import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class WishlistService {
    constructor(private prisma: PrismaService) {}

    async getWishlist(userId: string) {
        const items = await this.prisma.wishlistItem.findMany({
            where: { userId },
            include: {
                product: {
                    select: {
                        id: true, name: true, price: true, images: true,
                        brand: true, category: true, status: true,
                        supplier: { select: { name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return items.map(i => ({ id: i.id, addedAt: i.createdAt, ...i.product }));
    }

    async add(userId: string, productId: string) {
        await this.prisma.wishlistItem.upsert({
            where: { userId_productId: { userId, productId } },
            update: {},
            create: { userId, productId },
        });
        return { added: true };
    }

    async remove(userId: string, productId: string) {
        await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
        return { removed: true };
    }

    async isInWishlist(userId: string, productId: string): Promise<boolean> {
        const item = await this.prisma.wishlistItem.findUnique({
            where: { userId_productId: { userId, productId } },
        });
        return !!item;
    }
}
