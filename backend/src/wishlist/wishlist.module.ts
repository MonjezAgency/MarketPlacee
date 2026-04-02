import { Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';

@Module({
    providers: [WishlistService],
    controllers: [WishlistController],
    exports: [WishlistService],
})
export class WishlistModule {}
