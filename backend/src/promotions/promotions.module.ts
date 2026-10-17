import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { AdminPromotionsController, SupplierPromotionsController } from './promotions.controller';

/** Special offers (Promotion): supplier and admin management. Price application lives in promotion-lookup.ts. */
@Module({
    providers: [PromotionsService],
    controllers: [SupplierPromotionsController, AdminPromotionsController],
    exports: [PromotionsService],
})
export class PromotionsModule {}
