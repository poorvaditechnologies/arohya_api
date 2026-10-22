import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { buildPagination } from '../../common/dto/pagination-query.dto';

const TYPE_TO_WIRE: Record<string, string> = {
  APPLICATION_UPDATE: 'applicationUpdate',
  SYSTEM: 'system',
  PROMOTIONAL: 'promotional',
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  // ---------------------------------------------------------------------
  // 16. NOTIFICATIONS (list)
  // ---------------------------------------------------------------------
  async list(userId: string, page: number, limit: number, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return {
      message: this.i18n.translate('notifications.retrieved', lang),
      data: {
        unreadCount,
        items: items.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: TYPE_TO_WIRE[n.type] ?? n.type.toLowerCase(),
          referenceId: n.referenceId,
          read: n.read,
          createdAt: n.createdAt.toISOString(),
        })),
        pagination: buildPagination(page, limit, total),
      },
    };
  }

  // ---------------------------------------------------------------------
  // 16b. MARK NOTIFICATION AS READ
  // ---------------------------------------------------------------------
  async markRead(userId: string, notificationId: string, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      throw AppException.of(404, ErrorCode.RESOURCE_NOT_FOUND, this.i18n.translate('error.resourceNotFound', lang), 'notificationId');
    }
    // Ownership check (see ApplicationsService.detail for the same
    // 403-vs-404 reasoning).
    if (notification.userId !== userId) {
      throw AppException.of(403, ErrorCode.ACCESS_DENIED, this.i18n.translate('error.accessDenied', lang), 'notificationId');
    }

    const updated = await this.prisma.notification.update({ where: { id: notificationId }, data: { read: true } });

    return {
      message: this.i18n.translate('notification.read', lang),
      data: { id: updated.id, read: updated.read },
    };
  }
}
