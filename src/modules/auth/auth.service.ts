import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChallenge, OtpPurpose, OtpStatus, Prisma, User } from '@prisma/client';
import { AppConfig } from '../../config/configuration';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { PrismaService } from '../../database/prisma.service';
import { HashService } from '../../security/hash.service';
import { IdService } from '../../security/id.service';
import { MailService } from '../../common/mail/mail.service';
import { maskEmail, maskPan } from '../../common/utils/mask.util';
import { displayToEntityType, entityTypeToDisplay, kycStatusToWire } from '../../common/utils/enum-mappers.util';
import { TokensService } from './tokens.service';
import { GenerateOtpDto } from './dto/generate-otp.dto';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function generateNumericOtp(): string {
  // 6-digit numeric OTP, zero-padded (guide: "OTP must be handled as a
  // string because it may start with zero").
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, '0');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hash: HashService,
    private readonly ids: IdService,
    private readonly tokens: TokensService,
    private readonly i18n: I18nService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly mail: MailService,
  ) {}

  // ---------------------------------------------------------------------
  // 1. GENERATE OTP
  // ---------------------------------------------------------------------
  async generateOtp(dto: GenerateOtpDto, ip: string, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    if (!EMAIL_REGEX.test(dto.email)) {
      throw AppException.of(400, ErrorCode.INVALID_EMAIL, this.i18n.translate('error.invalidEmail', lang), 'email');
    }
    const email = dto.email.toLowerCase();
    const purpose: OtpPurpose = dto.purpose === 'signUp' ? OtpPurpose.SIGN_UP : OtpPurpose.LOGIN;

    // Rate-limit OTP generation by email + IP (guide requirement under
    // endpoint 1). Window/limit are configurable via env.
    const windowSeconds = this.config.get('otp.generateWindowSeconds', { infer: true });
    const maxPerWindow = this.config.get('otp.generateMaxPerWindow', { infer: true });
    const since = new Date(Date.now() - windowSeconds * 1000);
    const recentCount = await this.prisma.otpChallenge.count({
      where: { email, requestIp: ip, createdAt: { gte: since } },
    });
    if (recentCount >= maxPerWindow) {
      throw AppException.of(429, ErrorCode.OTP_RATE_LIMITED, this.i18n.translate('error.otpRateLimited', lang));
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (purpose === OtpPurpose.LOGIN && !user) {
      throw AppException.of(404, ErrorCode.ACCOUNT_NOT_FOUND, this.i18n.translate('error.accountNotFound', lang), 'email');
    }
    if (purpose === OtpPurpose.SIGN_UP && user) {
      throw AppException.of(409, ErrorCode.ACCOUNT_ALREADY_EXISTS, this.i18n.translate('error.accountAlreadyExists', lang), 'email');
    }

    const otp = generateNumericOtp();
    const otpHash = await this.hash.hash(otp);
    const ttlSeconds = this.config.get('otp.ttlSeconds', { infer: true });
    const resendAfterSeconds = this.config.get('otp.resendAfterSeconds', { infer: true });
    const maxVerifyAttempts = this.config.get('otp.maxVerifyAttempts', { infer: true });

    const challenge = await this.prisma.otpChallenge.create({
      data: {
        requestId: this.ids.otpRequestId(),
        email,
        userId: user?.id,
        purpose,
        otpHash,
        attemptsRemaining: maxVerifyAttempts,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        resendAfter: new Date(Date.now() + resendAfterSeconds * 1000),
        requestIp: ip,
      },
    });

    const data: Record<string, unknown> = {
      otpRequestId: challenge.requestId,
      purpose: dto.purpose,
      maskedEmail: maskEmail(email),
      expiresInSeconds: ttlSeconds,
      resendAfterSeconds,
    };

    // Actually deliver the OTP by email. The OTP is already generated,
    // hashed, and persisted above, so it's valid regardless of whether the
    // email send below succeeds — an SMTP failure (bad credentials, network
    // blip, provider rate limit, etc.) must never turn into a 500 for the
    // caller, since the challenge they need to proceed already exists. We
    // log and swallow instead of propagating; in development/test,
    // debugOtp (below) still lets the caller proceed even if mail never
    // arrives.
    try {
      await this.mail.sendOtpEmail(email, otp, dto.purpose, ttlSeconds, lang);
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${maskEmail(email)}: ${(err as Error).message}`);
    }

    // "For local development only, an optional debugOtp field may be
    // returned when the server is explicitly running in development
    // mode." Never set outside development/test — enforced here, not just
    // by convention, so a misconfigured NODE_ENV in prod cannot leak it.
    const nodeEnv = this.config.get('nodeEnv', { infer: true });
    if (nodeEnv === 'development' || nodeEnv === 'test') {
      data.debugOtp = otp;
    }

    return { message: this.i18n.translate('otp.sent', lang), data };
  }

  // ---------------------------------------------------------------------
  // 2. LOGIN
  // ---------------------------------------------------------------------
  async login(dto: LoginDto, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const email = dto.email.toLowerCase();
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { requestId: dto.otpRequestId } });
    if (!challenge || challenge.email !== email || challenge.purpose !== OtpPurpose.LOGIN) {
      throw AppException.of(400, ErrorCode.OTP_REQUEST_MISMATCH, this.i18n.translate('error.otpRequestMismatch', lang), 'otpRequestId');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw AppException.of(404, ErrorCode.ACCOUNT_NOT_FOUND, this.i18n.translate('error.accountNotFound', lang), 'email');
    }

    await this.assertAccountNotLocked(user, lang);
    await this.verifyOtpOrFail(challenge, dto.otp, user, lang);

    const refreshSession = await this.createRefreshSession(user.id, dto.rememberDevice ?? false, dto.device);
    const access = this.tokens.signAccessToken(user.id);

    return {
      message: this.i18n.translate('login.success', lang),
      data: {
        accessToken: access.token,
        refreshToken: refreshSession.rawToken,
        accessTokenExpiresInSeconds: access.expiresInSeconds,
        user: {
          id: user.id,
          fullName: user.fullName,
          firstName: user.firstName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          entityType: entityTypeToDisplay(user.entityType),
          kycStatus: kycStatusToWire(user.kycStatus),
        },
      },
    };
  }

  // ---------------------------------------------------------------------
  // 3. SIGN UP
  // ---------------------------------------------------------------------
  async signUp(dto: SignUpDto, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const pan = dto.pan.toUpperCase().trim();
    if (!PAN_REGEX.test(pan)) {
      throw AppException.of(400, ErrorCode.INVALID_PAN, this.i18n.translate('error.invalidPan', lang), 'pan');
    }
    if (!dto.consents.termsAccepted || !dto.consents.bureauConsent) {
      throw AppException.of(400, ErrorCode.CONSENT_REQUIRED, this.i18n.translate('error.consentRequired', lang), 'consents');
    }

    const entityType = displayToEntityType(dto.entityType);
    if (!entityType) {
      throw AppException.of(400, ErrorCode.VALIDATION_FAILED, `Unknown entityType "${dto.entityType}"`, 'entityType');
    }

    const email = dto.email.toLowerCase();
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { requestId: dto.otpRequestId } });
    if (!challenge || challenge.email !== email || challenge.purpose !== OtpPurpose.SIGN_UP) {
      throw AppException.of(400, ErrorCode.OTP_REQUEST_MISMATCH, this.i18n.translate('error.otpRequestMismatch', lang), 'otpRequestId');
    }
    await this.verifyOtpOrFail(challenge, dto.otp, null, lang);

    // Deviation note #2: PAN uniqueness. We check explicitly first (for a
    // clean, documented error before hitting the DB) and ALSO rely on the
    // `User.pan @unique` DB constraint as a safety net against races,
    // caught below via Prisma's P2002 error code.
    const [emailTaken, panTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.user.findUnique({ where: { pan } }),
    ]);
    if (emailTaken) {
      throw AppException.of(409, ErrorCode.EMAIL_ALREADY_REGISTERED, this.i18n.translate('error.emailAlreadyRegistered', lang), 'email');
    }
    if (panTaken) {
      throw AppException.of(409, ErrorCode.PAN_ALREADY_REGISTERED, this.i18n.translate('error.panAlreadyRegistered', lang), 'pan');
    }

    const firstName = dto.fullName.trim().split(/\s+/)[0] ?? dto.fullName;

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          id: this.ids.userId(),
          fullName: dto.fullName.trim(),
          firstName,
          email,
          pan,
          entityType,
          advisorCode: dto.advisorCode ?? null,
          kycStatus: 'PENDING',
          consents: {
            create: {
              termsAccepted: dto.consents.termsAccepted,
              bureauConsent: dto.consents.bureauConsent,
              privacyPolicyVersion: dto.consents.privacyPolicyVersion,
              acceptedAt: new Date(dto.consents.acceptedAt),
            },
          },
          preference: { create: {} },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
        if (target.includes('pan')) {
          throw AppException.of(409, ErrorCode.PAN_ALREADY_REGISTERED, this.i18n.translate('error.panAlreadyRegistered', lang), 'pan');
        }
        throw AppException.of(409, ErrorCode.EMAIL_ALREADY_REGISTERED, this.i18n.translate('error.emailAlreadyRegistered', lang), 'email');
      }
      throw err;
    }

    await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { status: OtpStatus.CONSUMED, consumedAt: new Date() } });

    const refreshSession = await this.createRefreshSession(user.id, false, undefined);
    const access = this.tokens.signAccessToken(user.id);

    return {
      message: this.i18n.translate('signup.success', lang),
      data: {
        accessToken: access.token,
        refreshToken: refreshSession.rawToken,
        accessTokenExpiresInSeconds: access.expiresInSeconds,
        user: {
          id: user.id,
          fullName: user.fullName,
          firstName: user.firstName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          panMasked: maskPan(user.pan),
          entityType: entityTypeToDisplay(user.entityType),
          kycStatus: kycStatusToWire(user.kycStatus),
        },
      },
    };
  }

  // ---------------------------------------------------------------------
  // 4. REFRESH ACCESS TOKEN
  // ---------------------------------------------------------------------
  async refreshToken(dto: RefreshTokenDto, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    let payload: { sub: string; sid: string };
    try {
      payload = this.tokens.verifyRefreshToken(dto.refreshToken);
    } catch {
      throw AppException.of(401, ErrorCode.INVALID_REFRESH_TOKEN, this.i18n.translate('error.invalidRefreshToken', lang), 'refreshToken');
    }

    const session = await this.prisma.refreshSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub || session.revoked || session.expiresAt < new Date()) {
      throw AppException.of(401, ErrorCode.INVALID_REFRESH_TOKEN, this.i18n.translate('error.invalidRefreshToken', lang), 'refreshToken');
    }
    const matches = await this.hash.verify(session.tokenHash, dto.refreshToken);
    if (!matches) {
      throw AppException.of(401, ErrorCode.INVALID_REFRESH_TOKEN, this.i18n.translate('error.invalidRefreshToken', lang), 'refreshToken');
    }

    // Rotation: revoke the old session and mint a brand new one, per the
    // "rotating hashed refresh tokens" stack requirement.
    const newSession = await this.createRefreshSession(
      session.userId,
      session.rememberDevice,
      { deviceId: session.deviceId ?? undefined, platform: session.platform ?? undefined, appVersion: session.appVersion ?? undefined },
    );
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revoked: true, replacedBySessionId: newSession.session.id },
    });

    const access = this.tokens.signAccessToken(session.userId);

    return {
      message: this.i18n.translate('token.refreshed', lang),
      data: {
        accessToken: access.token,
        refreshToken: newSession.rawToken,
        accessTokenExpiresInSeconds: access.expiresInSeconds,
      },
    };
  }

  // ---------------------------------------------------------------------
  // 5. LOGOUT
  // ---------------------------------------------------------------------
  async logout(userId: string, dto: LogoutDto, lang: Lang): Promise<ApiResult<null>> {
    try {
      const payload = this.tokens.verifyRefreshToken(dto.refreshToken);
      if (payload.sub === userId) {
        await this.prisma.refreshSession.updateMany({
          where: { id: payload.sid, userId },
          data: { revoked: true },
        });
      }
    } catch {
      // Logout is intentionally idempotent/best-effort: an already
      // expired/invalid refresh token still results in a successful
      // logout response, since the caller's intent (end this session) is
      // satisfied either way and the guide defines no error codes for
      // this endpoint.
    }
    return { message: this.i18n.translate('logout.success', lang), data: null };
  }

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------

  private async assertAccountNotLocked(user: User, lang: Lang): Promise<void> {
    if (user.accountStatus === 'LOCKED') {
      if (user.lockedUntil && user.lockedUntil.getTime() <= Date.now()) {
        // Cool-down period elapsed: auto-unlock (deviation note #3).
        await this.prisma.user.update({
          where: { id: user.id },
          data: { accountStatus: 'ACTIVE', failedOtpAttempts: 0, lockedUntil: null },
        });
        return;
      }
      throw AppException.of(423, ErrorCode.ACCOUNT_LOCKED, this.i18n.translate('error.accountLocked', lang));
    }
  }

  /**
   * Shared OTP-challenge verification for both login and sign-up.
   *
   * Two independent counters are deliberately used (deviation note #3):
   *  - `challenge.attemptsRemaining` — exhausting the attempts on THIS one
   *    OTP challenge returns 429 TOO_MANY_ATTEMPTS (try requesting a new
   *    code).
   *  - `user.failedOtpAttempts` — a cross-challenge, account-wide counter.
   *    Reaching OTP_MAX_VERIFY_ATTEMPTS (default 5) consecutive failures
   *    locks the account for OTP_LOCKOUT_MINUTES (default 15) and returns
   *    423 ACCOUNT_LOCKED. Only applies when `user` is known (login); a
   *    sign-up has no existing account to lock.
   */
  private async verifyOtpOrFail(challenge: OtpChallenge, otp: string, user: User | null, lang: Lang): Promise<void> {
    if (challenge.status === OtpStatus.CONSUMED) {
      throw AppException.of(400, ErrorCode.OTP_REQUEST_MISMATCH, this.i18n.translate('error.otpRequestMismatch', lang), 'otpRequestId');
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { status: OtpStatus.EXPIRED } });
      throw AppException.of(400, ErrorCode.OTP_EXPIRED, this.i18n.translate('error.otpExpired', lang), 'otp');
    }
    if (challenge.attemptsRemaining <= 0) {
      throw AppException.of(429, ErrorCode.TOO_MANY_ATTEMPTS, this.i18n.translate('error.tooManyAttempts', lang));
    }

    const matches = await this.hash.verify(challenge.otpHash, otp);
    if (!matches) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attemptsRemaining: { decrement: 1 } },
      });

      if (user) {
        const maxAttempts = this.config.get('otp.maxVerifyAttempts', { infer: true });
        const lockoutMinutes = this.config.get('otp.lockoutMinutes', { infer: true });
        const failedAttempts = user.failedOtpAttempts + 1;
        if (failedAttempts >= maxAttempts) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              failedOtpAttempts: failedAttempts,
              accountStatus: 'LOCKED',
              lockedUntil: new Date(Date.now() + lockoutMinutes * 60 * 1000),
            },
          });
          throw AppException.of(423, ErrorCode.ACCOUNT_LOCKED, this.i18n.translate('error.accountLocked', lang));
        }
        await this.prisma.user.update({ where: { id: user.id }, data: { failedOtpAttempts: failedAttempts } });
      }

      throw AppException.of(400, ErrorCode.INVALID_OTP, this.i18n.translate('error.invalidOtp', lang), 'otp');
    }

    await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { status: OtpStatus.CONSUMED, consumedAt: new Date() } });
    if (user) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedOtpAttempts: 0, accountStatus: 'ACTIVE', lockedUntil: null } });
    }
  }

  private async createRefreshSession(
    userId: string,
    rememberDevice: boolean,
    device: { deviceId?: string; platform?: string; appVersion?: string } | undefined,
  ): Promise<{ session: { id: string }; rawToken: string }> {
    // Create the row first with a placeholder hash, then sign a token that
    // embeds the row id, then update the row with the real hash — avoids
    // needing the token's own id before the token can be created.
    const expiresAt = new Date(Date.now() + this.config.get('jwt.refreshExpiresInDays', { infer: true }) * 24 * 60 * 60 * 1000);
    const created = await this.prisma.refreshSession.create({
      data: {
        userId,
        // Unique placeholder (never a valid argon2 hash) so concurrent
        // session creations can't collide on the @unique tokenHash column
        // before being replaced with the real hash below.
        tokenHash: `pending_${randomUUID()}`,
        deviceId: device?.deviceId,
        platform: device?.platform,
        appVersion: device?.appVersion,
        rememberDevice,
        expiresAt,
      },
    });
    const { token } = this.tokens.signRefreshToken(userId, created.id);
    const tokenHash = await this.hash.hash(token);
    await this.prisma.refreshSession.update({ where: { id: created.id }, data: { tokenHash } });
    return { session: created, rawToken: token };
  }
}
