import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import type { Lang } from '../../common/i18n/i18n.service';
import { FinancingSolutionsService } from './financing-solutions.service';
import { QueryFinancingSolutionsDto } from './dto/query-financing-solutions.dto';

// Not a "Protected endpoint" per the guide (no Authorization requirement is
// listed under endpoint 6) — the product catalog, including the
// application-screen dropdown source, is public.
@ApiTags('financing-solutions')
@Controller('financing-solutions')
export class FinancingSolutionsController {
  constructor(private readonly service: FinancingSolutionsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Retrieve the financing solutions catalog that drives the Financing Solutions cards, "View More" list, and application product dropdown',
  })
  @ApiQuery({ name: 'applicationEnabled', required: false, type: Boolean, example: true })
  @ApiQuery({ name: 'category', required: false, type: String, example: 'loan' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({
    status: 200,
    description: 'Financing solutions retrieved',
    schema: {
      example: {
        success: true,
        message: 'Financing solutions retrieved',
        data: {
          initialVisibleCount: 5,
          products: [
            {
              id: 'product_personal_loan',
              slug: 'personal-loan',
              title: 'Personal Loan',
              amountLabel: 'Up to ₹40 Lakhs',
              badgeText: 'Instant KYC',
              badgeTone: 'success',
              rateLabel: 'From 10.49% p.a.',
              iconUrl: 'https://cdn.example.com/products/personal-loan.svg',
              fallbackIconKey: 'person',
              sortOrder: 1,
              visibleInitially: true,
              applicationEnabled: true,
              category: 'loan',
              active: true,
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid query parameter value',
    schema: {
      example: {
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'page', code: 'INVALID_PAGINATION', message: 'page must be a positive integer' }],
        requestId: 'req_01J...',
      },
    },
  })
  list(@Query() query: QueryFinancingSolutionsDto, @CurrentLang() lang: Lang) {
    return this.service.list(query, lang);
  }
}
