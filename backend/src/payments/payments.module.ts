import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { EscrowService } from './escrow.service';
import { PrismaModule } from '../common/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [PrismaModule, NotificationsModule],
    providers: [PaymentsService, EscrowService],
    controllers: [PaymentsController],
    exports: [PaymentsService, EscrowService],
})
export class PaymentsModule {}
