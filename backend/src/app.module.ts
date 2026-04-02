import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PricingModule } from './pricing/pricing.module';
import { ProductsModule } from './products/products.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';
import { CouponsModule } from './coupons/coupons.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { ShippingModule } from './shipping/shipping.module';
import { DiscountsModule } from './discounts/discounts.module';
import { InvoiceModule } from './invoices/invoice.module';
import { FinanceModule } from './finance/finance.module';

import { PrismaModule } from './common/prisma.module';
import { SecurityModule } from './security/security.module';
import { SecurityInterceptor } from './security/security.interceptor';
import { AdsModule } from './ads/ads.module';
import { ChatModule } from './chat/chat.module';
import { KycModule } from './kyc/kyc.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { PaymentsModule } from './payments/payments.module';
import { DisputesModule } from './disputes/disputes.module';
import { OwnerModule } from './owner/owner.module';

@Module({
    imports: [
        ThrottlerModule.forRoot([{
            ttl: 60000,
            limit: 100,
        }]),
        ScheduleModule.forRoot(),
        PrismaModule,
        SecurityModule,
        PricingModule,
        ProductsModule,
        AdminModule,
        AuthModule,
        UsersModule,
        OrdersModule,
        CouponsModule,
        AdsModule,
        ChatModule,
        KycModule,
        NotificationsModule,
        WishlistModule,
        PaymentsModule,
        DisputesModule,
        ShippingModule,
        DiscountsModule,
        InvoiceModule,
        FinanceModule,
        OwnerModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TransformInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: SecurityInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: AuditInterceptor,
        },
    ],
})
export class AppModule { }
