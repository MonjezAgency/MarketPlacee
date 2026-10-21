import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterAdminController, NewsletterController } from './newsletter.controller';
import { NewsletterContactsService } from './newsletter-contacts.service';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';
import { MarketingConsentModule } from './marketing-consent.module';
import { PrismaModule } from '../common/prisma.module';
import { EmailModule } from '../email/email.module';
import { EmailTrackingModule } from '../email-tracking/email-tracking.module';

@Module({
    imports: [PrismaModule, EmailModule, EmailTrackingModule, MarketingConsentModule],
    controllers: [NewsletterController, NewsletterAdminController],
    providers: [NewsletterService, NewsletterContactsService, NewsletterCampaignsService],
    exports: [NewsletterService, MarketingConsentModule],
})
export class NewsletterModule {}
