import { FilesService } from './files.service';
import { I18nService } from '../../common/i18n/i18n.service';

describe('FilesService', () => {
  let prisma: any;
  let storage: any;
  let service: FilesService;

  beforeEach(() => {
    prisma = {
      application: { findUnique: jest.fn() },
      attachment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    };
    storage = {
      createPresignedPutUrl: jest.fn().mockResolvedValue('https://signed-put'),
      createPresignedGetUrl: jest.fn().mockResolvedValue('https://signed-get'),
      headObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    service = new FilesService(prisma, storage, new I18nService());
  });

  describe('createUploadUrl', () => {
    it('rejects an unsupported mime type', async () => {
      await expect(service.createUploadUrl('usr_1', { ownerType: 'user_avatar', filename: 'f.exe', mimeType: 'application/x-msdownload' } as any, 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'UNSUPPORTED_FILE_TYPE' })],
      });
    });

    it('rejects a declared size over the 10MB cap', async () => {
      await expect(
        service.createUploadUrl('usr_1', { ownerType: 'user_avatar', filename: 'f.png', mimeType: 'image/png', sizeBytes: 20 * 1024 * 1024 } as any, 'en'),
      ).rejects.toMatchObject({ errors: [expect.objectContaining({ code: 'FILE_TOO_LARGE' })] });
    });

    it('uses the current user id implicitly for user_avatar', async () => {
      prisma.attachment.create.mockResolvedValue({});
      const result = await service.createUploadUrl('usr_1', { ownerType: 'user_avatar', filename: 'avatar.png', mimeType: 'image/png' } as any, 'en');
      expect(prisma.attachment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ownerType: 'USER_AVATAR', ownerId: 'usr_1', uploadedByUserId: 'usr_1' }) }),
      );
      expect(result.data.attachmentId).toBeDefined();
    });

    it('rejects application_document when the application belongs to another user', async () => {
      prisma.application.findUnique.mockResolvedValue({ id: 'app_1', userId: 'someone_else' });
      await expect(
        service.createUploadUrl('usr_1', { ownerType: 'application_document', ownerId: 'app_1', filename: 'f.pdf', mimeType: 'application/pdf' } as any, 'en'),
      ).rejects.toMatchObject({ errors: [expect.objectContaining({ code: 'ACCESS_DENIED' })] });
    });

    it('returns 404 when the application does not exist', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      await expect(
        service.createUploadUrl('usr_1', { ownerType: 'application_document', ownerId: 'app_missing', filename: 'f.pdf', mimeType: 'application/pdf' } as any, 'en'),
      ).rejects.toMatchObject({ errors: [expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' })] });
    });
  });

  describe('confirmUpload', () => {
    it('throws ATTACHMENT_NOT_FOUND when the attachment does not exist', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);
      await expect(service.confirmUpload('usr_1', 'att_x', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'ATTACHMENT_NOT_FOUND' })],
      });
    });

    it('throws ACCESS_DENIED when the attachment belongs to another user', async () => {
      prisma.attachment.findUnique.mockResolvedValue({ id: 'att_x', uploadedByUserId: 'someone_else', status: 'PENDING' });
      await expect(service.confirmUpload('usr_1', 'att_x', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'ACCESS_DENIED' })],
      });
    });

    it('throws UPLOAD_NOT_FOUND_IN_S3 when the HEAD check fails', async () => {
      prisma.attachment.findUnique.mockResolvedValue({ id: 'att_x', uploadedByUserId: 'usr_1', status: 'PENDING', s3Key: 'key' });
      storage.headObject.mockResolvedValue(null);
      await expect(service.confirmUpload('usr_1', 'att_x', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'UPLOAD_NOT_FOUND_IN_S3' })],
      });
    });

    it('marks the attachment CONFIRMED and swaps the user avatar pointer for USER_AVATAR', async () => {
      prisma.attachment.findUnique.mockResolvedValue({ id: 'att_x', uploadedByUserId: 'usr_1', status: 'PENDING', s3Key: 'key', ownerType: 'USER_AVATAR', ownerId: 'usr_1' });
      storage.headObject.mockResolvedValue({ ContentLength: 1000 });
      prisma.attachment.update.mockResolvedValue({
        id: 'att_x',
        ownerType: 'USER_AVATAR',
        ownerId: 'usr_1',
        originalFilename: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 1000,
        status: 'CONFIRMED',
        uploadedAt: new Date(),
        confirmedAt: new Date(),
        s3Key: 'key',
      });

      const result = await service.confirmUpload('usr_1', 'att_x', 'en');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'usr_1' }, data: { avatarAttachmentId: 'att_x' } });
      expect(result.data.status).toBe('confirmed');
      expect(result.data.url).toBe('https://signed-get');
    });
  });

  describe('deleteAttachment', () => {
    it('deletes the S3 object and DB row for the owner', async () => {
      prisma.attachment.findUnique.mockResolvedValue({ id: 'att_x', uploadedByUserId: 'usr_1', s3Key: 'key', ownerType: 'APPLICATION_DOCUMENT', ownerId: 'app_1' });
      const result = await service.deleteAttachment('usr_1', 'att_x', 'en');
      expect(storage.deleteObject).toHaveBeenCalledWith('key');
      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att_x' } });
      expect(result.data).toEqual({ attachmentId: 'att_x' });
    });

    it('rejects deletion by a non-owner', async () => {
      prisma.attachment.findUnique.mockResolvedValue({ id: 'att_x', uploadedByUserId: 'someone_else' });
      await expect(service.deleteAttachment('usr_1', 'att_x', 'en')).rejects.toMatchObject({
        errors: [expect.objectContaining({ code: 'ACCESS_DENIED' })],
      });
    });
  });
});
