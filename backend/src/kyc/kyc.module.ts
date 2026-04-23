import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { PrismaModule } from '../common/prisma.module';
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [PrismaModule, EmailModule, StorageModule, AiAgentModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
