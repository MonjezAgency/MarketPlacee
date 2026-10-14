import { casesInUnit, normaliseTier } from '../orders/pricing';

/**
 * Stock movements per product, always in CASES (the unit Product.stock is
 * kept in). Order lines are converted with the pack sizes of the ordered
 * tier, so a pallet line counts as casesPerPallet cases, not 1.
 *
 *  • reserved  — committed to buyers, not yet delivered
 *                (PENDING, PAID, PROCESSING, SHIPPED). Already taken off stock.
 *  • delivered — delivered to buyers (DELIVERED).
 *  • cancelled — on cancelled orders. Returned to stock if cancelled
 *                before dispatch.
 *  • ordered   — every order line ever, any status.
 *
 * Mixed pallets / trucks are not stock-tracked per product and are left out.
 */
export const RESERVED_STATUSES = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'] as const;

export interface StockMovement { reserved: number; delivered: number; cancelled: number; ordered: number }

type ItemRow = {
    productId: string | null;
    quantity: number;
    stockCases?: number | null;
    selectedTier?: string | null;
    mixComposition?: unknown;
    mixedLoadId?: string | null;
    order: { status: string };
    product?: { unitsPerCase?: number | null; casesPerPallet?: number | null; palletsPerShipment?: number | null } | null;
};

/** Cases represented by one order line (0 for mixed loads). */
export function casesForItem(it: ItemRow): number {
    if (it.mixedLoadId || (Array.isArray(it.mixComposition) && it.mixComposition.length)) return 0;
    if (typeof it.stockCases === 'number') return it.stockCases;
    const tier = normaliseTier(it.selectedTier) ?? 'carton';
    const per = it.product ? casesInUnit({ id: '', name: '', price: 0, ...it.product } as any, tier) : 1;
    return Math.max(0, it.quantity) * (Number.isFinite(per) && per > 0 ? per : 1);
}

export async function stockMovements(prisma: any, productIds: string[]): Promise<Record<string, StockMovement>> {
    const out: Record<string, StockMovement> = {};
    if (!productIds.length) return out;
    const items: ItemRow[] = await prisma.orderItem.findMany({
        where: { productId: { in: productIds } },
        select: {
            productId: true, quantity: true, stockCases: true, selectedTier: true, mixComposition: true, mixedLoadId: true,
            order: { select: { status: true } },
            product: { select: { unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true } },
        },
    });
    for (const it of items) {
        if (!it.productId) continue;
        const m = (out[it.productId] ||= { reserved: 0, delivered: 0, cancelled: 0, ordered: 0 });
        const c = casesForItem(it);
        m.ordered += c;
        const s = it.order.status;
        if ((RESERVED_STATUSES as readonly string[]).includes(s)) m.reserved += c;
        else if (s === 'DELIVERED') m.delivered += c;
        else if (s === 'CANCELLED') m.cancelled += c;
    }
    return out;
}
