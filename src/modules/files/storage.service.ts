import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, HeadObjectCommandOutput, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../../config/configuration';

/**
 * Thin wrapper around the AWS S3 SDK v3 client. Kept as its own injectable
 * so FilesService's business logic (ownership, validation, Prisma rows)
 * stays separate from AWS wiring, and so unit tests can mock just this
 * client (see storage.service.spec.ts, which mocks S3Client#send).
 *
 * Design choice (requirement #4 "your call"): presigned PUT (not a
 * presigned POST policy). A presigned PUT is a single signed URL the
 * client issues one HTTP PUT against with the file bytes as the body —
 * simpler for a Flutter client (http.put a byte buffer) than building a
 * multipart POST with policy-document fields. The tradeoff is that S3
 * itself does not enforce size/content-type limits on a presigned PUT the
 * way a POST policy's conditions array can. We cover that gap by
 * validating mimeType/extension and a declared max size at
 * upload-url-issue time (FilesService) AND re-validating the real object
 * (size + content-type) via a HEAD request at confirm time — so a client
 * that lies about size/type in the initial request still gets caught
 * before the attachment is marked CONFIRMED.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const aws = this.config.get('aws', { infer: true });
    this.bucket = aws.bucketName;
    this.client = new S3Client({
      region: aws.region,
      credentials: {
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
      },
    });
  }

  async createPresignedPutUrl(key: string, mimeType: string, expiresInSeconds: number): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async createPresignedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** Returns null if the object does not exist (404) rather than throwing. */
  async headObject(key: string): Promise<HeadObjectCommandOutput | null> {
    try {
      return await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
