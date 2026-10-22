import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCallbackRequestDto {
  @ApiProperty({ example: '2026-10-25' })
  @IsDateString()
  preferredDate!: string;

  @ApiProperty({ example: '14:00-16:00' })
  @IsString()
  @IsNotEmpty()
  preferredTimeSlot!: string;

  @ApiProperty({ example: 'Business Loan' })
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @ApiPropertyOptional({ example: 'Need help understanding required documents' })
  @IsOptional()
  @IsString()
  notes?: string;
}
