import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PlacementStatus, PlacementType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PricingService } from '../pricing/pricing.service';

@Injectable()
export class PlacementService {
    constructor(private prisma: PrismaService, private pricingService: PricingService) { }

    async createRequest(productId: string, type: PlacementType, durationDays: number) {
        // 1. Calculate Price
        const price = this.pricingService.calculateTotal({
            productId,
            placementType: type,
            durationDays,
        });

        // 2. Create Placement Request
        return this.prisma.productPlacement.create({
            data: {
                productId,
                placementType: type,
                price,
                status: PlacementStatus.PENDING,
                history: {
                    create: {
                        newStatus: PlacementStatus.PENDING,
                        changedById: 'SYSTEM', // Should be supplier ID in practice
                        reason: 'Placement request submitted',
                    },
                },
            },
            include: {
                product: true,
                history: true,
            },
        });
    }

    async approvePlacement(placementId: string, adminId: string, priorityOrder: number) {
        const placement = await this.prisma.productPlacement.findUnique({
            where: { id: placementId },
        });

        if (!placement) throw new NotFoundException('Placement not found');

        // 3. Conflict Detection
        const conflict = await this.prisma.productPlacement.findFirst({
            where: {
                placementType: placement.placementType,
                priorityOrder: priorityOrder,
                status: PlacementStatus.ACTIVE,
                id: { not: placementId },
            },
        });

        if (conflict) {
            throw new ConflictException(`Priority slot ${priorityOrder} for ${placement.placementType} is already taken by product ${conflict.productId}`);
        }

        // 4. Approve and Log
        return this.prisma.productPlacement.update({
            where: { id: placementId },
            data: {
                status: PlacementStatus.ACTIVE,
                priorityOrder,
                history: {
                    create: {
                        previousStatus: placement.status,
                        newStatus: PlacementStatus.ACTIVE,
                        changedById: adminId,
                        reason: `Approved with priority ${priorityOrder}`,
                    },
                },
            },
        });
    }

    async findAll() {
        return this.prisma.productPlacement.findMany({
            include: {
                product: {
                    include: {
                        supplier: {
                            select: { id: true, name: true, companyName: true, email: true },
                        },
                    },
                },
                history: true,
            },
        });
    }

    async findBySupplier(supplierId: string) {
        return this.prisma.productPlacement.findMany({
            where: {
                product: {
                    supplierId,
                },
            },
            include: {
                product: true,
            },
        });
    }
}
