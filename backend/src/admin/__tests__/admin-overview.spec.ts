import { resolveRange } from '../../products/report-range';
import { catalogHealth, commercialSummary, datedEventsSummary, eligibleOrders, orderAttention, paymentsSummary, type EligibleOrder, type SaleLineFacts } from '../admin-overview';
import { scopeOf, scopeWhere, parseScope } from '../../products/catalog-scope';

/** Founder Overview: which orders count, what each figure is, and that nothing is estimated. */
const NOW = new Date('2026-10-20T10:00:00Z');
const D = (s: string) => new Date(s);
const range = resolveRange({ range: '7d' }, NOW); // 14–20 Oct, previous 7–13 Oct

const line = (o: Partial<SaleLineFacts> = {}): SaleLineFacts => ({ productId: 'p1', name: 'Takis', image: null, quantity: 2, price: 50, supplierUnitPrice: 40, supplierId: 's1', supplierName: 'Supplier A', ...o });
const order = (id: string, at: string, o: Partial<EligibleOrder> = {}): EligibleOrder => ({ id, totalAmount: 100, recognizedAt: D(at), paymentStatus: 'UNPAID', lines: [line()], ...o });

describe('eligible orders', () => {
    it('counts approved workflow orders and confirmed legacy orders only, at their recognition time', () => {
        const base = { totalAmount: 10, paymentStatus: 'UNPAID', lines: [], createdAt: D('2026-10-01T00:00:00Z') };
        const out = eligibleOrders([
            { ...base, id: 'waiting', status: 'PENDING', reviewStatus: 'PENDING_REVIEW' },
            { ...base, id: 'rejected', status: 'CANCELLED', reviewStatus: 'REJECTED', reviewedAt: D('2026-10-15T00:00:00Z') },
            { ...base, id: 'approved', status: 'PROCESSING', reviewStatus: 'APPROVED', reviewedAt: D('2026-10-15T09:00:00Z') },
            { ...base, id: 'approved-then-cancelled', status: 'CANCELLED', reviewStatus: 'APPROVED', reviewedAt: D('2026-10-15T09:00:00Z') },
            { ...base, id: 'legacy-pending', status: 'PENDING', reviewStatus: 'LEGACY' },
            { ...base, id: 'legacy-delivered', status: 'DELIVERED', reviewStatus: 'LEGACY', firstConfirmedAt: D('2026-10-12T00:00:00Z') },
        ]);
        expect(out.map((o) => o.id)).toEqual(['approved', 'legacy-delivered']);
        expect(out[0].recognizedAt.toISOString()).toBe('2026-10-15T09:00:00.000Z');
        expect(out[1].recognizedAt.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    });
});

describe('commercial summary', () => {
    it('sums order value per period, compares with the previous period and buckets by day', () => {
        const s = commercialSummary([
            order('a', '2026-10-14T00:00:00Z', { totalAmount: 100 }), // first instant of the period
            order('b', '2026-10-20T09:59:59Z', { totalAmount: 50.5 }), // today
            order('c', '2026-10-13T23:59:59Z', { totalAmount: 30 }), // last instant of the previous period
            order('d', '2026-10-06T00:00:00Z', { totalAmount: 999 }), // before both
        ], range);
        expect(s.current.orderValue).toBe(150.5);
        expect(s.current.orders).toBe(2);
        expect(s.current.aov).toBe(75.25);
        expect(s.previous).toMatchObject({ orderValue: 30, orders: 1, aov: 30 });
        expect(s.change.orderValue).toBeCloseTo((150.5 - 30) / 30, 4);
        expect(s.series).toHaveLength(7);
        expect(s.series[0]).toMatchObject({ key: '2026-10-14', orderValue: 100, orders: 1 });
        expect(s.series[6]).toMatchObject({ key: '2026-10-20', orderValue: 50.5, orders: 1, partial: true });
        expect(s.series.reduce((t, b) => t + b.orderValue, 0)).toBe(150.5);
    });
    it('shows no comparison and no average when there is nothing to compare or divide by', () => {
        const s = commercialSummary([order('a', '2026-10-15T00:00:00Z')], range);
        expect(s.change.orderValue).toBeNull();
        expect(s.previous.aov).toBeNull();
        expect(s.change.aov).toBeNull();
        const empty = commercialSummary([], range);
        expect(empty.current).toMatchObject({ orderValue: 0, orders: 0, aov: null, margin: null });
    });
    it('reports the Atlantis margin only when every line has a recorded supplier price', () => {
        const complete = commercialSummary([order('a', '2026-10-15T00:00:00Z', { totalAmount: 100, lines: [line({ price: 50, quantity: 2, supplierUnitPrice: 40 })] })], range);
        expect(complete.current).toMatchObject({ supplierNet: 80, margin: 20, revenueRecorded: 20, linesWithNet: 1, linesWithoutNet: 0 });
        const partial = commercialSummary([
            order('a', '2026-10-15T00:00:00Z', { totalAmount: 100, lines: [line({ supplierUnitPrice: 40 })] }),
            order('b', '2026-10-16T00:00:00Z', { totalAmount: 60, lines: [line({ supplierUnitPrice: null })] }),
        ], range);
        expect(partial.current.margin).toBeNull();
        expect(partial.current.linesWithoutNet).toBe(1);
        expect(partial.current.supplierNet).toBe(80); // what is recorded, never estimated
        expect(partial.current.revenueRecorded).toBe(20); // only the covered line
        expect(partial.change.revenue).toBeNull(); // no comparison on partial coverage
    });
    it('ranks products by order value and suppliers by order value, with net only when complete', () => {
        const s = commercialSummary([
            order('a', '2026-10-15T00:00:00Z', { lines: [line({ productId: 'p1', name: 'A', price: 10, quantity: 10, supplierId: 's1', cases: 10 }), line({ productId: 'p2', name: 'B', price: 100, quantity: 2, supplierId: 's2', supplierName: 'Supplier B', supplierUnitPrice: null, cases: 192 })] }),
            order('b', '2026-10-16T00:00:00Z', { lines: [line({ productId: 'p1', name: 'A', price: 10, quantity: 5, supplierId: 's1', cases: 5 })] }),
        ], range);
        expect(s.topProducts.map((p) => [p.productId, p.orderValue, p.units, p.orders])).toEqual([['p2', 200, 192, 1], ['p1', 150, 15, 2]]);
        expect(s.current).toMatchObject({ casesSold: 207, productsSold: 2, lines: 3 });
        expect(s.topSuppliers[0]).toMatchObject({ supplierId: 's2', orderValue: 200, supplierNet: null });
        expect(s.topSuppliers[1]).toMatchObject({ supplierId: 's1', orderValue: 150, supplierNet: 600, orders: 2 });
    });
});

describe('payments, refunds and cancellations', () => {
    it('counts Stripe-confirmed EUR payments by capture date; other currencies and undated records are never added', () => {
        const p = paymentsSummary([
            { amount: 100, currency: 'EUR', capturedAt: D('2026-10-15T00:00:00Z') },
            { amount: 40, currency: 'eur', capturedAt: D('2026-10-10T00:00:00Z') },
            { amount: 7, currency: 'EUR', capturedAt: null },
            { amount: 999, currency: 'USD', capturedAt: D('2026-10-15T00:00:00Z') },
        ], range);
        expect(p.current).toEqual({ amount: 100, payments: 1 });
        expect(p.previous).toEqual({ amount: 40, payments: 1 });
        expect(p.change).toBeCloseTo(1.5, 4);
        expect(p.excluded).toBe(2);
        expect(paymentsSummary([], range)).toMatchObject({ current: { amount: 0, payments: 0 }, change: null, recordsEver: 0 });
    });
    it('counts dated events per period', () => {
        const r = datedEventsSummary([{ at: D('2026-10-14T00:00:00Z'), amount: 12 }, { at: D('2026-10-13T00:00:00Z'), amount: 5 }, { at: D('2026-09-01T00:00:00Z') }], range);
        expect(r.current).toEqual({ count: 1, amount: 12 });
        expect(r.previous).toEqual({ count: 1, amount: 5 });
        expect(r.change).toBe(0);
    });
});

describe('orders requiring action', () => {
    const conf = (supplierId: string, status: string, deadline?: string) => ({ supplierId, termsVersion: 1, status, deadline: deadline ? D(deadline) : null });
    it('separates what Atlantis must do from what suppliers and buyers still owe', () => {
        const a = orderAttention([
            { id: 'ready', status: 'PENDING', reviewStatus: 'PENDING_REVIEW', termsVersion: 1, supplierIds: ['s1', 's2'], confirmations: [conf('s1', 'ACCEPTED'), conf('s2', 'ACCEPTED')] },
            { id: 'waiting', status: 'PENDING', reviewStatus: 'PENDING_REVIEW', termsVersion: 1, supplierIds: ['s1'], confirmations: [conf('s1', 'PENDING', '2026-10-25T00:00:00Z')] },
            { id: 'expired', status: 'PENDING', reviewStatus: 'PENDING_REVIEW', termsVersion: 1, supplierIds: ['s1'], confirmations: [conf('s1', 'PENDING', '2026-10-01T00:00:00Z')] },
            { id: 'declined', status: 'PENDING', reviewStatus: 'PENDING_REVIEW', termsVersion: 1, supplierIds: ['s1'], confirmations: [conf('s1', 'REJECTED')] },
            { id: 'legacy', status: 'PENDING', reviewStatus: 'LEGACY', termsVersion: 1, supplierIds: ['s1'], confirmations: [] },
            { id: 'buyer', status: 'PROCESSING', reviewStatus: 'APPROVED', termsVersion: 2, buyerAcceptedVersion: 1, supplierIds: ['s1'], confirmations: [] },
            { id: 'done', status: 'PROCESSING', reviewStatus: 'APPROVED', termsVersion: 1, supplierIds: ['s1'], confirmations: [] },
            { id: 'cancelled', status: 'CANCELLED', reviewStatus: 'PENDING_REVIEW', termsVersion: 1, supplierIds: ['s1'], confirmations: [] },
        ], NOW);
        expect(a).toEqual({ readyForApproval: 1, needsDecision: 2, waitingSuppliers: 1, legacyPending: 1, waitingBuyer: 1, requiresAction: 4 });
    });
});

describe('catalog health and scope', () => {
    it('counts each product once per tile and leaves rejected listings out of the open tiles', () => {
        const h = catalogHealth([
            { status: 'DRAFT', missing: 3, hasImage: false },
            { status: 'PENDING', missing: 0, hasImage: true },
            { status: 'APPROVED', missing: 1, hasImage: true },
            { status: 'REJECTED', missing: 5, hasImage: false },
        ]);
        expect(h).toEqual({ total: 4, byStatus: { DRAFT: 1, PENDING: 1, APPROVED: 1, REJECTED: 1 }, missingInfo: 2, missingImages: 1, liveIncomplete: 1 });
    });
    it('puts a product in exactly one scope by the role of the account that owns it', () => {
        expect(scopeOf('OWNER')).toBe('catalog');
        expect(scopeOf('admin')).toBe('catalog');
        expect(scopeOf('EDITOR')).toBe('catalog');
        expect(scopeOf('SUPPLIER')).toBe('submissions');
        expect(scopeOf(null)).toBe('submissions');
        expect(scopeWhere('catalog', ['a', 'b'])).toEqual({ supplierId: { in: ['a', 'b'] } });
        expect(scopeWhere('submissions', ['a'])).toEqual({ supplierId: { notIn: ['a'] } });
        expect(scopeWhere('submissions', [])).toEqual({});
        expect(parseScope('Catalog')).toBe('catalog');
        expect(parseScope('all')).toBeNull();
    });
});
