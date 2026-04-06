import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class ReviewsService {
    constructor(private prisma: PrismaService) {}

    async findAll(productId: string) {
        return this.prisma.review.findMany({
            where: { productId },
            include: {
                user: { select: { id: true, name: true, companyName: true, avatar: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async create(productId: string, userId: string, rating: number, comment?: string, files: any[] = []) {
        if (rating < 1 || rating > 5) throw new BadRequestException('Rating must be between 1 and 5');

        const images = [];
        if (files && files.length > 0) {
            const uploadDir = join(process.cwd(), 'uploads', 'reviews');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            for (const file of files) {
                const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
                const filePath = join(uploadDir, fileName);
                fs.writeFileSync(filePath, file.buffer);
                images.push(`/uploads/reviews/${fileName}`);
            }
        }

        const review = await this.prisma.review.upsert({
            where: { productId_userId: { productId, userId } },
            update: { rating, comment, images },
            create: { productId, userId, rating, comment, images },
            include: {
                user: { select: { id: true, name: true, companyName: true, avatar: true } },
            },
        });

        await this.updateProductRating(productId);
        return review;
    }

    async delete(reviewId: string, userId: string) {
        const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
        if (!review) throw new BadRequestException('Review not found');
        if (review.userId !== userId) throw new ForbiddenException('Not your review');

        await this.prisma.review.delete({ where: { id: reviewId } });
        await this.updateProductRating(review.productId);
        return { success: true };
    }

    /** Admin: delete any review */
    async adminDelete(reviewId: string) {
        const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
        if (!review) throw new BadRequestException('Review not found');
        await this.prisma.review.delete({ where: { id: reviewId } });
        await this.updateProductRating(review.productId);
        return { success: true };
    }

    /** Admin: list all reviews with pagination and optional rating filter */
    async findAllAdmin(page = 1, limit = 30, minRating?: number) {
        const where: any = {};
        if (minRating !== undefined) where.rating = { lte: minRating };
        const skip = (page - 1) * limit;
        const [reviews, total] = await Promise.all([
            this.prisma.review.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true, companyName: true } },
                    product: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.review.count({ where }),
        ]);
        return { data: reviews, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    private async updateProductRating(productId: string) {
        const reviews = await this.prisma.review.findMany({ where: { productId }, select: { rating: true } });
        const count = reviews.length;
        const avg = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
        await this.prisma.product.update({
            where: { id: productId },
            data: { rating: Math.round(avg * 10) / 10, reviewsCount: count },
        });
    }
}
