import { Module } from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentAdminController, FulfillmentPublicController, FulfillmentSupplierController } from './fulfillment.controller';

@Module({
    controllers: [FulfillmentPublicController, FulfillmentSupplierController, FulfillmentAdminController],
    providers: [FulfillmentService],
    exports: [FulfillmentService],
})
export class FulfillmentModule {}
