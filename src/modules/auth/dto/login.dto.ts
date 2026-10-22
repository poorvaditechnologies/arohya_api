import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class DeviceDto {
  @ApiPropertyOptional({ example: 'device_abc123' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'android' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'rajesh.gowda@example.com' })
  @IsEmail()
  email!: string;

  // Kept as a string throughout (guide: "OTP must be handled as a string
  // because it may start with zero").
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  otp!: string;

  @ApiProperty({ example: 'otp_req_01JABC123' })
  @IsString()
  @IsNotEmpty()
  otpRequestId!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}
