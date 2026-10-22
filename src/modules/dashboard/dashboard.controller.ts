import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Lang } from '../../common/i18n/i18n.service';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get the home dashboard summary: user tier, active application and unread notification count" })
  @ApiResponse({
    status: 200,
    description: 'Dashboard retrieved',
    schema: {
      example: {
        success: true,
        message: 'Dashboard retrieved',
        data: {
          user: { firstName: 'Rajesh', kycStatus: 'verified', tierLabel: 'Fiduciary Tier 1 Verified' },
          activeApplication: {
            id: 'application_01JABC',
            applicationNumber: 'ARH10294',
            productTitle: 'MSME Business Loan',
            requestedAmount: 2500000,
            currency: 'INR',
            status: 'underwriting',
            statusLabel: 'In Syndicate Underwriting',
            currentStep: 2,
            totalSteps: 4,
          },
          unreadNotificationCount: 0,
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
  get(@CurrentUser() user: { id: string }, @CurrentLang() lang: Lang) {
    return this.service.getDashboard(user.id, lang);
  }
}
