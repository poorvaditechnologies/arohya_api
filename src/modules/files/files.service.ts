import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { StorageService } from './storage.service';
import { CreateUploadUrlDto, OwnerType } from './dto/create-upload-url.dto';

// Allow-list per requirement #4: images (avatar) + documents (application
// documents). Kept as one combined list — the ownerType itself already
// scopes what makes sense (an avatar upload with mimeType=pdf is rejected
// the same way a document upload with mimeType=png would be accepted;
// images are valid evidence documents too, e.g. a photographed ID).
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, per requirement #4
const PUT_URL_EXPIRY_SECONDS = 5 * 60; // short-lived presigned PUT
const GET_URL_EXPIRY_SECONDS = 5 * 60; // short-lived presigned GET, regenerated per-request

function ownerTypeToDb(ownerType: OwnerType): 'USER_AVATAR' | 'APPLICATION_DOCUMENT' {
  return ownerType === 'user_avatar' ? 'USER_AVATAR' : 'APPLICATION_DOCUMENT';
}

function ownerTypeToWire(ownerType: 'USER_AVATAR' | 'APPLICATION_DOCUMENT'): OwnerType {
  return ownerType === 'USER_AVATAR' ? 'user_avatar' : 'application_document';
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly i18n: I18nService,
  ) {}

  // ---------------------------------------------------------------------
  // POST /files/upload-url
  // ---------------------------------------------------------------------
  async createUploadUrl(userId: string, dto: CreateUploadUrlDto, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const extension = ALLOWED_MIME_TYPES[dto.mimeType.toLowerCase()];
    if (!extension) {
      throw AppException.of(400, ErrorCode.UNSUPPORTED_FILE_TYPE, 'This file type is not supported. Allowed: jpg, jpeg, png, webp, pdf', 'mimeType');
    }
    if (dto.sizeBytes && dto.sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw AppException.of(400, ErrorCode.FILE_TOO_LARGE, 'File exceeds the 10MB maximum size', 'sizeBytes');
    }

    let ownerId: string;
    if (dto.ownerType === 'user_avatar') {
      // Implicit owner: always the current user, per requirement #3a.
      ownerId = userId;
    } else {
      if (!dto.ownerId) {
        throw AppException.of(400, ErrorCode.VALIDATION_FAILED, 'ownerId is required for application_document', 'ownerId');
      }
      const application = await this.prisma.application.findUnique({ where: { id: dto.ownerId } });
      if (!application) {
        throw AppException.of(404, ErrorCode.RESOURCE_NOT_FOUND, this.i18n.translate('error.resourceNotFound', lang), 'ownerId');
      }
      if (application.userId !== userId) {
        throw AppException.of(403, ErrorCode.ACCESS_DENIED, this.i18n.translate('error.accessDenied', lang), 'ownerId');
      }
      ownerId = application.id;
    }

    const attachmentId = `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const s3Key = `${ownerTypeToDb(dto.ownerType).toLowerCase()}/${ownerId}/${attachmentId}.${extension}`;

    await this.prisma.attachment.create({
      data: {
        id: attachmentId,
        ownerType: ownerTypeToDb(dto.ownerType),
        ownerId,
        uploadedByUserId: userId,
        s3Key,
        originalFilename: dto.filename,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes ?? null,
        status: 'PENDING',
      },
    });

    const uploadUrl = await this.storage.createPresignedPutUrl(s3Key, dto.mimeType, PUT_URL_EXPIRY_SECONDS);

    return {
      message: 'Upload URL generated',
      data: {
        attachmentId,
        uploadUrl,
        s3Key,
        expiresInSeconds: PUT_URL_EXPIRY_SECONDS,
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
      },
    };
  }

  // ---------------------------------------------------------------------
  // POST /files/{attachmentId}/confirm
  // ---------------------------------------------------------------------
  async confirmUpload(userId: string, attachmentId: string, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const attachment = await this.findOwnedAttachment(userId, attachmentId, lang);

    if (attachment.status === 'CONFIRMED') {
      throw AppException.of(409, ErrorCode.ATTACHMENT_ALREADY_CONFIRMED, 'This attachment has already been confirmed', 'attachmentId');
    }

    const head = await this.storage.headObject(attachment.s3Key);
    if (!head) {
      throw AppException.of(404, ErrorCode.UPLOAD_NOT_FOUND_IN_S3, 'The uploaded file was not found in storage. Upload it first, then confirm', 'attachmentId');
    }
    if (head.ContentLength && head.ContentLength > MAX_FILE_SIZE_BYTES) {
      throw AppException.of(400, ErrorCode.FILE_TOO_LARGE, 'Uploaded file exceeds the 10MB maximum size', 'attachmentId');
    }

    const confirmed = await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        sizeBytes: head.ContentLength ?? attachment.sizeBytes,
      },
    });

    // If this is a USER_AVATAR upload, swap the user's avatarAttachmentId
    // pointer to the newly-confirmed attachment (requirement #3a).
    if (confirmed.ownerType === 'USER_AVATAR') {
      await this.prisma.user.update({ where: { id: confirmed.ownerId }, data: { avatarAttachmentId: confirmed.id } });
    }

    const getUrl = await this.storage.createPresignedGetUrl(confirmed.s3Key, GET_URL_EXPIRY_SECONDS);

    return {
      message: 'Attachment confirmed',
      data: this.toAttachmentDto(confirmed, getUrl),
    };
  }

  // ---------------------------------------------------------------------
  // DELETE /files/{attachmentId}
  // ---------------------------------------------------------------------
  async deleteAttachment(userId: string, attachmentId: string, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const attachment = await this.findOwnedAttachment(userId, attachmentId, lang);

    await this.storage.deleteObject(attachment.s3Key);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });

    if (attachment.ownerType === 'USER_AVATAR') {
      await this.prisma.user.updateMany({ where: { id: attachment.ownerId, avatarAttachmentId: attachment.id }, data: { avatarAttachmentId: null } });
    }

    return { message: 'Attachment deleted', data: { attachmentId } };
  }

  // ---------------------------------------------------------------------
  // Helpers used by UsersService (avatarUrl) and ApplicationsService (documents)
  // ---------------------------------------------------------------------
  async getAvatarUrl(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarAttachmentId: true } });
    if (!user?.avatarAttachmentId) return null;
    const attachment = await this.prisma.attachment.findUnique({ where: { id: user.avatarAttachmentId } });
    if (!attachment || attachment.status !== 'CONFIRMED') return null;
    return this.storage.createPresignedGetUrl(attachment.s3Key, GET_URL_EXPIRY_SECONDS);
  }

  async getApplicationDocuments(applicationId: string): Promise<Array<Record<string, unknown>>> {
    const attachments = await this.prisma.attachment.findMany({
      where: { ownerType: 'APPLICATION_DOCUMENT', ownerId: applicationId, status: 'CONFIRMED' },
      orderBy: { uploadedAt: 'asc' },
    });
    return Promise.all(
      attachments.map(async (a) => {
        const getUrl = await this.storage.createPresignedGetUrl(a.s3Key, GET_URL_EXPIRY_SECONDS);
        return this.toAttachmentDto(a, getUrl);
      }),
    );
  }

  // ---------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------
  private async findOwnedAttachment(userId: string, attachmentId: string, lang: Lang) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      throw AppException.of(404, ErrorCode.ATTACHMENT_NOT_FOUND, this.i18n.translate('error.resourceNotFound', lang), 'attachmentId');
    }
    // Ownership: a user may only act on attachments they uploaded. For
    // application documents this is equivalent to "only on applications
    // belonging to them" since createUploadUrl already enforced that at
    // creation time and uploadedByUserId is immutable thereafter.
    if (attachment.uploadedByUserId !== userId) {
      throw AppException.of(403, ErrorCode.ACCESS_DENIED, this.i18n.translate('error.accessDenied', lang), 'attachmentId');
    }
    return attachment;
  }

  private toAttachmentDto(attachment: { id: string; ownerType: 'USER_AVATAR' | 'APPLICATION_DOCUMENT'; ownerId: string; originalFilename: string; mimeType: string; sizeBytes: number | null; status: 'PENDING' | 'CONFIRMED'; uploadedAt: Date; confirmedAt: Date | null }, getUrl: string) {
    return {
      attachmentId: attachment.id,
      ownerType: ownerTypeToWire(attachment.ownerType),
      ownerId: attachment.ownerId,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      status: attachment.status.toLowerCase(),
      uploadedAt: attachment.uploadedAt.toISOString(),
      confirmedAt: attachment.confirmedAt ? attachment.confirmedAt.toISOString() : null,
      url: getUrl,
    };
  }
}
