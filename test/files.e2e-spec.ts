// Mocks the AWS SDK for this e2e spec (per BUILD_LOG.md design decision:
// prefer mocking the AWS SDK client in automated tests to avoid cluttering
// the real bucket; a real round-trip against the live bucket was done
// once manually as a verification step, not in the automated suite).
// A fake in-memory "S3" lets confirmUpload's HEAD check succeed after the
// test "uploads" by calling PutObjectCommand directly through the mocked
// send(), exercising the full upload-url -> confirm -> delete flow against
// the real Neon DB.
const fakeS3Objects = new Map<string, { contentType: string; length: number }>();

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(async (command: any) => {
        if (command instanceof actual.PutObjectCommand) {
          fakeS3Objects.set(command.input.Key, { contentType: command.input.ContentType, length: 1234 });
          return {};
        }
        if (command instanceof actual.HeadObjectCommand) {
          const obj = fakeS3Objects.get(command.input.Key);
          if (!obj) throw new Error('NotFound');
          return { ContentLength: obj.length, ContentType: obj.contentType };
        }
        if (command instanceof actual.DeleteObjectCommand) {
          fakeS3Objects.delete(command.input.Key);
          return {};
        }
        return {};
      }),
    })),
  };
});
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async (_client: any, command: any) => `https://fake-s3.example.com/${command.input.Key}?mock-signed`),
}));

import { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { buildTestApp } from './utils/test-app';

describe('Files upload-url -> confirm -> delete flow (e2e)', () => {
  let app: NestFastifyApplication;
  let server: any;

  const unique = Date.now();
  const email = `e2e.files.${unique}@example.com`;
  const pan = `CCCCC${String(unique).slice(-4)}C`;

  let accessToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    server = app.getHttpAdapter().getInstance().server;

    const otpRes = await request(server).post('/api/v1/generate-otp').send({ email, purpose: 'signUp' }).expect(200);
    const signUpRes = await request(server)
      .post('/api/v1/sign-up')
      .send({
        fullName: 'E2E Files Tester',
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

  let attachmentId: string;

  it('POST /files/upload-url rejects an unsupported mime type', async () => {
    const res = await request(server)
      .post('/api/v1/files/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ownerType: 'user_avatar', filename: 'virus.exe', mimeType: 'application/x-msdownload' })
      .expect(400);
    expect(res.body.errors[0].code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('POST /files/upload-url issues a presigned PUT URL for an avatar', async () => {
    const res = await request(server)
      .post('/api/v1/files/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ownerType: 'user_avatar', filename: 'avatar.png', mimeType: 'image/png', sizeBytes: 1000 })
      .expect(201);
    expect(res.body.data.uploadUrl).toContain('mock-signed');
    attachmentId = res.body.data.attachmentId;
  });

  it('POST /files/{id}/confirm fails with 404 before the object actually "lands" in S3', async () => {
    // A second attachment that is never uploaded to the fake S3 store.
    const res = await request(server)
      .post('/api/v1/files/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ownerType: 'user_avatar', filename: 'avatar2.png', mimeType: 'image/png' })
      .expect(201);
    const neverUploadedId = res.body.data.attachmentId;

    const confirmRes = await request(server).post(`/api/v1/files/${neverUploadedId}/confirm`).set('Authorization', `Bearer ${accessToken}`).expect(404);
    expect(confirmRes.body.errors[0].code).toBe('UPLOAD_NOT_FOUND_IN_S3');
  });

  it('simulates the client PUT to S3, then confirm succeeds', async () => {
    // Directly exercise the storage layer's mocked S3Client by issuing the
    // same PutObjectCommand a real client would send when PUTting bytes to
    // the presigned URL (the "URL" here is a mock string, not a real
    // endpoint, so we simulate the PUT at the SDK level instead of HTTP).
    // The s3Key format is `user_avatar/<userId>/<attachmentId>.png` —
    // derived the same way FilesService.createUploadUrl builds it.
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const profile = await request(server).get('/api/v1/profile').set('Authorization', `Bearer ${accessToken}`).expect(200);
    const userId = profile.body.data.id;
    const realKey = `user_avatar/${userId}/${attachmentId}.png`;

    const client = new S3Client({});
    await client.send(new PutObjectCommand({ Bucket: 'test', Key: realKey, ContentType: 'image/png' }));

    const confirmRes = await request(server).post(`/api/v1/files/${attachmentId}/confirm`).set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(confirmRes.body.data.status).toBe('confirmed');
    expect(confirmRes.body.data.url).toContain('mock-signed');
  });

  it('GET /profile now returns a non-null avatarUrl', async () => {
    const res = await request(server).get('/api/v1/profile').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.data.avatarUrl).toContain('mock-signed');
  });

  it('DELETE /files/{id} removes the attachment', async () => {
    await request(server).delete(`/api/v1/files/${attachmentId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);

    const res = await request(server).get('/api/v1/profile').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.data.avatarUrl).toBeNull();
  });

  it('DELETE /files/{id} on an already-deleted attachment returns 404', async () => {
    const res = await request(server).delete(`/api/v1/files/${attachmentId}`).set('Authorization', `Bearer ${accessToken}`).expect(404);
    expect(res.body.errors[0].code).toBe('ATTACHMENT_NOT_FOUND');
  });
});
