import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Lang } from '../../common/i18n/i18n.service';
import { LoanFacilitiesService } from './loan-facilities.service';

@ApiTags('loan-facilities')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('loan-facilities')
export class LoanFacilitiesController {
  constructor(private readonly service: LoanFacilitiesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List the current user's active loan facilities" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Loan facilities retrieved',
    schema: {
      example: {
        success: true,
        message: 'Loan facilities retrieved',
        data: {
          items: [
            {
              id: 'facility_01',
              title: 'Working Capital Line',
              sanctionedAmount: 2500000,
              currency: 'INR',
              nextEmiAmount: 58450,
              nextEmiDate: '2026-11-05',
              status: 'active',
              statusLabel: 'Active',
              autoDebitActive: true,
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: {
      example: {
        success: false,
        message: 'Unauthorized',
        errors: [{ field: 'authorization', code: 'UNAUTHORIZED', message: 'Missing or invalid access token' }],
        requestId: 'req_01J...',
      },
    },
  })
  list(@CurrentUser() user: { id: string }, @Query() query: PaginationQueryDto, @CurrentLang() lang: Lang) {
    return this.service.list(user.id, query.page ?? 1, query.limit ?? 20, lang);
  }
}
