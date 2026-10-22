import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { HashService } from '../../security/hash.service';
import { IdService } from '../../security/id.service';
import { I18nService } from '../../common/i18n/i18n.service';
import { AppException } from '../../common/errors/app.exception';

describe('AuthService', () => {
  let prisma: any;
  let hash: jest.Mocked<HashService>;
  let tokens: jest.Mocked<TokensService>;
  let service: AuthService;

  const CONFIG_VALUES: Record<string, any> = {
    'otp.generateWindowSeconds': 600,
    'otp.generateMaxPerWindow': 5,
    'otp.ttlSeconds': 300,
    'otp.resendAfterSeconds': 30,
    'otp.maxVerifyAttempts': 5,
    'otp.lockoutMinutes': 15,
    'jwt.refreshExpiresInDays': 30,
    nodeEnv: 'test',
  };

  beforeEach(() => {
    prisma = {
      otpChallenge: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      refreshSession: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    };

    hash = { hash: jest.fn().mockResolvedValue('hashed'), verify: jest.fn() } as any;
    tokens = {
      signAccessToken: jest.fn().mockReturnValue({ token: 'access-token', expiresInSeconds: 900 }),
      signRefreshToken: jest.fn().mockReturnValue({ token: 'refresh-token', expiresAt: new Date() }),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    } as any;

    const ids = new IdService();
    const i18n = new I18nService();
    const config = { get: (key: string) => CONFIG_VALUES[key] } as unknown as ConfigService<any, true>;

    service = new AuthService(prisma, hash, ids, tokens, i18n, config);
  });

  describe('generateOtp', () => {
    it('rejects a malformed email with INVALID_EMAIL', async () => {
      await expect(service.generateOtp({ email: 'not-an-email', purpose: 'login' }, '1.2.3.4', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'INVALID_EMAIL' })],
      });
    });

    it('returns 404 ACCOUNT_NOT_FOUND for login when no user exists', async () => {
      prisma.otpChallenge.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.generateOtp({ email: 'a@b.com', purpose: 'login' }, '1.2.3.4', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'ACCOUNT_NOT_FOUND' })],
      });
    });

    it('returns 409 ACCOUNT_ALREADY_EXISTS for signUp when a user already exists', async () => {
      prisma.otpChallenge.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({ id: 'usr_1' });

      await expect(service.generateOtp({ email: 'a@b.com', purpose: 'signUp' }, '1.2.3.4', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'ACCOUNT_ALREADY_EXISTS' })],
      });
    });

    it('rate-limits after the configured number of requests in the window', async () => {
      prisma.otpChallenge.count.mockResolvedValue(5); // == generateMaxPerWindow
      prisma.user.findUnique.mockResolvedValue({ id: 'usr_1' });

      await expect(service.generateOtp({ email: 'a@b.com', purpose: 'login' }, '1.2.3.4', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'OTP_RATE_LIMITED' })],
      });
    });

    it('creates an OTP challenge and includes debugOtp outside production', async () => {
      prisma.otpChallenge.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({ id: 'usr_1' });
      prisma.otpChallenge.create.mockResolvedValue({ requestId: 'otp_req_123' });

      const result = await service.generateOtp({ email: 'a@b.com', purpose: 'login' }, '1.2.3.4', 'en');

      expect(result.data.otpRequestId).toBe('otp_req_123');
      expect(result.data.debugOtp).toBeDefined();
      expect(prisma.otpChallenge.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('login OTP verification / account lockout', () => {
    const baseUser = {
      id: 'usr_1',
      accountStatus: 'ACTIVE',
      lockedUntil: null,
      failedOtpAttempts: 0,
      entityType: 'SOLE_PROPRIETORSHIP',
      kycStatus: 'VERIFIED',
      email: 'a@b.com',
      fullName: 'A B',
      firstName: 'A',
      mobileNumber: null,
    };
    const baseChallenge = {
      id: 'chal_1',
      email: 'a@b.com',
      purpose: 'LOGIN',
      status: 'PENDING',
      otpHash: 'hashed',
      attemptsRemaining: 5,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('rejects a wrong OTP with INVALID_OTP and decrements counters', async () => {
      prisma.otpChallenge.findUnique.mockResolvedValue({ ...baseChallenge });
      prisma.user.findUnique.mockResolvedValue({ ...baseUser });
      hash.verify.mockResolvedValue(false);

      await expect(service.login({ email: 'a@b.com', otp: '000000', otpRequestId: 'otp_req_1' }, 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'INVALID_OTP' })],
      });

      expect(prisma.otpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attemptsRemaining: { decrement: 1 } } }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { failedOtpAttempts: 1 } }),
      );
    });

    it('locks the account after reaching the max verify attempts', async () => {
      prisma.otpChallenge.findUnique.mockResolvedValue({ ...baseChallenge });
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, failedOtpAttempts: 4 }); // next failure = 5th
      hash.verify.mockResolvedValue(false);

      await expect(service.login({ email: 'a@b.com', otp: '000000', otpRequestId: 'otp_req_1' }, 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'ACCOUNT_LOCKED' })],
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accountStatus: 'LOCKED', failedOtpAttempts: 5 }),
        }),
      );
    });

    it('rejects login while the account is already locked, even with the right OTP', async () => {
      const future = new Date(Date.now() + 10 * 60 * 1000);
      prisma.otpChallenge.findUnique.mockResolvedValue({ ...baseChallenge });
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, accountStatus: 'LOCKED', lockedUntil: future });

      await expect(service.login({ email: 'a@b.com', otp: '123456', otpRequestId: 'otp_req_1' }, 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'ACCOUNT_LOCKED' })],
      });
      expect(hash.verify).not.toHaveBeenCalled();
    });

    it('auto-unlocks once the lockout cool-down has elapsed', async () => {
      const past = new Date(Date.now() - 1000);
      prisma.otpChallenge.findUnique.mockResolvedValue({ ...baseChallenge });
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, accountStatus: 'LOCKED', lockedUntil: past });
      prisma.user.update.mockResolvedValue({});
      hash.verify.mockResolvedValue(true);
      prisma.refreshSession.create.mockResolvedValue({ id: 'sess_1' });
      prisma.refreshSession.update.mockResolvedValue({});

      const result = await service.login({ email: 'a@b.com', otp: '123456', otpRequestId: 'otp_req_1' }, 'en');

      expect(result.data.accessToken).toBe('access-token');
      // first update call is the auto-unlock
      expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ accountStatus: 'ACTIVE', failedOtpAttempts: 0 });
    });

    it('logs in successfully with a valid OTP and issues tokens', async () => {
      prisma.otpChallenge.findUnique.mockResolvedValue({ ...baseChallenge });
      prisma.user.findUnique.mockResolvedValue({ ...baseUser });
      hash.verify.mockResolvedValue(true);
      prisma.refreshSession.create.mockResolvedValue({ id: 'sess_1' });
      prisma.refreshSession.update.mockResolvedValue({});

      const result = await service.login({ email: 'a@b.com', otp: '123456', otpRequestId: 'otp_req_1' }, 'en');

      expect(result.message).toBe('Login successful');
      const user = result.data.user as any;
      expect(user.entityType).toBe('Sole Proprietorship');
      expect(user.kycStatus).toBe('verified');
      expect(tokens.signAccessToken).toHaveBeenCalledWith('usr_1');
    });
  });

  it('AppException carries field/code/message triples usable by the global filter', async () => {
    try {
      await service.generateOtp({ email: 'bad', purpose: 'login' }, '1.1.1.1', 'en');
      fail('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
    }
  });
});
