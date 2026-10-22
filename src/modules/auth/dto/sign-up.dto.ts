import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ConsentsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  termsAccepted!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  bureauConsent!: boolean;

  @ApiProperty({ example: '2026-10-01' })
  @IsString()
  @IsNotEmpty()
  privacyPolicyVersion!: string;

  @ApiProperty({ example: '2026-10-22T12:30:00Z' })
  @IsDateString()
  acceptedAt!: string;
}

export class SignUpDto {
  @ApiProperty({ example: 'Rajesh Kumar Gowda' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: 'rajesh.gowda@example.com' })
  @IsEmail()
  email!: string;

  // Format (5 letters, 4 digits, 1 letter) is checked explicitly in
  // AuthService so the exact 400 INVALID_PAN code/message from the guide
  // can be returned, rather than a generic VALIDATION_FAILED.
  @ApiProperty({ example: 'ABCDE1234F' })
  @IsString()
  @IsNotEmpty()
  pan!: string;

  @ApiProperty({ example: 'Sole Proprietorship' })
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @ApiProperty({ example: null, nullable: true, required: false })
  @IsOptional()
  @IsString()
  advisorCode?: string | null;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  otp!: string;

  @ApiProperty({ example: 'otp_req_01JABC456' })
  @IsString()
  @IsNotEmpty()
  otpRequestId!: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => ConsentsDto)
  consents!: ConsentsDto;
}
