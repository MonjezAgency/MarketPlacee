import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { MarketingConsentService } from './marketing-consent.service';

/** Central marketing consent + suppression check, importable by any marketing sender (offers, newsletter). */
@Module({
    imports: [PrismaModule],
    providers: [MarketingConsentService],
    exports: [MarketingConsentService],
})
export class MarketingConsentModule {}
