import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { EmailModule } from '../email/email.module';
import { EmailTrackingModule } from '../email-tracking/email-tracking.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [EmailModule, EmailTrackingModule, NotificationsModule],
    controllers: [OffersController],
    providers: [OffersService],
    exports: [OffersService],
})
export class OffersModule {}
