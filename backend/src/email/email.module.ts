import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailAdminController } from './email-admin.controller';

@Module({
    providers: [EmailService],
    controllers: [EmailAdminController],
    exports: [EmailService],
})
export class EmailModule { }
