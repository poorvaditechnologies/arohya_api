import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class AddressDto {
  @ApiProperty({ example: '24 MG Road' })
  @IsString()
  @IsNotEmpty()
  addressLine!: string;

  @ApiProperty({ example: 'Bengaluru' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Karnataka' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty({ example: '560001' })
  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @ApiProperty({ example: 'IN' })
  @IsString()
  @IsNotEmpty()
  country!: string;
}

export class TemporaryAddressDto extends AddressDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  sameAsPermanent!: boolean;
}

/**
 * GAP (guide deviation note #1): the guide's POST /applications request
 * JSON has NO `requestedAmount` field, while GET /applications and
 * GET /applications/{id} responses DO include `requestedAmount`. This DTO
 * deliberately has no requestedAmount property — see the matching comment
 * on `Application.requestedAmount` in schema.prisma and on
 * `ApplicationsService.submit` for the resulting null-until-underwriting
 * behavior we chose.
 */
export class CreateApplicationDto {
  @ApiProperty({ example: 'product_home_loan' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 'Rajesh' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ example: 'Gowda' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({ example: '9845012849' })
  @IsString()
  @IsNotEmpty()
  mobile!: string;

  @ApiPropertyOptional({ example: 'rajesh.gowda@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 75000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  income?: number;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional()
  @IsDateString()
  loanNeededDate?: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AddressDto)
  permanentAddress!: AddressDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => TemporaryAddressDto)
  temporaryAddress!: TemporaryAddressDto;
}
