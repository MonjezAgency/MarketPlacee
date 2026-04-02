import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../common/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
    imports: [PrismaModule, EmailModule, NotificationsModule, InvoiceModule, PaymentsModule],
    providers: [OrdersService],
    controllers: [OrdersController],
    exports: [OrdersService],
})
export class OrdersModule { }
