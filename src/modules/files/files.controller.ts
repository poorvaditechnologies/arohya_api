import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Lang } from '../../common/i18n/i18n.service';
import { FilesService } from './files.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

/**
 * File storage extension phase (agreed in conversation, beyond the
 * original 17-endpoint guide — see BUILD_LOG.md). One reusable
 * presigned-URL mechanism backs avatars, application documents, and future
 * use cases; see FilesService for the upload -> confirm -> use flow.
 */
@ApiTags('files')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Get a short-lived presigned S3 PUT URL to upload a file',
    description:
      'Issues a presigned PUT URL and creates a PENDING attachment record. The client PUTs the raw file bytes directly to `uploadUrl` with header `Content-Type` matching the requested mimeType, then calls POST /files/{attachmentId}/confirm.',
  })
  @ApiResponse({
    status: 201,
    description: 'Upload URL generated',
    schema: {
      example: {
        success: true,
        message: 'Upload URL generated',
        data: {
          attachmentId: 'attachment_1729_abc123',
          uploadUrl: 'https://arohya-bucket.s3.ap-south-1.amazonaws.com/application_document/application_01JABC/attachment_1729_abc123.pdf?X-Amz-...',
          s3Key: 'application_document/application_01JABC/attachment_1729_abc123.pdf',
          expiresInSeconds: 300,
          maxSizeBytes: 10485760,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Unsupported file type or declared size too large',
    schema: {
      example: {
        success: false,
        message: 'This file type is not supported. Allowed: jpg, jpeg, png, webp, pdf',
        errors: [{ field: 'mimeType', code: 'UNSUPPORTED_FILE_TYPE', message: 'This file type is not supported. Allowed: jpg, jpeg, png, webp, pdf' }],
        requestId: 'req_01J...',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'ownerId does not belong to the current user (e.g. application owned by someone else)',
    schema: {
      example: {
        success: false,
        message: 'You do not have access to this resource',
        errors: [{ field: 'ownerId', code: 'ACCESS_DENIED', message: 'You do not have access to this resource' }],
        requestId: 'req_01J...',
      },
    },
  })
  createUploadUrl(@CurrentUser() user: { id: string }, @Body() dto: CreateUploadUrlDto, @CurrentLang() lang: Lang) {
    return this.service.createUploadUrl(user.id, dto, lang);
  }

  @Post(':attachmentId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a completed S3 upload',
    description: 'HEAD-checks the object actually landed in S3 (and matches the 10MB size cap), marks the attachment CONFIRMED, and returns its metadata including a fresh presigned GET URL.',
  })
  @ApiResponse({
    status: 200,
    description: 'Attachment confirmed',
    schema: {
      example: {
        success: true,
        message: 'Attachment confirmed',
        data: {
          attachmentId: 'attachment_1729_abc123',
          ownerType: 'application_document',
          ownerId: 'application_01JABC',
          originalFilename: 'income-proof.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 245678,
          status: 'confirmed',
          uploadedAt: '2026-10-22T12:45:00Z',
          confirmedAt: '2026-10-22T12:46:10Z',
          url: 'https://arohya-bucket.s3.ap-south-1.amazonaws.com/...signed-get...',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Attachment not found, or the object was never actually uploaded to S3',
    schema: {
      example: {
        success: false,
        message: 'The uploaded file was not found in storage. Upload it first, then confirm',
        errors: [{ field: 'attachmentId', code: 'UPLOAD_NOT_FOUND_IN_S3', message: 'The uploaded file was not found in storage. Upload it first, then confirm' }],
        requestId: 'req_01J...',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Attachment belongs to another user',
    schema: {
      example: {
        success: false,
        message: 'You do not have access to this resource',
        errors: [{ field: 'attachmentId', code: 'ACCESS_DENIED', message: 'You do not have access to this resource' }],
        requestId: 'req_01J...',
      },
    },
  })
  confirmUpload(@CurrentUser() user: { id: string }, @Param('attachmentId') attachmentId: string, @CurrentLang() lang: Lang) {
    return this.service.confirmUpload(user.id, attachmentId, lang);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an attachment (removes the S3 object and the DB record)' })
  @ApiResponse({
    status: 200,
    description: 'Attachment deleted',
    schema: {
      example: { success: true, message: 'Attachment deleted', data: { attachmentId: 'attachment_1729_abc123' } },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Attachment not found',
    schema: {
      example: {
        success: false,
        message: 'Resource not found',
        errors: [{ field: 'attachmentId', code: 'ATTACHMENT_NOT_FOUND', message: 'Resource not found' }],
        requestId: 'req_01J...',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Attachment belongs to another user',
    schema: {
      example: {
        success: false,
        message: 'You do not have access to this resource',
        errors: [{ field: 'attachmentId', code: 'ACCESS_DENIED', message: 'You do not have access to this resource' }],
        requestId: 'req_01J...',
      },
    },
  })
  deleteAttachment(@CurrentUser() user: { id: string }, @Param('attachmentId') attachmentId: string, @CurrentLang() lang: Lang) {
    return this.service.deleteAttachment(user.id, attachmentId, lang);
  }
}
