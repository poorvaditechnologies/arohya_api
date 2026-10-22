import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Lang } from '../../common/i18n/i18n.service';
import { SupportService } from './support.service';
import { CreateCallbackRequestDto } from './dto/create-callback-request.dto';

@ApiTags('support')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get support configuration: relationship manager details and contact channels' })
  @ApiResponse({
    status: 200,
    description: 'Support information retrieved',
    schema: {
      example: {
        success: true,
        message: 'Support information retrieved',
        data: {
          relationshipManager: {
            id: 'rm_01',
            name: 'Vikram Krishnamurthy',
            title: 'Senior Fiduciary Relationship Manager',
            initials: 'VK',
            available: true,
            availabilityLabel: 'Available 09:00 - 19:00 IST',
            profileImageUrl: null,
          },
          channels: [
            {
              id: 'helpline',
              type: 'phone',
              title: 'Institutional Helpline',
              subtitle: '+91 80 4920 1800 (Toll Free)',
              actionUrl: 'tel:+918049201800',
              iconUrl: null,
              fallbackIconKey: 'phone',
              sortOrder: 1,
              active: true,
            },
          ],
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
  getSupportConfig(@CurrentLang() lang: Lang) {
    return this.service.getSupportConfig(lang);
  }

  @Post('callback-requests')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Schedule a support callback request' })
  @ApiResponse({
    status: 201,
    description: 'Callback scheduled successfully',
    schema: {
      example: {
        success: true,
        message: 'Callback scheduled successfully',
        data: {
          callbackRequestId: 'callback_01JABC',
          status: 'scheduled',
          preferredDate: '2026-10-25',
          preferredTimeSlot: '14:00-16:00',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid callback request payload',
    schema: {
      example: {
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'preferredDate', code: 'INVALID_DATE', message: 'Enter a valid preferred date' }],
        requestId: 'req_01J...',
      },
    },
  })
  createCallbackRequest(@CurrentUser() user: { id: string }, @Body() dto: CreateCallbackRequestDto, @CurrentLang() lang: Lang) {
    return this.service.createCallbackRequest(user.id, dto, lang);
  }
}
