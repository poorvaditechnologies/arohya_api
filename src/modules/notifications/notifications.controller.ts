import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Lang } from '../../common/i18n/i18n.service';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List the current user's notifications with unread count" })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved',
    schema: {
      example: {
        success: true,
        message: 'Notifications retrieved',
        data: {
          unreadCount: 1,
          items: [
            {
              id: 'notification_01',
              title: 'Application updated',
              message: 'Application ARH10294 has entered underwriting.',
              type: 'applicationUpdate',
              referenceId: 'application_01JABC',
              read: false,
              createdAt: '2026-10-22T08:30:00Z',
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

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
    schema: {
      example: {
        success: true,
        message: 'Notification marked as read',
        data: { id: 'notification_01', read: true },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found or not owned by the current user',
    schema: {
      example: {
        success: false,
        message: 'Notification not found',
        errors: [{ field: 'notificationId', code: 'NOTIFICATION_NOT_FOUND', message: 'This notification does not exist' }],
        requestId: 'req_01J...',
      },
    },
  })
  markRead(@CurrentUser() user: { id: string }, @Param('notificationId') notificationId: string, @CurrentLang() lang: Lang) {
    return this.service.markRead(user.id, notificationId, lang);
  }
}
