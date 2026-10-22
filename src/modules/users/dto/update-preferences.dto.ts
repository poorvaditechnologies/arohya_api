import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePreferencesDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  biometricEnabled!: boolean;
}
