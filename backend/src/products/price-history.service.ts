import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buyerCasePrice, readMarkups } from '../common/markups';
import { isPriceStaff, isSupplierViewer, type Viewer } from '../common/price-privacy';

const DAY = 86_400_000;

/**
 * Price history = the buyer-facing LISTED price per case (case tier, EUR),
 * recorded each time it changes. One price type only: never supplier
 * prices, never order/transaction prices, never invented points. A product's
 * history starts at its first recorded observation.
 */
@Injectable()
export class PriceHistoryService {
    private readonly logger = new Logger(PriceHistoryService.name);
    constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

    /** Record the current listed price if it differs from the last observation. */
    async record(productId: string, source: 'PRICE_CHANGE' | 'APPROVED' | 'OBSERVED'): Promise<number | null> {
        try {
            const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, status: true, basePrice: true } });
            if (!p || p.status !== 'APPROVED') return null;
            const price = buyerCasePrice(p, await readMarkups(this.prisma));
            if (price === null) return null;
            const last = await (this.prisma as any).priceObservation.findFirst({ where: { productId }, orderBy: { observedAt: 'desc' } });
            if (last && Math.abs(last.casePrice - price) < 0.005) return price;
            await (this.prisma as any).priceObservation.create({ data: { productId, casePrice: price, source } });
            await this.notifyTargetsReached(productId, price);
            return price;
        } catch (e: any) {
            this.logger.warn(`[price-history] ${productId}: ${e?.message}`);
            return null;
        }
    }

    /** Buyers with an open target at or above the new listed price are told once. */
    private async notifyTargetsReached(productId: string, price: number) {
        const reqs = await (this.prisma as any).targetPriceRequest.findMany({
            where: { productId, status: { in: ['OPEN', 'RESPONDED'] }, reachedNotifiedAt: null, targetCasePrice: { gte: price } },
            select: { id: true, ref: true, buyerId: true, product: { select: { name: true } } },
        });
        for (const r of reqs) {
            const claimed = await (this.prisma as any).targetPriceRequest.updateMany({ where: { id: r.id, reachedNotifiedAt: null }, data: { reachedNotifiedAt: new Date() } });
            if (!claimed.count) continue;
            this.notifications.notifyUser(r.buyerId, 'Price reached your target', `${r.product?.name} is now listed at €${price.toFixed(2)} per case — at or below your target (${r.ref}).`, 'SUCCESS', { productId, targetPriceRequestId: r.id, targetRef: r.ref, kind: 'TARGET_REACHED', params: { ref: r.ref, product: r.product?.name ?? '', price: Math.round(price * 100) / 100 }, dedupeKey: `target:${r.id}:reached` }).catch(() => {});
        }
    }

    async history(productId: string, viewer: Viewer, monthsIn?: number) {
        const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, status: true, supplierId: true } });
        if (!p || (p.status !== 'APPROVED' && !isPriceStaff(viewer))) throw new NotFoundException('Product not found');
        if (!viewer?.id) return { locked: true, reason: 'Sign in to see price history.' };
        // Suppliers never see buyer prices for their own listing (margin privacy).
        if (String(viewer.role || '').toUpperCase() === 'SUPPLIER' && p.supplierId === viewer.id) {
            return { ownerView: true, reason: 'This is your listing. Your own price history is in Inventory & Products → product → Change history.' };
        }
        // No supplier sees the buyer-price history of any listing (it would reveal buyer prices and margins).
        if (isSupplierViewer(viewer)) return { supplierView: true, reason: 'Buyer price history isn’t shown to supplier accounts.' };
        await this.record(productId, 'OBSERVED'); // captures changes made outside the price-change path (e.g. markup updates)

        const months = [3, 6, 12].includes(Number(monthsIn)) ? Number(monthsIn) : 12;
        const now = Date.now();
        const all: { casePrice: number; observedAt: Date }[] = await (this.prisma as any).priceObservation.findMany({
            where: { productId, observedAt: { gte: new Date(now - 366 * DAY) } }, orderBy: { observedAt: 'asc' }, select: { casePrice: true, observedAt: true },
        });
        const before = await (this.prisma as any).priceObservation.findFirst({ where: { productId, observedAt: { lt: new Date(now - 366 * DAY) } }, orderBy: { observedAt: 'desc' }, select: { casePrice: true, observedAt: true } });
        const first = await (this.prisma as any).priceObservation.findFirst({ where: { productId }, orderBy: { observedAt: 'asc' }, select: { observedAt: true } });
        const series = [...(before ? [before] : []), ...all];

        // Range stats over a window, using the price that was in effect (step function).
        const stats = (days: number) => {
            const from = now - days * DAY;
            const inEffect = series.filter((o) => +new Date(o.observedAt) <= from).pop();
            const pts = [...(inEffect ? [{ ...inEffect, observedAt: new Date(from) }] : []), ...series.filter((o) => +new Date(o.observedAt) > from)];
            if (!pts.length) return null;
            let weighted = 0, span = 0;
            pts.forEach((o, i) => {
                const start = +new Date(o.observedAt), end = i + 1 < pts.length ? +new Date(pts[i + 1].observedAt) : now;
                weighted += o.casePrice * Math.max(0, end - start); span += Math.max(0, end - start);
            });
            const prices = pts.map((o) => o.casePrice);
            return { min: Math.min(...prices), max: Math.max(...prices), average: span > 0 ? Math.round((weighted / span) * 100) / 100 : prices[prices.length - 1], since: new Date(Math.max(from, +new Date(pts[0].observedAt))).toISOString(), observations: pts.length };
        };
        const windowFrom = now - months * 30.44 * DAY;
        const inWindow = series.filter((o) => +new Date(o.observedAt) >= windowFrom);
        const carried = series.filter((o) => +new Date(o.observedAt) < windowFrom).pop();
        const latest = series[series.length - 1] ?? null;
        return {
            basis: 'Listed price per case (case tier), EUR, before delivery. Recorded each time the listed price changes.',
            currency: 'EUR',
            months,
            firstRecordedAt: first?.observedAt ?? null,
            latest: latest ? { price: latest.casePrice, at: latest.observedAt } : null,
            points: [...(carried ? [{ price: carried.casePrice, at: new Date(windowFrom).toISOString(), carried: true }] : []), ...inWindow.map((o) => ({ price: o.casePrice, at: o.observedAt }))],
            range12m: stats(365),
            range3m: stats(91),
        };
    }
}
