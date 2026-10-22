import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { buildTestApp } from './utils/test-app';

/**
 * CRUD-ish e2e flow: sign up a fresh user, submit a financing application,
 * list it, fetch its detail, and confirm ownership is enforced against a
 * second user. Runs against the real Neon DB.
 */
describe('Applications flow (e2e)', () => {
  let app: NestFastifyApplication;
  let server: any;

  const unique = Date.now();
  const email = `e2e.apps.${unique}@example.com`;
  const pan = `BBBBB${String(unique).slice(-4)}B`;

  let accessToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    server = app.getHttpAdapter().getInstance().server;

    const otpRes = await request(server).post('/api/v1/generate-otp').send({ email, purpose: 'signUp' }).expect(200);
    const signUpRes = await request(server)
      .post('/api/v1/sign-up')
      .send({
        fullName: 'E2E Applications Tester',
        email,
        pan,
        entityType: 'Sole Proprietorship',
        advisorCode: null,
        otp: otpRes.body.data.debugOtp,
        otpRequestId: otpRes.body.data.otpRequestId,
        consents: { termsAccepted: true, bureauConsent: true, privacyPolicyVersion: '2026-10-01', acceptedAt: '2026-10-22T12:30:00Z' },
      })
      .expect(201);
    accessToken = signUpRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /financing-solutions lists the seeded catalog (public, no auth)', async () => {
    const res = await request(server).get('/api/v1/financing-solutions').expect(200);
    expect(res.body.data.products.length).toBeGreaterThanOrEqual(8);
    expect(res.body.data.initialVisibleCount).toBe(5);
  });

  let applicationId: string;

  it('POST /applications submits a new Home Loan application', async () => {
    const res = await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productId: 'product_home_loan',
        firstName: 'Rajesh',
        lastName: 'Gowda',
        mobile: '9845012849',
        email,
        income: 75000,
        loanNeededDate: '2026-12-15',
        permanentAddress: { addressLine: '24 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'IN' },
        temporaryAddress: { sameAsPermanent: true, addressLine: '24 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'IN' },
      })
      .expect(201);

    expect(res.body.data.productId).toBe('product_home_loan');
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.currentStep).toBe(1);
    applicationId = res.body.data.id;
  });

  it('GET /applications lists it back with requestedAmount still null (GAP #1)', async () => {
    const res = await request(server).get('/api/v1/applications?page=1&limit=20').set('Authorization', `Bearer ${accessToken}`).expect(200);
    const item = res.body.data.items.find((i: any) => i.id === applicationId);
    expect(item).toBeDefined();
    expect(item.requestedAmount).toBeNull();
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 1, hasNextPage: false });
  });

  it('GET /applications/{id} returns the full timeline', async () => {
    const res = await request(server).get(`/api/v1/applications/${applicationId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.data.timeline).toHaveLength(4);
    expect(res.body.data.timeline[0]).toMatchObject({ step: 1, status: 'completed' });
    expect(res.body.data.timeline[1]).toMatchObject({ step: 2, status: 'pending' });
  });

  it('a second user cannot read the first user\'s application (403 ACCESS_DENIED)', async () => {
    const email2 = `e2e.apps2.${unique}@example.com`;
    const pan2 = `CCCCC${String(unique).slice(-4)}C`;
    const otpRes = await request(server).post('/api/v1/generate-otp').send({ email: email2, purpose: 'signUp' }).expect(200);
    const signUpRes = await request(server)
      .post('/api/v1/sign-up')
      .send({
        fullName: 'E2E Second Tester',
        email: email2,
        pan: pan2,
        entityType: 'Sole Proprietorship',
        advisorCode: null,
        otp: otpRes.body.data.debugOtp,
        otpRequestId: otpRes.body.data.otpRequestId,
        consents: { termsAccepted: true, bureauConsent: true, privacyPolicyVersion: '2026-10-01', acceptedAt: '2026-10-22T12:30:00Z' },
      })
      .expect(201);
    const otherAccessToken = signUpRes.body.data.accessToken;

    const res = await request(server).get(`/api/v1/applications/${applicationId}`).set('Authorization', `Bearer ${otherAccessToken}`).expect(403);
    expect(res.body.errors[0].code).toBe('ACCESS_DENIED');

    // That second (brand-new) user must see an EMPTY loan-facilities list —
    // no auto-generated fake facility, per guide rule #5/#6.
    const facilitiesRes = await request(server).get('/api/v1/loan-facilities').set('Authorization', `Bearer ${otherAccessToken}`).expect(200);
    expect(facilitiesRes.body.data.items).toEqual([]);
  });
});
