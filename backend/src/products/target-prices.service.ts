import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { TO_EUR } from './catalog-rules';
import { buyerCasePrice, minOrderCases, readMarkups } from '../common/markups';
import { countryName, resolveCountry } from '../shipping/delivery-policy';

export const TP_STAFF = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT'];
const OPEN = ['OPEN', 'RESPONDED'];

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

/**
 * Target-price requests: a buyer tells Atlantis the price they'd buy at.
 * Atlantis operations review and answer (Atlantis is the seller of record, so
 * the supplier is not contacted directly and never sees buyer prices).
 * Submitting never changes a listing price and never creates an order.
 */
@Injectable()
export class TargetPricesService {
    constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly email: EmailService) {}

    private ref() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        return 'TP-' + Array.from(crypto.randomBytes(6)).map((b) => alphabet[b % alphabet.length]).join('');
    }

    /** Public view of a request for its buyer (no internal fields). */
    private buyerView(r: any) {
        return {
            id: r.id, ref: r.ref, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt,
            product: r.product ? { id: r.product.id, name: r.product.name, ean: r.product.ean, image: (r.product.images || []).find((x: string) => /^https?:/.test(x)) || null } : null,
            targetCasePrice: r.targetCasePrice, enteredPrice: r.enteredPrice, enteredBasis: r.enteredBasis, currency: r.currency,
            quantity: r.quantity, quantityUnit: r.quantityUnit, quantityCases: r.quantityCases, message: r.message, deliveryCountry: r.deliveryCountry ?? null,
            response: r.response, counterCasePrice: r.counterCasePrice, respondedAt: r.respondedAt,
            history: (r.history || []).map((h: any) => ({ status: h.status, at: h.at, note: h.note ?? null })),
        };
    }

    async create(buyer: { id: string; role: string }, input: TargetPriceInput) {
        const role = String(buyer.role || '').toUpperCase();
        if (!['CUSTOMER', 'SUPPLIER'].includes(role)) throw new ForbiddenException('Target prices are for buyer accounts.');
        const key = typeof input.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
        if (key) {
            const existing = await (this.prisma as any).targetPriceRequest.findUnique({ where: { idempotencyKey: key }, include: { product: true } });
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
        const targetCasePrice = Math.round((basis === 'PIECE' ? price * Number(p.unitsPerCase) : price) * rate * 100) / 100;

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

        const open = await (this.prisma as any).targetPriceRequest.findFirst({ where: { buyerId: buyer.id, productId: p.id, status: { in: OPEN } } });
        if (open) throw new ConflictException({ code: 'TARGET_EXISTS', message: `You already have an open target price for this product (${open.ref}). Withdraw it to send a new one.`, ref: open.ref, id: open.id });

        const now = new Date().toISOString();
        let created: any;
        try {
            created = await (this.prisma as any).targetPriceRequest.create({
                data: {
                    ref: this.ref(), productId: p.id, buyerId: buyer.id, targetCasePrice, enteredPrice: price, enteredBasis: basis, currency,
                    quantity: qty, quantityUnit: unit, quantityCases, message: message || null, deliveryCountry, idempotencyKey: key,
                    history: [{ status: 'OPEN', at: now, by: buyer.id, note: 'Submitted' }],
                },
                include: { product: true },
            });
        } catch (e: any) {
            if (key && e?.code === 'P2002') {
                const again = await (this.prisma as any).targetPriceRequest.findUnique({ where: { idempotencyKey: key }, include: { product: true } });
                if (again?.buyerId === buyer.id) return this.buyerView(again);
            }
            throw e;
        }
        const listed = buyerCasePrice(p, await readMarkups(this.prisma));
        this.notifications.notifyAdmins('New target price', `${created.ref}: ${p.name} — target €${targetCasePrice.toFixed(2)}/case for ${quantityCases} cases${deliveryCountry ? ` to ${countryName(deliveryCountry)}` : ''}${listed ? ` (listed €${listed.toFixed(2)})` : ''}.`, 'INFO',
            { targetPriceRequestId: created.id, targetRef: created.ref, productId: p.id, kind: 'TARGET_CREATED', params: { ref: created.ref, product: p.name, cases: quantityCases }, dedupeKey: `target:${created.id}:created` }).catch(() => {});
        // The product's supplier learns that buyers want this product at a better price — never the target, the buyer or any buyer price.
        if (p.supplierId) {
            this.notifications.notifyUser(p.supplierId, 'Buyer price interest', `A buyer asked Atlantis for a better price on “${p.name}” (${quantityCases} cases). Atlantis handles the request; you may be asked about your price.`, 'INFO',
                { targetPriceRequestId: created.id, productId: p.id, kind: 'TARGET_INTEREST_SUPPLIER', params: { product: p.name, cases: quantityCases }, dedupeKey: `target:${created.id}:supplier` }).catch(() => {});
        }
        return this.buyerView(created);
    }

    async mine(buyerId: string) {
        const rows = await (this.prisma as any).targetPriceRequest.findMany({ where: { buyerId }, orderBy: { createdAt: 'desc' }, take: 100, include: { product: true } });
        return rows.map((r: any) => this.buyerView(r));
    }

    async withdraw(buyerId: string, id: string) {
        const r = await (this.prisma as any).targetPriceRequest.findUnique({ where: { id } });
        if (!r || r.buyerId !== buyerId) throw new NotFoundException('Request not found');
        const moved = await (this.prisma as any).targetPriceRequest.updateMany({
            where: { id, status: { in: OPEN } },
            data: { status: 'WITHDRAWN', history: [...(r.history || []), { status: 'WITHDRAWN', at: new Date().toISOString(), by: buyerId, note: 'Withdrawn by buyer' }] },
        });
        if (!moved.count) throw new ConflictException('This request is already closed.');
        const out = await (this.prisma as any).targetPriceRequest.findUnique({ where: { id }, include: { product: true } });
        this.notifications.notifyAdmins('Target price withdrawn', `${r.ref}: the buyer withdrew the request.`, 'INFO',
            { targetPriceRequestId: id, targetRef: r.ref, productId: r.productId, kind: 'TARGET_WITHDRAWN', params: { ref: r.ref, product: out?.product?.name ?? '' }, dedupeKey: `target:${id}:withdrawn` }).catch(() => {});
        return this.buyerView(out);
    }

    /** Staff list: includes the listed buyer price for comparison, never the supplier price. */
    async list(q: { status?: string; q?: string; page?: string | number }) {
        const page = Math.max(1, Number(q.page) || 1), take = 30;
        const where: any = {};
        if (q.status && ['OPEN', 'RESPONDED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'].includes(String(q.status).toUpperCase())) where.status = String(q.status).toUpperCase();
        const term = String(q.q || '').trim();
        if (term) where.OR = [{ ref: { contains: term, mode: 'insensitive' } }, { product: { name: { contains: term, mode: 'insensitive' } } }, { product: { ean: { contains: term } } }, { buyer: { email: { contains: term, mode: 'insensitive' } } }];
        const [total, rows, m] = await Promise.all([
            (this.prisma as any).targetPriceRequest.count({ where }),
            (this.prisma as any).targetPriceRequest.findMany({
                where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take,
                include: { product: { select: { id: true, name: true, ean: true, images: true, basePrice: true, moq: true, moqUnit: true } }, buyer: { select: { id: true, name: true, email: true, companyName: true } } },
            }),
            readMarkups(this.prisma),
        ]);
        return {
            total, page, pages: Math.max(1, Math.ceil(total / take)),
            data: rows.map((r: any) => ({ ...this.buyerView(r), listedCasePrice: buyerCasePrice(r.product || {}, m), buyer: r.buyer, idempotencyKey: undefined })),
        };
    }

    async respond(staffId: string, id: string, body: { status: string; response?: string; counterCasePrice?: number }) {
        const status = String(body?.status || '').toUpperCase();
        if (!['RESPONDED', 'ACCEPTED', 'DECLINED'].includes(status)) throw new BadRequestException('Status must be RESPONDED, ACCEPTED or DECLINED.');
        const response = String(body?.response || '').trim().slice(0, 2000);
        if (response.length < 3) throw new BadRequestException('Write a short reply for the buyer.');
        const counter = body?.counterCasePrice === undefined || body?.counterCasePrice === null || (body.counterCasePrice as any) === '' ? null : Number(body.counterCasePrice);
        if (counter !== null && (!Number.isFinite(counter) || counter <= 0)) throw new BadRequestException('Counter price must be above 0.');
        const r = await (this.prisma as any).targetPriceRequest.findUnique({ where: { id }, include: { product: true, buyer: { select: { id: true, email: true, name: true, notificationPrefs: true } } } });
        if (!r) throw new NotFoundException('Request not found');
        const moved = await (this.prisma as any).targetPriceRequest.updateMany({
            where: { id, status: { in: OPEN } },
            data: {
                status, response, counterCasePrice: counter, respondedAt: new Date(), respondedById: staffId,
                history: [...(r.history || []), { status, at: new Date().toISOString(), by: staffId, note: response.slice(0, 300) }],
            },
        });
        if (!moved.count) throw new ConflictException('This request is already closed.');
        const label = status === 'ACCEPTED' ? 'accepted' : status === 'DECLINED' ? 'declined' : 'answered';
        const text = `Your target price ${r.ref} for ${r.product?.name} was ${label}. ${response}${counter ? ` Our offer: €${counter.toFixed(2)} per case.` : ''}`;
        this.notifications.notifyUser(r.buyerId, `Target price ${label}`, text, status === 'DECLINED' ? 'WARNING' : 'SUCCESS',
            { targetPriceRequestId: id, targetRef: r.ref, productId: r.productId, kind: `TARGET_${status}`, params: { ref: r.ref, product: r.product?.name ?? '', reason: response.slice(0, 300), price: counter ? Math.round(counter * 100) / 100 : '' }, dedupeKey: `target:${id}:${status}:${(r.history || []).length}` }).catch(() => {});
        // Operational email (an answer to the buyer's own request), unless they turned order/account updates off.
        const prefs = (r.buyer?.notificationPrefs as any) || {};
        if (r.buyer?.email && prefs.orderUpdates !== false) {
            const base = process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com';
            const esc = (t: string) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
            this.email.sendMailDetailed(r.buyer.email, `Your target price ${r.ref} was ${label}`,
                `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#0F172A"><h2 style="margin:0 0 8px">Target price ${esc(r.ref)}</h2><p style="color:#475569;line-height:1.6">${esc(text)}</p><p><a href="${base}/dashboard/customer/targets" style="color:#0E7C74;font-weight:600">View your target prices</a></p></div>`)
                .then((res) => { if (!res.success) console.error(`[TARGET_PRICE_EMAIL_FAIL] ${r.ref}: ${res.error}`); }).catch(() => {});
        }
        return { ok: true, status };
    }
}
