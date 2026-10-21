import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CouponRefusal, assertUsable, couponStatus, generateCode, normalizeCode, parseCouponInput, scopeOf, typeOf, type CouponInput, type CouponStatus } from './coupon-rules';

/** Admin view of one coupon (OWNER/ADMIN only). */
export interface AdminCouponRow {
    id: string; code: string; status: CouponStatus;
    discountType: 'PERCENT' | 'FIXED'; discountPercent: number; amountOff: number | null;
    minOrderAmount: number | null; usageLimit: number | null; perCustomerLimit: number | null;
    /** Orders created with the code (redemption records, plus orders recorded with the code before tracking began). */
    redemptions: number;
    /** Counter the usage limit is enforced against (redemption records only). */
    usedCount: number;
    description: string | null;
    /** Sum of recorded redemption discounts (EUR); null when only pre-tracking orders exist. */
    discountGiven: number | null;
    startsAt: string | null; expirationDate: string; isActive: boolean;
    scope: 'ALL' | 'CATEGORY' | 'PRODUCTS' | 'LEGACY'; categories: string[];
    products: { id: string; name: string; brand: string | null; ean: string | null; missing?: boolean }[];
    createdAt: string;
}

@Injectable()
export class CouponsService {
    constructor(private prisma: PrismaService) { }

    /** A crypto-random code not in use right now (checked again by the unique index on save). */
    async generateUniqueCode(): Promise<{ code: string }> {
        for (let i = 0; i < 8; i++) {
            const code = generateCode();
            const taken = await this.prisma.coupon.findUnique({ where: { code }, select: { id: true } });
            if (!taken) return { code };
        }
        throw new ConflictException({ code: 'CODE_GENERATION_FAILED', message: 'Could not generate a free code. Try again.' });
    }

    private async checkTargets(i: CouponInput) {
        if (i.scope === 'PRODUCTS') {
            const found = await this.prisma.product.findMany({ where: { id: { in: i.productIds } }, select: { id: true } });
            const known = new Set(found.map((p) => p.id));
            const missing = i.productIds.filter((id) => !known.has(id));
            if (missing.length) throw new BadRequestException({ code: 'INVALID_COUPON_INPUT', message: 'Some selected products no longer exist.', fields: { productIds: 'Some selected products no longer exist. Remove them and try again.' }, missing });
        }
        if (i.scope === 'CATEGORY') {
            const used = await this.prisma.product.groupBy({ by: ['category'], where: { category: { in: i.categories } } });
            const known = new Set(used.map((r) => r.category));
            const missing = i.categories.filter((c) => !known.has(c));
            if (missing.length) throw new BadRequestException({ code: 'INVALID_COUPON_INPUT', message: 'No products use some of these categories.', fields: { categories: `No products use: ${missing.join(', ')}.` }, missing });
        }
    }

    private dataOf(i: CouponInput) {
        return {
            code: i.code, discountType: i.discountType, discountPercent: i.discountType === 'PERCENT' ? i.discountPercent : 0,
            amountOff: i.discountType === 'FIXED' ? i.amountOff : null, minOrderAmount: i.minOrderAmount,
            usageLimit: i.usageLimit, perCustomerLimit: i.perCustomerLimit, startsAt: i.startsAt, expirationDate: i.expirationDate,
            scope: i.scope, categories: i.scope === 'CATEGORY' ? i.categories : [], productIds: i.scope === 'PRODUCTS' ? i.productIds : [],
            description: i.description,
        };
    }

    async create(body: any, adminId: string) {
        const { input, errors } = parseCouponInput(body);
        if (errors) throw new BadRequestException({ code: 'INVALID_COUPON_INPUT', message: 'Check the highlighted fields.', fields: errors });
        const i = input!;
        await this.checkTargets(i);
        try {
            const c = await this.prisma.coupon.create({ data: { ...this.dataOf(i), createdById: adminId, isActive: true } });
            return (await this.rows([c.id]))[0];
        } catch (e: any) {
            if (e?.code === 'P2002') throw new ConflictException({ code: 'CODE_TAKEN', message: 'That code is already in use. Generate another or choose a different one.', fields: { code: 'That code is already in use.' } });
            throw e;
        }
    }

    /**
     * Edit with the same rules as create, plus: the code is locked once the coupon has been used; the usage
     * limit can't go below the uses already recorded (checked again in the UPDATE, so a redemption landing
     * at the same moment can't slip past it); an end date already in the past may be kept, a new one must be
     * in the future. Orders already placed keep the discount they were priced with.
     */
    async update(id: string, body: any) {
        const [row] = await this.rows([id]);
        if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Coupon not found.' });
        const { input, errors } = parseCouponInput({ ...body, code: body?.code ?? row.code }, new Date(), { endMayBePast: true });
        const fields: Record<string, string> = { ...(errors ?? {}) } as any;
        if (input) {
            if (input.code !== row.code && row.redemptions > 0) fields.code = 'The code has been used on orders, so it can’t be changed.';
            const used = Math.max(row.usedCount, row.redemptions);
            if (input.usageLimit != null && input.usageLimit < used) fields.usageLimit = `The code has already been used ${used} times; the limit can’t be lower.`;
            if (input.expirationDate.getTime() !== new Date(row.expirationDate).getTime() && input.expirationDate.getTime() <= Date.now()) fields.expirationDate = 'The end must be in the future.';
        }
        if (Object.keys(fields).length) throw new BadRequestException({ code: 'INVALID_COUPON_INPUT', message: 'Check the highlighted fields.', fields });
        const i = input!;
        await this.checkTargets(i);
        try {
            const where: any = { id };
            if (i.usageLimit != null) where.usedCount = { lte: i.usageLimit };
            // Renaming is only allowed while unused — re-checked here so a first use can't land in between.
            if (i.code !== row.code) where.usedCount = { equals: 0 };
            const res = await this.prisma.coupon.updateMany({ where, data: this.dataOf(i) });
            if (res.count === 0) throw new ConflictException({ code: 'COUPON_CHANGED', message: 'The code was used while you were editing. Reload and try again.', fields: { usageLimit: 'The code was used while you were editing.' } });
        } catch (e: any) {
            if (e?.code === 'P2002') throw new ConflictException({ code: 'CODE_TAKEN', message: 'That code is already in use. Choose a different one.', fields: { code: 'That code is already in use.' } });
            throw e;
        }
        return (await this.rows([id]))[0];
    }

    /** Raw list kept for older clients (GET /coupons). */
    async findAll() {
        return this.prisma.coupon.findMany({ include: { placement: { include: { product: true } } }, orderBy: { createdAt: 'desc' } });
    }

    /** Admin list + summary computed from the same records. */
    async adminList() {
        const rows = await this.rows();
        const now = new Date();
        const count = (s: CouponStatus) => rows.filter((r) => r.status === s).length;
        return {
            rows,
            summary: {
                total: rows.length, active: count('ACTIVE'), scheduled: count('SCHEDULED'), expired: count('EXPIRED'),
                disabled: count('DISABLED'), exhausted: count('EXHAUSTED'),
                redemptions: rows.reduce((s, r) => s + r.redemptions, 0),
            },
            serverTime: now.toISOString(),
        };
    }

    private async rows(ids?: string[]): Promise<AdminCouponRow[]> {
        const list = await this.prisma.coupon.findMany({
            where: ids ? { id: { in: ids } } : undefined,
            include: { placement: { select: { productId: true } }, _count: { select: { redemptions: true } } },
            orderBy: { createdAt: 'desc' },
        });
        if (!list.length) return [];
        const sums = await this.prisma.couponRedemption.groupBy({ by: ['couponId'], where: { couponId: { in: list.map((c) => c.id) } }, _sum: { discount: true } });
        const sumOf = new Map(sums.map((s) => [s.couponId, s._sum.discount ?? 0]));
        // Orders placed with a code before redemption records existed: the code is in the order's submitted terms.
        const legacy = await this.legacyOrderCounts(list.map((c) => ({ id: c.id, code: c.code, createdAt: c.createdAt })));
        const productIds = [...new Set(list.flatMap((c) => scopeOf(c as any).productIds))];
        const products = productIds.length ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, brand: true, ean: true } }) : [];
        const byId = new Map(products.map((p) => [p.id, p]));
        const now = new Date();
        return list.map((c) => {
            const s = scopeOf(c as any);
            const tracked = c._count.redemptions;
            return {
                id: c.id, code: c.code, status: couponStatus(c as any, now),
                discountType: typeOf(c as any), discountPercent: c.discountPercent, amountOff: c.amountOff ?? null,
                minOrderAmount: c.minOrderAmount ?? null, usageLimit: c.usageLimit ?? null, perCustomerLimit: c.perCustomerLimit ?? null,
                redemptions: tracked + (legacy.get(c.id) ?? 0),
                usedCount: c.usedCount ?? 0,
                description: c.description ?? null,
                discountGiven: tracked ? Math.round((sumOf.get(c.id) ?? 0) * 100) / 100 : null,
                startsAt: c.startsAt ? c.startsAt.toISOString() : null, expirationDate: c.expirationDate.toISOString(), isActive: c.isActive,
                scope: s.scope, categories: s.categories,
                products: s.productIds.map((id) => { const p = byId.get(id); return p ? { id, name: p.name, brand: p.brand ?? null, ean: p.ean ?? null } : { id, name: '', brand: null, ean: null, missing: true }; }),
                createdAt: c.createdAt.toISOString(),
            };
        });
    }

    private async legacyOrderCounts(coupons: { id: string; code: string; createdAt: Date }[]): Promise<Map<string, number>> {
        const out = new Map<string, number>();
        if (!coupons.length) return out;
        const codes = coupons.map((c) => c.code);
        const rows: { code: string; createdAt: Date }[] = await this.prisma.$queryRaw`
            SELECT o."submittedTerms"->>'coupon' AS code, o."createdAt" AS "createdAt"
            FROM "Order" o
            WHERE o."submittedTerms"->>'coupon' = ANY(${codes})
              AND NOT EXISTS (SELECT 1 FROM "CouponRedemption" r WHERE r."orderId" = o.id)`.catch(() => []) as any;
        for (const c of coupons) out.set(c.id, rows.filter((r) => r.code === c.code && new Date(r.createdAt) >= c.createdAt).length);
        return out;
    }

    /** Buyer pre-check at checkout (cart-independent rules; the quote applies the cart rules). */
    async validate(code: string, customerId?: string) {
        const c = await this.prisma.coupon.findUnique({ where: { code: normalizeCode(code) }, include: { placement: { select: { productId: true } } } });
        try {
            const customerUses = c && c.perCustomerLimit != null && customerId ? await this.prisma.couponRedemption.count({ where: { couponId: c.id, customerId } }) : null;
            assertUsable(c as any, { customerUses });
        } catch (e) {
            if (e instanceof CouponRefusal) {
                if (e.reason === 'NOT_FOUND') throw new NotFoundException({ code: 'INVALID_COUPON', reason: e.reason, message: e.message });
                throw new BadRequestException({ code: 'INVALID_COUPON', reason: e.reason, message: e.message, ...e.detail });
            }
            throw e;
        }
        const s = scopeOf(c as any);
        return {
            code: c!.code,
            discountType: typeOf(c as any),
            // PERCENT: the coupon's %; FIXED: 0 (older checkouts read this field).
            discountPercent: typeOf(c as any) === 'PERCENT' ? c!.discountPercent : 0,
            amountOff: typeOf(c as any) === 'FIXED' ? c!.amountOff ?? 0 : null,
            minOrderAmount: c!.minOrderAmount ?? null,
            scope: s.scope === 'LEGACY' ? 'PRODUCTS' : s.scope,
            categories: s.categories,
            expirationDate: c!.expirationDate.toISOString(),
        };
    }

    async setActive(id: string, isActive: boolean) {
        const c = await this.prisma.coupon.findUnique({ where: { id } });
        if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Coupon not found.' });
        await this.prisma.coupon.update({ where: { id }, data: { isActive } });
        return (await this.rows([id]))[0];
    }

    async toggleStatus(id: string) {
        const c = await this.prisma.coupon.findUnique({ where: { id } });
        if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Coupon not found.' });
        return this.setActive(id, !c.isActive);
    }

    /** Only unused codes can be deleted; a used code is switched off instead so its order history stays explained. */
    async remove(id: string) {
        const [row] = await this.rows([id]);
        if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Coupon not found.' });
        if (row.redemptions > 0) throw new ConflictException({ code: 'COUPON_USED', message: 'This code has been used on orders, so it can’t be deleted. Disable it instead.' });
        await this.prisma.coupon.delete({ where: { id } });
        return { id, deleted: true };
    }

    /** Catalogue products an admin can target (live and in review), searchable by name, brand or EAN. */
    async searchProducts(q?: string, ids?: string[]) {
        const term = (q ?? '').trim().slice(0, 80);
        const where: any = ids?.length ? { id: { in: ids.slice(0, 200) } } : {
            status: { in: ['APPROVED', 'PENDING', 'NEEDS_CHANGES'] },
            ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { brand: { contains: term, mode: 'insensitive' } }, { ean: { contains: term } }] } : {}),
        };
        const rows = await this.prisma.product.findMany({ where, select: { id: true, name: true, brand: true, category: true, ean: true, status: true, images: true }, orderBy: { name: 'asc' }, take: ids?.length ? 200 : 25 });
        return rows.map((p) => ({ id: p.id, name: p.name, brand: p.brand ?? null, category: p.category, ean: p.ean ?? null, status: p.status, image: p.images?.[0] ?? null }));
    }

    /** Categories in use on products, with live product counts. */
    async categories() {
        const rows = await this.prisma.product.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { category: 'asc' } });
        const live = await this.prisma.product.groupBy({ by: ['category'], where: { status: 'APPROVED' }, _count: { _all: true } });
        const liveOf = new Map(live.map((r) => [r.category, r._count._all]));
        return rows.filter((r) => r.category && r.category.trim()).map((r) => ({ category: r.category, products: r._count._all, live: liveOf.get(r.category) ?? 0 }));
    }
}
