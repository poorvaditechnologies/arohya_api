import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { ApiResult } from '../../common/interceptors/response-envelope.interceptor';
import { QueryFinancingSolutionsDto } from './dto/query-financing-solutions.dto';

@Injectable()
export class FinancingSolutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async list(query: QueryFinancingSolutionsDto, lang: Lang): Promise<ApiResult<Record<string, unknown>>> {
    // Backend behavior per guide: "Return only active products to the
    // mobile app." Removing/disabling a product server-side immediately
    // removes it from the app with no release needed.
    const where: Prisma.FinancingProductWhereInput = { active: true };
    if (query.applicationEnabled !== undefined) where.applicationEnabled = query.applicationEnabled;
    if (query.category) where.category = query.category;

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const products = await this.prisma.financingProduct.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const initialVisibleCount = products.filter((p) => p.visibleInitially).length;

    return {
      message: this.i18n.translate('financing.retrieved', lang),
      data: {
        initialVisibleCount,
        products: products.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          amountLabel: p.amountLabel,
          badgeText: p.badgeText,
          badgeTone: p.badgeTone,
          rateLabel: p.rateLabel,
          iconUrl: p.iconUrl,
          fallbackIconKey: p.fallbackIconKey,
          sortOrder: p.sortOrder,
          visibleInitially: p.visibleInitially,
          applicationEnabled: p.applicationEnabled,
          category: p.category,
          active: p.active,
        })),
      },
    };
  }
}
