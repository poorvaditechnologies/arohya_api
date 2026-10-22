import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({ example: 'refresh-token' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @ApiPropertyOptional({ example: 'device_abc123' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
