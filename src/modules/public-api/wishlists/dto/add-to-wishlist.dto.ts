import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddToWishlistDto {
  @ApiProperty({ description: 'ID del prodotto da aggiungere alla wishlist' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;
}
