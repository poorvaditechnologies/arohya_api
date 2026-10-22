import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Lang } from '../../common/i18n/i18n.service';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';

@ApiTags('applications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a product/loan application (loan, SHCG or insurance)' })
  @ApiResponse({
    status: 201,
    description: 'Application submitted successfully',
    schema: {
      example: {
        success: true,
        message: 'Application submitted successfully',
        data: {
          id: 'application_01JABC',
          applicationNumber: 'ARH10295',
          productId: 'product_home_loan',
          productTitle: 'Home Loan',
          status: 'submitted',
          currentStep: 1,
          totalSteps: 4,
          submittedAt: '2026-10-22T12:45:00Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'productId does not match any active financing solution',
    schema: {
      example: {
        success: false,
        message: 'Product not found',
        errors: [{ field: 'productId', code: 'PRODUCT_NOT_FOUND', message: 'This product is not available' }],
        requestId: 'req_01J...',
      },
    },
  })
  submit(@CurrentUser() user: { id: string }, @Body() dto: CreateApplicationDto, @CurrentLang() lang: Lang) {
    return this.service.submit(user.id, dto, lang);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's submitted applications" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Applications retrieved',
    schema: {
      example: {
        success: true,
        message: 'Applications retrieved',
        data: {
          items: [
            {
              id: 'application_01JABC',
              applicationNumber: 'ARH10294',
              productId: 'product_business_loan',
              productTitle: 'MSME Business Loan',
              requestedAmount: 2500000,
              currency: 'INR',
              status: 'underwriting',
              statusLabel: 'In Syndicate Underwriting',
              currentStep: 2,
              totalSteps: 4,
              submittedAt: '2026-10-20T10:00:00Z',
              updatedAt: '2026-10-22T08:30:00Z',
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

  @Get(':applicationId')
  @ApiOperation({ summary: 'Get application details and step tracker/timeline for one application' })
  @ApiResponse({
    status: 200,
    description: 'Application details retrieved',
    schema: {
      example: {
        success: true,
        message: 'Application details retrieved',
        data: {
          id: 'application_01JABC',
          applicationNumber: 'ARH10294',
          productId: 'product_business_loan',
          productTitle: 'MSME Business Loan',
          requestedAmount: 2500000,
          currency: 'INR',
          status: 'underwriting',
          statusLabel: 'In Syndicate Underwriting',
          currentStep: 2,
          totalSteps: 4,
          timeline: [
            { step: 1, title: 'Application Submitted', status: 'completed', completedAt: '2026-10-20T10:00:00Z' },
            { step: 2, title: 'Syndicate Underwriting', status: 'active', completedAt: null },
            { step: 3, title: 'Document Verification', status: 'pending', completedAt: null },
            { step: 4, title: 'Final Decision', status: 'pending', completedAt: null },
          ],
          documents: [
            {
              attachmentId: 'attachment_1729_abc123',
              ownerType: 'application_document',
              ownerId: 'application_01JABC',
              originalFilename: 'income-proof.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 245678,
              status: 'confirmed',
              uploadedAt: '2026-10-20T10:05:00Z',
              confirmedAt: '2026-10-20T10:06:00Z',
              url: 'https://arohya-bucket.s3.ap-south-1.amazonaws.com/...signed-get...',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found or not owned by the current user',
    schema: {
      example: {
        success: false,
        message: 'Application not found',
        errors: [{ field: 'applicationId', code: 'APPLICATION_NOT_FOUND', message: 'This application does not exist' }],
        requestId: 'req_01J...',
      },
    },
  })
  detail(@CurrentUser() user: { id: string }, @Param('applicationId') applicationId: string, @CurrentLang() lang: Lang) {
    return this.service.detail(user.id, applicationId, lang);
  }
}
