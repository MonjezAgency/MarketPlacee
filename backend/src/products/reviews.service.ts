import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { renderReviewNotificationEmail } from '../email/marketing-template';

const USER_SELECT = { id: true, name: true, companyName: true, avatar: true } as const;

/**
 * Product reviews. Rules:
 *  • only signed-in users, one review per user per product (editing replaces it);
 *  • only APPROVED (live) products can be reviewed;
 *  • a supplier can't review their own product;
 *  • "Verified purchase" is shown when the reviewer has a delivered order
 *    containing the product (computed, never self-declared). Buying is not
 *    required to review — that's a business decision still open.
 *  • the product's supplier is told about a NEW review once (in-app, plus
 *    an email unless they turned listing feedback off); edits don't notify.
 *  • reviews publish immediately — there is no moderation queue, so the
 *    notification says "published"; admins can remove a review.
 */
@Injectable()
export class ReviewsService {
    private readonly logger = new Logger(ReviewsService.name);
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
        private email: EmailService,
        private storage: SupabaseStorageService,
    ) {}

    async findAll(productId: string) {
        const reviews = await this.prisma.review.findMany({
            where: { productId },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        if (!reviews.length) return reviews;
        const buyers = await this.prisma.orderItem.findMany({
            where: { productId, order: { status: 'DELIVERED', customerId: { in: reviews.map((r) => r.userId) } } },
            select: { order: { select: { customerId: true } } },
        });
        const verified = new Set(buyers.map((b) => b.order.customerId));
        return reviews.map((r) => ({ ...r, verifiedPurchase: verified.has(r.userId) }));
    }

    async create(productId: string, userId: string, rating: number, comment?: string, files: any[] = []) {
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BadRequestException('Rating must be a whole number from 1 to 5.');
        const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, status: true, supplierId: true } });
        if (!product || product.status !== 'APPROVED') throw new NotFoundException('This product can’t be reviewed.');
        if (product.supplierId && product.supplierId === userId) throw new ForbiddenException('You can’t review your own product.');
        const text = typeof comment === 'string' ? comment.trim().slice(0, 2000) : undefined;

        // Photos go to the configured storage (the server disk is wiped on every deploy).
        const images: string[] = [];
        for (const file of (files || []).slice(0, 5)) {
            try { images.push(await this.storage.uploadProductImage(file.buffer, `review-${file.originalname || 'photo'}`, file.mimetype)); }
            catch (e: any) { this.logger.warn(`[reviews] photo upload failed: ${e?.message}`); }
        }

        const existing = await this.prisma.review.findUnique({ where: { productId_userId: { productId, userId } }, select: { id: true, images: true } });
        let review: any;
        let isNew = false;
        if (existing) {
            review = await this.prisma.review.update({ where: { id: existing.id }, data: { rating, comment: text, ...(images.length ? { images } : {}) }, include: { user: { select: USER_SELECT } } });
        } else {
            try {
                review = await this.prisma.review.create({ data: { productId, userId, rating, comment: text, images }, include: { user: { select: USER_SELECT } } });
                isNew = true;
            } catch (e: any) {
                // A double submit lost the race: update instead, and don't notify twice.
                if (e?.code !== 'P2002') throw e;
                review = await this.prisma.review.update({ where: { productId_userId: { productId, userId } }, data: { rating, comment: text }, include: { user: { select: USER_SELECT } } });
            }
        }

        await this.updateProductRating(productId);
        if (isNew && product.supplierId) this.notifySupplier(product as any, review).catch((e) => this.logger.warn(`[reviews] supplier notification failed: ${e?.message}`));
        return review;
    }

    /** Once per new review: in-app notification, and an email unless the supplier turned listing feedback off. */
    private async notifySupplier(product: { id: string; name: string; supplierId: string }, review: { id: string; rating: number; comment?: string | null }) {
        const siteUrl = (process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');
        const reviewUrl = `${siteUrl}/products/${product.id}#reviews`;
        await this.notifications.notifyUser(product.supplierId, `New ${review.rating}-star review`, `A buyer reviewed ${product.name}.`, 'INFO', { type: 'PRODUCT_REVIEW', productId: product.id, reviewId: review.id, link: `/products/${product.id}#reviews` });
        const supplier: any = await this.prisma.user.findUnique({ where: { id: product.supplierId }, select: { email: true, notificationPrefs: true } });
        if (!supplier?.email || (supplier.notificationPrefs as any)?.productComments === false) return;
        const mail = renderReviewNotificationEmail({ productName: product.name, rating: review.rating, comment: review.comment, reviewUrl, settingsUrl: `${siteUrl}/supplier/settings`, siteUrl });
        const res = await this.email.sendMailDetailed(supplier.email, mail.subject, mail.html, { text: mail.text });
        if (!res.success) this.logger.warn(`[reviews] review email not sent: ${res.error}`);
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
                    user: { select: USER_SELECT },
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
