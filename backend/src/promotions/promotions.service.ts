import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { readMarkups } from '../common/markups';
import {
    PromotionError, cleanName, editableFields, parseInstant, productEligibility, promoFactor, promoPrice, promotionState, round2,
    validatePercent, validateWindow, type PromotionState,
} from './promotion-rules';

export type Actor = { id: string; role: string };
/** supplier = the caller's own products only; admin = any product (Ali FMCG staff). */
export type Scope = { kind: 'supplier'; supplierId: string } | { kind: 'admin' };

const PRODUCT_SELECT = {
    id: true, name: true, brand: true, ean: true, images: true, unit: true, unitsPerCase: true, casesPerPallet: true,
    palletsPerShipment: true, status: true, basePrice: true, supplierId: true,
} as const;

const PAGE_SIZE = 25;

/**
 * Special offers management for suppliers (own products) and Ali FMCG
 * admins (any product). Rules live in promotion-rules.ts; which promotion
 * applies to a price lives in promotion-lookup.ts.
 *
 * What each side gets back:
 *  • supplier — net prices only (current net, promotional net, net at creation);
 *    never a buyer price or a markup.
 *  • admin    — net and buyer prices (case tier), plus the supplier.
 */
@Injectable()
export class PromotionsService {
    constructor(private readonly prisma: PrismaService) {}

    /** Overridable clock (tests). */
    now(): Date { return new Date(); }

    // ─── Reads ─────────────────────────────────────────────────────────

    async list(scope: Scope, query: { status?: string; q?: string; page?: string | number; productId?: string } = {}) {
        const now = this.now();
        const base: any = scope.kind === 'supplier' ? { product: { supplierId: scope.supplierId } } : {};
        if (query.productId) base.productId = String(query.productId);
        const q = String(query.q || '').trim().slice(0, 100);
        if (q) {
            base.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { product: { name: { contains: q, mode: 'insensitive' } } },
                { product: { brand: { contains: q, mode: 'insensitive' } } },
                { product: { ean: { contains: q } } },
            ];
        }
        const byState: Record<string, any> = {
            SCHEDULED: { status: { not: 'CANCELLED' }, startsAt: { gt: now } },
            ACTIVE: { status: { not: 'CANCELLED' }, startsAt: { lte: now }, endsAt: { gt: now } },
            EXPIRED: { status: { not: 'CANCELLED' }, endsAt: { lte: now } },
            CANCELLED: { status: 'CANCELLED' },
        };
        const status = String(query.status || 'ALL').toUpperCase();
        const where = byState[status] ? { AND: [base, byState[status]] } : base;
        const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
        const [rows, total, ...counts] = await Promise.all([
            this.prisma.promotion.findMany({
                where, orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
                include: { product: { select: { ...PRODUCT_SELECT, ...(scope.kind === 'admin' ? { supplier: { select: { id: true, name: true, companyName: true } } } : {}) } } },
            }),
            this.prisma.promotion.count({ where }),
            ...Object.values(byState).map((w) => this.prisma.promotion.count({ where: { AND: [base, w] } })),
        ]);
        const views = await this.views(rows, scope, now);
        const keys = Object.keys(byState);
        return {
            data: views, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
            counts: { ALL: counts.reduce((s, n) => s + n, 0), ...Object.fromEntries(keys.map((k, i) => [k, counts[i]])) },
            timeZone: 'UTC', now: now.toISOString(),
        };
    }

    async get(scope: Scope, id: string) {
        const row = await this.load(scope, id);
        return (await this.views([row], scope, this.now()))[0];
    }

    /** Products the caller may put on special offer, for the searchable selector. */
    async eligibleProducts(scope: Scope, query: { q?: string; limit?: string | number } = {}) {
        const now = this.now();
        const where: any = scope.kind === 'supplier' ? { supplierId: scope.supplierId } : {};
        const terms = String(query.q || '').trim().slice(0, 100).split(/\s+/).filter(Boolean);
        if (terms.length) where.AND = terms.map((t) => ({ OR: [{ name: { contains: t, mode: 'insensitive' } }, { brand: { contains: t, mode: 'insensitive' } }, { ean: { contains: t } }] }));
        if (scope.kind === 'supplier') where.status = { notIn: ['REJECTED'] };
        const limit = Math.min(30, Math.max(1, parseInt(String(query.limit || '20'), 10) || 20));
        const rows = await this.prisma.product.findMany({
            where, take: limit, orderBy: [{ status: 'asc' }, { name: 'asc' }],
            select: { ...PRODUCT_SELECT, ...(scope.kind === 'admin' ? { supplier: { select: { id: true, name: true, companyName: true } } } : {}) },
        });
        const promos = rows.length ? await this.prisma.promotion.findMany({
            where: { productId: { in: rows.map((r: any) => r.id) }, status: { not: 'CANCELLED' }, endsAt: { gt: now } },
            select: { id: true, productId: true, discountPercent: true, startsAt: true, endsAt: true, status: true },
            orderBy: { startsAt: 'asc' },
        }) : [];
        const m = scope.kind === 'admin' ? await readMarkups(this.prisma) : null;
        return {
            timeZone: 'UTC',
            data: rows.map((p: any) => {
                const el = productEligibility(p);
                const net = typeof p.basePrice === 'number' && p.basePrice > 0 ? round2(p.basePrice) : null;
                return {
                    ...this.productView(p, scope),
                    eligible: el.ok, reason: el.ok ? null : (el as any).code,
                    net: { current: net },
                    ...(m && net !== null ? { buyer: { current: round2(p.basePrice * m.piece), perNet: m.piece } } : {}),
                    promotions: promos.filter((x: any) => x.productId === p.id).map((x: any) => ({ id: x.id, discountPercent: x.discountPercent, startsAt: x.startsAt, endsAt: x.endsAt, state: promotionState(x, now, p.status === 'APPROVED') })),
                };
            }),
        };
    }

    // ─── Writes ────────────────────────────────────────────────────────

    async create(actor: Actor, scope: Scope, body: any) {
        const now = this.now();
        const productId = typeof body?.productId === 'string' ? body.productId : '';
        if (!productId) throw new PromotionError('PRODUCT_REQUIRED', 'Choose a product.');
        const product = await this.prisma.product.findUnique({ where: { id: productId }, select: PRODUCT_SELECT });
        if (!product) throw new PromotionError('PRODUCT_NOT_FOUND', 'Product not found.', 404);
        this.assertOwner(scope, product.supplierId);
        const el = productEligibility(product);
        if (!el.ok) throw new PromotionError((el as any).code, (el as any).message);
        const discountPercent = validatePercent(body?.discountPercent);
        const { startsAt, endsAt } = validateWindow(body?.startsAt, body?.endsAt, now);
        const name = cleanName(body?.name);
        const row = await this.prisma.$transaction(async (tx: any) => {
            await this.assertNoOverlap(tx, productId, startsAt, endsAt);
            return tx.promotion.create({
                data: {
                    productId, supplierId: product.supplierId, name, discountPercent, startsAt, endsAt, status: 'ACTIVE',
                    basePriceAtCreation: product.basePrice, createdById: actor.id, createdByRole: String(actor.role || '').toUpperCase(),
                    history: [{ at: now.toISOString(), by: actor.id, role: String(actor.role || '').toUpperCase(), action: 'CREATE', changes: { discountPercent: [null, discountPercent], startsAt: [null, startsAt.toISOString()], endsAt: [null, endsAt.toISOString()], name: [null, name] } }],
                },
            });
        });
        return this.get(scope, row.id);
    }

    /**
     * Scheduled: discount, start, end and name can change. Running (active or
     * on hold): only the end (still in the future) and the name — the price
     * buyers already see doesn't change under them; cancel and create a new
     * one for a different discount. Ended or cancelled: nothing.
     */
    async update(actor: Actor, scope: Scope, id: string, body: any) {
        const now = this.now();
        const row: any = await this.load(scope, id);
        const state = promotionState(row, now, row.product?.status === 'APPROVED');
        const allowed = editableFields(state);
        if (!allowed.length) throw new PromotionError('NOT_EDITABLE', state === 'CANCELLED' ? 'This special offer was cancelled and can’t be changed.' : 'This special offer has ended and can’t be changed.', 409);
        const has = (k: string) => body && Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;
        const next: any = {};
        const changes: Record<string, [unknown, unknown]> = {};
        if (has('discountPercent')) {
            const pct = validatePercent(body.discountPercent);
            if (pct !== row.discountPercent) {
                if (!allowed.includes('discountPercent')) throw new PromotionError('FIELD_LOCKED', 'The discount of a running special offer can’t change. Cancel it and create a new one.', 409);
                next.discountPercent = pct; changes.discountPercent = [row.discountPercent, pct];
            }
        }
        const startRaw = has('startsAt') ? body.startsAt : row.startsAt;
        const endRaw = has('endsAt') ? body.endsAt : row.endsAt;
        const startChanged = has('startsAt') && parseInstant(body.startsAt, 'startsAt').getTime() !== new Date(row.startsAt).getTime();
        if (startChanged && !allowed.includes('startsAt')) throw new PromotionError('FIELD_LOCKED', 'A running special offer has already started; only its end and name can change.', 409);
        if (has('startsAt') || has('endsAt')) {
            const w = validateWindow(state === 'SCHEDULED' ? startRaw : row.startsAt, endRaw, now);
            const start = state === 'SCHEDULED' ? w.startsAt : new Date(row.startsAt);
            if (state === 'SCHEDULED' && start.getTime() !== new Date(row.startsAt).getTime()) { next.startsAt = start; changes.startsAt = [new Date(row.startsAt).toISOString(), start.toISOString()]; }
            if (w.endsAt.getTime() !== new Date(row.endsAt).getTime()) { next.endsAt = w.endsAt; changes.endsAt = [new Date(row.endsAt).toISOString(), w.endsAt.toISOString()]; }
        }
        if (has('name')) {
            const name = cleanName(body.name);
            if (name !== (row.name ?? null)) { next.name = name; changes.name = [row.name ?? null, name]; }
        }
        if (!Object.keys(next).length) return this.get(scope, id);
        if (next.discountPercent !== undefined || next.startsAt !== undefined) {
            const el = productEligibility(row.product);
            if (!el.ok && (el as any).code === 'PRICE_MISSING') throw new PromotionError('PRICE_MISSING', (el as any).message);
        }
        const startsAt = next.startsAt ?? new Date(row.startsAt), endsAt = next.endsAt ?? new Date(row.endsAt);
        await this.prisma.$transaction(async (tx: any) => {
            if (next.startsAt || next.endsAt) await this.assertNoOverlap(tx, row.productId, startsAt, endsAt, row.id);
            const history = [...(Array.isArray(row.history) ? row.history : []), { at: now.toISOString(), by: actor.id, role: String(actor.role || '').toUpperCase(), action: 'UPDATE', changes }];
            // Guarded on the state we checked: a concurrent cancel wins.
            const res = await tx.promotion.updateMany({ where: { id: row.id, status: { not: 'CANCELLED' } }, data: { ...next, updatedById: actor.id, history } });
            if (res.count === 0) throw new PromotionError('NOT_EDITABLE', 'This special offer was cancelled and can’t be changed.', 409);
        });
        return this.get(scope, id);
    }

    async cancel(actor: Actor, scope: Scope, id: string, reason?: unknown) {
        const now = this.now();
        const row: any = await this.load(scope, id);
        const state = promotionState(row, now, row.product?.status === 'APPROVED');
        if (state === 'CANCELLED') throw new PromotionError('ALREADY_CANCELLED', 'This special offer is already cancelled.', 409);
        if (state === 'EXPIRED') throw new PromotionError('ALREADY_ENDED', 'This special offer has already ended.', 409);
        const why = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : null;
        const history = [...(Array.isArray(row.history) ? row.history : []), { at: now.toISOString(), by: actor.id, role: String(actor.role || '').toUpperCase(), action: 'CANCEL', ...(why ? { reason: why } : {}), stateBefore: state }];
        const res = await this.prisma.promotion.updateMany({
            where: { id: row.id, status: { not: 'CANCELLED' } },
            data: { status: 'CANCELLED', cancelledAt: now, cancelledById: actor.id, cancelReason: why, updatedById: actor.id, history },
        });
        if (res.count === 0) throw new PromotionError('ALREADY_CANCELLED', 'This special offer is already cancelled.', 409);
        return this.get(scope, id);
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    private assertOwner(scope: Scope, productSupplierId: string | null | undefined) {
        if (scope.kind === 'supplier' && productSupplierId !== scope.supplierId) {
            throw new PromotionError('FORBIDDEN', 'You can only manage special offers on your own products.', 403);
        }
    }

    private async load(scope: Scope, id: string) {
        const row: any = await this.prisma.promotion.findUnique({
            where: { id: String(id) },
            include: { product: { select: { ...PRODUCT_SELECT, ...(scope.kind === 'admin' ? { supplier: { select: { id: true, name: true, companyName: true } } } : {}) } } },
        });
        if (!row) throw new PromotionError('NOT_FOUND', 'Special offer not found.', 404);
        this.assertOwner(scope, row.product?.supplierId);
        return row;
    }

    /** Refuses a window that overlaps another non-cancelled promotion on the same product. */
    private async assertNoOverlap(tx: any, productId: string, startsAt: Date, endsAt: Date, exceptId?: string) {
        const clash = await tx.promotion.findFirst({
            where: { productId, status: { not: 'CANCELLED' }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(exceptId ? { id: { not: exceptId } } : {}) },
            select: { id: true, startsAt: true, endsAt: true, discountPercent: true },
        });
        if (clash) {
            throw new PromotionError('OVERLAP', 'This product already has a special offer in that period. Change the dates or cancel the other offer first.', 409, {
                conflict: { id: clash.id, startsAt: new Date(clash.startsAt).toISOString(), endsAt: new Date(clash.endsAt).toISOString(), discountPercent: clash.discountPercent },
            });
        }
    }

    private productView(p: any, scope: Scope) {
        return {
            id: p.id, name: p.name, brand: p.brand ?? null, ean: p.ean ?? null, image: Array.isArray(p.images) ? p.images[0] ?? null : null,
            unitsPerCase: p.unitsPerCase ?? null, casesPerPallet: p.casesPerPallet ?? null, status: p.status,
            ...(scope.kind === 'admin' && p.supplier ? { supplier: { id: p.supplier.id, name: p.supplier.companyName || p.supplier.name || null } } : {}),
        };
    }

    private async views(rows: any[], scope: Scope, now: Date) {
        const m = scope.kind === 'admin' ? await readMarkups(this.prisma) : null;
        const people = new Map<string, { name: string | null; email: string | null; role: string | null }>();
        if (scope.kind === 'admin') {
            const ids = [...new Set(rows.flatMap((r) => [r.createdById, r.updatedById, r.cancelledById]).filter(Boolean))] as string[];
            const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, role: true } }).catch(() => [] as any[]) : [];
            for (const u of users) people.set(u.id, { name: u.name ?? null, email: u.email ?? null, role: u.role ?? null });
        }
        // Suppliers see "you" or "Ali FMCG" — never a staff member's identity.
        const who = (id: string | null | undefined, role?: string | null) => {
            if (!id) return null;
            if (scope.kind === 'supplier') return { kind: id === scope.supplierId ? 'YOU' : 'ATLANTIS' };
            const p = people.get(id);
            return { kind: String(role || p?.role || '').toUpperCase() === 'SUPPLIER' ? 'SUPPLIER' : 'ATLANTIS', id, name: p?.name ?? null, email: p?.email ?? null };
        };
        return rows.map((r) => {
            const p = r.product || {};
            const live = p.status === 'APPROVED';
            const state: PromotionState = promotionState(r, now, live);
            const pct = Number(r.discountPercent);
            const net = typeof p.basePrice === 'number' && p.basePrice > 0 ? p.basePrice : null;
            const atCreation = typeof r.basePriceAtCreation === 'number' ? round2(r.basePriceAtCreation) : null;
            const view: any = {
                id: r.id, name: r.name ?? null, discountPercent: pct,
                startsAt: new Date(r.startsAt).toISOString(), endsAt: new Date(r.endsAt).toISOString(),
                state, editable: editableFields(state), productLive: live,
                cancelledAt: r.cancelledAt ? new Date(r.cancelledAt).toISOString() : null, cancelReason: r.cancelReason ?? null,
                createdAt: new Date(r.createdAt).toISOString(), updatedAt: new Date(r.updatedAt).toISOString(),
                createdBy: who(r.createdById, r.createdByRole), cancelledBy: who(r.cancelledById),
                product: this.productView(p, scope),
                net: {
                    current: net === null ? null : round2(net), promotional: net === null ? null : promoPrice(net, pct), atCreation,
                    changedSinceCreation: atCreation !== null && net !== null && Math.abs(round2(net) - atCreation) >= 0.005,
                },
                history: (Array.isArray(r.history) ? r.history : []).map((h: any) => ({ at: h.at, action: h.action, changes: h.changes ?? null, reason: h.reason ?? null, by: who(h.by, h.role) })),
            };
            if (m && net !== null) {
                // Case-tier buyer price per case, exactly as the cart quote computes it (orders/pricing.ts).
                const current = round2(net * m.piece), promotional = round2(net * m.piece * promoFactor(pct));
                view.buyer = { current, promotional, percentOff: current > 0 ? Math.round((1 - promotional / current) * 1000) / 10 : null, perNet: m.piece };
            }
            return view;
        });
    }
}
