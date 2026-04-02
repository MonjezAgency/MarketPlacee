import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class CouponsService {
    constructor(private prisma: PrismaService) { }

    async create(data: { code: string; discountPercent: number; expirationDate: Date; placementId: string }) {
        const placement = await this.prisma.productPlacement.findUnique({
            where: { id: data.placementId },
        });

        if (!placement) {
            throw new BadRequestException('Offer not found');
        }

        const existing = await this.prisma.coupon.findUnique({
            where: { code: data.code },
        });

        if (existing) {
            throw new BadRequestException('Coupon code already exists');
        }

        return this.prisma.coupon.create({
            data: {
                code: data.code,
                discountPercent: data.discountPercent,
                expirationDate: data.expirationDate,
                placementId: data.placementId,
            }
        });
    }

    async findAll() {
        return this.prisma.coupon.findMany({
            include: {
                placement: {
                    include: {
                        product: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async validate(code: string) {
        const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });
        if (!coupon) throw new NotFoundException('Invalid coupon code');
        if (!coupon.isActive) throw new BadRequestException('Coupon is no longer active');
        if (new Date() > coupon.expirationDate) throw new BadRequestException('Coupon has expired');
        return { code: coupon.code, discountPercent: coupon.discountPercent };
    }
}
