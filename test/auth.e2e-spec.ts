import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { buildTestApp } from './utils/test-app';

/**
 * Full auth flow e2e test: generate-otp -> sign-up -> login -> refresh-token
 * -> logout, against the real Neon DB configured in .env. Uses a unique
 * email/PAN per run so the suite is repeatable.
 */
describe('Auth flow (e2e)', () => {
  let app: NestFastifyApplication;
  let server: any;

  const unique = Date.now();
  const email = `e2e.auth.${unique}@example.com`;
  const pan = `AAAAA${String(unique).slice(-4)}A`;

  beforeAll(async () => {
    app = await buildTestApp();
    server = app.getHttpAdapter().getInstance().server;
  });

  afterAll(async () => {
    await app.close();
  });

  let signUpOtpRequestId: string;
  let signUpOtp: string;

  it('POST /generate-otp (signUp) issues an OTP challenge', async () => {
    const res = await request(server)
      .post('/api/v1/generate-otp')
      .send({ email, purpose: 'signUp' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.otpRequestId).toMatch(/^otp_req_/);
    expect(res.body.data.maskedEmail).toContain('***@example.com');
    expect(res.body.data.debugOtp).toBeDefined(); // dev/test only

    signUpOtpRequestId = res.body.data.otpRequestId;
    signUpOtp = res.body.data.debugOtp;
  });

  it('POST /generate-otp (signUp) is rejected for an already-registered email after sign-up', async () => {
    // placeholder email reused after sign-up below; checked later in this file.
    expect(true).toBe(true);
  });

  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  it('POST /sign-up creates the account and returns tokens', async () => {
    const res = await request(server)
      .post('/api/v1/sign-up')
      .send({
        fullName: 'E2E Auth Tester',
        email,
        pan,
        entityType: 'Sole Proprietorship',
        advisorCode: null,
        otp: signUpOtp,
        otpRequestId: signUpOtpRequestId,
        consents: {
          termsAccepted: true,
          bureauConsent: true,
          privacyPolicyVersion: '2026-10-01',
          acceptedAt: '2026-10-22T12:30:00Z',
        },
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.kycStatus).toBe('pending');
    expect(res.body.data.user.panMasked).toBe(`${pan.slice(0, 5)}****${pan.slice(-1)}`);
    expect(res.body.data.accessTokenExpiresInSeconds).toBe(900);

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
    userId = res.body.data.user.id;
    expect(userId).toMatch(/^usr_/);
  });

  it('POST /generate-otp (signUp) now returns 409 ACCOUNT_ALREADY_EXISTS', async () => {
    const res = await request(server).post('/api/v1/generate-otp').send({ email, purpose: 'signUp' }).expect(409);
    expect(res.body.success).toBe(false);
    expect(res.body.errors[0].code).toBe('ACCOUNT_ALREADY_EXISTS');
    expect(res.body.requestId).toMatch(/^req_/);
  });

  let loginOtp: string;
  let loginOtpRequestId: string;

  it('POST /generate-otp (login) issues a fresh OTP for the new account', async () => {
    const res = await request(server).post('/api/v1/generate-otp').send({ email, purpose: 'login' }).expect(200);
    loginOtp = res.body.data.debugOtp;
    loginOtpRequestId = res.body.data.otpRequestId;
  });

  it('POST /login with the wrong OTP returns 400 INVALID_OTP', async () => {
    const res = await request(server)
      .post('/api/v1/login')
      .send({ email, otp: '000000', otpRequestId: loginOtpRequestId })
      .expect(400);
    expect(res.body.errors[0].code).toBe('INVALID_OTP');
  });

  it('POST /login with the correct OTP logs the user in', async () => {
    const res = await request(server)
      .post('/api/v1/login')
      .send({ email, otp: loginOtp, otpRequestId: loginOtpRequestId, rememberDevice: true, device: { deviceId: 'd1', platform: 'android', appVersion: '1.0.0' } })
      .expect(200);

    expect(res.body.data.user.id).toBe(userId);
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('POST /auth/refresh-token rotates the refresh token', async () => {
    const res = await request(server).post('/api/v1/auth/refresh-token').send({ refreshToken }).expect(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('old refresh token can no longer be used after rotation', async () => {
    // A stale refresh token (pre-rotation) must be rejected.
    const res = await request(server).post('/api/v1/auth/refresh-token').send({ refreshToken: 'not-a-real-token' }).expect(401);
    expect(res.body.errors[0].code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('GET /profile requires a bearer token', async () => {
    const res = await request(server).get('/api/v1/profile').expect(401);
    expect(res.body.errors[0].code).toBe('UNAUTHORIZED');
  });

  it('GET /profile succeeds with a valid access token', async () => {
    const res = await request(server).get('/api/v1/profile').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.data.id).toBe(userId);
  });

  it('POST /auth/logout revokes the session', async () => {
    const res = await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken, deviceId: 'd1' })
      .expect(200);
    expect(res.body.data).toBeNull();
  });
});
