import { missingProfileFields } from '../users/profile-completion';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvoiceService } from '../invoices/invoice.service';
import { EscrowService } from '../payments/escrow.service';
import { AppConfigService } from '../admin/app-config.service';
import { MixedLoadsService, asHttp } from './mixed-loads.service';
import { PricingError, basePerCase, casesInUnit, normaliseTier, priceLine, priceLoad, round2 } from './pricing';
import { casesForItem, supplierLineValue } from '../products/stock-ledger';
import { minOrderCases } from '../common/markups';

const STATUS_LABELS: Record<OrderStatus, string> = {
    PENDING: 'Pending',
    PAID: 'Paid',
    PROCESSING: 'Processing',
    SHIPPED: 'Shipped',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
};

/**
 * The order lifecycle. Anything not listed is refused (e.g. DELIVERED →
 * PROCESSING, or re-saving the same status), so a status can't be applied
 * twice and stock can't be restored twice.
 *   PENDING   placed, waiting for the supplier to confirm
 *   PAID      paid, waiting for the supplier to confirm
 *   PROCESSING confirmed by the supplier, being prepared
 *   SHIPPED   dispatched;  DELIVERED / CANCELLED are final.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    PENDING: [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.CANCELLED],
    PAID: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
    PROCESSING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    SHIPPED: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    DELIVERED: [],
    CANCELLED: [],
};
/** Cancelling from these returns the cases to stock (goods haven't left). */
export const RESTOCK_FROM: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.PROCESSING];
/** Statuses where the supplier still has to accept or reject. */
export const AWAITING_SUPPLIER: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PAID];

export function assertTransition(from: OrderStatus, to: OrderStatus) {
    if (from === to) throw new ConflictException({ code: 'INVALID_TRANSITION', message: `This order is already ${STATUS_LABELS[from] || from}.`, status: from });
    if (!ORDER_TRANSITIONS[from]?.includes(to)) {
        throw new BadRequestException({ code: 'INVALID_TRANSITION', message: `An order that is ${STATUS_LABELS[from] || from} can't be changed to ${STATUS_LABELS[to] || to}.`, from, to, allowed: ORDER_TRANSITIONS[from] });
    }
}

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
        private notificationsService: NotificationsService,
        private invoiceService: InvoiceService,
        private escrowService: EscrowService,
        private appConfigService: AppConfigService,
        private mixedLoads: MixedLoadsService,
    ) { }

    /**
     * Admin / logistics assigns a transport carrier, price, and (optionally)
     * the carrier-issued tracking number to the order. Upsert pattern so the
     * admin can update fields independently as info comes in: carrier first
     * during the booking call, tracking number when the carrier returns it,
     * price when negotiated.
     *
     * Order.shippingCompany + Order.shippingCost are stored on the Order
     * row directly. trackingNumber + carrier live on a separate Shipment
     * row (one-to-one with Order via unique orderId) so the Shipment record
     * can carry status updates over time.
     */
    async setShipping(
        orderId: string,
        shippingCompany?: string | null,
        shippingCost?: number | null,
        trackingNumber?: string | null,
    ) {
        // 1. Order-level fields
        const orderData: any = {};
        if (shippingCompany !== undefined) orderData.shippingCompany = shippingCompany || null;
        if (shippingCost !== undefined) {
            orderData.shippingCost = shippingCost === null ? null
                : Number(shippingCost) >= 0 ? Number(shippingCost) : null;
        }
        if (Object.keys(orderData).length > 0) {
            await this.prisma.order.update({ where: { id: orderId }, data: orderData });
        }

        // 2. Shipment-level fields (tracking + carrier)
        if (trackingNumber !== undefined || shippingCompany !== undefined) {
            const trimmedTracking = trackingNumber?.trim();
            if (trimmedTracking) {
                // Upsert the Shipment row. trackingNumber is @unique in the
                // schema; if a customer's old tracking number is being
                // reassigned to a different order Prisma will throw — that
                // shouldn't happen in normal use because each carrier-issued
                // tracking is unique to the shipment.
                await this.prisma.shipment.upsert({
                    where: { orderId },
                    create: {
                        orderId,
                        trackingNumber: trimmedTracking,
                        carrier: shippingCompany || null,
                    },
                    update: {
                        trackingNumber: trimmedTracking,
                        ...(shippingCompany !== undefined ? { carrier: shippingCompany || null } : {}),
                    },
                });
            } else if (trackingNumber === null) {
                // Explicit clear — drop the Shipment row entirely.
                await this.prisma.shipment.deleteMany({ where: { orderId } });
            } else if (shippingCompany !== undefined) {
                // Only the carrier was changed — update existing Shipment if any.
                await this.prisma.shipment.updateMany({
                    where: { orderId },
                    data: { carrier: shippingCompany || null },
                });
            }
        }

        // Return the merged latest state
        const fresh = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                shippingCompany: true,
                shippingCost: true,
                shipment: { select: { trackingNumber: true, carrier: true } },
            },
        });
        return {
            id: fresh?.id,
            shippingCompany: fresh?.shippingCompany,
            shippingCost: fresh?.shippingCost,
            trackingNumber: (fresh as any)?.shipment?.trackingNumber ?? null,
        };
    }

    /**
     * Price a cart on the server. Every line is recomputed from the database
     * (pack sizes, markups, MOQ, mixed-load capacity) — client prices are
     * never trusted. Used by POST /orders/quote and by create().
     */
    async priceCart(customerId: string, items: any[], couponCode?: string | null, db: any = this.prisma, opts: { lenient?: boolean } = {}) {
        if (!Array.isArray(items) || items.length === 0) throw new BadRequestException({ code: 'EMPTY_CART', message: 'Your cart is empty.' });
        if (items.length > 200) throw new BadRequestException({ code: 'TOO_MANY_LINES', message: 'Too many cart lines in one order.' });
        const markups = await this.mixedLoads.markups();
        const productIds = items.filter((i) => i && !i.mixedLoadId).map((i) => String(i.productId || '').split('::')[0]).filter(Boolean);
        const products = await this.mixedLoads.loadProducts(productIds, db);
        const lines: any[] = [];
        for (const raw of items) {
            if (!raw || typeof raw !== 'object') throw new BadRequestException({ code: 'INVALID_LINE', message: 'Invalid cart line.' });
            try {
                if (raw.mixedLoadId) {
                    // Server-saved mixed pallet / truckload.
                    const load = await db.mixedLoad.findFirst({ where: { id: String(raw.mixedLoadId), customerId } });
                    if (!load) throw new PricingError('LOAD_NOT_FOUND', 'A mixed load in your cart no longer exists.');
                    if (load.status !== 'DRAFT') throw new PricingError('LOAD_ALREADY_ORDERED', 'A mixed load in your cart has already been ordered.', { mixedLoadId: load.id });
                    const q = await this.mixedLoads.price(load.kind, load.lines as any[], db);
                    if (!q.ready) throw new PricingError('LOAD_NOT_READY', `Mixed ${load.kind === 'PALLET' ? 'pallet' : 'truckload'}: ${q.issues.join(' ')}`, { mixedLoadId: load.id });
                    lines.push({
                        productId: null, mixedLoadId: load.id, quantity: 1, price: q.total, lineTotal: q.total,
                        tier: load.kind === 'PALLET' ? 'pallet' : 'truck',
                        name: `Mixed ${load.kind === 'PALLET' ? 'pallet' : 'truckload'} (${q.lines.length} product${q.lines.length === 1 ? '' : 's'})`,
                        mixComposition: q.lines.map((l) => ({ productId: l.productId, name: l.name, variant: l.variant ?? null, quantity: l.quantity, unit: l.unit, cases: l.cases, unitPrice: l.casePrice, lineSubtotal: l.lineSubtotal })),
                        supplierId: q.supplierId,
                    });
                    continue;
                }
                const productId = String(raw.productId || '').split('::')[0];
                const p = products.get(productId);
                if (!p) throw new PricingError('PRODUCT_NOT_FOUND', 'A product in your cart is no longer available.', { productId });
                const tier = normaliseTier(raw.tier) ?? 'carton';
                if (Array.isArray(raw.mixComposition) && raw.mixComposition.length > 0) {
                    // Legacy single-product variant mix (one truck/pallet of variants).
                    if (tier === 'carton') throw new PricingError('INVALID_TIER', `${p.name}: variant mixes are by pallet or truckload.`);
                    const kind = tier === 'pallet' ? 'PALLET' : 'TRUCK';
                    const loadLines = raw.mixComposition.map((c: any) => ({ productId, variant: c.signature ?? c.variant ?? null, quantity: Number(c.quantity) }));
                    const q = priceLoad(kind, loadLines, products, markups, { requiredFill: 1 });
                    if (!q.ready) throw new PricingError('LOAD_NOT_READY', `${p.name}: ${q.issues.join(' ')}`);
                    if (Number(raw.quantity ?? 1) !== 1) throw new PricingError('INVALID_QUANTITY', `${p.name}: a mixed ${tier} is ordered one at a time.`);
                    lines.push({ productId, quantity: 1, price: q.total, lineTotal: q.total, tier, name: p.name, selectedVariants: raw.selectedVariants, mixComposition: q.lines.map((l) => ({ signature: l.variant, quantity: l.quantity, unitPrice: l.casePrice * (kind === 'TRUCK' ? Number(p.casesPerPallet) : 1) })), supplierId: p.supplierId });
                    continue;
                }
                const priced = priceLine(p, tier, Number(raw.quantity), markups, { raw: !!p.supplierId && p.supplierId === customerId });
                // Supplier's own price for one ordered unit (no Atlantis margin) — for supplier views only.
                const supplierUnitPrice = round2(basePerCase(p, markups) * casesInUnit(p, priced.tier));
                lines.push({ productId, quantity: priced.quantity, price: priced.unitPrice, supplierUnitPrice, lineTotal: priced.lineTotal, tier: priced.tier, name: p.name, selectedVariants: raw.selectedVariants, supplierId: p.supplierId, unitsTotal: priced.unitsTotal, casesTotal: priced.casesTotal, perCase: priced.perCase, minUnits: priced.minUnits, info: { ean: (p as any).ean ?? null, unitsPerCase: p.unitsPerCase ?? null, shelfLife: (p as any).shelfLife ?? null, leadTime: (p as any).leadTime ?? null, readyForDispatch: !!(p as any).readyForDispatch, exwLocation: p.exwLocation ?? null } });
            } catch (e) {
                // Cart view: flag the line and keep pricing the rest. Orders stay strict.
                if (opts.lenient && e instanceof PricingError) {
                    lines.push({ productId: raw.productId ? String(raw.productId).split('::')[0] : null, mixedLoadId: raw.mixedLoadId ?? null, quantity: Number(raw.quantity) || 0, price: 0, lineTotal: 0, error: { code: e.code, message: e.message, ...e.detail } });
                    continue;
                }
                asHttp(e);
            }
        }
        const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
        let discountPercent = 0, appliedCoupon: string | null = null;
        if (couponCode && String(couponCode).trim()) {
            const c = await db.coupon.findUnique({ where: { code: String(couponCode).trim() } }).catch(() => null);
            if (!c || !c.isActive || (c.expirationDate && new Date(c.expirationDate).getTime() < Date.now())) {
                throw new BadRequestException({ code: 'INVALID_COUPON', message: 'That promo code is not valid.' });
            }
            discountPercent = Math.max(0, Math.min(100, Number(c.discountPercent) || 0));
            appliedCoupon = c.code;
        }
        const discount = round2(subtotal * discountPercent / 100);
        return { lines, subtotal, discountPercent, discount, coupon: appliedCoupon, total: round2(subtotal - discount), markups };
    }

    /** Accounts that started with an incomplete business profile (e.g. Google sign-up) must finish it before ordering. */
    async assertProfileComplete(userId: string) {
        const u: any = await this.prisma.user.findUnique({ where: { id: userId } });
        if (u && u.onboardingCompleted === false && missingProfileFields(u).length > 0) {
            throw new ForbiddenException({ code: 'PROFILE_INCOMPLETE', message: 'Complete your business profile before placing an order.', missing: missingProfileFields(u) });
        }
    }

    async create(customerId: string, totalAmount: number, items: any[], shippingCompany?: string, shippingCost?: number, opts: { idempotencyKey?: string; couponCode?: string } = {}) {
        const key = typeof opts.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(opts.idempotencyKey) ? opts.idempotencyKey : null;
        if (key) {
            // A retried / double-clicked submit returns the order already created.
            const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true, history: true, customer: { select: { email: true, name: true } } } });
            if (existing) {
                if (existing.customerId !== customerId) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Duplicate request key.' });
                return existing;
            }
        }

        const quote = await this.priceCart(customerId, items, opts.couponCode);
        // The buyer must have seen the server price. If the client total
        // disagrees (prices / markups changed since the cart was built),
        // refuse and return the server figures so the UI can refresh.
        if (typeof totalAmount === 'number' && Number.isFinite(totalAmount) && Math.abs(totalAmount - quote.total) > 0.01) {
            throw new ConflictException({ code: 'PRICE_CHANGED', message: `Prices were updated — your order total is now ${quote.total.toFixed(2)} EUR. Review and confirm again.`, serverTotal: quote.total, quote: { subtotal: quote.subtotal, discount: quote.discount, total: quote.total, lines: quote.lines.map((l) => ({ productId: l.productId, mixedLoadId: l.mixedLoadId ?? null, price: l.price, lineTotal: l.lineTotal })) } });
        }

        let order: any;
        try {
            order = await this.prisma.$transaction(async (tx) => {
                // Stock gate: Product.stock is kept in CASES, so a line takes
                // quantity × cases-in-its-tier (a pallet = casesPerPallet cases).
                // The conditional decrement means two buyers can't oversell.
                for (const l of quote.lines) {
                    if (!l.productId || l.mixComposition) continue;
                    const cases = Number.isInteger(l.casesTotal) && l.casesTotal > 0 ? l.casesTotal : l.quantity;
                    l.stockCases = cases;
                    const res = await tx.product.updateMany({ where: { id: l.productId, stock: { gte: cases } }, data: { stock: { decrement: cases } } });
                    if (res.count === 0) throw new BadRequestException({ code: 'INSUFFICIENT_STOCK', message: `Not enough stock for ${l.name}. Reduce the quantity or contact the supplier.`, productId: l.productId });
                }
                const created = await tx.order.create({
                    data: {
                        customerId,
                        idempotencyKey: key,
                        totalAmount: quote.total,
                        shippingCompany: shippingCompany ?? null,
                        customerShippingCompany: shippingCompany ?? null,
                        shippingCost: shippingCost ?? null,
                        status: OrderStatus.PENDING,
                        items: {
                            create: quote.lines.map((l) => ({
                                productId: l.productId,
                                quantity: l.quantity,
                                price: l.price,
                                stockCases: l.stockCases ?? null,
                                supplierUnitPrice: typeof l.supplierUnitPrice === 'number' ? l.supplierUnitPrice : null,
                                productNameSnapshot: l.name,
                                selectedVariants: l.selectedVariants && typeof l.selectedVariants === 'object' ? l.selectedVariants : undefined,
                                selectedTier: l.tier,
                                mixComposition: l.mixComposition ?? undefined,
                                mixedLoadId: l.mixedLoadId ?? null,
                            })),
                        },
                        history: { create: { newStatus: OrderStatus.PENDING, changedById: customerId, reason: quote.coupon ? `Order created (promo ${quote.coupon} −${quote.discountPercent}%)` : 'Order created' } },
                    },
                    include: { items: true, history: true, customer: { select: { email: true, name: true } } },
                });
                // Lock each mixed load to this order; if another submit got there first, roll back.
                for (const l of quote.lines) {
                    if (!l.mixedLoadId) continue;
                    const r = await tx.mixedLoad.updateMany({ where: { id: l.mixedLoadId, customerId, status: 'DRAFT' }, data: { status: 'ORDERED', orderId: created.id } });
                    if (r.count === 0) throw new ConflictException({ code: 'LOAD_ALREADY_ORDERED', message: 'A mixed load in your cart has already been ordered.' });
                }
                return created;
            });
        } catch (e: any) {
            // Concurrent duplicate submit with the same key → return the winner.
            if (key && e?.code === 'P2002') {
                const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true, history: true, customer: { select: { email: true, name: true } } } });
                if (existing && existing.customerId === customerId) return existing;
            }
            throw e;
        }
        const supplierIdsFromQuote = [...new Set(quote.lines.map((l) => l.supplierId).filter(Boolean))] as string[];

        // Send Customer Confirmation Email (payment bypassed as per client request)
        if (order.customer?.email) {
            this.emailService.sendOrderConfirmationEmail(
                order.customer.email,
                order.customer.name,
                order.id,
                order.totalAmount
            ).catch(err => console.error('Failed to send order confirmation email:', err));
        }

        // Notify each supplier
        // Suppliers come from the server-priced lines (order items don't include product).
        const supplierIds = supplierIdsFromQuote;
        for (const supplierId of supplierIds) {
            this.notificationsService.create(
                supplierId as string,
                'New Order Received',
                `You have a new order #${order.id.slice(-8).toUpperCase()} waiting for confirmation.`,
                'INFO',
                { orderId: order.id },
            ).catch(() => {});
        }
        // Email each supplier (unless they turned order emails off). Sent once,
        // after the order exists; a retried submit returns the existing order
        // above and never reaches this point, so there are no duplicates.
        this.emailSuppliersNewOrder(order, quote.lines).catch((e) => console.error(`[ORDER_SUPPLIER_EMAIL_FAIL] ${order.id}: ${e?.message}`));
        this.alertLowStock(quote.lines).catch((e) => console.error(`[LOW_STOCK_ALERT_FAIL] ${order.id}: ${e?.message}`));

        // Notify Admins & Owners
        this.notificationsService.notifyAdmins(
            'New Order Received',
            `Order #${order.id.slice(-8).toUpperCase()} has been placed by ${order.customer?.name}.`,
            'INFO',
            { orderId: order.id }
        ).catch(() => {});

        return order;
    }

    /**
     * Logistics dashboard query: pull every order whose shippingCompany
     * field matches the logged-in user's companyName / name (case-
     * insensitive). The match is fuzzy because admin-typed carrier
     * names ("DHL", "DHL Express", "DHL EU") all describe the same
     * carrier — substring contains-either-direction is good enough
     * without a hard FK between Users(LOGISTICS) and Orders.
     */
    async findOrdersForLogisticsUser(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, companyName: true, role: true },
        });
        if (!user) return [];

        const candidates = [user.companyName, user.name]
            .filter(Boolean)
            .map(s => String(s).trim())
            .filter(s => s.length > 0);

        // Pull every order with a shippingCompany set, then filter in JS so
        // we can do a fuzzy two-way contains match without bending Prisma.
        const orders = await this.prisma.order.findMany({
            where: { shippingCompany: { not: null } },
            include: {
                customer: { select: { id: true, name: true, email: true, phone: true } },
                items: {
                    include: {
                        product: { select: { id: true, name: true, images: true, weight: true } },
                    },
                },
                shipment: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });

        if (candidates.length === 0) return [];
        const lc = candidates.map(c => c.toLowerCase());
        return orders.filter(o => {
            const ship = (o.shippingCompany || '').toLowerCase().trim();
            if (!ship) return false;
            return lc.some(c => ship.includes(c) || c.includes(ship));
        });
    }

    async findAll() {
        const orders = await this.prisma.order.findMany({
            include: {
                customer: {
                    select: { id: true, name: true, email: true, phone: true }
                },
                supplier: {
                    select: { id: true, name: true, email: true }
                },
                items: {
                    include: {
                        product: {
                            include: {
                                supplier: {
                                    select: { id: true, name: true, email: true }
                                }
                            }
                        }
                    }
                },
                history: true,
                shipment: true,
            },
        });

        // Hoist platform fee fetch outside the loop (was awaiting inside .map)
        const markupData = await this.appConfigService.getMarkupPercentage();
        const feePercent = markupData.platformFee;

        // Map to format suitable for Admin Dashboard
        return orders.map(order => {
            const customerId = order.customer?.id;
            const customerName = order.customer?.name ?? 'Unknown Buyer';

            // Collect unique supplier names from order items, excluding the buyer themselves
            const supplierNamesFromItems: string[] = [];
            const supplierIdsFromItems = new Set<string>();
            for (const item of order.items) {
                const sup = item.product?.supplier;
                if (!sup) continue;
                if (sup.id === customerId) continue; // buyer bought their own product (test data)
                if (supplierIdsFromItems.has(sup.id)) continue;
                supplierIdsFromItems.add(sup.id);
                supplierNamesFromItems.push(sup.name);
            }

            // Prefer the order-level supplierId relation only if it differs from the buyer
            let supplierNames: string;
            if (order.supplier && order.supplier.id !== customerId) {
                supplierNames = order.supplier.name;
            } else if (supplierNamesFromItems.length > 0) {
                supplierNames = supplierNamesFromItems.join(', ');
            } else {
                supplierNames = 'Platform Inventory';
            }

            let supplierProfit = 0;
            for (const item of order.items) {
                supplierProfit += item.price * item.quantity;
            }
            const adminProfit = order.totalAmount * (feePercent / 100);

            return {
                id: order.id,
                customer: customerName,
                customerId: order.customer?.id,
                customerEmail: order.customer?.email,
                customerPhone: order.customer?.phone,
                supplier: supplierNames,
                total: order.totalAmount,
                supplierProfit,
                adminProfit,
                status: order.status,
                date: order.createdAt.toISOString().split('T')[0],
                shippingCompany: order.shippingCompany,
                shippingCost: order.shippingCost,
                trackingNumber: order.shipment?.trackingNumber,
                carrier: order.shipment?.carrier,
                items: order.items.map(i => ({
                    product: i.product?.name ?? 'Unknown Product',
                    quantity: i.quantity,
                    price: i.price,
                })),
                history: order.history.map(h => ({
                    status: h.newStatus,
                    time: h.createdAt,
                    reason: h.reason
                }))
            };
        });
    }

    async findByBuyer(customerId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where: { customerId, deletedByCustomer: false },
                include: {
                    items: {
                        include: {
                            product: { select: { id: true, name: true, images: true, brand: true, ean: true, supplierId: true } },
                        },
                    },
                    shipment: { select: { trackingNumber: true, carrier: true, status: true, expectedDelivery: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.order.count({ where: { customerId, deletedByCustomer: false } }),
        ]);
        return { data: orders, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findByIdForBuyer(orderId: string, customerId: string) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, customerId },
            include: {
                customer: {
                    select: {
                        id: true, name: true, email: true, phone: true,
                        companyName: true, country: true, vatNumber: true,
                    },
                },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true, name: true, images: true, brand: true,
                                category: true, unit: true, ean: true,
                                unitsPerCase: true, casesPerPallet: true,
                                unitsPerPallet: true, palletsPerShipment: true,
                                shelfLife: true,
                                supplier: { select: { name: true } },
                            },
                        },
                    },
                },
                history: { orderBy: { createdAt: 'asc' } },
                shipment: {
                    select: {
                        trackingNumber: true, carrier: true, status: true,
                        expectedDelivery: true,
                    },
                },
            },
        });
        if (!order) throw new NotFoundException('Order not found');

        // Flatten shipment fields into the response so the existing
        // `order.trackingNumber` / `order.carrier` UI keeps working.
        return {
            ...order,
            trackingNumber: order.shipment?.trackingNumber ?? null,
            carrier: order.shipment?.carrier ?? null,
            expectedDelivery: order.shipment?.expectedDelivery ?? null,
        };
    }

    async findBySupplier(supplierId: string) {
        const orders = await this.prisma.order.findMany({
            where: {
                items: { some: { product: { supplierId } } },
            },
            include: {
                customer: { select: { id: true, name: true, email: true } },
                items: {
                    where: { product: { supplierId } },
                    include: { product: { select: { id: true, name: true, images: true, supplierId: true, ean: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true, stock: true, basePrice: true } } },
                },
                history: { orderBy: { createdAt: 'asc' }, select: { reason: true, newStatus: true, previousStatus: true, createdAt: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        // Every line's supplier (not just this supplier's) to know if the order is shared.
        const allItems = await this.prisma.orderItem.findMany({ where: { orderId: { in: orders.map((o) => o.id) } }, select: { orderId: true, mixedLoadId: true, product: { select: { supplierId: true } } } });
        for (const o of orders as any[]) o._allItems = allItems.filter((i) => i.orderId === o.id);

        return orders.map(order => {
            // Privacy mask: suppliers should NOT see the customer's
            // real name or full email. Atlantis is the principal in
            // the transaction; the supplier ships to the warehouse
            // address, not the customer. We surface a redacted form
            // so the supplier can still differentiate orders in the
            // table ("Customer A" vs "Customer B") without learning
            // who they are.
            const masked = (raw?: string) =>
                raw ? raw.split(' ').map((p) => (p ? p[0] + '***' : '')).join(' ') : 'Customer';
            const maskedEmail = (raw?: string) =>
                raw ? raw.replace(/^(.{2}).*@/, '$1***@') : '';
            const allMine = (order as any)._allItems?.every((i: any) => i.product?.supplierId === supplierId && !i.mixedLoadId) ?? false;
            // Supplier views use the supplier's own prices only — never the buyer
            // price or the order total (which would reveal the Atlantis margin).
            const values = order.items.map((i: any) => supplierLineValue(i));
            const subtotal = Math.round(values.reduce((s: number, v) => s + v.total, 0) * 100) / 100;
            const hist = ((order as any).history || []) as any[];
            const lastReason = hist.length ? hist[hist.length - 1].reason : null;
            return {
            id: order.id,
            status: order.status,
            // Value of THIS supplier's lines at the supplier's own prices (EUR).
            supplierSubtotal: subtotal,
            valueEstimated: values.some((v) => v.estimated),
            timeline: hist.map((h) => ({ status: h.newStatus, at: h.createdAt, note: h.reason ?? null })),
            needsAction: AWAITING_SUPPLIER.includes(order.status as OrderStatus),
            canDecline: AWAITING_SUPPLIER.includes(order.status as OrderStatus) && allMine,
            sharedOrder: !allMine,
            lastStatusNote: lastReason,
            supplierInvoiceUrl: (order as any).supplierInvoiceUrl ?? null,
            updatedAt: (order as any).updatedAt,
            shippingCompany: order.shippingCompany,
            createdAt: order.createdAt,
            // The supplier UI reads `buyer` — keep this as the canonical
            // shape. We also include `customer` as a back-compat alias
            // in case any older client still expects it.
            buyer: {
                name: masked(order.customer?.name),
                email: maskedEmail(order.customer?.email),
            },
            customer: {
                name: masked(order.customer?.name),
                email: maskedEmail(order.customer?.email),
            },
            items: order.items.map(item => ({
                id: item.id,
                productId: item.productId,
                // Fall back to the snapshot when product was deleted post-order.
                name: (item as any).product?.name ?? (item as any).productNameSnapshot ?? 'Deleted product',
                image: (item as any).product?.images?.[0] ?? null,
                quantity: item.quantity,
                // The supplier's own price per ordered unit (see supplierLineValue).
                price: supplierLineValue(item as any).unit,
                priceEstimated: supplierLineValue(item as any).estimated,
                ean: (item as any).product?.ean ?? null,
                unitsPerCase: (item as any).product?.unitsPerCase ?? null,
                cases: casesForItem(item as any),
                stockNow: (item as any).product?.stock ?? null,
                // Forward the Shopify-style tier + variant snapshot so the
                // supplier order page can render "10 × Pallet" next to qty
                // (operator-requested) and the chosen variants for buyers
                // who configured the product.
                selectedTier: (item as any).selectedTier ?? null,
                selectedVariants: (item as any).selectedVariants ?? null,
                // Forward the mix breakdown so the supplier sees exactly
                // which variants the customer bundled into the mixed
                // truck/pallet (operator-required so they can pack
                // 5 × Diet + 3 × Red etc.).
                mixComposition: (item as any).mixComposition ?? null,
            })),
            };
        });
    }

    /**
     * Tell a supplier when this order took a product below one minimum order
     * (or to zero). Fires only on the crossing, so it isn't repeated per order.
     * Respects the supplier's "Low stock alerts" preference.
     */
    private async alertLowStock(lines: any[]) {
        const taken = lines.filter((l) => l.productId && typeof l.stockCases === 'number' && l.stockCases > 0);
        if (!taken.length) return;
        const products = await this.prisma.product.findMany({
            where: { id: { in: taken.map((l) => l.productId) } },
            select: { id: true, name: true, stock: true, moq: true, moqUnit: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true, supplierId: true, supplier: { select: { notificationPrefs: true } } },
        });
        for (const p of products as any[]) {
            const took = taken.filter((l) => l.productId === p.id).reduce((s, l) => s + l.stockCases, 0);
            const after = p.stock ?? 0, before = after + took;
            const min = minOrderCases(p);
            if ((p.supplier?.notificationPrefs as any)?.lowStockAlerts === false || !p.supplierId) continue;
            if (after <= 0 && before > 0) {
                this.notificationsService.create(p.supplierId, 'Out of stock', `“${p.name}” is out of stock after a new order. Buyers can’t order it until you add stock.`, 'WARNING', { productId: p.id, type: 'LOW_STOCK' }).catch(() => {});
            } else if (min > 0 && after < min && before >= min) {
                this.notificationsService.create(p.supplierId, 'Low stock', `“${p.name}” has ${after} cases left — less than one minimum order (${min} cases).`, 'WARNING', { productId: p.id, type: 'LOW_STOCK' }).catch(() => {});
            }
        }
    }

    private async emailSuppliersNewOrder(order: any, lines: any[]) {
        const ids = [...new Set(lines.map((l) => l.supplierId).filter(Boolean))] as string[];
        if (!ids.length) return;
        const suppliers = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true, notificationPrefs: true } });
        const ref = order.id.slice(-8).toUpperCase();
        const base = process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com';
        const esc = (t: string) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
        for (const s of suppliers) {
            const prefs = (s.notificationPrefs as any) || {};
            if (prefs.orderUpdates === false || !s.email) continue;
            const mine = lines.filter((l) => l.supplierId === s.id);
            const rows = mine.map((l) => `<tr><td style="padding:6px 0;color:#0F172A">${esc(l.name)}</td><td style="padding:6px 0;text-align:right;color:#334155">${l.quantity} × ${l.tier === 'carton' ? 'case' : esc(l.tier)}</td></tr>`).join('');
            // No buyer identity in the email — the supplier ships via Atlantis.
            const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#0F172A">
                <h2 style="margin:0 0 8px">New order #${ref}</h2>
                <p style="color:#475569;line-height:1.6;margin:0 0 16px">A buyer ordered your products. Please confirm or decline it in your Atlantis supplier workspace.</p>
                <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
                <p style="margin:24px 0"><a href="${base}/supplier/orders?view=action" style="background:#0B1F3A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Review order</a></p>
                <p style="color:#94A3B8;font-size:12px">You can turn off order emails in Settings → Notifications.</p></div>`;
            const r = await this.emailService.sendMailDetailed(s.email, `New order #${ref} — please confirm`, html);
            if (!r.success) console.error(`[ORDER_SUPPLIER_EMAIL_FAIL] order=${order.id} supplier=${s.id}: ${r.error || 'provider rejected'}`);
        }
    }

    /** Supplier confirms an order containing their products: PENDING/PAID → PROCESSING. */
    async supplierAccept(orderId: string, supplierId: string) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: { select: { supplierId: true, stock: true, name: true } } } } } });
        if (!order || !order.items.some((i: any) => i.product?.supplierId === supplierId)) throw new NotFoundException('Order not found');
        // Stock for these lines was taken when the order was placed, so
        // confirming never oversells; nothing more is deducted here.
        return this.internalUpdateStatus(orderId, OrderStatus.PROCESSING, supplierId, 'Confirmed by supplier', AWAITING_SUPPLIER);
    }

    /**
     * Supplier declines an order before confirming it. Only possible when every
     * line on the order is theirs — otherwise other suppliers' goods would be
     * cancelled too, so Atlantis handles it.
     */
    async supplierReject(orderId: string, supplierId: string, reason: string) {
        const text = String(reason || '').trim();
        if (text.length < 5) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Tell the buyer why you can’t fulfil this order (at least 5 characters).' });
        const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: { select: { supplierId: true } } } } } });
        if (!order || !order.items.some((i: any) => i.product?.supplierId === supplierId)) throw new NotFoundException('Order not found');
        const othersOnOrder = order.items.some((i: any) => i.product?.supplierId !== supplierId || i.mixedLoadId);
        if (othersOnOrder) {
            this.notificationsService.notifyAdmins('Supplier can’t fulfil part of an order', `Order #${orderId.slice(-8).toUpperCase()}: a supplier asked to decline their lines. Reason: ${text.slice(0, 300)}`, 'WARNING', { orderId, supplierId }).catch(() => {});
            throw new ConflictException({ code: 'SHARED_ORDER', message: 'This order also contains other suppliers’ products, so it can’t be declined from here. We’ve told the Atlantis team — they will contact you.' });
        }
        return this.internalUpdateStatus(orderId, OrderStatus.CANCELLED, supplierId, `Declined by supplier: ${text.slice(0, 500)}`, AWAITING_SUPPLIER);
    }

    // ─── Admin Stats ─────────────────────────────────────────────────
    async countPending(): Promise<number> {
        return this.prisma.order.count({
            where: { status: OrderStatus.PENDING },
        });
    }

    async getOrderStats() {
        const [pending, processing, shipped, delivered, cancelled, total] = await Promise.all([
            this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
            this.prisma.order.count({ where: { status: OrderStatus.PROCESSING } }),
            this.prisma.order.count({ where: { status: OrderStatus.SHIPPED } }),
            this.prisma.order.count({ where: { status: OrderStatus.DELIVERED } }),
            this.prisma.order.count({ where: { status: OrderStatus.CANCELLED } }),
            this.prisma.order.count(),
        ]);

        // Total revenue in EGP (all non-cancelled orders)
        const revenueResult = await this.prisma.order.aggregate({
            where: { status: { not: OrderStatus.CANCELLED } },
            _sum: { totalAmount: true },
        });

        return {
            pending,
            processing,
            shipped,
            delivered,
            cancelled,
            total,
            totalRevenue: revenueResult._sum.totalAmount || 0,
        };
    }

    // ─── Update Status ───────────────────────────────────────────────
    async updateStatus(orderId: string, status: OrderStatus, changedById: string, reason?: string) {
        return this.internalUpdateStatus(orderId, status, changedById, reason);
    }

    async bulkUpdateStatus(orderIds: string[], status: OrderStatus, changedById: string) {
        const results = [];
        for (const orderId of orderIds) {
            try {
                const updated = await this.internalUpdateStatus(orderId, status, changedById, `Bulk update to ${status}`);
                results.push({ orderId, success: true });
            } catch (err: any) {
                results.push({ orderId, success: false, error: err.message });
            }
        }
        return results;
    }

    private async internalUpdateStatus(orderId: string, status: OrderStatus, changedById: string, reason?: string, expectFrom?: OrderStatus[]) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: { select: { email: true, name: true } },
                items: {
                    include: {
                        product: {
                            include: {
                                supplier: { select: { id: true, name: true, email: true } }
                            }
                        }
                    }
                },
            },
        });

        if (!order) throw new NotFoundException(`Order ${orderId} not found`);

        const previousStatus = order.status;
        if (expectFrom && !expectFrom.includes(previousStatus)) {
            throw new ConflictException({ code: 'INVALID_TRANSITION', message: `This order is already ${STATUS_LABELS[previousStatus] || previousStatus}.`, status: previousStatus });
        }
        assertTransition(previousStatus, status);

        // Status change, history and stock return happen in one transaction,
        // and only if the order is still in the status we read — a retried or
        // concurrent request can't apply the same change (or restock) twice.
        // Stock returns only when cancelled BEFORE dispatch (goods still in the
        // supplier's warehouse), and only what the order actually took.
        const restock = status === OrderStatus.CANCELLED && RESTOCK_FROM.includes(previousStatus);
        const updated = await this.prisma.$transaction(async (tx) => {
            const moved = await tx.order.updateMany({ where: { id: orderId, status: previousStatus }, data: { status } });
            if (moved.count === 0) throw new ConflictException({ code: 'ORDER_CHANGED', message: 'This order was updated by someone else just now. Refresh and try again.' });
            if (restock) {
                for (const it of order.items as any[]) {
                    if (!it.productId || it.mixedLoadId || (Array.isArray(it.mixComposition) && it.mixComposition.length)) continue;
                    const cases = typeof it.stockCases === 'number' ? it.stockCases : it.quantity; // legacy orders took `quantity`
                    if (cases > 0) await tx.product.update({ where: { id: it.productId }, data: { stock: { increment: cases } } });
                }
            }
            await tx.orderStatusHistory.create({
                data: { orderId, previousStatus, newStatus: status, changedById, reason: reason || `Status changed to ${STATUS_LABELS[status] || status}` },
            });
            return tx.order.findUnique({ where: { id: orderId }, include: { items: true, history: true, customer: { select: { email: true, name: true } } } });
        });

        // Fetch shipment info if it exists for tracking
        const shipment = await this.prisma.shipment.findUnique({
            where: { orderId }
        });

        // Send email notification to customer
        try {
            const statusLabel = STATUS_LABELS[status] || status;
            
            // Build tracking URL if possible (Generic example, would ideally use carrier-specific logic)
            let trackingUrl: string | undefined = undefined;
            if (shipment && shipment.trackingNumber) {
                if (shipment.carrier?.toUpperCase() === 'DHL') {
                    trackingUrl = `https://www.dhl.com/en/express/tracking.html?AWB=${shipment.trackingNumber}`;
                } else if (shipment.carrier?.toUpperCase() === 'FEDEX') {
                    trackingUrl = `https://www.fedex.com/apps/fedextrack/?tracknumbers=${shipment.trackingNumber}`;
                } else {
                    // Fallback to internal tracking or generic link
                    trackingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/customer/orders/${orderId}`;
                }
            }

            await this.emailService.sendOrderStatusUpdateEmail(
                order.customer.email,
                order.customer.name,
                orderId,
                status,
                trackingUrl
            );

            // Special follow-up for DELIVERED status
            if (status === OrderStatus.DELIVERED) {
                await this.emailService.sendFeedbackPromptEmail(
                    order.customer.email,
                    order.customer.name,
                    orderId
                );
            }

        } catch (e) {
            console.error(`[ORDER_EMAIL_FAIL] ${orderId}:`, e);
        }

        // Tell the buyer in-app too (the email above may be filtered or fail).
        if ((order as any).customerId && (order as any).customerId !== changedById) {
            const label = STATUS_LABELS[status] || status;
            this.notificationsService.create(
                (order as any).customerId,
                `Order #${orderId.slice(-8).toUpperCase()}: ${label}`,
                status === OrderStatus.CANCELLED && reason ? `Your order was cancelled. ${reason}` : `Your order is now ${label.toLowerCase()}.`,
                status === OrderStatus.CANCELLED ? 'WARNING' : 'INFO',
                { orderId, status },
            ).catch(() => {});
        }

        // Notify each supplier involved
        const supplierIds = [...new Set(
            order.items.map((item: any) => item.product?.supplier?.id).filter(Boolean)
        )];
        for (const supplierId of supplierIds) {
            // Skip notifying the supplier who just acted — they triggered
            // the change themselves, no need to ping their own bell.
            if (supplierId === changedById) continue;
            this.notificationsService.create(
                supplierId as string,
                `Order ${STATUS_LABELS[status] || status}`,
                `Order #${orderId.slice(-8).toUpperCase()} has been updated to ${STATUS_LABELS[status] || status}.`,
                'INFO',
                { orderId },
            ).catch(() => {});
        }

        // Notify admin team when a SUPPLIER performs the change — so the
        // operator's "supplier confirmed the order" complaint surfaces on
        // the admin orders page + notification bell instead of being a
        // silent state update. We check if the actor is a supplier (i.e.
        // they appear in this order's supplierIds) before pinging admins.
        const actorIsSupplier = supplierIds.includes(changedById);
        if (actorIsSupplier) {
            const actor = await this.prisma.user.findUnique({
                where: { id: changedById },
                select: { name: true, companyName: true },
            }).catch(() => null);
            const actorLabel = actor?.companyName || actor?.name || 'Supplier';
            const verb =
                status === 'PROCESSING' ? 'confirmed'
                : status === 'SHIPPED'    ? 'shipped'
                : status === 'CANCELLED'  ? 'cancelled'
                : 'updated';
            await this.notificationsService.notifyAdmins(
                `${actorLabel} ${verb} order #${orderId.slice(-8).toUpperCase()}`,
                `${actorLabel} marked order #${orderId.slice(-8).toUpperCase()} as ${STATUS_LABELS[status] || status}.`,
                'INFO',
                { orderId, supplierId: changedById, newStatus: status },
            ).catch(() => { });
        }

        // Handle invoice generation on delivery
        if (status === OrderStatus.DELIVERED) {
            try {
                await this.invoiceService.createInvoiceForOrder(orderId);
            } catch (e) {
                console.error(`[ORDER_INVOICE_FAIL] ${orderId}:`, e);
            }
        }

        // Handle Escrow Void/Refund on Cancellation
        if (status === OrderStatus.CANCELLED) {
            try {
                const escrow = await this.prisma.escrowTransaction.findUnique({ where: { orderId } });
                if (escrow) {
                    if (escrow.status === 'HOLDING') {
                        await this.escrowService.voidEscrow(orderId, reason || 'Order cancelled by admin/supplier');
                    } else if (escrow.status === 'RELEASED' || escrow.status === 'CAPTURED') {
                        await this.escrowService.refundEscrow(orderId, reason || 'Order cancelled/refunded');
                    }
                }
            } catch (err: any) {
                console.error(`[ORDER_CANCEL_ESCROW_ERROR] Failed for ${orderId}:`, err.message);
            }
        }

        return updated;
    }


    // ─── Supplier Analytics ───────────────────────────────────────────

    async getSupplierAnalytics(supplierId: string, days: number) {
        const since = new Date(Date.now() - days * 86_400_000);

        // All orders that contain at least one product owned by this supplier
        const orders = await this.prisma.order.findMany({
            where: {
                createdAt: { gte: since },
                items: { some: { product: { supplierId } } },
            },
            include: {
                items: {
                    where: { product: { supplierId } },
                    include: { product: { select: { id: true, name: true, basePrice: true, category: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true } } },
                },
            },
        });

        // Revenue = sum of item.price * item.quantity (customer-facing prices)
        let totalRevenue = 0;
        let totalItems = 0;
        const productMap: Record<string, { name: string; orders: number; revenue: number; category: string }> = {};
        const categoryMap: Record<string, number> = {};

        // Same revenue definition as the Business Overview: only confirmed
        // orders (paid, preparing, shipped, delivered) count as sales.
        const CONFIRMED_FOR_REVENUE = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
        for (const order of orders) {
            if (!CONFIRMED_FOR_REVENUE.includes(order.status)) continue;
            for (const item of order.items) {
                // Supplier's own prices only — buyer prices would reveal the margin.
                const lineTotal = supplierLineValue(item as any).total;
                totalRevenue += lineTotal;
                totalItems += item.quantity;
                const pid = item.product?.id ?? 'unknown';
                const pname = item.product?.name ?? 'Unknown';
                const cat = item.product?.category ?? 'Other';
                if (!productMap[pid]) productMap[pid] = { name: pname, orders: 0, revenue: 0, category: cat };
                productMap[pid].orders += item.quantity;
                productMap[pid].revenue += lineTotal;
                categoryMap[cat] = (categoryMap[cat] ?? 0) + lineTotal;
            }
        }

        // Monthly revenue buckets (last 7 months)
        const monthlyMap: Record<string, { revenue: number; orders: number }> = {};
        for (const order of orders) {
            if (!CONFIRMED_FOR_REVENUE.includes(order.status)) continue;
            const key = new Date(order.createdAt).toLocaleString('en-US', { month: 'short', year: '2-digit' });
            if (!monthlyMap[key]) monthlyMap[key] = { revenue: 0, orders: 0 };
            monthlyMap[key].orders += 1;
            for (const item of order.items) monthlyMap[key].revenue += supplierLineValue(item as any).total;
        }

        const topProducts = Object.entries(productMap)
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const categoryBreakdown = Object.entries(categoryMap)
            .map(([name, value]) => ({ name, value: Math.round(value) }))
            .sort((a, b) => b.value - a.value);

        const activeProducts = await this.prisma.product.count({
            where: { supplierId, status: 'APPROVED' },
        });

        const totalOrders = orders.filter(o => o.status !== 'CANCELLED').length;
        const deliveredOrders = orders.filter(o => o.status === 'DELIVERED').length;

        return {
            totalRevenue,
            totalOrders,
            deliveredOrders,
            totalItems,
            activeProducts,
            conversionRate: totalOrders > 0 ? ((deliveredOrders / totalOrders) * 100).toFixed(1) : '0',
            monthlyData: Object.entries(monthlyMap).map(([month, v]) => ({ month, ...v })),
            topProducts,
            categoryBreakdown,
        };
    }

    async findByIdForAdmin(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: {
                    select: {
                        id: true, name: true, email: true, phone: true,
                        companyName: true, country: true, vatNumber: true,
                    },
                },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true, name: true, images: true, brand: true,
                                category: true, ean: true, unit: true,
                                unitsPerCase: true, casesPerPallet: true,
                                unitsPerPallet: true, palletsPerShipment: true,
                                shelfLife: true, weight: true, stock: true,
                                exwLocation: true, origin: true,
                                // Pull the supplier with contact details so the
                                // admin order page can render a per-item
                                // "Contact Supplier" panel + portfolio link.
                                // Operator workflow: admin sees the order →
                                // pings the supplier to confirm they have the
                                // stock → only after the supplier confirms
                                // does the admin move the order to PROCESSING.
                                supplier: {
                                    select: {
                                        id: true, name: true, email: true, phone: true,
                                        companyName: true, country: true,
                                    },
                                },
                            },
                        },
                    },
                },
                history: { orderBy: { createdAt: 'asc' } },
                shipment: {
                    select: {
                        trackingNumber: true, carrier: true,
                        status: true, expectedDelivery: true,
                    },
                },
            },
        });

        if (!order) throw new NotFoundException('Order not found');

        return {
            id: order.id,
            status: order.status,
            total: order.totalAmount,
            createdAt: order.createdAt.toISOString(),
            updatedAt: (order as any).updatedAt?.toISOString?.() ?? null,
            trackingNumber: order.shipment?.trackingNumber ?? null,
            carrier: order.shipment?.carrier ?? null,
            expectedDelivery: order.shipment?.expectedDelivery?.toISOString() ?? null,
            customer: order.customer ?? null,
            items: order.items.map(item => ({
                id: item.id,
                quantity: item.quantity,
                unitPrice: item.price,
                totalPrice: item.price * item.quantity,
                product: item.product ?? null,
                // Surface the Shopify-style snapshot the buyer chose at
                // checkout (variants + tier). The admin /orders/[id] page
                // renders these as chips under the product name so ops
                // can see exactly what was ordered without inferring it
                // from price math.
                selectedVariants: (item as any).selectedVariants ?? null,
                selectedTier: (item as any).selectedTier ?? null,
            })),
        };
    }

    async findByIdWithItems(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                images: true,
                                price: true,
                            }
                        }
                    }
                },
                customer: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                },
                supplier: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        stripeAccountId: true,
                        stripeOnboarded: true,
                    }
                }
            }
        });

        if (!order) {
            throw new NotFoundException(
                `Order ${orderId} not found`
            );
        }

        return order;
    }

    async confirmDelivery(orderId: string, customerId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.customerId !== customerId) {
            throw new ForbiddenException('This order does not belong to you');
        }
        if (order.status !== OrderStatus.SHIPPED) {
            throw new BadRequestException(
                `Order must be SHIPPED to confirm delivery. Current status: ${order.status}`
            );
        }
        return this.updateStatus(orderId, OrderStatus.DELIVERED, customerId, 'Customer confirmed delivery');
    }

    async notifyDeliveryDay(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: { select: { email: true, name: true } } }
        });

        if (!order) throw new NotFoundException('Order not found');
        if (!order.customer?.email) throw new BadRequestException('Customer has no email');

        await this.emailService.sendArrivingTodayEmail(
            order.customer.email,
            order.customer.name,
            order.id
        );

        return { success: true };
    }

    async hideOrder(orderId: string, customerId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.customerId !== customerId) throw new ForbiddenException('This order does not belong to you');

        return this.prisma.order.update({
            where: { id: orderId },
            data: { deletedByCustomer: true },
        });
    }

    async delete(orderId: string) {
        // Administrative hard delete
        return this.prisma.order.delete({
            where: { id: orderId }
        });
    }

    async bulkDelete(orderIds: string[]) {
        return this.prisma.order.deleteMany({
            where: { id: { in: orderIds } }
        });
    }

    async getAdminAnalytics(timeframe: string = 'daily') {
        // Fetch all non-cancelled orders with their items and suppliers
        const orders = await this.prisma.order.findMany({
            where: { status: { not: OrderStatus.CANCELLED } },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                supplier: { select: { id: true, name: true, email: true } }
                            }
                        }
                    }
                }
            }
        });

        const productStats: Record<string, { name: string, sales: number, revenue: number, image: string }> = {};
        const supplierStats: Record<string, { name: string, revenue: number, orders: number }> = {};
        const revenueTrends: Record<string, number> = {};

        for (const order of orders) {
            let dateKey: string;
            
            if (timeframe === 'monthly') {
                dateKey = order.createdAt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            } else if (timeframe === 'weekly') {
                // Get start of week (Sunday)
                const d = new Date(order.createdAt);
                const day = d.getDay();
                const diff = d.getDate() - day;
                const startOfWeek = new Date(d.setDate(diff));
                dateKey = `Wk ${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            } else {
                // Default: Daily
                dateKey = order.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            revenueTrends[dateKey] = (revenueTrends[dateKey] || 0) + order.totalAmount;

            for (const item of order.items) {
                const prod = item.product;
                if (!prod) continue;

                // Product Stats
                if (!productStats[prod.id]) {
                    productStats[prod.id] = {
                        name: prod.name,
                        sales: 0,
                        revenue: 0,
                        image: prod.images?.[0] || ''
                    };
                }
                productStats[prod.id].sales += item.quantity;
                productStats[prod.id].revenue += item.price * item.quantity;

                // Supplier Stats
                const sup = prod.supplier;
                if (sup) {
                    if (!supplierStats[sup.id]) {
                        supplierStats[sup.id] = { name: sup.name, revenue: 0, orders: 0 };
                    }
                    supplierStats[sup.id].revenue += item.price * item.quantity;
                    supplierStats[sup.id].orders += 1;
                }
            }
        }

        const topProducts = Object.values(productStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const topSuppliers = Object.values(supplierStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const revenueData = Object.entries(revenueTrends)
            .map(([name, revenue]) => ({ name, revenue }))
            .sort((a, b) => {
                // Very basic sort for chart display
                return 0; // Keeping insertion order for now (linked to order dates)
            })
            .slice(timeframe === 'daily' ? -14 : -12); // Show more data for daily, less for others

        return {
            topProducts,
            topSuppliers,
            revenueData
        };
    }
}
