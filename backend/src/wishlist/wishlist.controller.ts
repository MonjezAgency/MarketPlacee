import { Controller, Get, Post, Delete, Param, Request, UseGuards } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
    constructor(private readonly wishlistService: WishlistService) {}

    @Get()
    getWishlist(@Request() req) {
        return this.wishlistService.getWishlist(req.user.sub);
    }

    @Post(':productId')
    add(@Param('productId') productId: string, @Request() req) {
        return this.wishlistService.add(req.user.sub, productId);
    }

    @Delete(':productId')
    remove(@Param('productId') productId: string, @Request() req) {
        return this.wishlistService.remove(req.user.sub, productId);
    }

    @Get('check/:productId')
    async check(@Param('productId') productId: string, @Request() req) {
        const saved = await this.wishlistService.isInWishlist(req.user.sub, productId);
        return { saved };
    }
}
