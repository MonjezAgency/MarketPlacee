import { StepUpService } from '../auth/step-up.service';
import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { MixedLoadsService } from './mixed-loads.service';
import { MixedLoadsController } from './mixed-loads.controller';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../common/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { PaymentsModule } from '../payments/payments.module';

import { AdminModule } from '../admin/admin.module';
import { StorageModule } from '../storage/storage.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { OrderWorkflowCron } from './order-workflow.cron';

@Module({
    imports: [PrismaModule, EmailModule, NotificationsModule, InvoiceModule, StorageModule, FulfillmentModule, forwardRef(() => PaymentsModule), forwardRef(() => AdminModule)],
    providers: [OrdersService, MixedLoadsService, StepUpService, OrderWorkflowCron],
    controllers: [OrdersController, MixedLoadsController],
    exports: [OrdersService, MixedLoadsService],
})
export class OrdersModule { }
