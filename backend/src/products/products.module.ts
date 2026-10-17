import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PlacementService } from './placement.service';
import { PlacementController } from './placement.controller';
import { PricingModule } from '../pricing/pricing.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { EanService } from './ean.service';
import { EanCacheService } from './ean-cache.service';
import { EanValidatorService } from './ean-validator.service';
import { ExcelService } from '../admin/excel.service';
import { ReviewsService } from './reviews.service';
import { ReviewsController, AdminReviewsController } from './reviews.controller';
import { SupplierCatalogController } from './supplier-catalog.controller';
import { CatalogFieldsController } from './catalog-fields.controller';
import { SupplierImportService } from './supplier-import.service';
import { ImageLookupService } from './image-lookup.service';
import { ImportEnrichmentService } from './import-enrichment.service';
import { SupplierOverviewService } from './supplier-overview.service';
import { PriceHistoryService } from './price-history.service';
import { SupplierUpdatesService } from './supplier-updates.service';
import { TargetPricesService } from './target-prices.service';
import { PriceHistoryController, TargetPricesController } from './market.controller';
import { OfferCompareService } from './offer-compare.service';

import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [PricingModule, AiAgentModule, StorageModule, NotificationsModule, EmailModule],
    providers: [ProductsService, PlacementService, EanService, EanCacheService, EanValidatorService, ExcelService, ReviewsService, SupplierImportService, ImageLookupService, ImportEnrichmentService, SupplierOverviewService, PriceHistoryService, TargetPricesService, SupplierUpdatesService, OfferCompareService],
    controllers: [SupplierCatalogController, CatalogFieldsController, PriceHistoryController, TargetPricesController, ProductsController, PlacementController, ReviewsController, AdminReviewsController],
    exports: [ProductsService, PlacementService, PriceHistoryService],
})
export class ProductsModule { }
