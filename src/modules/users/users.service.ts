import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { entityTypeToDisplay, kycStatusToWire } from '../../common/utils/enum-mappers.util';
import { maskGstin, maskPan } from '../../common/utils/mask.util';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { FilesService } from '../files/files.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly files: FilesService,
  ) {}

  // ---------------------------------------------------------------------
  // 12. USER PROFILE
  // ---------------------------------------------------------------------
  async getProfile(userId: string, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { preference: true } });
    if (!user) {
      throw AppException.of(404, ErrorCode.RESOURCE_NOT_FOUND, this.i18n.translate('error.resourceNotFound', lang), 'userId');
    }

    // avatarUrl is a fresh presigned GET URL, regenerated per-request (not
    // stored) — see FilesService.getAvatarUrl. null when no avatar is set.
    const avatarUrl = await this.files.getAvatarUrl(userId);

    return {
      message: this.i18n.translate('profile.retrieved', lang),
      data: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
        avatarUrl,
        businessType: entityTypeToDisplay(user.entityType),
        panMasked: maskPan(user.pan),
        // GSTIN/Account Aggregator fields stay null until a real
        // verification pipeline populates them — never fabricated here
        // (guide rule #5: no fake KYC/bureau/AA data).
        gstinStatus: user.gstinStatus,
        gstinMasked: user.gstin ? maskGstin(user.gstin) : null,
        accountAggregator: {
          status: user.accountAggregatorStatus ?? 'notLinked',
          handle: user.accountAggregatorHandle,
        },
        kycStatus: kycStatusToWire(user.kycStatus),
        preferences: {
          biometricEnabled: user.preference?.biometricEnabled ?? false,
        },
      },
    };
  }

  // ---------------------------------------------------------------------
  // 13. UPDATE PROFILE PREFERENCES
  // ---------------------------------------------------------------------
  async updatePreferences(userId: string, dto: UpdatePreferencesDto, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const preference = await this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, biometricEnabled: dto.biometricEnabled },
      update: { biometricEnabled: dto.biometricEnabled },
    });

    return {
      message: this.i18n.translate('preferences.updated', lang),
      data: { biometricEnabled: preference.biometricEnabled },
    };
  }
}
