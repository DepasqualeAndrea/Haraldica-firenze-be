import { Expose } from "class-transformer";
import { ProductListResponseDto } from "../../products/dto/product.dto";

export class PersonalizedRecommendationsDto {
  @Expose()
  forYou: ProductListResponseDto[];

  @Expose()
  basedOnStyle: ProductListResponseDto[];

  @Expose()
  basedOnSize: ProductListResponseDto[];

  @Expose()
  favoriteCategories: ProductListResponseDto[];

  @Expose()
  newArrivals: ProductListResponseDto[];

  @Expose()
  reasoning: {
    styleMatches: number;
    sizeMatches: number;
    categoryMatches: number;
    newArrivalsCount: number;
  };
}

export class RecommendationsQueryDto {
  limit?: number = 12;
  excludeProductIds?: string[];
  categoryFilter?: string;
  styleFilter?: string;
  priceRange?: {
    min: number;
    max: number;
  };
}
