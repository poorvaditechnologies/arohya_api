import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentLang } from '../../common/decorators/lang.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { GenerateOtpDto } from './dto/generate-otp.dto';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import type { Lang } from '../../common/i18n/i18n.service';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('generate-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate and send an email OTP for login or sign-up' })
  @ApiResponse({
    status: 200,
    description: 'OTP generated and sent successfully',
    schema: {
      example: {
        success: true,
        message: 'Verification code sent successfully',
        data: {
          otpRequestId: 'otp_req_01JABC123',
          purpose: 'login',
          maskedEmail: 'ra***@example.com',
          expiresInSeconds: 300,
          resendAfterSeconds: 30,
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No account exists for this email when purpose is login',
    schema: {
      example: {
        success: false,
        message: 'Account not found',
        errors: [{ field: 'email', code: 'ACCOUNT_NOT_FOUND', message: 'No account exists for this email' }],
        requestId: 'req_01J...',
      },
    },
  })
  generateOtp(@Body() dto: GenerateOtpDto, @Req() req: any, @CurrentLang() lang: Lang) {
    const ip = req.ip ?? req.raw?.socket?.remoteAddress ?? 'unknown';
    return this.auth.generateOtp(dto, ip, lang);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in using the OTP sent to the user\'s email' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        success: true,
        message: 'Login successful',
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          accessTokenExpiresInSeconds: 900,
          user: {
            id: 'usr_rajesh_01',
            fullName: 'Rajesh Kumar Gowda',
            firstName: 'Rajesh',
            email: 'rajesh.gowda@example.com',
            mobileNumber: '9845012849',
            entityType: 'Sole Proprietorship',
            kycStatus: 'verified',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'OTP is invalid, expired, or does not match the given otpRequestId',
    schema: {
      example: {
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'otp', code: 'INVALID_OTP', message: 'Enter a valid OTP' }],
        requestId: 'req_01J...',
      },
    },
  })
  login(@Body() dto: LoginDto, @CurrentLang() lang: Lang) {
    return this.auth.login(dto, lang);
  }

  @Post('sign-up')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new account with OTP verification and statutory consents' })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully',
    schema: {
      example: {
        success: true,
        message: 'Account created successfully',
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          accessTokenExpiresInSeconds: 900,
          user: {
            id: 'usr_01JNEWUSER',
            fullName: 'Rajesh Kumar Gowda',
            firstName: 'Rajesh',
            email: 'rajesh.gowda@example.com',
            mobileNumber: null,
            panMasked: 'ABCDE****F',
            entityType: 'Sole Proprietorship',
            kycStatus: 'pending',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Email or PAN already registered',
    schema: {
      example: {
        success: false,
        message: 'Account already exists',
        errors: [{ field: 'email', code: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered' }],
        requestId: 'req_01J...',
      },
    },
  })
  signUp(@Body() dto: SignUpDto, @CurrentLang() lang: Lang) {
    return this.auth.signUp(dto, lang);
  }

  @Post('auth/refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a valid refresh token for a new access/refresh token pair' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed',
    schema: {
      example: {
        success: true,
        message: 'Token refreshed',
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          accessTokenExpiresInSeconds: 900,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token is missing, invalid, or has been revoked',
    schema: {
      example: {
        success: false,
        message: 'Invalid refresh token',
        errors: [{ field: 'refreshToken', code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' }],
        requestId: 'req_01J...',
      },
    },
  })
  refreshToken(@Body() dto: RefreshTokenDto, @CurrentLang() lang: Lang) {
    return this.auth.refreshToken(dto, lang);
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Log out the current device by revoking its refresh session' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: {
      example: {
        success: true,
        message: 'Logged out successfully',
        data: null,
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
  logout(@CurrentUser() user: { id: string }, @Body() dto: LogoutDto, @CurrentLang() lang: Lang) {
    return this.auth.logout(user.id, dto, lang);
  }
}
