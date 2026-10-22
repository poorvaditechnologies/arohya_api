import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export type OtpPurposeWire = 'login' | 'signUp';

export class GenerateOtpDto {
  // Intentionally @IsString, not @IsEmail: the guide specifies a dedicated
  // 400 INVALID_EMAIL error code for this endpoint, so semantic email
  // validation is performed in AuthService (see validateEmailFormat) to
  // control the exact error code/message rather than letting the generic
  // class-validator pipe produce a VALIDATION_FAILED error.
  @ApiProperty({ example: 'rajesh.gowda@example.com' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ enum: ['login', 'signUp'], example: 'login' })
  @IsIn(['login', 'signUp'])
  purpose!: OtpPurposeWire;
}
