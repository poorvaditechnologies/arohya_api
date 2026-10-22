import { Injectable } from '@nestjs/common';
import { LoanFacilityStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { buildPagination } from '../../common/dto/pagination-query.dto';

const STATUS_TO_WIRE: Record<LoanFacilityStatus, string> = {
  ACTIVE: 'active',
  CLOSED: 'closed',
  OVERDUE: 'overdue',
};

const STATUS_TO_LABEL: Record<LoanFacilityStatus, string> = {
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  OVERDUE: 'Overdue',
};

@Injectable()
export class LoanFacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  // ---------------------------------------------------------------------
  // 11. ACTIVE LOAN FACILITIES
  // ---------------------------------------------------------------------
  // IMPORTANT (guide rule #5/#6): this must return an EMPTY list for any
  // user without real, seeded/verified facilities. No facility is ever
  // auto-generated here — the query below simply reflects whatever rows
  // genuinely exist for this user in the LoanFacility table.
  async list(userId: string, page: number, limit: number, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    const [items, total] = await Promise.all([
      this.prisma.loanFacility.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.loanFacility.count({ where: { userId } }),
    ]);

    return {
      message: this.i18n.translate('facilities.retrieved', lang),
      data: {
        items: items.map((f) => ({
          id: f.id,
          title: f.title,
          sanctionedAmount: f.sanctionedAmount,
          currency: f.currency,
          nextEmiAmount: f.nextEmiAmount,
          nextEmiDate: f.nextEmiDate ? f.nextEmiDate.toISOString().slice(0, 10) : null,
          status: STATUS_TO_WIRE[f.status],
          statusLabel: STATUS_TO_LABEL[f.status],
          autoDebitActive: f.autoDebitActive,
        })),
        pagination: buildPagination(page, limit, total),
      },
    };
  }
}
