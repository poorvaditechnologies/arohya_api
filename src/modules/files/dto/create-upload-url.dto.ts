import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export const OWNER_TYPES = ['user_avatar', 'application_document'] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

/**
 * Request body for POST /files/upload-url. `ownerId` is optional for
 * ownerType = user_avatar (the current user's id is used implicitly, from
 * the JWT, per requirement #3) but required for application_document.
 */
export class CreateUploadUrlDto {
  @ApiProperty({ enum: OWNER_TYPES, example: 'application_document' })
  @IsIn(OWNER_TYPES)
  ownerType!: OwnerType;

  @ApiPropertyOptional({ example: 'application_01JABC', description: 'Required for application_document; ignored for user_avatar (implicit from JWT).' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiProperty({ example: 'income-proof.pdf' })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @ApiPropertyOptional({ example: 2_500_000, description: 'Declared file size in bytes; re-validated against the real object at confirm time.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes?: number;
}
