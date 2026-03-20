import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

export class ReviewResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  productId: string;

  @ApiPropertyOptional()
  @Expose()
  orderId?: string;

  @ApiProperty()
  @Expose()
  rating: number;

  @ApiProperty()
  @Expose()
  title: string;

  @ApiProperty()
  @Expose()
  comment: string;

  @ApiPropertyOptional({ type: [String] })
  @Expose()
  images?: string[];

  @ApiProperty()
  @Expose()
  isVerifiedPurchase: boolean;

  @ApiProperty()
  @Expose()
  isApproved: boolean;

  @ApiProperty()
  @Expose()
  isFeatured: boolean;

  @ApiPropertyOptional()
  @Expose()
  storeResponse?: string;

  @ApiPropertyOptional()
  @Expose()
  storeResponseDate?: Date;

  @ApiProperty()
  @Expose()
  helpfulVotes: number;

  @ApiProperty()
  @Expose()
  totalVotes: number;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  // Relazioni incluse
  @ApiPropertyOptional()
  @Expose()
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };

  @ApiPropertyOptional()
  @Expose()
  product?: {
    id: string;
    name: string;
    brand?: string;
    images?: string[];
  };

  // Computed properties
  @ApiProperty()
  @Expose()
  get helpfulnessRatio(): number {
    return this.totalVotes > 0 ? Math.round((this.helpfulVotes / this.totalVotes) * 100) : 0;
  }

  @ApiProperty()
  @Expose()
  get authorName(): string {
    if (this.user) {
      return `${this.user.firstName} ${this.user.lastName.charAt(0)}.`;
    }
    return 'Utente';
  }

  @ApiProperty()
  @Expose()
  get timeAgo(): string {
    const now = new Date();
    const diff = now.getTime() - this.createdAt.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Oggi';
    if (days === 1) return 'Ieri';
    if (days < 30) return `${days} giorni fa`;
    if (days < 365) return `${Math.floor(days / 30)} mesi fa`;
    return `${Math.floor(days / 365)} anni fa`;
  }
}

export class ReviewListResponseDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  @Expose()
  @Type(() => ReviewResponseDto)
  reviews: ReviewResponseDto[];

  @ApiProperty()
  @Expose()
  total: number;

  @ApiProperty()
  @Expose()
  page: number;

  @ApiProperty()
  @Expose()
  limit: number;

  @ApiProperty()
  @Expose()
  totalPages: number;

  @ApiProperty()
  @Expose()
  hasNext: boolean;

  @ApiProperty()
  @Expose()
  hasPrev: boolean;

  @ApiPropertyOptional()
  @Expose()
  averageRating?: number;

  @ApiPropertyOptional()
  @Expose()
  ratingDistribution?: { [key: number]: number };
}

export class ProductRatingStatsDto {
  @ApiProperty({ description: 'Media delle valutazioni' })
  @Expose()
  averageRating: number;

  @ApiProperty({ description: 'Numero totale di recensioni' })
  @Expose()
  totalReviews: number;

  @ApiProperty({ 
    description: 'Distribuzione delle valutazioni per stelle',
    example: { 1: 2, 2: 1, 3: 5, 4: 15, 5: 30 }
  })
  @Expose()
  ratingDistribution: { [key: number]: number };

  @ApiProperty({ description: 'Percentuale di recensioni positive (4-5 stelle)' })
  @Expose()
  positivePercentage: number;

  @ApiProperty({ description: 'Numero di recensioni con immagini' })
  @Expose()
  reviewsWithImages: number;

  @ApiProperty({ description: 'Numero di acquisti verificati' })
  @Expose()
  verifiedPurchases: number;

  @ApiProperty({ description: 'Recensioni recenti (ultimo mese)' })
  @Expose()
  recentReviews: number;
}

export class ReviewStatsResponseDto {
  @ApiProperty()
  @Expose()
  totalReviews: number;

  @ApiProperty()
  @Expose()
  approvedReviews: number;

  @ApiProperty()
  @Expose()
  pendingReviews: number;

  @ApiProperty()
  @Expose()
  featuredReviews: number;

  @ApiProperty()
  @Expose()
  verifiedPurchases: number;

  @ApiProperty()
  @Expose()
  averageRating: number;

  @ApiProperty()
  @Expose()
  reviewsThisMonth: number;

  @ApiProperty()
  @Expose()
  reviewsWithImages: number;

  @ApiProperty()
  @Expose()
  reviewsWithStoreResponse: number;

  @ApiProperty()
  @Expose()
  topRatedProducts: Array<{
    productId: string;
    productName: string;
    averageRating: number;
    totalReviews: number;
  }>;

  @ApiProperty()
  @Expose()
  recentReviews: ReviewResponseDto[];

  @ApiProperty()
  @Expose()
  ratingTrends: Array<{
    month: string;
    averageRating: number;
    totalReviews: number;
  }>;
}