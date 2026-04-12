import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DiscountsService } from './discounts.service';

@Controller('discounts')
@UseGuards(AuthGuard('jwt'))
export class DiscountsController {
    constructor(private readonly discountsService: DiscountsService) {}

    // ─── Tiered Pricing ────────────────────────────────────

    @Get('tiers/:productId')
    getTiers(@Param('productId') productId: string) {
        return this.discountsService.getTiersByProduct(productId);
    }

    @Post('tiers')
    createTier(
        @Body()
        body: {
            productId: string;
            minQty: number;
            maxQty?: number;
            discountPercent: number;
        },
    ) {
        return this.discountsService.createTier(body);
    }

    @Delete('tiers/:id')
    deleteTier(@Param('id') id: string) {
        return this.discountsService.deleteTier(id);
    }

    // ─── Price Calculation ─────────────────────────────────

    @Get('calculate')
    calculatePrice(
        @Query('productId') productId: string,
        @Query('quantity') quantity: string,
        @Query('customerId') customerId?: string,
    ) {
        return this.discountsService.calculateDiscountedPrice(
            productId,
            parseInt(quantity, 10) || 1,
            customerId,
        );
    }

    // ─── Customer Groups ───────────────────────────────────

    @Get('groups')
    getAllGroups() {
        return this.discountsService.getAllGroups();
    }

    @Post('groups')
    createGroup(
        @Body() body: { name: string; discountPercent: number; description?: string },
    ) {
        return this.discountsService.createGroup(body);
    }

    @Delete('groups/:id')
    deleteGroup(@Param('id') id: string) {
        return this.discountsService.deleteGroup(id);
    }

    @Post('groups/:id/members')
    addMember(
        @Param('id') groupId: string,
        @Body() body: { userId: string },
    ) {
        return this.discountsService.addMemberToGroup(groupId, body.userId);
    }

    @Delete('groups/:groupId/members/:userId')
    removeMember(
        @Param('groupId') groupId: string,
        @Param('userId') userId: string,
    ) {
        return this.discountsService.removeMemberFromGroup(groupId, userId);
    }
}
