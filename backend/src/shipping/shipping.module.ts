import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { ShipmentService } from './shipment.service';
import { ShipmentController } from './shipment.controller';
import { DhlProvider, AramexProvider } from './shipping.provider';
import { PrismaModule } from '../common/prisma.module';
import { DeliveryPolicyController, AdminDeliveryPolicyController } from './delivery-policy.controller';

@Module({
    imports: [PrismaModule],
    providers: [ShippingService, ShipmentService, DhlProvider, AramexProvider],
    controllers: [ShippingController, ShipmentController, DeliveryPolicyController, AdminDeliveryPolicyController],
    exports: [ShippingService, ShipmentService, DhlProvider, AramexProvider],
})
export class ShippingModule { }
