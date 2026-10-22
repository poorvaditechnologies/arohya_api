import { Injectable } from '@nestjs/common';
import { ApplicationStatus, KycStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { kycStatusToWire } from '../../common/utils/enum-mappers.util';
import { applicationStatusToLabel, applicationStatusToWire } from '../../common/utils/application-status.util';

// UI tier label derived purely from the real `kycStatus` field already on
// the user — not a fabricated bureau/underwriting tier. Kept here (not in
// the enum-mappers util) since it is dashboard-presentation-specific.
const TIER_LABEL: Record<KycStatus, string> = {
  PENDING: 'Fiduciary Tier Pending Verification',
  IN_PROGRESS: 'Fiduciary Tier Verification In Progress',
  VERIFIED: 'Fiduciary Tier 1 Verified',
  REJECTED: 'Fiduciary Tier Verification Rejected',
};

// An application counts as "active" on the dashboard while it has not yet
// reached a terminal state. REJECTED and DISBURSED are terminal; APPROVED
// is kept as "active" because the user still has something to track until
// disbursement.
const ACTIVE_STATUSES: ApplicationStatus[] = ['SUBMITTED', 'UNDERWRITING', 'DOCUMENT_VERIFICATION', 'APPROVED'];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async getDashboard(userId: string, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppException.of(404, ErrorCode.RESOURCE_NOT_FOUND, this.i18n.translate('error.resourceNotFound', lang), 'userId');
    }

    const [activeApplication, unreadNotificationCount] = await Promise.all([
      this.prisma.application.findFirst({
        where: { userId, status: { in: ACTIVE_STATUSES } },
        include: { product: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return {
      message: this.i18n.translate('dashboard.retrieved', lang),
      data: {
        user: {
          firstName: user.firstName,
          kycStatus: kycStatusToWire(user.kycStatus),
          tierLabel: TIER_LABEL[user.kycStatus],
        },
        // null (not a fabricated placeholder application) when the user
        // has no real application in an active state — per guide rule #5.
        activeApplication: activeApplication
          ? {
              id: activeApplication.id,
              applicationNumber: activeApplication.applicationNumber,
              productTitle: activeApplication.product.title,
              requestedAmount: activeApplication.requestedAmount,
              currency: activeApplication.currency,
              status: applicationStatusToWire(activeApplication.status),
              statusLabel: applicationStatusToLabel(activeApplication.status),
              currentStep: activeApplication.currentStep,
              totalSteps: activeApplication.totalSteps,
            }
          : null,
        unreadNotificationCount,
      },
    };
  }
}
