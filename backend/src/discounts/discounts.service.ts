import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DiscountsService {
    constructor(private prisma: PrismaService) {}

    // ─── Tiered Pricing ────────────────────────────────────

    async createTier(data: {
        productId: string;
        minQty: number;
        maxQty?: number;
        discountPercent: number;
    }) {
        // Validate: discountPercent must be between 0 and 100
        if (data.discountPercent < 0 || data.discountPercent > 100) {
            throw new BadRequestException('Discount percent must be between 0 and 100');
        }
        if (data.minQty < 1) {
            throw new BadRequestException('Minimum quantity must be at least 1');
        }
        if (data.maxQty !== undefined && data.maxQty !== null && data.maxQty < data.minQty) {
            throw new BadRequestException('Max quantity must be greater than or equal to min quantity');
        }

        // Verify product exists
        const product = await this.prisma.product.findUnique({ where: { id: data.productId } });
        if (!product) throw new NotFoundException('Product not found');

        return this.prisma.tieredPrice.create({
            data: {
                productId: data.productId,
                minQty: data.minQty,
                maxQty: data.maxQty ?? null,
                discountPercent: data.discountPercent,
            },
        });
    }

    async getTiersByProduct(productId: string) {
        return this.prisma.tieredPrice.findMany({
            where: { productId },
            orderBy: { minQty: 'asc' },
        });
    }

    async deleteTier(id: string) {
        const tier = await this.prisma.tieredPrice.findUnique({ where: { id } });
        if (!tier) throw new NotFoundException('Tier not found');
        return this.prisma.tieredPrice.delete({ where: { id } });
    }

    /**
     * Calculate the final price for a product based on quantity tiers
     * and optional customer group discount.
     */
    async calculateDiscountedPrice(productId: string, quantity: number, customerId?: string) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            include: { tieredPrices: { orderBy: { minQty: 'asc' } } },
        });
        if (!product) throw new NotFoundException('Product not found');

        const basePrice = product.price;
        let tierDiscount = 0;

        // Find the matching tier
        for (const tier of product.tieredPrices) {
            if (quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)) {
                tierDiscount = tier.discountPercent;
            }
        }

        // Check for customer group discount
        let groupDiscount = 0;
        if (customerId) {
            const membership = await this.prisma.customerGroupMember.findFirst({
                where: { userId: customerId },
                include: { group: true },
            });
            if (membership) {
                groupDiscount = membership.group.discountPercent;
            }
        }

        // Combine discounts (additive, capped at product price)
        const totalDiscountPercent = Math.min(tierDiscount + groupDiscount, 100);
        const unitPrice = basePrice * (1 - totalDiscountPercent / 100);
        const totalPrice = unitPrice * quantity;

        return {
            basePrice,
            tierDiscount,
            groupDiscount,
            totalDiscountPercent,
            unitPrice: Math.round(unitPrice * 100) / 100,
            totalPrice: Math.round(totalPrice * 100) / 100,
            quantity,
        };
    }

    // ─── Customer Price Groups ─────────────────────────────

    async createGroup(data: { name: string; discountPercent: number; description?: string }) {
        if (data.discountPercent < 0 || data.discountPercent > 100) {
            throw new BadRequestException('Discount percent must be between 0 and 100');
        }
        return this.prisma.customerPriceGroup.create({ data });
    }

    async updateGroup(id: string, data: { name?: string; discountPercent?: number; description?: string }) {
        const group = await this.prisma.customerPriceGroup.findUnique({ where: { id } });
        if (!group) throw new NotFoundException('Group not found');
        return this.prisma.customerPriceGroup.update({ where: { id }, data });
    }

    async deleteGroup(id: string) {
        const group = await this.prisma.customerPriceGroup.findUnique({ where: { id } });
        if (!group) throw new NotFoundException('Group not found');
        return this.prisma.customerPriceGroup.delete({ where: { id } });
    }

    async getAllGroups() {
        return this.prisma.customerPriceGroup.findMany({
            include: {
                members: true,
                _count: { select: { members: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async addMemberToGroup(groupId: string, userId: string) {
        // Verify group exists
        const group = await this.prisma.customerPriceGroup.findUnique({ where: { id: groupId } });
        if (!group) throw new NotFoundException('Group not found');

        // Check if membership already exists
        const existing = await this.prisma.customerGroupMember.findUnique({
            where: { userId_groupId: { userId, groupId } },
        });
        if (existing) throw new BadRequestException('User is already a member of this group');

        return this.prisma.customerGroupMember.create({
            data: { userId, groupId },
        });
    }

    async removeMemberFromGroup(groupId: string, userId: string) {
        const member = await this.prisma.customerGroupMember.findUnique({
            where: { userId_groupId: { userId, groupId } },
        });
        if (!member) throw new NotFoundException('Membership not found');
        return this.prisma.customerGroupMember.delete({ where: { id: member.id } });
    }

    async getGroupMembers(groupId: string) {
        return this.prisma.customerGroupMember.findMany({
            where: { groupId },
        });
    }
}
