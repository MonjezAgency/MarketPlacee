import { Module } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { PrismaModule } from '../common/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
    imports: [PrismaModule, NotificationsModule, PaymentsModule],
    controllers: [DisputesController],
    providers: [DisputesService],
    exports: [DisputesService],
})
export class DisputesModule {}
