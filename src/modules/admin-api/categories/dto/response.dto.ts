import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

export class CategoryResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional()
  @Expose()
  description?: string;

  @ApiProperty()
  @Expose()
  slug: string;

  @ApiPropertyOptional()
  @Expose()
  image?: string;

  @ApiProperty()
  @Expose()
  sortOrder: number;

  @ApiProperty()
  @Expose()
  isActive: boolean;

  @ApiPropertyOptional()
  @Expose()
  parentId?: string;

  @ApiPropertyOptional({ type: String, description: 'Tipo abbigliamento (es. camicie, pantaloni)' })
  @Expose()
  clothingType?: string;

  @ApiPropertyOptional()
  @Expose()
  metaTitle?: string;

  @ApiPropertyOptional()
  @Expose()
  metaDescription?: string;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  // Relazioni
  @ApiPropertyOptional()
  @Expose()
  parent?: CategoryResponseDto;

  @ApiPropertyOptional({ type: [CategoryResponseDto] })
  @Expose()
  @Type(() => CategoryResponseDto)
  children?: CategoryResponseDto[];

  @ApiPropertyOptional({ type: Number })
  @Expose()
  productCount?: number;

  @ApiProperty()
  @Expose()
  get displayName(): string {
    return this.name;
  }

  @ApiProperty()
  @Expose()
  get breadcrumb(): Array<{ id: string; name: string; slug: string }> {
    const path: Array<{ id: string; name: string; slug: string }> = [];

    if (this.parent) {
      path.push({
        id: this.parent.id,
        name: this.parent.name,
        slug: this.parent.slug,
      });
    }

    path.push({ id: this.id, name: this.name, slug: this.slug });
    return path;
  }
}

export class CategoryListResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  @Expose()
  @Type(() => CategoryResponseDto)
  categories: CategoryResponseDto[];

  @ApiProperty()
  @Expose()
  total: number;

  @ApiPropertyOptional()
  @Expose()
  rootCategories?: number;

  @ApiPropertyOptional()
  @Expose()
  totalActiveCategories?: number;
}

export class CategoryTreeResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  @Expose()
  @Type(() => CategoryResponseDto)
  tree: CategoryResponseDto[];

  @ApiProperty()
  @Expose()
  totalCategories: number;

  @ApiProperty()
  @Expose()
  maxDepth: number;
}

export class CategoryStatsResponseDto {
  @ApiProperty()
  @Expose()
  totalCategories: number;

  @ApiProperty()
  @Expose()
  activeCategories: number;

  @ApiProperty()
  @Expose()
  rootCategories: number;

  @ApiProperty()
  @Expose()
  categoriesWithProducts: number;

  @ApiProperty()
  @Expose()
  averageProductsPerCategory: number;

  @ApiProperty()
  @Expose()
  topCategories: Array<{
    id: string;
    name: string;
    productCount: number;
  }>;
}
