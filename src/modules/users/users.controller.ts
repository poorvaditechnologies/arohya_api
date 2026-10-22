import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Lang } from '../../common/i18n/i18n.service';
import { UsersService } from './users.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@ApiTags('profile')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get the current user's profile" })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved',
    schema: {
      example: {
        success: true,
        message: 'Profile retrieved',
        data: {
          id: 'usr_rajesh_01',
          fullName: 'Rajesh Kumar Gowda',
          email: 'rajesh.gowda@example.com',
          mobileNumber: '9845012849',
          avatarUrl: 'https://arohya-bucket.s3.ap-south-1.amazonaws.com/...signed-get...',
          businessType: 'Sole Proprietorship',
          panMasked: 'ABCDE****F',
          gstinStatus: 'verified',
          gstinMasked: 'AAACB****F1Z5',
          accountAggregator: { status: 'linked', handle: '9845012849@finvu' },
          kycStatus: 'verified',
          preferences: { biometricEnabled: true },
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
  getProfile(@CurrentUser() user: { id: string }, @CurrentLang() lang: Lang) {
    return this.service.getProfile(user.id, lang);
  }

  @Patch('profile/preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update the current user's profile preferences" })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated',
    schema: {
      example: {
        success: true,
        message: 'Preferences updated',
        data: { biometricEnabled: false },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid preferences payload',
    schema: {
      example: {
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'biometricEnabled', code: 'INVALID_VALUE', message: 'biometricEnabled must be a boolean' }],
        requestId: 'req_01J...',
      },
    },
  })
  updatePreferences(@CurrentUser() user: { id: string }, @Body() dto: UpdatePreferencesDto, @CurrentLang() lang: Lang) {
    return this.service.updatePreferences(user.id, dto, lang);
  }
}
