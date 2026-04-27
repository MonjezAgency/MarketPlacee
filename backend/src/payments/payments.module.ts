import { Module, Logger, forwardRef } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { EscrowService } from './escrow.service';
import { StripeGateway } from './stripe.gateway';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PrismaModule } from '../common/prisma.module';
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

import { AdminModule } from '../admin/admin.module';

@Module({
    imports: [PrismaModule, UsersModule, forwardRef(() => OrdersModule), NotificationsModule, EmailModule, forwardRef(() => AdminModule)],
    controllers: [PaymentsController, StripeWebhookController],
    providers: [PaymentsService, EscrowService, StripeGateway, Logger],
    exports: [PaymentsService, EscrowService],
})
export class PaymentsModule {}
