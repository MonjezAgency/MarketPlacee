import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { PrismaModule } from '../common/prisma.module';
import { EmailModule } from '../email/email.module';
import { EmailTrackingModule } from '../email-tracking/email-tracking.module';

@Module({
    imports: [PrismaModule, EmailModule, EmailTrackingModule],
    controllers: [NewsletterController],
    providers: [NewsletterService],
    exports: [NewsletterService]
})
export class NewsletterModule {}
