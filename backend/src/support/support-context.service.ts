import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { MixedLoadsService } from '../orders/mixed-loads.service';
import { missingForPublish, statusExplanation } from '../products/catalog-rules';
import { stockMovements } from '../products/stock-ledger';
import { readMarkups, buyerCasePrice, minOrderCases } from '../common/markups';
import { missingProfileFields } from '../users/profile-completion';
import { loadDeliveryCountries } from '../shipping/delivery-policy';

/**
 * Account facts for the support assistant — retrieved on the server for the
 * signed-in user ONLY (identity comes from the verified token, never from
 * the client), and only for the topic being asked about. Every query is
 * scoped by ownership: a supplier sees their own products/orders, a buyer
 * their own orders/cart. Buyer prices, Atlantis margins, other users' data
 * and internal admin notes are never included for suppliers; supplier
 * prices are never included for buyers.
 */
export type Area = 'products' | 'inventory' | 'pricing' | 'orders' | 'checkout' | 'delivery' | 'account' | 'catalog';
export interface SupportLink { label: string; href: string }
export interface SupportContext { role: 'supplier' | 'buyer' | 'staff'; areas: Area[]; facts: string; links: SupportLink[] }
export interface Viewer { id: string; role: string }

const AREA_PATTERNS: [Area, RegExp][] = [
    ['products', /\b(product|products|listing|listings|marketplace|appear|appearing|visible|publish|published|approved|approval|review|draft|rejected|live)\b|منتج|المنتج|منتجات|يظهر|ظاهر|نشر|مراجعة|مسودة/i],
    ['inventory', /\b(stock|inventory|quantity|quantities|out of stock|reserved|reservation|cases left)\b|مخزون|المخزون|كمية|الكمية|محجوز/i],
    ['pricing', /\b(price|prices|pricing|cost|margin|currency|discount|offer)\b|سعر|السعر|أسعار|اسعار|عملة|خصم/i],
    ['orders', /\b(order|orders|shipment|shipped|deliver|delivered|delivery|track|tracking|status|invoice|cancel)\b|طلب|طلبات|الطلب|اوردر|أوردر|شحن|شحنة|توصيل|فاتورة/i],
    ['checkout', /\b(checkout|check out|cart|basket|minimum|moq|pallet|pallets|truck|mix|mixed|pay|payment|buy|purchase)\b|سلة|السلة|الدفع|دفع|الحد الأدنى|باليت|شاحنة|شراء/i],
    ['delivery', /\b(deliver|delivery|country|destination|ship to|egypt|shipping)\b|توصيل|دولة|الدولة|مصر/i],
    ['account', /\b(account|kyc|verify|verified|verification|profile|settings|password|email|login|sign in|2fa)\b|حساب|الحساب|توثيق|تحقق|إعدادات|اعدادات|كلمة السر/i],
    ['catalog', /\b(compare|comparison|supplier offers|offers|available|availability|in stock|find|looking for)\b|قارن|مقارنة|متوفر|متاح/i],
];
const STOP = new Set(['the', 'and', 'for', 'with', 'my', 'why', 'how', 'what', 'isnt', 'not', 'can', 'cant', 'this', 'that', 'help', 'product', 'products', 'order', 'orders', 'price', 'stock', 'is', 'are', 'me', 'please']);
const words = (s: string) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
const ref = (id: string) => `#${id.slice(-8).toUpperCase()}`;
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const STAFF = ['ADMIN', 'OWNER', 'MODERATOR', 'EDITOR', 'SUPPORT', 'DEVELOPER', 'LOGISTICS'];

export function detectAreas(text: string): Area[] {
    const out = AREA_PATTERNS.filter(([, re]) => re.test(text)).map(([a]) => a);
    return Array.from(new Set(out));
}

/** "#AB12CD34" / "ab12cd34" style order references in the text. */
export function orderRefs(text: string): string[] {
    return Array.from(new Set((String(text).match(/#?\b[0-9a-f]{8}\b/gi) || []).map((m) => m.replace('#', '').toUpperCase())));
}

@Injectable()
export class SupportContextService {
    constructor(private readonly prisma: PrismaService, private readonly orders: OrdersService, private readonly loads: MixedLoadsService) {}

    async build(viewer: Viewer, question: string, opts: { cart?: any[]; previous?: string } = {}): Promise<SupportContext> {
        const role = String(viewer.role || '').toUpperCase();
        const group: SupportContext['role'] = role === 'SUPPLIER' ? 'supplier' : STAFF.includes(role) ? 'staff' : 'buyer';
        // Follow-ups ("which product was in it?") keep the topic of the previous question.
        const areas = Array.from(new Set([...detectAreas(question), ...(opts.previous ? detectAreas(opts.previous) : [])]));
        question = opts.previous && orderRefs(question).length === 0 ? `${question}\n${orderRefs(opts.previous).map((r) => `#${r}`).join(' ')}` : question;
        const lines: string[] = [];
        const links: SupportLink[] = [];
        if (group === 'supplier') await this.supplier(viewer.id, question, areas, lines, links);
        else if (group === 'buyer') await this.buyer(viewer.id, question, areas, lines, links, opts.cart);
        else lines.push('The user is Atlantis staff; no account facts are attached in the support assistant.');
        const seen = new Set<string>();
        return { role: group, areas, facts: lines.join('\n'), links: links.filter((l) => !seen.has(l.href) && seen.add(l.href)).slice(0, 4) };
    }

    // ─── Supplier ────────────────────────────────────────────────────────
    private async supplier(id: string, q: string, areas: Area[], out: string[], links: SupportLink[]) {
        const me: any = await this.prisma.user.findUnique({ where: { id }, select: { kycStatus: true, status: true, defaultCurrency: true, country: true, name: true, companyName: true, businessType: true, phone: true } });
        const products: any[] = await this.prisma.product.findMany({
            where: { supplierId: id },
            select: { id: true, name: true, brand: true, ean: true, status: true, adminNotes: true, stock: true, basePrice: true, supplierPrice: true, supplierCurrency: true, moq: true, moqUnit: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true, images: true, category: true, origin: true, exwLocation: true, weight: true, unit: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' }, take: 500,
        });
        const byStatus = products.reduce((m: Record<string, number>, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {});
        out.push(`Supplier catalog: ${products.length} products (${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}). Identity verification (KYC): ${me?.kycStatus ?? 'unknown'}. Account status: ${me?.status ?? 'unknown'}.`);

        // A product the question is about (by barcode or name words).
        const ean = (q.match(/\b\d{8,14}\b/) || [])[0];
        const qw = words(q);
        const scored = products.map((p) => ({ p, s: (ean && p.ean === ean ? 10 : 0) + words(`${p.name} ${p.brand || ''}`).filter((w) => qw.includes(w)).length })).filter((x) => x.s >= 2 || (x.s >= 1 && qw.length <= 2)).sort((a, b) => b.s - a.s);
        const focus = scored[0]?.p;
        const named = qw.filter((w) => !/^(appear|appearing|marketplace|visible|live|draft|incorrect|wrong|update|inventory|showing|isnt|doesnt)$/.test(w));
        if (!focus && named.length && (areas.includes('products') || areas.includes('pricing') || areas.includes('inventory'))) {
            out.push(`None of this supplier's own products matches the product named in the question ("${named.slice(0, 6).join(' ')}"). Do not describe the status of a product that isn't theirs; ask them to check the name or barcode.`);
        }
        const describe = async (p: any) => {
            const missing = missingForPublish(p);
            const mv = (await stockMovements(this.prisma, [p.id]))[p.id];
            out.push(`Product "${p.name}" (Atlantis ID ${p.id}, EAN ${p.ean || 'none'}): status ${p.status}. ${statusExplanation(p.status, missing, p.status === 'NEEDS_CHANGES' || p.status === 'REJECTED' ? p.adminNotes : null)}`
                + `${missing.length ? ` Missing/invalid: ${missing.map((m) => `${m.label} (${m.reason})`).join('; ')}.` : ''}`
                + ` Stock: ${p.stock ?? 0} cases available${mv ? `, ${mv.reserved} reserved on open orders, ${mv.inTransit} in transit` : ''}.`
                + ` Your price: ${p.supplierPrice && p.supplierCurrency ? `${p.supplierPrice} ${p.supplierCurrency}` : p.basePrice ? `${p.basePrice} EUR` : 'not set'} per case.`
                + ` Minimum order: ${p.moq ? `${p.moq} ${String(p.moqUnit || 'PIECE').toLowerCase()}(s)` : 'none'}. Pack: ${p.unitsPerCase ?? '?'} pcs/case, ${p.casesPerPallet ?? '?'} cases/pallet, ${p.palletsPerShipment ?? '?'} pallets/truck. Last updated ${day(p.updatedAt)}.`);
            links.push({ label: `Edit ${p.name.slice(0, 40)}`, href: `/supplier/products/${p.id}/edit` });
        };
        if (focus) await describe(focus);

        if (areas.includes('products') || (!areas.length && !focus)) {
            const notLive = products.filter((p) => p.status !== 'APPROVED' && p.id !== focus?.id).slice(0, 6);
            for (const p of notLive) {
                const missing = missingForPublish(p);
                out.push(`Not live: "${p.name}" — ${p.status}. ${statusExplanation(p.status, missing, p.status === 'NEEDS_CHANGES' || p.status === 'REJECTED' ? p.adminNotes : null)}`);
            }
            const liveIncomplete = products.filter((p) => p.status === 'APPROVED' && missingForPublish(p).length).length;
            if (liveIncomplete) out.push(`${liveIncomplete} live product(s) have missing required details.`);
            const outOfStockLive = products.filter((p) => p.status === 'APPROVED' && !(p.stock > 0)).length;
            if (outOfStockLive) out.push(`${outOfStockLive} live product(s) have 0 stock — buyers see them as out of stock.`);
            links.push({ label: 'Inventory & products', href: '/supplier/products' });
        }
        if (areas.includes('inventory')) {
            const live = products.filter((p) => p.status === 'APPROVED');
            const zero = live.filter((p) => !(p.stock > 0)).slice(0, 8);
            const low = live.filter((p) => p.stock > 0 && minOrderCases(p) > 0 && p.stock < minOrderCases(p)).slice(0, 8);
            out.push(`Out of stock (live): ${zero.length ? zero.map((p) => `"${p.name}"`).join(', ') : 'none'}. Below one minimum order: ${low.length ? low.map((p) => `"${p.name}" (${p.stock} cases, MOQ ${minOrderCases(p)} cases)`).join(', ') : 'none'}.`);
            out.push('How stock works on Atlantis: stock is counted in cases; orders take stock when placed and return it if cancelled before dispatch. Suppliers change stock per product (Stock & Reservations → Adjust) or in bulk (Inventory & Products → Update prices & stock).');
            links.push({ label: 'Stock & reservations', href: '/supplier/inventory' });
        }
        if (areas.includes('pricing')) {
            out.push('How pricing works: the supplier enters their own price per case (in their currency, converted to EUR once). Buyers see a price that includes the Atlantis margin; the margin and buyer prices are not shown to suppliers. Price changes on live products apply immediately and are recorded in the product history.');
            if (!focus) out.push(`Your prices (latest 8): ${products.slice(0, 8).map((p) => `"${p.name}" ${p.supplierPrice && p.supplierCurrency ? `${p.supplierPrice} ${p.supplierCurrency}` : p.basePrice ?? 'not set'}`).join('; ') || 'no products'}.`);
            links.push({ label: 'Update prices & stock', href: '/supplier/products' });
        }
        if (areas.includes('orders') || orderRefs(q).length) {
            const items: any[] = await this.prisma.orderItem.findMany({
                where: { product: { supplierId: id } },
                select: { orderId: true, quantity: true, selectedTier: true, supplierUnitPrice: true, productNameSnapshot: true, order: { select: { id: true, status: true, createdAt: true, history: { select: { newStatus: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 } } } },
                orderBy: { order: { createdAt: 'desc' } }, take: 120,
            });
            const byOrder = new Map<string, any>();
            for (const it of items) {
                const o = byOrder.get(it.orderId) ?? { ...it.order, lines: [] as any[] };
                o.lines.push(it);
                byOrder.set(it.orderId, o);
            }
            const wanted = orderRefs(q);
            const all = Array.from(byOrder.values());
            const chosen = wanted.length ? all.filter((o) => wanted.includes(o.id.slice(-8).toUpperCase())) : all.slice(0, 8);
            if (wanted.length && !chosen.length) out.push(`No order of this supplier matches ${wanted.map((w) => `#${w}`).join(', ')}.`);
            out.push(`Supplier orders (${all.length} total containing this supplier's products): ${chosen.map((o) => `${ref(o.id)} ${o.status} placed ${day(o.createdAt)}: ${o.lines.map((l: any) => `${l.quantity}× ${l.selectedTier || 'case'} ${l.productNameSnapshot || 'product'}${typeof l.supplierUnitPrice === 'number' ? ` (your value ${l.supplierUnitPrice}/unit)` : ''}`).join(', ')}`).join(' | ') || 'none'}.`);
            const awaiting = all.filter((o) => o.status === 'PENDING').length;
            if (awaiting) out.push(`${awaiting} order(s) are PENDING — waiting for the supplier to accept or decline in Orders.`);
            for (const o of chosen.slice(0, 2)) links.push({ label: `Order ${ref(o.id)}`, href: `/supplier/orders?q=${o.id.slice(-8).toUpperCase()}` });
            if (!chosen.length) links.push({ label: 'Orders', href: '/supplier/orders' });
        }
        if (areas.includes('account')) {
            const miss = missingProfileFields(me);
            out.push(`Account: KYC ${me?.kycStatus ?? 'unknown'}, default currency ${me?.defaultCurrency || 'not set'}, profile ${miss.length ? `missing ${miss.join(', ')}` : 'complete'}.`);
            links.push({ label: 'Settings', href: '/supplier/settings' });
        }
    }

    // ─── Buyer ───────────────────────────────────────────────────────────
    private async buyer(id: string, q: string, areas: Area[], out: string[], links: SupportLink[], cart?: any[]) {
        const me: any = await this.prisma.user.findUnique({ where: { id }, select: { status: true, kycStatus: true, emailVerified: true, onboardingCompleted: true, name: true, companyName: true, businessType: true, country: true, phone: true } });
        const wanted = orderRefs(q);
        if (areas.includes('orders') || wanted.length || !areas.length) {
            const orders: any[] = await this.prisma.order.findMany({
                where: { customerId: id, deletedByCustomer: false },
                select: { id: true, status: true, createdAt: true, totalAmount: true, destinationCountry: true, shippingCompany: true, paymentStatus: true,
                    items: { select: { productNameSnapshot: true, quantity: true, selectedTier: true } },
                    history: { select: { newStatus: true, createdAt: true, reason: true }, orderBy: { createdAt: 'desc' }, take: 3 },
                    shipment: { select: { trackingNumber: true, carrier: true } } } as any,
                orderBy: { createdAt: 'desc' }, take: 50,
            });
            const chosen = wanted.length ? orders.filter((o) => wanted.includes(o.id.slice(-8).toUpperCase())) : orders.slice(0, 6);
            if (wanted.length && !chosen.length) out.push(`No order of this buyer matches ${wanted.map((w) => `#${w}`).join(', ')}.`);
            out.push(`Buyer orders (${orders.length} total): ${chosen.map((o) => `${ref(o.id)} ${o.status} (payment ${o.paymentStatus}) placed ${day(o.createdAt)}, total ${o.totalAmount} EUR excl. delivery/VAT${o.destinationCountry ? `, to ${o.destinationCountry}` : ''}${o.shipment?.trackingNumber ? `, tracking ${o.shipment.carrier || ''} ${o.shipment.trackingNumber}` : ''}; items: ${o.items.map((i: any) => `${i.quantity}× ${i.selectedTier || 'case'} ${i.productNameSnapshot || 'product'}`).join(', ')}; last update ${o.history[0] ? `${o.history[0].newStatus} on ${day(o.history[0].createdAt)}` : day(o.createdAt)}`).join(' | ') || 'none'}.`);
            out.push('Order statuses: PENDING (waiting for supplier confirmation), PAID, PROCESSING, SHIPPED, DELIVERED, CANCELLED. Delivery dates are not stored unless a tracking number is shown.');
            for (const o of chosen.slice(0, 2)) links.push({ label: `Order ${ref(o.id)}`, href: `/dashboard/customer/orders/${o.id}` });
            if (!chosen.length) links.push({ label: 'My orders', href: '/dashboard/customer/orders' });
        }
        if (areas.includes('checkout') || areas.includes('delivery')) {
            const items = Array.isArray(cart) ? cart.slice(0, 50) : [];
            if (items.length) {
                try {
                    const qv: any = await this.orders.priceCart(id, items, null, undefined, { lenient: true });
                    const bad = qv.lines.filter((l: any) => l.error);
                    out.push(`Cart check (server, now): ${items.length} line(s); ${bad.length ? `${bad.length} blocked: ${bad.map((l: any) => l.error.message).join(' | ')}` : 'all lines can be ordered'}; total ready ${qv.total} EUR excl. delivery/VAT.`);
                } catch (e: any) {
                    out.push(`Cart check failed: ${e?.response?.message || e?.message || 'unknown'}.`);
                }
            } else out.push('The buyer\'s cart is empty on this device (the cart lives in the browser).');
            const loads: any[] = await this.loads.list(id).catch(() => []);
            for (const l of loads.slice(0, 3)) out.push(`Mixed ${l.kind === 'TRUCK' ? 'truckload' : 'pallet'} draft: ${l.quote?.ready ? 'ready to order' : `not ready — ${(l.quote?.issues || [l.error?.message]).filter(Boolean).join(' ')}`}.`);
            const miss = missingProfileFields(me);
            if (me?.onboardingCompleted === false && miss.length) out.push(`Checkout is blocked until the business profile is complete (missing: ${miss.join(', ')}).`);
            const { countries } = await loadDeliveryCountries(this.prisma);
            out.push(`Delivery: Atlantis delivers to ${countries.length} countries (Europe and the Gulf by default); Egypt ${countries.includes('EG') ? 'is' : 'is not'} supported. Checkout refuses unsupported destinations. Freight is quoted after the order; VAT is added on the invoice.`);
            out.push('Checkout rules: every line must meet the product minimum order (shown as progress in the cart) and fit the stock; mixed loads combine variants of the same product.');
            links.push({ label: 'Cart', href: '/cart' });
        }
        if (areas.includes('catalog') || areas.includes('pricing') || (areas.includes('products') && !areas.includes('orders'))) {
            const ean = (q.match(/\b\d{8,14}\b/) || [])[0];
            const qw = words(q);
            if (ean || qw.length) {
                const rows: any[] = await this.prisma.product.findMany({
                    where: { status: 'APPROVED', OR: [...(ean ? [{ ean }] : []), ...qw.slice(0, 5).map((w) => ({ name: { contains: w, mode: 'insensitive' } }))] } as any,
                    select: { id: true, name: true, ean: true, stock: true, basePrice: true, moq: true, moqUnit: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true, origin: true },
                    take: 30,
                });
                const scored = rows.map((p) => ({ p, s: (ean && p.ean === ean ? 10 : 0) + words(p.name).filter((w) => qw.includes(w)).length })).sort((a, b) => b.s - a.s).slice(0, 4);
                const m = await readMarkups(this.prisma);
                for (const { p } of scored) {
                    const sameEan = p.ean ? await this.prisma.product.count({ where: { status: 'APPROVED', ean: p.ean } }) : 1;
                    out.push(`Catalog: "${p.name}" (EAN ${p.ean || 'none'}): ${p.stock > 0 ? `in stock (${p.stock} cases)` : 'out of stock'}, listed ${buyerCasePrice(p, m) ?? '—'} EUR per case (case tier, before delivery/VAT), minimum order ${p.moq ? `${p.moq} ${String(p.moqUnit || 'PIECE').toLowerCase()}(s)` : 'none'}, origin ${p.origin || 'not stated'}${sameEan > 1 ? `, ${sameEan} offers with this barcode — compare them on the product page` : ''}.`);
                    links.push({ label: p.name.slice(0, 40), href: `/products/${p.id}` });
                }
                if (!scored.length) out.push('No approved product matches the words in the question.');
            }
        }
        if (areas.includes('account')) {
            const miss = missingProfileFields(me);
            out.push(`Account: status ${me?.status}, email ${me?.emailVerified ? 'verified' : 'not verified'}, business profile ${miss.length ? `missing ${miss.join(', ')}` : 'complete'}.`);
            links.push({ label: 'Account settings', href: '/dashboard/customer/settings' });
        }
    }
}
