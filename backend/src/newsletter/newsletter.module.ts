import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { PrismaModule } from '../common/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [PrismaModule, EmailModule],
    controllers: [NewsletterController],
    providers: [NewsletterService],
    exports: [NewsletterService]
})
export class NewsletterModule {}
