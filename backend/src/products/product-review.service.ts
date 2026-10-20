import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Review trail of a product listing (ProductReviewEvent). One row per
 * submission, decision or feedback message, so a supplier can read exactly
 * what Atlantis asked for and Atlantis can see what happened before — even
 * after `adminNotes` is overwritten or cleared by a resubmission.
 *
 * Writing a row never changes the product; the review lifecycle itself stays
 * in ProductsService (DRAFT → PENDING → APPROVED / REJECTED / NEEDS_CHANGES →
 * PENDING again). Failures here are logged and swallowed so an audit-trail
 * hiccup never blocks a decision that already happened.
 */
export const REVIEW_ACTIONS = ['SUBMITTED', 'RESUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'STATUS_CHANGED'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export interface ReviewActor { id?: string | null; role?: string | null }

export interface ReviewEventView {
    id: string;
    action: ReviewAction | string;
    message: string | null;
    statusAfter: string | null;
    createdAt: string;
    /** Who acted: `atlantis` (any staff account), `supplier`, or `system`. */
    by: 'atlantis' | 'supplier' | 'system';
    /** Staff viewers only: the team member's name. Never sent to suppliers. */
    actorName?: string | null;
    actorId?: string | null;
}

const STAFF = new Set(['OWNER', 'ADMIN', 'MODERATOR', 'EDITOR', 'DEVELOPER', 'LOGISTICS', 'SUPPORT']);

@Injectable()
export class ProductReviewService {
    private readonly logger = new Logger(ProductReviewService.name);
    constructor(private readonly prisma: PrismaService) {}

    async record(input: { productId: string; action: ReviewAction; message?: string | null; statusAfter?: string | null; actor?: ReviewActor | null }): Promise<void> {
        try {
            const text = typeof input.message === 'string' ? input.message.trim() : '';
            await this.prisma.productReviewEvent.create({
                data: {
                    productId: input.productId,
                    action: input.action,
                    message: text ? text.slice(0, 4000) : null,
                    statusAfter: input.statusAfter ?? null,
                    actorId: input.actor?.id ?? null,
                    actorRole: input.actor?.role ? String(input.actor.role).toUpperCase() : input.actor?.id ? null : 'SYSTEM',
                },
            });
        } catch (e: any) {
            this.logger.warn(`review event not recorded for ${input.productId} (${input.action}): ${e?.message}`);
        }
    }

    async recordMany(productIds: string[], action: ReviewAction, message: string | null, statusAfter: string, actor?: ReviewActor | null): Promise<void> {
        await Promise.all(productIds.map((productId) => this.record({ productId, action, message, statusAfter, actor })));
    }

    /**
     * Events for one product, oldest first. `viewer` decides how much identity
     * is shown: staff see who on the team acted; a supplier only sees "Atlantis".
     */
    async history(productId: string, viewer: 'staff' | 'supplier'): Promise<ReviewEventView[]> {
        const rows = await this.prisma.productReviewEvent.findMany({
            where: { productId },
            orderBy: { createdAt: 'asc' },
            take: 200,
            include: { actor: { select: { id: true, name: true, role: true } } },
        });
        return rows.map((r) => {
            const role = String(r.actorRole || r.actor?.role || '').toUpperCase();
            const by: ReviewEventView['by'] = !r.actorId && role === 'SYSTEM' ? 'system' : STAFF.has(role) ? 'atlantis' : role === 'SUPPLIER' ? 'supplier' : r.actorId ? 'supplier' : 'system';
            const base: ReviewEventView = { id: r.id, action: r.action, message: r.message, statusAfter: r.statusAfter, createdAt: r.createdAt.toISOString(), by };
            if (viewer === 'staff') { base.actorName = r.actor?.name ?? null; base.actorId = r.actorId; }
            return base;
        });
    }

    /** Decisions in [from, to), by action — for the Overview's approval / rejection trend. */
    async decisionCounts(from: Date, to: Date): Promise<{ approved: number; rejected: number; changesRequested: number; submitted: number; trackedSince: string | null }> {
        const [groups, first] = await Promise.all([
            this.prisma.productReviewEvent.groupBy({ by: ['action'], where: { createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
            this.prisma.productReviewEvent.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        ]);
        const n = (a: string) => (groups as any[]).find((g) => g.action === a)?._count._all ?? 0;
        return { approved: n('APPROVED'), rejected: n('REJECTED'), changesRequested: n('CHANGES_REQUESTED'), submitted: n('SUBMITTED') + n('RESUBMITTED'), trackedSince: first?.createdAt.toISOString() ?? null };
    }
}
