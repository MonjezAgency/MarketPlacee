import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PlacementType, PlacementStatus } from '@prisma/client';

@Injectable()
export class AdsService {
    constructor(private prisma: PrismaService) { }

    // Public endpoint for fetching ads based on frontend placement
    async getAdsByPlacement(type: string): Promise<any[]> {
        // Map frontend placement strings to DB types if needed
        const placementType = type.toUpperCase() as PlacementType;

        const placements = await this.prisma.productPlacement.findMany({
            where: {
                placementType: placementType,
                status: 'ACTIVE',
                startDate: { lte: new Date() },
                endDate: { gte: new Date() }
            },
            include: {
                product: {
                    include: {
                        supplier: { select: { name: true, companyName: true, id: true } }
                    }
                }
            },
            orderBy: { priorityOrder: 'desc' }
        });

        return placements.map(p => ({
            id: p.id,
            placement: p.placementType,
            product: p.product
        }));
    }

    // Supplier: Get my own ad requests/placements
    async getMyAds(supplierId: string) {
        return this.prisma.productPlacement.findMany({
            where: {
                product: { supplierId }
            },
            include: {
                product: { select: { name: true, price: true, images: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    // Supplier: Request a new placement
    async requestPlacement(supplierId: string, data: { productId: string; type: PlacementType; durationDays: number }) {
        const product = await this.prisma.product.findUnique({ where: { id: data.productId } });
        if (!product) throw new NotFoundException('Product not found');
        if (product.supplierId !== supplierId) throw new ForbiddenException('You do not own this product');

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + data.durationDays);

        const prices = {
            [PlacementType.HERO]: 500,
            [PlacementType.FEATURED]: 300,
            [PlacementType.BANNER]: 200,
            [PlacementType.LISTING]: 100
        };

        return this.prisma.productPlacement.create({
            data: {
                productId: data.productId,
                placementType: data.type,
                status: 'PENDING',
                price: prices[data.type] || 0,
                startDate,
                endDate
            }
        });
    }

    // Admin: Get all ads
    async getAllAdsAdmin() {
        return this.prisma.productPlacement.findMany({
            include: {
                product: {
                    include: { supplier: { select: { name: true, companyName: true } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    // Admin: Add/Create ad directly
    async addAd(productId: string, type: PlacementType) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30); // Default 30 days for admin ads

        return this.prisma.productPlacement.create({
            data: {
                productId,
                placementType: type,
                status: 'ACTIVE',
                startDate: new Date(),
                endDate
            }
        });
    }

    // Admin/Supplier: Remove ad
    async removeAd(adId: string, supplierId?: string) {
        if (supplierId) {
            const ad = await this.prisma.productPlacement.findUnique({
                where: { id: adId },
                include: { product: true }
            });
            if (ad?.product.supplierId !== supplierId) throw new ForbiddenException();
        }

        await this.prisma.productPlacement.delete({ where: { id: adId } });
    }

    // Admin: Update status
    async updateAdStatus(adId: string, status: PlacementStatus) {
        return this.prisma.productPlacement.update({
            where: { id: adId },
            data: { status }
        });
    }
}
