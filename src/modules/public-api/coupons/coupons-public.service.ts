import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CouponsAdminService } from 'src/modules/admin-api/coupons/coupons.service';
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { CouponValidationResultDto } from 'src/modules/admin-api/coupons/dto/coupon.dto';
import { ValidateCouponPublicDto } from './dto/validate-coupon-public.dto';

@Injectable()
export class CouponsPublicService {
  private readonly logger = new Logger(CouponsPublicService.name);

  constructor(
    private readonly couponsAdminService: CouponsAdminService,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
  ) {}

  async validateForPublic(
    dto: ValidateCouponPublicDto,
    user?: any,
  ): Promise<CouponValidationResultDto> {
    const userId: string | undefined = user?.id;

    const isFirstOrder = userId ? await this.isFirstOrder(userId) : undefined;

    const result = await this.couponsAdminService.validate({
      code: dto.code,
      orderTotal: dto.cartSubtotal,
      userId,
      isFirstOrder,
    });

    // Rimuove campi interni admin dalla risposta pubblica
    if (result.valid && result.coupon) {
      return {
        valid: true,
        coupon: {
          id: result.coupon.id,
          code: result.coupon.code,
          name: result.coupon.name,
          type: result.coupon.type,
          value: result.coupon.value,
          minimumOrderAmount: result.coupon.minimumOrderAmount,
          maximumDiscountAmount: result.coupon.maximumDiscountAmount,
        },
        discountAmount: result.discountAmount,
      };
    }

    return result;
  }

  private async isFirstOrder(userId: string): Promise<boolean> {
    const count = await this.ordersRepo.count({
      where: {
        userId,
        status: In([
          OrderStatus.CONFIRMED,
          OrderStatus.PROCESSING,
          OrderStatus.SHIPPED,
          OrderStatus.DELIVERED,
        ]),
      },
    });
    return count === 0;
  }
}
