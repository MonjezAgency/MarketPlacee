import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../common/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { PaymentsModule } from '../payments/payments.module';

import { AdminModule } from '../admin/admin.module';
import { StorageModule } from '../storage/storage.module';

@Module({
    imports: [PrismaModule, EmailModule, NotificationsModule, InvoiceModule, StorageModule, forwardRef(() => PaymentsModule), forwardRef(() => AdminModule)],
    providers: [OrdersService],
    controllers: [OrdersController],
    exports: [OrdersService],
})
export class OrdersModule { }
