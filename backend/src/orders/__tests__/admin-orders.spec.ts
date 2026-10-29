import {
    attentionQueues, buildLoads, buildOrderWhere, loadTotals, normaliseComposition, buildTimeline, cleanVariants, csvCell, moneySummary, nextAction, orderByFor, orderRef, ordersPerKey,
    parseBound, parseOrderListQuery, redactNet, statusCounts, statusOptions, supplierIdsOf, toCsv, OrderListQueryError,
} from '../admin-orders';
import { orderAttention, type OpenOrderFacts } from '../../admin/admin-overview';
import { ORDER_TRANSITIONS } from '../orders.service';

/** Admin order management: query parsing, filters, queues, money and timeline — all from recorded fields. */
const NOW = new Date('2026-10-20T10:00:00Z');
const FUTURE = new Date('2026-10-25T00:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');
const conf = (supplierId: string, status: string, o: Record<string, unknown> = {}) => ({ supplierId, termsVersion: 1, status, deadline: FUTURE, decidedAt: null, ...o });
const facts = (id: string, o: Partial<OpenOrderFacts> = {}): OpenOrderFacts => ({ id, status: 'PENDING', reviewStatus: 'PENDING_REVIEW', termsVersion: 1, buyerAcceptedVersion: null, supplierIds: ['s1'], confirmations: [conf('s1', 'PENDING')], ...o });

describe('list query', () => {
    it('keeps known values, ignores unknown ones and bounds the page size', () => {
        const q = parseOrderListQuery({ status: 'shipped', sort: 'TOTAL_DESC', paymentStatus: 'paid', page: '3', limit: '500', q: '#A1B2C3D4', attention: 'ready', supplier: 'abc-123', buyer: 'bad id!' });
        expect(q).toMatchObject({ status: 'SHIPPED', sort: 'total_desc', paymentStatus: 'PAID', page: 3, limit: 100, q: 'A1B2C3D4', attention: 'ready', supplierId: 'abc-123', buyerId: null });
        const d = parseOrderListQuery({ status: 'RETURNED', sort: 'random', attention: 'everything', page: '-1', limit: 'x' });
        expect(d).toMatchObject({ status: null, sort: 'newest', attention: null, page: 1, limit: 25 });
    });
    it('reads date bounds: instants as sent, bare days as whole UTC days, and refuses impossible ranges', () => {
        expect(parseBound('2026-10-01', 'from')!.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect(parseBound('2026-10-01', 'to')!.toISOString()).toBe('2026-10-02T00:00:00.000Z');
        expect(parseBound('2026-10-01T22:00:00.000Z', 'from')!.toISOString()).toBe('2026-10-01T22:00:00.000Z');
        expect(parseBound('', 'from')).toBeNull();
        expect(() => parseBound('yesterday', 'from')).toThrow(OrderListQueryError);
        expect(() => parseOrderListQuery({ from: '2026-10-05', to: '2026-10-04' })).toThrow(/before the end date/);
        // A one-day range (from = to) is valid: that whole day.
        expect(parseOrderListQuery({ from: '2026-10-05', to: '2026-10-05' }).to!.toISOString()).toBe('2026-10-06T00:00:00.000Z');
    });
});

describe('filters and sorting', () => {
    it('builds one AND of the chosen filters, suppliers matched on lines or confirmations', () => {
        const q = parseOrderListQuery({ status: 'PENDING', paymentStatus: 'UNPAID', supplier: 's1', buyer: 'b1', from: '2026-10-01', to: '2026-10-31' });
        const w: any = buildOrderWhere(q, ['o1', 'o2']);
        expect(w.AND).toEqual(expect.arrayContaining([
            { status: 'PENDING' }, { paymentStatus: 'UNPAID' }, { customerId: 'b1' }, { id: { in: ['o1', 'o2'] } },
            { OR: [{ items: { some: { product: { supplierId: 's1' } } } }, { confirmations: { some: { supplierId: 's1' } } }] },
            { createdAt: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') } },
        ]));
        expect(buildOrderWhere(parseOrderListQuery({}))).toEqual({});
    });
    it('searches the order reference case-insensitively against the lower-case id, plus buyer and product names', () => {
        const w: any = buildOrderWhere(parseOrderListQuery({ q: 'A1B2' }));
        const or = w.AND[0].OR;
        expect(or[0]).toEqual({ id: { contains: 'a1b2' } });
        expect(JSON.stringify(or[1])).toContain('companyName');
        expect(JSON.stringify(or[2])).toContain('productNameSnapshot');
    });
    it('an empty queue matches nothing (not everything)', () => {
        const w: any = buildOrderWhere(parseOrderListQuery({ attention: 'ready' }), []);
        expect(w.AND).toEqual([{ id: { in: [] } }]);
    });
    it('sorts with a stable tie-breaker', () => {
        expect(orderByFor('newest')).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
        expect(orderByFor('total_asc')[0]).toEqual({ totalAmount: 'asc' });
    });
    it('order reference is the first 8 characters, upper-case (same as the Founder Overview)', () => {
        expect(orderRef('a1b2c3d4-0000-1111-2222-333344445555')).toBe('44445555');
    });
});

describe('next action and the "requiring action" count', () => {
    it('follows the workflow rules for one order', () => {
        expect(nextAction(facts('w'), NOW)).toBe('WAIT_SUPPLIERS');
        expect(nextAction(facts('a', { confirmations: [conf('s1', 'ACCEPTED')] }), NOW)).toBe('APPROVE');
        expect(nextAction(facts('r', { confirmations: [conf('s1', 'REJECTED')] }), NOW)).toBe('DECIDE');
        expect(nextAction(facts('e', { confirmations: [conf('s1', 'PENDING', { deadline: PAST })] }), NOW)).toBe('DECIDE');
        expect(nextAction(facts('l', { reviewStatus: 'LEGACY', confirmations: [] }), NOW)).toBe('LEGACY_CONFIRM');
        expect(nextAction(facts('b', { status: 'PROCESSING', reviewStatus: 'APPROVED', termsVersion: 2, buyerAcceptedVersion: 1 }), NOW)).toBe('WAIT_BUYER');
        expect(nextAction(facts('p', { status: 'PROCESSING', reviewStatus: 'APPROVED' }), NOW)).toBe('SHIP');
        expect(nextAction(facts('s', { status: 'SHIPPED', reviewStatus: 'LEGACY' }), NOW)).toBe('DELIVER');
        expect(nextAction(facts('d', { status: 'DELIVERED', reviewStatus: 'APPROVED' }), NOW)).toBeNull();
        expect(nextAction(facts('c', { status: 'CANCELLED', reviewStatus: 'REJECTED' }), NOW)).toBeNull();
    });
    it('a mixed-load order (no product supplier on its line) is judged by the suppliers asked to confirm it', () => {
        const ids = supplierIdsOf({ items: [{ product: null }], confirmations: [{ supplierId: 's9' }] });
        expect(ids).toEqual(['s9']);
        expect(nextAction(facts('m', { supplierIds: ids, confirmations: [conf('s9', 'ACCEPTED')] }), NOW)).toBe('APPROVE');
    });
    it('queue sizes are exactly the Founder Overview counts, and each queue lists its orders', () => {
        const set = [
            facts('w1'), facts('a1', { confirmations: [conf('s1', 'ACCEPTED')] }), facts('a2', { status: 'PAID', confirmations: [conf('s1', 'ACCEPTED')] }),
            facts('r1', { confirmations: [conf('s1', 'REJECTED')] }), facts('l1', { reviewStatus: 'LEGACY', confirmations: [] }), facts('l2', { reviewStatus: null, confirmations: [] }),
            facts('b1', { status: 'PROCESSING', reviewStatus: 'APPROVED', termsVersion: 2, buyerAcceptedVersion: 1 }),
            facts('x1', { status: 'CANCELLED' }), facts('p1', { status: 'PROCESSING', reviewStatus: 'APPROVED' }),
        ];
        const { counts, ids } = attentionQueues(set, NOW);
        expect(counts).toEqual(orderAttention(set, NOW));
        expect(counts).toMatchObject({ readyForApproval: 2, needsDecision: 1, waitingSuppliers: 1, legacyPending: 2, waitingBuyer: 1, requiresAction: 5 });
        expect(ids.ready).toEqual(['a1', 'a2']);
        expect(ids.decision).toEqual(['r1']);
        expect(ids.legacy).toEqual(['l1', 'l2']);
        expect(ids.waiting_suppliers).toEqual(['w1']);
        expect(ids.waiting_buyer).toEqual(['b1']);
        expect(ids.requires_action.sort()).toEqual(['a1', 'a2', 'l1', 'l2', 'r1']);
        expect(ids.requires_action.length).toBe(counts.requiresAction);
    });
});

describe('counts and facets', () => {
    it('reports the six statuses, zero when absent, and nothing else', () => {
        const c = statusCounts([{ status: 'PENDING', count: 4 }, { status: 'DELIVERED', count: 2 }, { status: 'RETURNED', count: 9 }]);
        expect(c.byStatus).toEqual({ PENDING: 4, PAID: 0, PROCESSING: 0, SHIPPED: 0, DELIVERED: 2, CANCELLED: 0 });
        expect(c.total).toBe(6);
    });
    it('counts each order once per supplier, however many lines it has', () => {
        const m = ordersPerKey([{ orderId: 'o1', key: 's1' }, { orderId: 'o1', key: 's1' }, { orderId: 'o2', key: 's1' }, { orderId: 'o2', key: 's2' }, { orderId: 'o3', key: null }]);
        expect(Object.fromEntries(m)).toEqual({ s1: 2, s2: 1 });
    });
});

describe('CSV', () => {
    it('quotes commas, quotes and line breaks, and neutralises spreadsheet formulas', () => {
        expect(csvCell('Acme, Ltd')).toBe('"Acme, Ltd"');
        expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
        expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
        expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
        expect(csvCell('-12.50')).toBe('-12.50'); // a negative number stays a number
        expect(csvCell(null)).toBe('');
        const csv = toCsv([['a', 'b'], [1, 'x\ny']]);
        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv).toBe('﻿a,b\r\n1,"x\ny"\r\n');
    });
});

describe('money on one order', () => {
    const lines = [{ quantity: 2, price: 50, supplierUnitPrice: 40 }, { quantity: 1, price: 100, supplierUnitPrice: null }];
    it('shows the recorded figures and leaves unrecorded ones empty', () => {
        const m = moneySummary({ totalAmount: 200, shippingCost: null, coupon: null, freightStatus: 'quote_required' }, lines);
        expect(m).toMatchObject({ linesSubtotal: 200, goodsTotal: 200, freight: null, freightStatus: 'quote_required', totalWithFreight: null, vat: null, couponDiscount: null, unexplainedDifference: null });
        expect(m).toMatchObject({ supplierNet: 80, markupOnRecordedLines: 20, linesWithNet: 1, linesWithoutNet: 1 });
    });
    it('adds the delivery charge only when it is recorded, and derives a coupon discount only when a code is recorded', () => {
        const m = moneySummary({ totalAmount: 180, shippingCost: 35.5, coupon: 'WELCOME10', freightStatus: 'priced' }, lines);
        expect(m).toMatchObject({ couponDiscount: 20, goodsTotal: 180, freight: 35.5, freightStatus: 'priced', totalWithFreight: 215.5 });
        const set = moneySummary({ totalAmount: 200, shippingCost: 50, coupon: null, freightStatus: 'quote_required' }, lines);
        expect(set.freightStatus).toBe('set_by_atlantis');
        const odd = moneySummary({ totalAmount: 190, shippingCost: null, coupon: null, freightStatus: null }, lines);
        expect(odd).toMatchObject({ couponDiscount: null, unexplainedDifference: 10 });
    });
    it('no supplier prices recorded → no net and no markup (never 0)', () => {
        const m = moneySummary({ totalAmount: 100, shippingCost: null, coupon: null, freightStatus: null }, [{ quantity: 1, price: 100, supplierUnitPrice: null }]);
        expect(m.supplierNet).toBeNull();
        expect(m.markupOnRecordedLines).toBeNull();
    });
});

describe('status options', () => {
    it('lists the transitions the server accepts, with the workflow reason when blocked', () => {
        const pending = statusOptions({ status: 'PENDING', reviewStatus: 'PENDING_REVIEW', termsVersion: 1 }, ORDER_TRANSITIONS as any);
        expect(pending.find((o) => o.to === 'PROCESSING')!.blocker).toMatch(/Ali FMCG approval/);
        expect(pending.find((o) => o.to === 'CANCELLED')!.blocker).toBeNull();
        const legacy = statusOptions({ status: 'PENDING', reviewStatus: 'LEGACY', termsVersion: 1 }, ORDER_TRANSITIONS as any);
        expect(legacy.every((o) => o.blocker === null)).toBe(true);
        const buyer = statusOptions({ status: 'PROCESSING', reviewStatus: 'APPROVED', termsVersion: 2, buyerAcceptedVersion: 1 }, ORDER_TRANSITIONS as any);
        expect(buyer.find((o) => o.to === 'SHIPPED')!.blocker).toMatch(/buyer/);
        expect(statusOptions({ status: 'DELIVERED', reviewStatus: 'APPROVED', termsVersion: 1 }, ORDER_TRANSITIONS as any)).toEqual([]);
    });
});

describe('timeline', () => {
    const base = {
        createdAt: '2026-10-01T09:00:00.000Z',
        history: [
            { createdAt: '2026-10-01T09:00:00.100Z', previousStatus: null, newStatus: 'PENDING', reason: 'Order created', actor: 'Buyer Co' },
            { createdAt: '2026-10-03T12:00:00.000Z', previousStatus: 'PENDING', newStatus: 'PROCESSING', reason: 'Approved by Ali FMCG', actor: 'Admin' },
            { createdAt: '2026-10-04T08:00:00.000Z', previousStatus: 'PROCESSING', newStatus: 'PROCESSING', reason: 'Inspection recorded: passed', actor: 'Admin' },
        ],
        confirmations: [{ supplier: 'Supplier A', termsVersion: 1, status: 'ACCEPTED', requestedAt: '2026-10-01T09:00:00.200Z', decidedAt: '2026-10-02T10:00:00.000Z', note: null }],
        review: { status: 'APPROVED', at: '2026-10-03T12:00:00.000Z', note: 'ok', actor: 'Admin' },
        buyerAccepted: { at: null, version: null },
        inspections: [{ status: 'PASSED', inspectedAt: '2026-10-04T07:00:00.000Z', createdAt: '2026-10-04T08:00:00.000Z', inspectorName: 'J. Doe' }],
        shipment: null, paidAt: null, card: null,
        invoices: [{ invoiceNumber: 'INV-1', createdAt: '2026-10-03T12:00:01.000Z', paidAt: null }],
        disputes: [],
    };
    it('merges every dated record oldest first and folds the creation row into "created"', () => {
        const t = buildTimeline(base);
        expect(t.map((e) => e.kind)).toEqual(['CREATED', 'CONFIRMATION_REQUESTED', 'CONFIRMATION_DECIDED', 'STATUS', 'REVIEWED', 'INVOICE_ISSUED', 'INSPECTION', 'NOTE']);
        expect(t.find((e) => e.kind === 'STATUS')).toMatchObject({ from: 'PENDING', status: 'PROCESSING', actor: 'Admin' });
        expect(t.find((e) => e.kind === 'CONFIRMATION_DECIDED')).toMatchObject({ supplier: 'Supplier A', status: 'ACCEPTED' });
    });
    it('leaves out what has no timestamp (no paid date, no capture date)', () => {
        const t = buildTimeline({ ...base, card: { capturedAt: null, releasedAt: null }, paidAt: null });
        expect(t.some((e) => e.kind === 'CARD_CAPTURED' || e.kind === 'PAYMENT_MARKED_PAID' || e.kind === 'INVOICE_PAID')).toBe(false);
    });
});

describe('detail helpers', () => {
    it('drops internal variant keys', () => {
        expect(cleanVariants({ Size: 'L', __translations: { ar: {} }, Pack: 12 })).toEqual({ Size: 'L', Pack: '12' });
        expect(cleanVariants(null)).toBeNull();
        expect(cleanVariants({ __x: 1 })).toBeNull();
    });
    it('staff without net access never receive supplier net prices, the markup or the fee split', () => {
        const d = redactNet({
            netVisible: true,
            lines: [{ id: 'i1', unitPrice: 50, supplierUnitPrice: 40, supplierLineTotal: 80 }],
            money: { goodsTotal: 100, supplierNet: 80, markupOnRecordedLines: 20, linesWithNet: 1, linesWithoutNet: 0 },
            payment: { status: 'PAID', card: { amount: 100, platformFee: 10, supplierAmount: 90 } },
            workflow: { terms: { lines: [{ name: 'x', unitPrice: 50, supplierUnitPrice: 40 }] }, submittedTerms: { lines: [{ supplierUnitPrice: 41 }] } },
        });
        const s = JSON.stringify(d);
        expect(s).not.toContain('supplierUnitPrice');
        expect(s).not.toContain('supplierLineTotal');
        expect(d.netVisible).toBe(false);
        expect(d.money).toMatchObject({ goodsTotal: 100, supplierNet: null, markupOnRecordedLines: null });
        expect(d.payment.card).toMatchObject({ amount: 100, platformFee: null, supplierAmount: null });
        expect(d.lines[0]).toEqual({ id: 'i1', unitPrice: 50 });
    });
});

describe('loads', () => {
    const line = (o: Record<string, any>) => ({ id: 'i', tier: 'pallet', quantity: 2, lineTotal: 200, supplierLineTotal: 160, mixedLoadId: null, mixedLoad: null, mixComposition: null, supplier: null, ...o });
    it('reads a server-validated mixed load: the stored contents are buyer prices; supplier net is not recorded', () => {
        // priceLoad stores buyer-priced lines (mix markup applied), e.g. 400 cases × €14.26 = €5,704.
        const comp = normaliseComposition([
            { productId: 'p1', name: 'Choco cake', variant: 'Flavour=Diet', quantity: 5, unit: 'pallet', cases: 400, unitPrice: 14.26, lineSubtotal: 5704 },
            { productId: 'p2', name: 'Wafer', quantity: 5, unit: 'pallet', cases: 400, unitPrice: 9.2, lineSubtotal: 3680, discountPercent: 5 },
        ], { mixedLoad: true, tier: 'truck', buyerTotal: 9384 })!;
        expect(comp[0]).toMatchObject({ variant: 'Flavour=Diet', quantity: 5, unit: 'pallet', cases: 400, unitPrice: 14.26, lineTotal: 5704, supplierUnitPrice: null, supplierLineTotal: null });
        expect(comp[1]).toMatchObject({ discountPercent: 5, lineTotal: 3680 });
        expect(comp[0].lineTotal! + comp[1].lineTotal!).toBeCloseTo(9384, 2);
        const [load] = buildLoads([line({ id: 'm1', tier: 'truck', quantity: 1, lineTotal: 9384, supplierLineTotal: null, mixedLoadId: 'L1', mixedLoad: { id: 'L1', kind: 'TRUCK' }, mixComposition: comp })]);
        expect(load).toMatchObject({ lineId: 'm1', type: 'MIXED_LOAD', mixedKind: 'TRUCK', loadRecordFound: true, entries: 2, buyerTotal: 9384, supplierNet: null });
    });
    it('reads the legacy variant mix: no unit recorded, so the unit comes from how the composer filled the tier', () => {
        const truck = normaliseComposition([{ signature: 'Flavour=Diet', quantity: 4, unitPrice: 500 }, { signature: 'Flavour=Regular', quantity: 6, unitPrice: 450 }], { mixedLoad: false, tier: 'truck', buyerTotal: 4700 })!;
        expect(truck[0]).toMatchObject({ variant: 'Flavour=Diet', unit: 'pallet', cases: null, unitPrice: 500, lineTotal: 2000, supplierLineTotal: null });
        const pallet = normaliseComposition([{ signature: 'A', quantity: 20, unitPrice: 9 }], { mixedLoad: false, tier: 'pallet', buyerTotal: 180 })!;
        expect(pallet[0]).toMatchObject({ unit: 'case', cases: 20, lineTotal: 180 });
        const [load] = buildLoads([line({ tier: 'truck', quantity: 1, lineTotal: 4700, supplierLineTotal: null, mixComposition: truck })]);
        expect(load).toMatchObject({ type: 'VARIANT_MIX', mixedKind: 'TRUCK', loadRecordFound: null, entries: 2, supplierNet: null });
    });
    it('keeps missing apart from zero, and a recorded supplier price on the order line still counts', () => {
        const comp = normaliseComposition([{ productId: 'p1', quantity: 3, unit: 'case' }, { productId: 'p2', quantity: 0, unit: 'case', unitPrice: 0, lineSubtotal: 0 }], { mixedLoad: true, tier: 'pallet', buyerTotal: 100 })!;
        expect(comp[0]).toMatchObject({ unitPrice: null, lineTotal: null });
        expect(comp[1]).toMatchObject({ quantity: 0, unitPrice: 0, lineTotal: 0 });
        const [gone] = buildLoads([line({ mixedLoadId: 'gone', mixedLoad: null, tier: 'truck', supplierLineTotal: null, mixComposition: comp })]);
        expect(gone).toMatchObject({ type: 'MIXED_LOAD', mixedKind: 'TRUCK', loadRecordFound: false, supplierNet: null });
        const [recorded] = buildLoads([line({ mixedLoadId: 'L', mixedLoad: { id: 'L', kind: 'PALLET' }, supplierLineTotal: 90, mixComposition: comp })]);
        expect(recorded.supplierNet).toBe(90);
        expect(normaliseComposition(null, { mixedLoad: false, tier: null, buyerTotal: 1 })).toBeNull();
        expect(normaliseComposition([], { mixedLoad: false, tier: null, buyerTotal: 1 })).toBeNull();
    });
    it('several products are never called a mixed load: each standard line is its own entry', () => {
        const loads = buildLoads([line({ id: 'a', tier: 'truck', quantity: 1 }), line({ id: 'b', tier: 'case', quantity: 40, lineTotal: 400, supplierLineTotal: null }), line({ id: 'c', tier: null })]);
        expect(loads.map((l) => [l.type, l.mixedKind, l.tier])).toEqual([['STANDARD', null, 'truck'], ['STANDARD', null, 'case'], ['STANDARD', null, null]]);
        const t = loadTotals(loads);
        expect(t).toMatchObject({ loads: 3, mixedLoads: 0, variantMixes: 0, standardLines: 3, buyerTotal: 800, supplierNet: null, loadsWithoutNet: 1 });
        expect(loadTotals(buildLoads([line({})]))).toMatchObject({ buyerTotal: 200, supplierNet: 160, loadsWithoutNet: 0 });
        expect(loadTotals([])).toMatchObject({ loads: 0, buyerTotal: 0, supplierNet: null });
    });
    it('redaction removes supplier values inside mixed loads and on the loads too', () => {
        const comp = normaliseComposition([{ productId: 'p1', quantity: 1, unit: 'case', unitPrice: 12, lineSubtotal: 12 }], { mixedLoad: true, tier: 'pallet', buyerTotal: 12 });
        const loads = buildLoads([line({ mixedLoadId: 'L', mixedLoad: { id: 'L', kind: 'PALLET' }, supplierLineTotal: 10, mixComposition: comp })]);
        const d = redactNet({ netVisible: true, lines: [{ id: 'i', unitPrice: 12, supplierUnitPrice: null, mixComposition: comp }], loads, loadTotals: loadTotals(loads), money: {} });
        const s = JSON.stringify(d);
        expect(s).not.toContain('supplierUnitPrice');
        expect(s).not.toContain('supplierLineTotal');
        expect(d.loads[0].supplierNet).toBeNull();
        expect(d.loadTotals.supplierNet).toBeNull();
        expect(d.lines[0].mixComposition[0]).toMatchObject({ lineTotal: 12, unitPrice: 12 });
    });
});
