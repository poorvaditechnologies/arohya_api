// Mocks the AWS SDK v3 client entirely (both the S3Client's .send and the
// presigner) so this test never makes a real network call. See
// files.service.spec.ts / BUILD_LOG.md for the "mock vs real S3 in tests"
// design decision write-up — mocking the SDK is used here; a real
// round-trip is instead done once manually against the live bucket per
// the task's verification step, not inside the automated test suite.
const sendMock = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  };
});
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://example-bucket.s3.amazonaws.com/signed-url'),
}));

import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;
  const config = new ConfigService({ aws: { accessKeyId: 'AKIA_TEST', secretAccessKey: 'secret', region: 'ap-south-1', bucketName: 'test-bucket' } });

  beforeEach(() => {
    sendMock.mockReset();
    service = new StorageService(config as any);
  });

  it('createPresignedPutUrl returns a signed URL', async () => {
    const url = await service.createPresignedPutUrl('key.pdf', 'application/pdf', 300);
    expect(url).toBe('https://example-bucket.s3.amazonaws.com/signed-url');
  });

  it('createPresignedGetUrl returns a signed URL', async () => {
    const url = await service.createPresignedGetUrl('key.pdf', 300);
    expect(url).toBe('https://example-bucket.s3.amazonaws.com/signed-url');
  });

  it('headObject returns the HEAD response when the object exists', async () => {
    sendMock.mockResolvedValue({ ContentLength: 1234 });
    const result = await service.headObject('key.pdf');
    expect(result).toEqual({ ContentLength: 1234 });
  });

  it('headObject returns null when the object does not exist', async () => {
    sendMock.mockRejectedValue(new Error('NotFound'));
    const result = await service.headObject('missing.pdf');
    expect(result).toBeNull();
  });

  it('deleteObject sends a DeleteObjectCommand', async () => {
    sendMock.mockResolvedValue({});
    await service.deleteObject('key.pdf');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
