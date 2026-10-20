import { resolveRange } from '../report-range';
import { attentionCounts, awaitingSupplier, inventoryHealth, pctChange, saleRecognizedAt, salesSummary, type SaleLine } from '../supplier-metrics';
import { SupplierOverviewService } from '../supplier-overview.service';

/** Supplier Overview: which orders are sales, when they count, and that every view adds up. */
const NOW = new Date('2026-10-17T10:00:00Z');
const D = (s: string) => new Date(s);

describe('sale eligibility and recognition date', () => {
    const base = { createdAt: D('2026-10-01T08:00:00Z') };
    it('workflow orders count only once Atlantis approved them, at the approval time', () => {
        expect(saleRecognizedAt({ ...base, status: 'PENDING', reviewStatus: 'PENDING_REVIEW' })).toBeNull(); // waiting for suppliers / Atlantis
        expect(saleRecognizedAt({ ...base, status: 'PROCESSING', reviewStatus: 'PENDING_REVIEW' })).toBeNull(); // moved without approval (webhook path)
        expect(saleRecognizedAt({ ...base, status: 'CANCELLED', reviewStatus: 'REJECTED', reviewedAt: D('2026-10-02T00:00:00Z') })).toBeNull();
        expect(saleRecognizedAt({ ...base, status: 'CANCELLED', reviewStatus: 'APPROVED', reviewedAt: D('2026-10-02T00:00:00Z') })).toBeNull(); // cancelled after approval
        for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
            expect(saleRecognizedAt({ ...base, status, reviewStatus: 'APPROVED', reviewedAt: D('2026-10-03T09:00:00Z') })?.toISOString()).toBe('2026-10-03T09:00:00.000Z');
        }
    });
    it('legacy orders count once confirmed, at the first confirmed status change', () => {
        expect(saleRecognizedAt({ ...base, status: 'PENDING', reviewStatus: 'LEGACY' })).toBeNull();
        expect(saleRecognizedAt({ ...base, status: 'CANCELLED', reviewStatus: 'LEGACY' })).toBeNull();
        expect(saleRecognizedAt({ ...base, status: 'DELIVERED', reviewStatus: 'LEGACY', firstConfirmedAt: D('2026-10-05T00:00:00Z') })?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
        expect(saleRecognizedAt({ ...base, status: 'PAID', reviewStatus: 'LEGACY' })?.toISOString()).toBe(base.createdAt.toISOString()); // no history row
    });
});

describe('sales summary', () => {
    const range = resolveRange({ range: '7d' }, NOW); // 11–17 Oct, previous 4–10 Oct
    const line = (orderId: string, productId: string, value: number, cases: number, at: string): SaleLine => ({ orderId, productId, name: productId.toUpperCase(), image: null, value, estimated: false, cases, recognizedAt: D(at) });
    const lines = [
        line('o1', 'a', 100, 10, '2026-10-11T00:00:00Z'), // exact start: included
        line('o1', 'b', 50, 5, '2026-10-11T00:00:00Z'),
        line('o2', 'b', 50, 2, '2026-10-15T12:00:00Z'),
        line('o3', 'c', 100, 1, '2026-10-17T23:59:59Z'), // last second: included
        line('o4', 'd', 80, 8, '2026-10-16T08:00:00Z'),
        line('o5', 'e', 1, 1, '2026-10-12T00:00:00Z'),
        line('o6', 'f', 2, 1, '2026-10-13T00:00:00Z'),
        line('o9', 'a', 999, 9, '2026-10-18T00:00:00Z'), // end: excluded
        line('p1', 'a', 200, 20, '2026-10-05T10:00:00Z'), // previous period
    ];
    const s = salesSummary(lines, range);

    it('totals, previous period and change', () => {
        expect(s.current).toEqual({ sales: 383, orders: 6, cases: 28, estimated: false });
        expect(s.previous.sales).toBe(200);
        expect(s.change.sales).toBeCloseTo(0.915, 4);
    });
    it('series adds up to the total, one bucket per day, order counted per bucket', () => {
        expect(s.series).toHaveLength(7);
        expect(s.series.reduce((x, b) => x + b.sales, 0)).toBe(s.current.sales);
        expect(s.series[0]).toMatchObject({ key: '2026-10-11', sales: 150, orders: 1 });
        expect(s.series[6]).toMatchObject({ key: '2026-10-17', sales: 100, partial: true });
    });
    it('top 5 by net sales value, ties broken by cases, consistent with the series', () => {
        // a 100/10, c 100/1, b 100/7, d 80, f 2, e 1 → a (10 cases) before b (7) before c (1)
        expect(s.top.map((t) => t.productId)).toEqual(['a', 'b', 'c', 'd', 'f']);
        expect(s.top[0]).toMatchObject({ sales: 100, cases: 10, orders: 1 });
        expect(s.top[1]).toMatchObject({ sales: 100, cases: 7, orders: 2 });
        const all = salesSummary(lines, range);
        const sumAllProducts = [...new Set(lines.filter((l) => l.recognizedAt >= range.start && l.recognizedAt < range.end).map((l) => l.productId))]
            .reduce((x, id) => x + lines.filter((l) => l.productId === id && l.recognizedAt >= range.start && l.recognizedAt < range.end).reduce((y, l) => y + l.value, 0), 0);
        expect(sumAllProducts).toBe(all.current.sales);
    });
    it('no previous sales → no percentage', () => {
        expect(pctChange(100, 0)).toBeNull();
        expect(pctChange(0, 0)).toBeNull();
        expect(pctChange(50, 100)).toBe(-0.5);
        expect(salesSummary(lines.filter((l) => !l.orderId.startsWith('p')), range).change.sales).toBeNull();
    });
    it('empty data', () => {
        const e = salesSummary([], range);
        expect(e.current).toEqual({ sales: 0, orders: 0, cases: 0, estimated: false });
        expect(e.top).toEqual([]);
        expect(e.series.every((b) => b.sales === 0 && b.orders === 0)).toBe(true);
        expect(e.change).toEqual({ sales: null, orders: null });
    });
});

describe('orders awaiting the supplier (current)', () => {
    const conf = (status: string, termsVersion = 1, deadline: string | null = '2026-10-20T00:00:00Z') => ({ termsVersion, status, deadline });
    it('matches the orders page rule', () => {
        expect(awaitingSupplier({ status: 'PENDING', reviewStatus: 'PENDING_REVIEW', confirmations: [conf('PENDING')] }, NOW)).toBe(true);
        expect(awaitingSupplier({ status: 'PENDING', reviewStatus: 'PENDING_REVIEW', confirmations: [conf('ACCEPTED')] }, NOW)).toBe(false); // waiting for Atlantis, not me
        expect(awaitingSupplier({ status: 'PENDING', reviewStatus: 'PENDING_REVIEW', confirmations: [conf('PENDING', 1, '2026-10-16T00:00:00Z')] }, NOW)).toBe(false); // expired
        expect(awaitingSupplier({ status: 'PENDING', reviewStatus: 'PENDING_REVIEW', confirmations: [conf('ACCEPTED', 1), conf('PENDING', 2)] }, NOW)).toBe(true); // new version
        expect(awaitingSupplier({ status: 'PROCESSING', reviewStatus: 'APPROVED', confirmations: [conf('ACCEPTED')] }, NOW)).toBe(false);
        expect(awaitingSupplier({ status: 'CANCELLED', reviewStatus: 'REJECTED', confirmations: [conf('PENDING')] }, NOW)).toBe(false);
        expect(awaitingSupplier({ status: 'PENDING', reviewStatus: 'LEGACY' }, NOW)).toBe(true);
        expect(awaitingSupplier({ status: 'SHIPPED', reviewStatus: 'LEGACY' }, NOW)).toBe(false);
    });
});

describe('inventory health and the attention badge', () => {
    const ok = { name: 'Cola 330 ml', brand: 'Cola', category: 'Drinks', ean: '5449000000996', origin: 'RO', exwLocation: 'Bucharest', weight: '330 ml', basePrice: 10, stock: 100, unitsPerCase: 24, casesPerPallet: 80, unit: 'can', moq: 10, moqUnit: 'CASE', images: ['https://img.example/cola.jpg'] };
    const products = [
        { ...ok, id: '1', status: 'APPROVED' },
        { ...ok, id: '2', status: 'APPROVED', stock: 0 },
        { ...ok, id: '3', status: 'APPROVED', stock: 4 }, // below one minimum order (10 cases)
        { ...ok, id: '4', status: 'DRAFT', images: [], brand: '' }, // draft, missing info AND image
        { ...ok, id: '5', status: 'DRAFT' },
        { ...ok, id: '6', status: 'NEEDS_CHANGES', images: ['data:image/svg+xml;utf8,<svg/>'] }, // placeholder ≠ real image
        { ...ok, id: '7', status: 'REJECTED', images: [] }, // closed: only counted as rejected
        { ...ok, id: '8', status: 'PENDING' },
    ];
    it('counts each product once per tile; tiles overlap', () => {
        expect(inventoryHealth(products)).toEqual({ drafts: 2, rejected: 1, needsChanges: 1, missingInfo: 2, missingImages: 2, outOfStock: 1, belowMinOrder: 1 });
    });
    it('badge = distinct draft + rejected + needs-changes products', () => {
        expect(attentionCounts({ DRAFT: 20, REJECTED: 4, NEEDS_CHANGES: 2, APPROVED: 50 })).toEqual({ total: 26, drafts: 20, rejected: 4, needsChanges: 2 });
        expect(attentionCounts({})).toEqual({ total: 0, drafts: 0, rejected: 0, needsChanges: 0 });
    });
});

describe('SupplierOverviewService with fake data', () => {
    const SUP = 'sup-1';
    const product = { name: 'Cola', images: ['https://img.example/c.jpg'], basePrice: 10, unitsPerCase: 24, casesPerPallet: 80, palletsPerShipment: 26 };
    const order = (id: string, status: string, reviewStatus: string, extra: any = {}) => ({ id, status, reviewStatus, termsVersion: 1, createdAt: D('2026-10-14T08:00:00Z'), reviewedAt: null, history: [], confirmations: [], ...extra });
    const ORDERS = [
        order('pending', 'PENDING', 'PENDING_REVIEW', { confirmations: [{ supplierId: SUP, termsVersion: 1, status: 'PENDING', deadline: D('2099-01-01T00:00:00Z') /* attention() uses the real clock */ }] }),
        order('accepted', 'PENDING', 'PENDING_REVIEW', { confirmations: [{ supplierId: SUP, termsVersion: 1, status: 'ACCEPTED', deadline: null }] }),
        order('bypass', 'PROCESSING', 'PENDING_REVIEW'),
        order('approved', 'PROCESSING', 'APPROVED', { reviewedAt: D('2026-10-15T09:00:00Z') }),
        order('delivered', 'DELIVERED', 'APPROVED', { reviewedAt: D('2026-10-16T09:00:00Z') }),
        order('cancelled', 'CANCELLED', 'APPROVED', { reviewedAt: D('2026-10-15T09:00:00Z') }),
        order('rejected', 'CANCELLED', 'REJECTED', { reviewedAt: D('2026-10-15T09:00:00Z') }),
        order('old-approval', 'SHIPPED', 'APPROVED', { reviewedAt: D('2026-09-01T09:00:00Z') }),
        order('legacy', 'SHIPPED', 'LEGACY', { createdAt: D('2026-09-01T00:00:00Z'), history: [{ newStatus: 'PROCESSING', createdAt: D('2026-10-12T00:00:00Z') }] }),
        order('legacy-pending', 'PENDING', 'LEGACY'),
    ];
    const ITEMS = ORDERS.map((o, i) => ({ orderId: o.id, productId: `p${i}`, quantity: 2, supplierUnitPrice: 100, stockCases: 2, selectedTier: 'carton', mixComposition: null, mixedLoadId: null, productNameSnapshot: null, product, order: o }));

    const matchOrder = (o: any, w: any = {}) => {
        if (w.reviewStatus && o.reviewStatus !== w.reviewStatus) return false;
        if (w.status?.not && o.status === w.status.not) return false;
        if (w.status?.in && !w.status.in.includes(o.status)) return false;
        if (w.reviewedAt && !(o.reviewedAt && o.reviewedAt >= w.reviewedAt.gte && o.reviewedAt < w.reviewedAt.lt)) return false;
        if (w.createdAt?.lt && !(o.createdAt < w.createdAt.lt)) return false;
        if (w.createdAt?.gte && !(o.createdAt >= w.createdAt.gte)) return false;
        return true;
    };
    const prisma: any = {
        orderItem: { findMany: async ({ where }: any) => ITEMS.filter((it) => matchOrder(it.order, where.order)) },
        order: {
            findMany: async ({ where }: any) => ORDERS.filter((o) => matchOrder(o, where)).map((o) => ({ ...o, items: ITEMS.filter((it) => it.orderId === o.id) })),
            count: async ({ where }: any) => ORDERS.filter((o) => matchOrder(o, where)).length,
        },
        product: {
            findMany: async () => [{ id: 'x', status: 'DRAFT', images: [], stock: 0 }],
            groupBy: async () => [{ status: 'DRAFT', _count: { _all: 3 } }, { status: 'REJECTED', _count: { _all: 1 } }],
        },
        productChangeLog: { count: async () => 0, findMany: async () => [] },
    };
    const svc = new SupplierOverviewService(prisma);

    it('counts only approved (or confirmed legacy) orders, at the supplier net price', async () => {
        const r: any = await svc.overview(SUP, { range: '7d' }, NOW);
        // approved (15 Oct) + delivered (16 Oct) + legacy (confirmed 12 Oct) = 3 orders × 2 × €100
        expect(r.financial.grossSales).toMatchObject({ value: 600, orders: 3, previous: 0, change: null });
        expect(r.orders.series.reduce((s: number, b: any) => s + b.sales, 0)).toBe(600);
        expect(r.orders.top.reduce((s: number, t: any) => s + t.sales, 0)).toBe(600);
        expect(r.range).toMatchObject({ from: '2026-10-11', to: '2026-10-17', start: '2026-10-11T00:00:00.000Z', end: '2026-10-18T00:00:00.000Z', timeZone: 'UTC' });
    });
    it('awaiting confirmation is a current count; untracked money figures say so', async () => {
        const r: any = await svc.overview(SUP, { range: '3d' }, NOW);
        expect(r.orders.awaitingConfirmation).toBe(2); // the pending workflow order + the pending legacy order
        for (const k of ['netEarnings', 'received', 'outstanding', 'refunds']) expect(r.financial[k]).toEqual({ tracked: false });
        expect(JSON.stringify(r)).not.toMatch(/totalAmount|buyerPrice|margin|"price"/);
    });
    it('navigation attention counts', async () => {
        const a: any = await svc.attention(SUP);
        expect(a.products).toEqual({ total: 4, drafts: 3, rejected: 1, needsChanges: 0 });
        expect(a.ordersAwaiting).toBe(2);
    });
    it('invalid ranges are a 400 with a code', async () => {
        await expect(svc.overview(SUP, { range: 'custom', from: '2026-10-10', to: '2026-10-20' }, NOW)).rejects.toMatchObject({ response: { code: 'RANGE_FUTURE' } });
    });
});
