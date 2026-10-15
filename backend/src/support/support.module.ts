import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { StorageModule } from '../storage/storage.module';
import { SupportAssistantController } from './support-assistant.controller';
import { SupportAssistantService } from './support-assistant.service';
import { SupportContextService } from './support-context.service';

@Module({
    imports: [OrdersModule, StorageModule],
    controllers: [SupportAssistantController],
    providers: [SupportAssistantService, SupportContextService],
})
export class SupportModule {}
