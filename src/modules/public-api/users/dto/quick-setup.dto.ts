import { IsString, IsIn, IsArray, IsOptional, IsBoolean } from "class-validator";

export class QuickSetupDto {
  @IsOptional()
  @IsString()
  @IsIn(['slim', 'regular', 'relaxed', 'oversized'])
  preferredFit?: string;

  @IsOptional()
  @IsString()
  @IsIn(['classic', 'casual', 'formal', 'sport'])
  style?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredSizes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredColors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteCategories?: string[];

  @IsOptional()
  @IsBoolean()
  newsletter?: boolean;
}
