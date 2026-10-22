import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { IdService } from '../../security/id.service';
import { CreateCallbackRequestDto } from './dto/create-callback-request.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
    private readonly i18n: I18nService,
  ) {}

  // ---------------------------------------------------------------------
  // 14. SUPPORT CONFIGURATION
  // ---------------------------------------------------------------------
  async getSupportConfig(lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const [rm, channels] = await Promise.all([
      this.prisma.relationshipManager.findFirst({ where: { active: true } }),
      this.prisma.supportChannel.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    ]);

    return {
      message: this.i18n.translate('support.retrieved', lang),
      data: {
        relationshipManager: rm
          ? {
              id: rm.id,
              name: rm.name,
              title: rm.title,
              initials: rm.initials,
              available: rm.available,
              availabilityLabel: rm.availabilityLabel,
              profileImageUrl: rm.profileImageUrl,
            }
          : null,
        channels: channels.map((c) => ({
          id: c.id,
          type: c.type.toLowerCase(),
          title: c.title,
          subtitle: c.subtitle,
          actionUrl: c.actionUrl,
          iconUrl: c.iconUrl,
          fallbackIconKey: c.fallbackIconKey,
          sortOrder: c.sortOrder,
          active: c.active,
        })),
      },
    };
  }

  // ---------------------------------------------------------------------
  // 15. SCHEDULE SUPPORT CALL
  // ---------------------------------------------------------------------
  async createCallbackRequest(userId: string, dto: CreateCallbackRequestDto, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const callback = await this.prisma.callbackRequest.create({
      data: {
        id: this.ids.callbackRequestId(),
        userId,
        preferredDate: new Date(dto.preferredDate),
        preferredTimeSlot: dto.preferredTimeSlot,
        topic: dto.topic,
        notes: dto.notes,
        status: 'SCHEDULED',
      },
    });

    return {
      message: this.i18n.translate('callback.scheduled', lang),
      data: {
        callbackRequestId: callback.id,
        status: callback.status.toLowerCase(),
        preferredDate: callback.preferredDate.toISOString().slice(0, 10),
        preferredTimeSlot: callback.preferredTimeSlot,
      },
    };
  }
}
