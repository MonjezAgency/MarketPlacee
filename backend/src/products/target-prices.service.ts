import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { TO_EUR } from './catalog-rules';
import { buyerCasePrice, minOrderCases, readMarkups } from '../common/markups';
import { countryName, resolveCountry } from '../shipping/delivery-policy';

/** Staff who may READ target prices. Answering is OWNER/ADMIN only (see the controller). */
export const TP_STAFF = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT'];
export const TP_STATUSES = ['OPEN', 'RESPONDED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'] as const;
const OPEN = ['OPEN', 'RESPONDED'];

/**
 * What a request means right now, derived from the stored status (values unchanged
 * since launch) and the additive negotiation fields:
 *  AWAITING_DESK    OPEN, never answered            — desk to answer
 *  REVISED          OPEN after the buyer sent a new target — desk to answer
 *  COUNTER_OFFERED  RESPONDED with a counter price  — buyer to accept / decline / revise
 *  DESK_REPLIED     RESPONDED without a price (older replies) — buyer may revise or withdraw
 *  AGREED_DESK      ACCEPTED: the desk accepted the target as asked
 *  AGREED_BUYER     ACCEPTED: the buyer accepted the desk's counter
 *  ACCEPTED_LEGACY  ACCEPTED before agreed prices were recorded (no agreed price stored)
 *  DECLINED_DESK    DECLINED by the desk
 *  DECLINED_BUYER   DECLINED: the buyer declined the desk's counter
 *  WITHDRAWN        withdrawn by the buyer
 */
export type TargetStage = 'AWAITING_DESK' | 'REVISED' | 'COUNTER_OFFERED' | 'DESK_REPLIED' | 'AGREED_DESK' | 'AGREED_BUYER' | 'ACCEPTED_LEGACY' | 'DECLINED_DESK' | 'DECLINED_BUYER' | 'WITHDRAWN';

export function targetStage(r: { status: string; counterCasePrice?: number | null; buyerDecision?: string | null; agreedCasePrice?: number | null }): TargetStage | string {
    switch (r.status) {
        case 'OPEN': return r.buyerDecision === 'REVISED' ? 'REVISED' : 'AWAITING_DESK';
        case 'RESPONDED': return r.counterCasePrice ? 'COUNTER_OFFERED' : 'DESK_REPLIED';
        case 'ACCEPTED': return r.agreedCasePrice == null ? 'ACCEPTED_LEGACY' : r.buyerDecision === 'ACCEPTED' ? 'AGREED_BUYER' : 'AGREED_DESK';
        case 'DECLINED': return r.buyerDecision === 'DECLINED' ? 'DECLINED_BUYER' : 'DECLINED_DESK';
        case 'WITHDRAWN': return 'WITHDRAWN';
        default: return r.status;
    }
}

/** The next actions each side may take, from the stage. The server enforces the same rules. */
export function allowedActions(stage: string) {
    return {
        deskMayAnswer: stage === 'AWAITING_DESK' || stage === 'REVISED' || stage === 'COUNTER_OFFERED' || stage === 'DESK_REPLIED',
        buyerMayAcceptCounter: stage === 'COUNTER_OFFERED',
        buyerMayDeclineCounter: stage === 'COUNTER_OFFERED',
        buyerMayRevise: stage === 'COUNTER_OFFERED' || stage === 'DESK_REPLIED',
        buyerMayWithdraw: stage === 'AWAITING_DESK' || stage === 'REVISED' || stage === 'COUNTER_OFFERED' || stage === 'DESK_REPLIED',
    };
}

/** History actions written since 2026-10-21; older entries only carry the status. */
const LEGACY_ACTION: Record<string, string> = { OPEN: 'SUBMITTED', RESPONDED: 'DESK_REPLY', ACCEPTED: 'DESK_ACCEPT', DECLINED: 'DESK_DECLINE', WITHDRAWN: 'WITHDRAWN' };
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface TargetPriceInput {
    productId: string;
    price: number | string;
    priceBasis?: 'CASE' | 'PIECE';
    currency?: string;
    quantity: number | string;
    quantityUnit?: 'CASE' | 'PALLET' | 'TRUCK';
    message?: string;
    /** ISO 3166-1 alpha-2 (or a country name), optional. */
    deliveryCountry?: string;
    idempotencyKey?: string;
}

export interface RespondInput {
    /** RESPONDED = counter-offer (or, for older clients, a reply without a price) · ACCEPTED = target accepted as asked · DECLINED */
    status: string;
    response?: string;
    counterCasePrice?: number | string | null;
    counterQuantityCases?: number | string | null;
}

export interface DecisionInput {
    decision: 'ACCEPT' | 'DECLINE' | 'REVISE' | string;
    /** ACCEPT: the counter price the buyer saw, so a counter changed meanwhile is never accepted by mistake. */
    counterCasePrice?: number | string | null;
    /** REVISE: the new target, EUR per case. */
    targetCasePrice?: number | string | null;
    message?: string;
}

/**
 * Target-price requests: a buyer tells Atlantis the price they'd buy at.
 * The Atlantis sourcing desk answers (Atlantis is the seller of record, so the
 * supplier is not contacted through this flow and never sees buyer prices or
 * the buyer). Nothing here changes a listing price or creates an order, and an
 * agreed price is NOT applied at checkout: orders are priced from the catalog
 * (orders.service priceCart), so the desk follows up on agreements itself.
 */
@Injectable()
export class TargetPricesService {
    constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly email: EmailService) {}

    private get repo() { return (this.prisma as any).targetPriceRequest; }

    private ref() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return 'TP-' + Array.from(crypto.randomBytes(6)).map((b) => alphabet[b % alphabet.length]).join('');
    }

    private history(r: any, viewerId?: string) {
        return (Array.isArray(r.history) ? r.history : []).map((h: any) => ({
            status: h.status, at: h.at, note: h.note ?? null, action: h.action || LEGACY_ACTION[h.status] || null,
            price: typeof h.price === 'number' ? h.price : null, cases: typeof h.cases === 'number' ? h.cases : null,
            ...(viewerId !== undefined ? { by: h.by === r.buyerId ? 'BUYER' : 'ATLANTIS' } : {}),
        }));
    }

    /**
     * The buyer's view of their own request: buyer prices only (their target, the
     * listed price, the desk's counter), never the supplier, the supplier's net
     * price, the staff member or internal ids.
     */
    buyerView(r: any, listedCasePrice?: number | null) {
        const stage = targetStage(r);
        return {
            id: r.id, ref: r.ref, status: r.status, stage, actions: allowedActions(stage), createdAt: r.createdAt, updatedAt: r.updatedAt,
            product: r.product ? { id: r.product.id, name: r.product.name, ean: r.product.ean, image: (r.product.images || []).find((x: string) => /^https?:/.test(x)) || null } : null,
            targetCasePrice: r.targetCasePrice, originalTargetCasePrice: r.originalTargetCasePrice ?? null,
            enteredPrice: r.enteredPrice, enteredBasis: r.enteredBasis, currency: r.currency,
            quantity: r.quantity, quantityUnit: r.quantityUnit, quantityCases: r.quantityCases, message: r.message, deliveryCountry: r.deliveryCountry ?? null,
            listedCasePriceAtRequest: r.listedCasePriceAtRequest ?? null,
            listedCasePrice: listedCasePrice === undefined ? null : listedCasePrice,
            response: r.response, counterCasePrice: r.counterCasePrice, counterQuantityCases: r.counterQuantityCases ?? null, respondedAt: r.respondedAt,
            buyerDecision: r.buyerDecision ?? null, buyerDecidedAt: r.buyerDecidedAt ?? null,
            agreedCasePrice: r.agreedCasePrice ?? null, agreedQuantityCases: r.agreedQuantityCases ?? null, agreedAt: r.agreedAt ?? null,
            history: this.history(r, r.buyerId),
        };
    }

    async create(buyer: { id: string; role: string }, input: TargetPriceInput) {
        const role = String(buyer.role || '').toUpperCase();
        if (!['CUSTOMER', 'SUPPLIER'].includes(role)) throw new ForbiddenException('Target prices are for buyer accounts.');
        const key = typeof input.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
        if (key) {
            const existing = await this.repo.findUnique({ where: { idempotencyKey: key }, include: { product: true } });
            if (existing) {
                if (existing.buyerId !== buyer.id) throw new ConflictException('Duplicate request key.');
                return this.buyerView(existing);
            }
        }
        const p: any = await this.prisma.product.findUnique({ where: { id: String(input.productId || '') } });
        if (!p || p.status !== 'APPROVED') throw new NotFoundException('This product isn’t available.');
        if (p.supplierId === buyer.id) throw new ForbiddenException('You can’t set a target price on your own product.');

        const currency = String(input.currency || 'EUR').toUpperCase();
        const rate = TO_EUR[currency];
        if (!rate) throw new BadRequestException(`Currency “${currency}” isn’t supported.`);
        const basis = String(input.priceBasis || 'CASE').toUpperCase() === 'PIECE' ? 'PIECE' : 'CASE';
        const price = Number(input.price);
        if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) throw new BadRequestException('Enter a target price above 0.');
        if (basis === 'PIECE' && !(Number(p.unitsPerCase) > 0)) throw new BadRequestException('This product has no pieces-per-case, so set your target per case.');
        const targetCasePrice = round2((basis === 'PIECE' ? price * Number(p.unitsPerCase) : price) * rate);

        const unit = String(input.quantityUnit || 'CASE').toUpperCase();
        if (!['CASE', 'PALLET', 'TRUCK'].includes(unit)) throw new BadRequestException('Quantity unit must be case, pallet or truck.');
        const qty = Number(input.quantity);
        if (!Number.isInteger(qty) || qty < 1 || qty > 100_000) throw new BadRequestException('Quantity must be a whole number of at least 1.');
        const cpp = Number(p.casesPerPallet) || 0, ppt = Number(p.palletsPerShipment) || 0;
        if (unit === 'PALLET' && !cpp) throw new BadRequestException('Pallet quantities aren’t available for this product.');
        if (unit === 'TRUCK' && !(cpp && ppt)) throw new BadRequestException('Truck quantities aren’t available for this product.');
        const quantityCases = unit === 'CASE' ? qty : unit === 'PALLET' ? qty * cpp : qty * cpp * ppt;
        const minCases = minOrderCases(p);
        if (minCases && quantityCases < minCases) throw new BadRequestException(`The minimum order for this product is ${p.moq} ${String(p.moqUnit || '').toLowerCase()}(s) (${minCases} cases).`);
        const message = typeof input.message === 'string' ? input.message.trim().slice(0, 1000) : '';
        // Optional delivery country: must be one country from the shared list; never guessed.
        let deliveryCountry: string | null = null;
        if (input.deliveryCountry != null && String(input.deliveryCountry).trim()) {
            deliveryCountry = resolveCountry(String(input.deliveryCountry));
            if (!deliveryCountry) throw new BadRequestException('Choose the delivery country from the list.');
        }

        const open = await this.repo.findFirst({ where: { buyerId: buyer.id, productId: p.id, status: { in: OPEN } } });
        if (open) throw new ConflictException({ code: 'TARGET_EXISTS', message: `You already have an open target price for this product (${open.ref}). Withdraw it to send a new one.`, ref: open.ref, id: open.id });

        const listed = buyerCasePrice(p, await readMarkups(this.prisma));
        const now = new Date().toISOString();
        let created: any;
        try {
            created = await this.repo.create({
                data: {
                    ref: this.ref(), productId: p.id, buyerId: buyer.id, targetCasePrice, enteredPrice: price, enteredBasis: basis, currency,
                    quantity: qty, quantityUnit: unit, quantityCases, message: message || null, deliveryCountry, idempotencyKey: key,
                    listedCasePriceAtRequest: listed,
                    history: [{ status: 'OPEN', action: 'SUBMITTED', at: now, by: buyer.id, note: 'Submitted', price: targetCasePrice, cases: quantityCases }],
                },
                include: { product: true },
            });
        } catch (e: any) {
            if (key && e?.code === 'P2002') {
                const again = await this.repo.findUnique({ where: { idempotencyKey: key }, include: { product: true } });
                if (again?.buyerId === buyer.id) return this.buyerView(again);
            }
            throw e;
        }
        this.notifications.notifyAdmins('New target price', `${created.ref}: ${p.name} — target €${targetCasePrice.toFixed(2)}/case for ${quantityCases} cases${deliveryCountry ? ` to ${countryName(deliveryCountry)}` : ''}${listed ? ` (listed €${listed.toFixed(2)})` : ''}.`, 'INFO',
            { targetPriceRequestId: created.id, targetRef: created.ref, productId: p.id, kind: 'TARGET_CREATED', params: { ref: created.ref, product: p.name, cases: quantityCases }, dedupeKey: `target:${created.id}:created` }).catch(() => {});
        // The product's supplier learns that buyers want this product at a better price — never the target, the buyer or any buyer price.
        if (p.supplierId) {
            this.notifications.notifyUser(p.supplierId, 'Buyer price interest', `A buyer asked Atlantis for a better price on “${p.name}” (${quantityCases} cases). Atlantis handles the request; you may be asked about your price.`, 'INFO',
                { targetPriceRequestId: created.id, productId: p.id, kind: 'TARGET_INTEREST_SUPPLIER', params: { product: p.name, cases: quantityCases }, dedupeKey: `target:${created.id}:supplier` }).catch(() => {});
        }
        return this.buyerView(created, listed);
    }

    /** The caller's own requests only (whatever their role), with today's listed buyer price for comparison. */
    async mine(buyerId: string) {
        const rows = await this.repo.findMany({ where: { buyerId }, orderBy: { createdAt: 'desc' }, take: 100, include: { product: true } });
        const m = await readMarkups(this.prisma);
        return rows.map((r: any) => this.buyerView(r, r.product && r.product.status === 'APPROVED' ? buyerCasePrice(r.product, m) : null));
    }

    /** Re-reads a request after a guarded update matched nothing, to say why. */
    private async whyNot(id: string): Promise<never> {
        const now = await this.repo.findUnique({ where: { id } });
        if (now && OPEN.includes(now.status)) throw new ConflictException({ code: 'TARGET_CHANGED', message: 'This request changed while you were looking at it. Reload to see the latest reply.' });
        throw new ConflictException({ code: 'TARGET_CLOSED', message: 'This request is already closed.' });
    }

    async withdraw(buyerId: string, id: string) {
        const r = await this.repo.findUnique({ where: { id } });
        // Someone else's request looks exactly like a missing one.
        if (!r || r.buyerId !== buyerId) throw new NotFoundException('Request not found');
        if (!OPEN.includes(r.status)) throw new ConflictException({ code: 'TARGET_CLOSED', message: 'This request is already closed.' });
        const moved = await this.repo.updateMany({
            where: { id, status: { in: OPEN }, updatedAt: r.updatedAt },
            data: { status: 'WITHDRAWN', history: [...(r.history || []), { status: 'WITHDRAWN', action: 'WITHDRAWN', at: new Date().toISOString(), by: buyerId, note: 'Withdrawn by buyer' }] },
        });
        if (!moved.count) await this.whyNot(id);
        const out = await this.repo.findUnique({ where: { id }, include: { product: true } });
        this.notifications.notifyAdmins('Target price withdrawn', `${r.ref}: the buyer withdrew the request.`, 'INFO',
            { targetPriceRequestId: id, targetRef: r.ref, productId: r.productId, kind: 'TARGET_WITHDRAWN', params: { ref: r.ref, product: out?.product?.name ?? '' }, dedupeKey: `target:${id}:withdrawn` }).catch(() => {});
        return this.buyerView(out);
    }

    /**
     * The buyer's answer to the desk: ACCEPT the counter (→ ACCEPTED, agreed at that
     * price), DECLINE it (→ DECLINED, closed) or REVISE with a new target (→ OPEN,
     * back with the desk). Only on their own request, only while the desk's reply is
     * the current one; nothing is ordered.
     */
    async decide(buyerId: string, id: string, body: DecisionInput) {
        const decision = String(body?.decision || '').toUpperCase();
        if (!['ACCEPT', 'DECLINE', 'REVISE'].includes(decision)) throw new BadRequestException('Decision must be ACCEPT, DECLINE or REVISE.');
        const r = await this.repo.findUnique({ where: { id }, include: { product: true } });
        if (!r || r.buyerId !== buyerId) throw new NotFoundException('Request not found');
        const stage = targetStage(r);
        const can = allowedActions(stage);
        const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) : '';
        const at = new Date();
        const history = [...(r.history || [])];
        let data: any;
        let notice: { kind: string; title: string; text: string; price: number };
        if (decision === 'ACCEPT') {
            if (!can.buyerMayAcceptCounter) throw new ConflictException({ code: 'TARGET_NO_COUNTER', message: 'There is no counter-offer to accept on this request.' });
            const seen = Number(body?.counterCasePrice);
            if (!Number.isFinite(seen) || Math.abs(seen - Number(r.counterCasePrice)) > 0.004) throw new ConflictException({ code: 'TARGET_CHANGED', message: 'The counter-offer changed. Reload to see the latest one before accepting.' });
            const cases = r.counterQuantityCases ?? r.quantityCases;
            history.push({ status: 'ACCEPTED', action: 'BUYER_ACCEPT', at: at.toISOString(), by: buyerId, note: message || null, price: r.counterCasePrice, cases });
            data = { status: 'ACCEPTED', buyerDecision: 'ACCEPTED', buyerDecidedAt: at, agreedCasePrice: r.counterCasePrice, agreedQuantityCases: cases, agreedAt: at, history };
            notice = { kind: 'TARGET_COUNTER_ACCEPTED', title: `Counter-offer ${r.ref} accepted`, text: `${r.ref}: the buyer accepted €${Number(r.counterCasePrice).toFixed(2)} per case for ${cases} cases of ${r.product?.name}. Nothing is ordered yet — follow up with the buyer.`, price: round2(r.counterCasePrice) };
        } else if (decision === 'DECLINE') {
            if (!can.buyerMayDeclineCounter) throw new ConflictException({ code: 'TARGET_NO_COUNTER', message: 'There is no counter-offer to decline on this request.' });
            history.push({ status: 'DECLINED', action: 'BUYER_DECLINE', at: at.toISOString(), by: buyerId, note: message || null, price: r.counterCasePrice });
            data = { status: 'DECLINED', buyerDecision: 'DECLINED', buyerDecidedAt: at, history };
            notice = { kind: 'TARGET_COUNTER_DECLINED', title: `Counter-offer ${r.ref} declined`, text: `${r.ref}: the buyer declined €${Number(r.counterCasePrice).toFixed(2)} per case for ${r.product?.name}.${message ? ` “${message}”` : ''}`, price: round2(r.counterCasePrice) };
        } else {
            if (!can.buyerMayRevise) throw new ConflictException({ code: 'TARGET_NOT_ANSWERED', message: 'You can send a new target once the sourcing desk has replied.' });
            const next = Number(body?.targetCasePrice);
            if (!Number.isFinite(next) || next <= 0 || next > 1_000_000) throw new BadRequestException('Enter a new target price above 0.');
            const target = round2(next);
            if (r.counterCasePrice && target >= r.counterCasePrice) throw new BadRequestException('Your new target is at or above the counter-offer — accept the counter-offer instead.');
            history.push({ status: 'OPEN', action: 'BUYER_REVISE', at: at.toISOString(), by: buyerId, note: message || null, price: target, cases: r.quantityCases });
            data = {
                status: 'OPEN', buyerDecision: 'REVISED', buyerDecidedAt: at, targetCasePrice: target, originalTargetCasePrice: r.originalTargetCasePrice ?? r.targetCasePrice,
                // The desk's earlier reply stays in the history; the request is back in its queue.
                counterCasePrice: null, counterQuantityCases: null, response: null, reachedNotifiedAt: null, history,
            };
            notice = { kind: 'TARGET_REVISED', title: `New target on ${r.ref}`, text: `${r.ref}: the buyer sent a new target of €${target.toFixed(2)} per case for ${r.quantityCases} cases of ${r.product?.name}.${message ? ` “${message}”` : ''}`, price: target };
        }
        const moved = await this.repo.updateMany({ where: { id, buyerId, status: r.status, updatedAt: r.updatedAt }, data });
        if (!moved.count) await this.whyNot(id);
        this.notifications.notifyAdmins(notice.title, notice.text, decision === 'DECLINE' ? 'WARNING' : 'INFO',
            { targetPriceRequestId: id, targetRef: r.ref, productId: r.productId, kind: notice.kind, params: { ref: r.ref, product: r.product?.name ?? '', price: notice.price, reason: message.slice(0, 300) }, dedupeKey: `target:${id}:buyer:${decision}:${history.length}` }).catch(() => {});
        const out = await this.repo.findUnique({ where: { id }, include: { product: true } });
        const m = await readMarkups(this.prisma);
        return this.buyerView(out, out?.product?.status === 'APPROVED' ? buyerCasePrice(out.product, m) : null);
    }

    private staffWhere(q: { status?: string; q?: string; stage?: string }) {
        const where: any = {};
        const st = String(q.status || '').toUpperCase();
        if ((TP_STATUSES as readonly string[]).includes(st)) where.status = st;
        // "Waiting for the buyer": a counter-offer the buyer hasn't answered.
        if (String(q.stage || '').toUpperCase() === 'COUNTER_OFFERED') { where.status = 'RESPONDED'; where.counterCasePrice = { not: null }; }
        const term = String(q.q || '').trim().slice(0, 80);
        if (term) where.OR = [
            { ref: { contains: term, mode: 'insensitive' } },
            { product: { name: { contains: term, mode: 'insensitive' } } }, { product: { ean: { contains: term } } },
            { buyer: { email: { contains: term, mode: 'insensitive' } } }, { buyer: { name: { contains: term, mode: 'insensitive' } } }, { buyer: { companyName: { contains: term, mode: 'insensitive' } } },
            { product: { supplier: { companyName: { contains: term, mode: 'insensitive' } } } }, { product: { supplier: { email: { contains: term, mode: 'insensitive' } } } },
        ];
        return where;
    }

    private staffRow(r: any, m: any) {
        const rest: any = this.buyerView(r, buyerCasePrice(r.product || {}, m));
        const s = r.product?.supplier;
        return {
            ...rest,
            history: this.history(r),
            buyer: r.buyer ? { id: r.buyer.id, name: r.buyer.name, email: r.buyer.email, companyName: r.buyer.companyName } : null,
            // Staff only: who lists the product (never shown to buyers). No supplier price is returned.
            supplier: s ? { id: s.id, name: s.name, companyName: s.companyName } : null,
            unitsPerCase: r.product?.unitsPerCase ?? null, casesPerPallet: r.product?.casesPerPallet ?? null,
            moqCases: r.product ? minOrderCases(r.product) || null : null,
            respondedById: r.respondedById ?? null,
        };
    }

    private staffInclude() {
        return {
            product: { select: { id: true, name: true, ean: true, images: true, basePrice: true, status: true, moq: true, moqUnit: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true, supplier: { select: { id: true, name: true, companyName: true, email: true } } } },
            buyer: { select: { id: true, name: true, email: true, companyName: true } },
        };
    }

    /** Staff list with real counts per status: buyer prices only (listed, target, counter), never the supplier price. */
    async list(q: { status?: string; stage?: string; q?: string; page?: string | number }) {
        const page = Math.max(1, Number(q.page) || 1), take = 30;
        const where = this.staffWhere(q);
        const countWhere = this.staffWhere({ q: q.q }); // counts follow the search, not the status tab
        const [total, rows, m, grouped, awaitingBuyer] = await Promise.all([
            this.repo.count({ where }),
            this.repo.findMany({ where, orderBy: [{ updatedAt: 'desc' }], skip: (page - 1) * take, take, include: this.staffInclude() }),
            readMarkups(this.prisma),
            this.repo.groupBy({ by: ['status'], where: countWhere, _count: { _all: true } }),
            this.repo.count({ where: { ...countWhere, status: 'RESPONDED', counterCasePrice: { not: null } } }),
        ]);
        const counts: Record<string, number> = Object.fromEntries(TP_STATUSES.map((s) => [s, 0]));
        for (const g of grouped as any[]) counts[g.status] = g._count?._all ?? 0;
        return {
            total, page, pages: Math.max(1, Math.ceil(total / take)),
            counts: { ...counts, ALL: Object.values(counts).reduce((a, b) => a + b, 0), COUNTER_OFFERED: awaitingBuyer },
            data: rows.map((r: any) => this.staffRow(r, m)),
        };
    }

    /** One request for staff, with the negotiation history and who acted (staff names; the buyer as "Buyer"). */
    async detail(id: string) {
        const r = await this.repo.findUnique({ where: { id }, include: this.staffInclude() });
        if (!r) throw new NotFoundException('Request not found');
        const m = await readMarkups(this.prisma);
        const ids = [...new Set((Array.isArray(r.history) ? r.history : []).map((h: any) => h.by).filter((x: any) => typeof x === 'string' && x !== r.buyerId))] as string[];
        const people = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, role: true } }) : [];
        const byId = new Map(people.map((u: any) => [u.id, u]));
        const row = this.staffRow(r, m);
        return {
            ...row,
            history: (Array.isArray(r.history) ? r.history : []).map((h: any, i: number) => {
                const u: any = byId.get(h.by);
                return { ...row.history[i], actor: h.by === r.buyerId ? { kind: 'BUYER' } : u ? { kind: 'STAFF', name: u.name || u.email, role: u.role } : { kind: 'UNKNOWN' } };
            }),
        };
    }

    /**
     * The desk's answer. Three outcomes, distinct:
     *  ACCEPTED  — the target is accepted as asked (agreed at the buyer's target; no counter allowed);
     *  RESPONDED — a counter-offer (price per case above the target, optional quantity in cases), the buyer decides;
     *              a reply without a price is still accepted for older clients and needs a message;
     *  DECLINED  — closed, no price.
     * Allowed while the request is OPEN or RESPONDED (the desk may revise its counter).
     */
    async respond(staffId: string, id: string, body: RespondInput) {
        const status = String(body?.status || '').toUpperCase();
        if (!['RESPONDED', 'ACCEPTED', 'DECLINED'].includes(status)) throw new BadRequestException('Status must be RESPONDED, ACCEPTED or DECLINED.');
        const response = String(body?.response || '').trim().slice(0, 2000);
        const blank = (v: any) => v === undefined || v === null || v === '';
        const counter = blank(body?.counterCasePrice) ? null : Number(body!.counterCasePrice);
        const counterCases = blank(body?.counterQuantityCases) ? null : Number(body!.counterQuantityCases);
        if (counter !== null && (!Number.isFinite(counter) || counter <= 0 || counter > 1_000_000)) throw new BadRequestException('Counter price must be above 0.');
        if (counterCases !== null && (!Number.isInteger(counterCases) || counterCases < 1 || counterCases > 10_000_000)) throw new BadRequestException('Counter quantity must be a whole number of cases.');
        if (status !== 'RESPONDED' && (counter !== null || counterCases !== null)) throw new BadRequestException(status === 'ACCEPTED' ? 'Accepting means the buyer’s target as asked. To offer another price, send a counter-offer.' : 'A decline has no price.');
        if (status === 'RESPONDED' && counter === null && response.length < 3) throw new BadRequestException('Enter a counter price per case, or write a reply for the buyer.');
        if (counterCases !== null && counter === null) throw new BadRequestException('A counter quantity needs a counter price.');

        const r = await this.repo.findUnique({ where: { id }, include: { product: true, buyer: { select: { id: true, email: true, name: true, notificationPrefs: true } } } });
        if (!r) throw new NotFoundException('Request not found');
        if (!OPEN.includes(r.status)) throw new ConflictException({ code: 'TARGET_CLOSED', message: 'This request is already closed.' });
        if (counter !== null && round2(counter) <= r.targetCasePrice) throw new BadRequestException('That counter is at or below the buyer’s target — accept the target instead.');
        const minCases = r.product ? minOrderCases(r.product) : 0;
        if (counterCases !== null && minCases && counterCases < minCases) throw new BadRequestException(`The counter quantity is below the minimum order (${minCases} cases).`);

        const at = new Date();
        const price = status === 'ACCEPTED' ? r.targetCasePrice : counter !== null ? round2(counter) : null;
        const cases = status === 'ACCEPTED' ? r.quantityCases : counterCases ?? (counter !== null ? r.quantityCases : null);
        const action = status === 'ACCEPTED' ? 'DESK_ACCEPT' : status === 'DECLINED' ? 'DESK_DECLINE' : counter !== null ? 'DESK_COUNTER' : 'DESK_REPLY';
        const history = [...(r.history || []), { status, action, at: at.toISOString(), by: staffId, note: response || null, ...(price !== null ? { price } : {}), ...(cases !== null ? { cases } : {}) }];
        const moved = await this.repo.updateMany({
            where: { id, status: { in: OPEN }, updatedAt: r.updatedAt },
            data: {
                status, response: response || null, counterCasePrice: status === 'RESPONDED' && counter !== null ? round2(counter) : null, counterQuantityCases: status === 'RESPONDED' ? counterCases : null,
                respondedAt: at, respondedById: staffId, buyerDecision: null, buyerDecidedAt: null,
                ...(status === 'ACCEPTED' ? { agreedCasePrice: r.targetCasePrice, agreedQuantityCases: r.quantityCases, agreedAt: at } : {}),
                history,
            },
        });
        if (!moved.count) await this.whyNot(id);

        const product = r.product?.name ?? '';
        const kind = status === 'ACCEPTED' ? 'TARGET_ACCEPTED' : status === 'DECLINED' ? 'TARGET_DECLINED' : counter !== null ? 'TARGET_COUNTERED' : 'TARGET_RESPONDED';
        const casesText = cases && cases !== r.quantityCases ? ` for ${cases} cases` : '';
        const headline: Record<string, string> = {
            TARGET_ACCEPTED: `Target price ${r.ref} accepted`,
            TARGET_DECLINED: `Target price ${r.ref} declined`,
            TARGET_COUNTERED: `Counter-offer on your target price ${r.ref}`,
            TARGET_RESPONDED: `Reply to your target price ${r.ref}`,
        };
        const body1: Record<string, string> = {
            TARGET_ACCEPTED: `The Atlantis sourcing desk accepted your target of €${r.targetCasePrice.toFixed(2)} per case for ${product}. Nothing is ordered yet — the desk will follow up.`,
            TARGET_DECLINED: `The Atlantis sourcing desk declined your target price for ${product}.`,
            TARGET_COUNTERED: `The Atlantis sourcing desk offers €${(price ?? 0).toFixed(2)} per case${casesText} for ${product}. Accept or decline it on your target prices page.`,
            TARGET_RESPONDED: `The Atlantis sourcing desk answered your request for ${product}.`,
        };
        const text = `${body1[kind]}${response ? ` “${response}”` : ''}`;
        const link = `/dashboard/customer/targets?ref=${encodeURIComponent(r.ref)}`;
        this.notifications.notifyUser(r.buyerId, headline[kind], text, status === 'DECLINED' ? 'WARNING' : 'SUCCESS',
            { targetPriceRequestId: id, targetRef: r.ref, productId: r.productId, link, kind, params: { ref: r.ref, product, reason: response.slice(0, 300), price: price !== null ? price : '', cases: cases ?? '' }, dedupeKey: `target:${id}:${status}:${history.length - 1}` }).catch(() => {});
        // Operational email (an answer to the buyer's own request), unless they turned order/account updates off.
        const prefs = (r.buyer?.notificationPrefs as any) || {};
        if (r.buyer?.email && prefs.orderUpdates !== false) {
            const base = process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com';
            const esc = (t: string) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
            this.email.sendMailDetailed(r.buyer.email, headline[kind],
                `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#0F172A"><h2 style="margin:0 0 8px">${esc(headline[kind])}</h2><p style="color:#475569;line-height:1.6">${esc(text)}</p><p><a href="${base}${link}" style="color:#0E7C74;font-weight:600">View your target price</a></p></div>`)
                .then((res) => { if (!res.success) console.error(`[TARGET_PRICE_EMAIL_FAIL] ${r.ref}: ${res.error}`); }).catch(() => {});
        }
        return { ok: true, status, stage: targetStage({ status, counterCasePrice: status === 'RESPONDED' ? counter : null, buyerDecision: null, agreedCasePrice: status === 'ACCEPTED' ? r.targetCasePrice : null }) };
    }
}
