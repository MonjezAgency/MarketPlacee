import { Controller, Post, Get, Patch, UseGuards, Request, Body, Res } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { UsersService } from '../users/users.service';
import { UpdatePayoutSettingsDto } from './dto/update-payout-settings.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly usersService: UsersService,
    ) {}

    @Post('create-intent')
    @Roles(Role.CUSTOMER, Role.ADMIN, Role.OWNER)
    @UseGuards(RolesGuard)
    async createPaymentIntent(
      @Body() dto: CreatePaymentIntentDto,
      @Request() req,
    ) {
      return this.paymentsService.createPaymentIntent(
        dto.orderId,
        req.user.sub,
        req.user.role,
      );
    }

    @Post('connect/onboard')
    @Roles(Role.SUPPLIER)
    @UseGuards(RolesGuard)
    async onboardConnect(@Request() req) {
        return this.paymentsService.createConnectOnboardingUrl(req.user.sub);
    }

    @Get('my-earnings')
    @Roles(Role.SUPPLIER)
    @UseGuards(RolesGuard)
    async getMyEarnings(@Request() req) {
        return this.paymentsService.getSupplierEarnings(req.user.sub);
    }

    @Patch('payout-settings')
    @Roles(Role.SUPPLIER)
    @UseGuards(RolesGuard)
    async updatePayoutSettings(@Request() req, @Body() dto: UpdatePayoutSettingsDto) {
        return this.usersService.updatePayoutSettings(req.user.sub, dto);
    }

    @Get('admin/revenue')
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    async getAdminRevenue() {
        return this.paymentsService.getAdminRevenue();
    }

    @Get('connect/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER)
    async getConnectStatus(@Request() req) {
        return this.paymentsService.getConnectStatus(req.user.sub);
    }
}
