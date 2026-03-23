import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt.guard';
import { CouponValidationResultDto } from 'src/modules/admin-api/coupons/dto/coupon.dto';
import { CouponsPublicService } from './coupons-public.service';
import { ValidateCouponPublicDto } from './dto/validate-coupon-public.dto';

@ApiTags('coupons')
@Controller('coupons')
export class CouponsPublicController {
  constructor(private readonly couponsPublicService: CouponsPublicService) {}

  @Post('validate')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Valida un codice coupon e calcola lo sconto applicabile' })
  @ApiResponse({ status: 200, description: 'Risultato validazione coupon', type: CouponValidationResultDto })
  async validate(
    @Body() dto: ValidateCouponPublicDto,
    @CurrentUser() user?: any,
  ): Promise<CouponValidationResultDto> {
    return this.couponsPublicService.validateForPublic(dto, user);
  }
}
