import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

/** Marks supplier confirmations that passed their deadline as expired and tells Atlantis. */
@Injectable()
export class OrderWorkflowCron {
    private readonly logger = new Logger(OrderWorkflowCron.name);
    constructor(private readonly orders: OrdersService) {}

    @Cron(CronExpression.EVERY_HOUR)
    async expire() {
        try {
            const n = await this.orders.expireStaleConfirmations();
            if (n) this.logger.log(`Expired ${n} supplier confirmation${n === 1 ? '' : 's'}`);
        } catch (e: any) {
            this.logger.warn(`Expiry run failed: ${e?.message}`);
        }
    }
}
