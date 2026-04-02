import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PlacementService } from './placement.service';
import { PlacementController } from './placement.controller';
import { PricingModule } from '../pricing/pricing.module';
import { EanService } from './ean.service';
import { ExcelService } from '../admin/excel.service';
import { ReviewsService } from './reviews.service';
import { ReviewsController, AdminReviewsController } from './reviews.controller';

@Module({
    imports: [PricingModule],
    providers: [ProductsService, PlacementService, EanService, ExcelService, ReviewsService],
    controllers: [ProductsController, PlacementController, ReviewsController, AdminReviewsController],
    exports: [ProductsService, PlacementService],
})
export class ProductsModule { }
