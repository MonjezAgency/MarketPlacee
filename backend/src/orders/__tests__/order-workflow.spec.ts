import { OrdersService } from '../orders.service';
import { approvalBlocker, buyerMustAccept, confirmationState, supplierView, termsHash, workflowBlocker } from '../order-workflow';

/**
 * The confirmation workflow end to end against an in-memory database:
 * nothing moves forward on the buyer's word, every supplier must accept the
 * exact terms, Atlantis approves, changed terms are confirmed again.
 */
function makeDb() {
    let seq = 0;
    const id = (p: string) => `${p}-${++seq}`;
    const t = { orders: [] as any[], items: [] as any[], confs: [] as any[], history: [] as any[], products: new Map<string, any>(), inspections: [] as any[], hubs: [] as any[] };
    const match = (row: any, where: any): boolean => Object.entries(where || {}).every(([k, v]: [string, any]) => {
        if (k === 'NOT') return !match(row, v);
        if (v && typeof v === 'object' && !(v instanceof Date)) {
            if ('in' in v) return v.in.includes(row[k]);
            if ('lt' in v) return row[k] && new Date(row[k]).getTime() < new Date(v.lt).getTime();
            if (k === 'order') return match(t.orders.find((o) => o.id === row.orderId) || {}, v);
            return match(row[k] || {}, v);
        }
        return row[k] === v;
    });
    const withRel = (o: any) => o && {
        ...o,
        items: t.items.filter((i) => i.orderId === o.id).map((i) => ({ ...i, product: i.productId ? { supplierId: t.products.get(i.productId)?.supplierId, name: t.products.get(i.productId)?.name } : null })),
        confirmations: t.confs.filter((c) => c.orderId === o.id).map((c) => ({ ...c })),
        customer: { id: o.customerId, email: 'b@x.test', name: 'Buyer' },
        inspections: t.inspections.filter((i) => i.orderId === o.id),
    };
    const db: any = {
        t,
        order: {
            findUnique: jest.fn(async ({ where }: any) => withRel(t.orders.find((o) => o.id === where.id)) ?? null),
            findFirst: jest.fn(async ({ where }: any) => withRel(t.orders.find((o) => match(o, where))) ?? null),
            update: jest.fn(async ({ where, data }: any) => { const o = t.orders.find((x) => x.id === where.id); Object.assign(o, data); return withRel(o); }),
            updateMany: jest.fn(async ({ where, data }: any) => { const list = t.orders.filter((o) => match(o, where)); list.forEach((o) => Object.assign(o, data)); return { count: list.length }; }),
        },
        orderItem: {
            findMany: jest.fn(async ({ where }: any) => t.items.filter((i) => match(i, where))),
            update: jest.fn(async ({ where, data }: any) => { const i = t.items.find((x) => x.id === where.id); Object.assign(i, data); return i; }),
        },
        orderSupplierConfirmation: {
            findUnique: jest.fn(async ({ where }: any) => {
                const k = where.orderId_supplierId_termsVersion;
                return t.confs.find((c) => c.orderId === k.orderId && c.supplierId === k.supplierId && c.termsVersion === k.termsVersion) ?? null;
            }),
            findMany: jest.fn(async ({ where }: any) => t.confs.filter((c) => match(c, where))),
            create: jest.fn(async ({ data }: any) => { const c = { id: id('c'), status: 'PENDING', ...data }; t.confs.push(c); return c; }),
            update: jest.fn(async ({ where, data }: any) => { const c = t.confs.find((x) => x.id === where.id); Object.assign(c, data); return c; }),
            updateMany: jest.fn(async ({ where, data }: any) => { const list = t.confs.filter((c) => match(c, where)); list.forEach((c) => Object.assign(c, data)); return { count: list.length }; }),
        },
        orderStatusHistory: { create: jest.fn(async ({ data }: any) => { t.history.push(data); return data; }) },
        product: { update: jest.fn(async ({ where, data }: any) => { const p = t.products.get(where.id); if (data.stock?.increment) p.stock += data.stock.increment; return p; }) },
        shipment: { findUnique: jest.fn(async () => null), deleteMany: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
        user: { findMany: jest.fn(async () => [{ id: 'sup-a', companyName: 'Alpha' }, { id: 'sup-b', companyName: 'Beta' }]), findUnique: jest.fn(async () => null) },
        appConfig: { findUnique: jest.fn(async () => null) },
        atlantisHub: { findFirst: jest.fn(async ({ where }: any) => t.hubs.find((h) => h.id === where.id) ?? null) },
        orderInspection: {
            create: jest.fn(async ({ data }: any) => { const i = { id: id('insp'), ...data, createdAt: new Date() }; t.inspections.push(i); return i; }),
            findUnique: jest.fn(async ({ where }: any) => t.inspections.find((i) => i.id === where.id) ?? null),
            update: jest.fn(async ({ where, data }: any) => { const i = t.inspections.find((x) => x.id === where.id); Object.assign(i, data); return i; }),
        },
        $transaction: jest.fn(async (fn: any) => fn(db)),
    };
    return db;
}

/** One order with lines from the given suppliers, as create() leaves it. */
function seed(db: any, suppliers: string[], opts: { hoursLeft?: number } = {}) {
    const deadline = new Date(Date.now() + (opts.hoursLeft ?? 72) * 3600_000);
    suppliers.forEach((s, n) => db.t.products.set(`p-${s}`, { id: `p-${s}`, supplierId: s, name: `Biscuits ${n + 1}`, stock: 100 }));
    const order = { id: 'ord-1', customerId: 'buyer', status: 'PENDING', reviewStatus: 'PENDING_REVIEW', termsVersion: 1, totalAmount: 0, shippingCost: null, destinationCountry: 'DE', buyerAcceptedVersion: null, submittedTerms: null, termsSnapshot: null, fulfillment: null };
    db.t.orders.push(order);
    suppliers.forEach((s, n) => {
        db.t.items.push({ id: `it-${s}`, orderId: 'ord-1', productId: `p-${s}`, quantity: 2, price: 1000, supplierUnitPrice: 900, stockCases: 160, selectedTier: 'pallet', productNameSnapshot: `Biscuits ${n + 1}` });
        db.t.confs.push({ id: `c-${s}`, orderId: 'ord-1', supplierId: s, termsVersion: 1, status: 'PENDING', deadline });
    });
    order.totalAmount = suppliers.length * 2000;
    return order;
}

function makeService(db: any) {
    const noop: any = { sendOrderStatusUpdateEmail: jest.fn(async () => {}), sendFeedbackPromptEmail: jest.fn(async () => {}), create: jest.fn(async () => {}), notifyAdmins: jest.fn(async () => {}) };
    const invoices: any = { generateForOrder: jest.fn(async () => null), createFromOrder: jest.fn(async () => null) };
    return { svc: new OrdersService(db, noop, noop, invoices, {} as any, {} as any, {} as any), notify: noop };
}
const code = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e?.response?.code ?? e?.message; } return 'OK'; };

describe('order workflow rules', () => {
    const order = { status: 'PENDING', reviewStatus: 'PENDING_REVIEW', termsVersion: 1, buyerAcceptedVersion: null };
    it('approval waits for every supplier, and stops on a rejection or an expired answer', () => {
        const confs = [{ supplierId: 'a', termsVersion: 1, status: 'ACCEPTED' }, { supplierId: 'b', termsVersion: 1, status: 'PENDING', deadline: new Date(Date.now() + 1e6) }];
        expect(approvalBlocker(order, confirmationState(confs, 1, ['a', 'b']))).toMatch(/Waiting for 1 supplier/);
        expect(approvalBlocker(order, confirmationState([confs[0], { ...confs[1], status: 'ACCEPTED' }], 1, ['a', 'b']))).toBeNull();
        expect(approvalBlocker(order, confirmationState([confs[0], { ...confs[1], status: 'REJECTED' }], 1, ['a', 'b']))).toMatch(/rejected/);
        expect(approvalBlocker(order, confirmationState([confs[0], { ...confs[1], deadline: new Date(Date.now() - 1000) }], 1, ['a', 'b']))).toMatch(/didn’t answer in time/);
        // an acceptance of an older version doesn't count
        expect(approvalBlocker({ ...order, termsVersion: 2 }, confirmationState([{ ...confs[0] }, { ...confs[1], status: 'ACCEPTED' }], 2, ['a', 'b']))).toMatch(/Waiting/);
    });
    it('status changes can’t skip approval; legacy orders keep the old rules', () => {
        expect(workflowBlocker(order, 'PROCESSING')).toMatch(/only by Atlantis approval/);
        expect(workflowBlocker(order, 'PAID')).toMatch(/only by Atlantis approval/);
        expect(workflowBlocker(order, 'PROCESSING', { viaApproval: true })).toBeNull();
        expect(workflowBlocker({ ...order, status: 'PROCESSING', reviewStatus: 'APPROVED', termsVersion: 2 }, 'SHIPPED')).toMatch(/buyer hasn’t accepted/);
        expect(workflowBlocker({ ...order, status: 'PROCESSING', reviewStatus: 'APPROVED', termsVersion: 2, buyerAcceptedVersion: 2 }, 'SHIPPED')).toBeNull();
        expect(workflowBlocker({ ...order, reviewStatus: 'LEGACY' }, 'PROCESSING')).toBeNull();
        expect(workflowBlocker(order, 'CANCELLED')).toBeNull();
    });
    it('the buyer accepts only terms that differ from what they submitted', () => {
        expect(buyerMustAccept({ reviewStatus: 'APPROVED', termsVersion: 1 })).toBe(false);
        expect(buyerMustAccept({ reviewStatus: 'APPROVED', termsVersion: 3, buyerAcceptedVersion: 2 })).toBe(true);
    });
    it('a supplier sees only their own lines at their own prices; any price change changes the terms hash', () => {
        const terms: any = { version: 1, lines: [{ productId: 'p1', name: 'A', tier: 'pallet', quantity: 2, unitPrice: 1000, lineTotal: 2000, supplierId: 'a', supplierUnitPrice: 900 }, { productId: 'p2', name: 'B', tier: 'pallet', quantity: 1, unitPrice: 500, lineTotal: 500, supplierId: 'b', supplierUnitPrice: 450 }], goodsTotal: 2500, freight: { amount: null, status: 'quote_required' }, destinationCountry: 'DE' };
        const v = supplierView(terms, 'a');
        expect(v.lines).toHaveLength(1);
        expect(v.netTotal).toBe(1800);
        expect(JSON.stringify(v)).not.toMatch(/unitPrice|lineTotal|1000|2500/);
        const changed = { ...terms, lines: [{ ...terms.lines[0], quantity: 1 }, terms.lines[1]] };
        expect(termsHash(changed)).not.toBe(termsHash(terms));
    });
});

describe('order workflow service', () => {
    it('a supplier’s acceptance alone confirms nothing; Atlantis approves only when every supplier accepted', async () => {
        const db = makeDb(); seed(db, ['sup-a', 'sup-b']);
        const { svc } = makeService(db);
        await svc.supplierAccept('ord-1', 'sup-a');
        expect(db.t.orders[0].status).toBe('PENDING');
        expect(await code(svc.approveOrder('ord-1', 'admin'))).toBe('CANNOT_APPROVE');
        // a direct status change can't skip the workflow either
        expect(await code(svc.updateStatus('ord-1', 'PROCESSING' as any, 'admin'))).toBe('APPROVAL_REQUIRED');
        await svc.supplierAccept('ord-1', 'sup-b');
        await svc.approveOrder('ord-1', 'admin', 'Checked stock and pricing');
        const o = db.t.orders[0];
        expect(o).toMatchObject({ status: 'PROCESSING', reviewStatus: 'APPROVED', reviewedById: 'admin' });
        expect(o.termsSnapshot).toMatchObject({ version: 1, hash: expect.any(String), lines: expect.arrayContaining([expect.objectContaining({ supplierId: 'sup-a', supplierUnitPrice: 900 })]) });
        expect(await code(svc.supplierAccept('ord-1', 'sup-a'))).toBe('NOT_AWAITING_SUPPLIER');
    });
    it('a supplier can’t answer twice, or after the deadline, or for an order that isn’t theirs', async () => {
        const db = makeDb(); seed(db, ['sup-a']);
        const { svc } = makeService(db);
        expect(await code(svc.supplierAccept('ord-1', 'sup-z'))).toBe('Order not found');
        await svc.supplierAccept('ord-1', 'sup-a');
        expect(await code(svc.supplierAccept('ord-1', 'sup-a'))).toBe('ALREADY_DECIDED');
        const db2 = makeDb(); seed(db2, ['sup-a'], { hoursLeft: -1 });
        expect(await code(makeService(db2).svc.supplierAccept('ord-1', 'sup-a'))).toBe('CONFIRMATION_EXPIRED');
        expect(db2.t.confs[0].status).toBe('EXPIRED');
    });
    it('a rejection cancels a single-supplier order (stock returned) and is recorded on a shared one', async () => {
        const db = makeDb(); seed(db, ['sup-a']);
        const { svc } = makeService(db);
        expect(await code(svc.supplierReject('ord-1', 'sup-a', 'no'))).toBe('REASON_REQUIRED');
        await svc.supplierReject('ord-1', 'sup-a', 'Out of this flavour until March');
        expect(db.t.orders[0]).toMatchObject({ status: 'CANCELLED', reviewStatus: 'REJECTED' });
        expect(db.t.products.get('p-sup-a').stock).toBe(260);

        const db2 = makeDb(); seed(db2, ['sup-a', 'sup-b']);
        const s2 = makeService(db2);
        const r: any = await s2.svc.supplierReject('ord-1', 'sup-a', 'Price changed at the factory');
        expect(r.rejected).toBe(true);
        expect(db2.t.orders[0].status).toBe('PENDING');
        expect(s2.notify.notifyAdmins).toHaveBeenCalledWith('Supplier rejected an order', expect.any(String), 'WARNING', expect.anything());
        expect(await code(s2.svc.approveOrder('ord-1', 'admin'))).toBe('CANNOT_APPROVE');
    });
    it('amending a line creates a new terms version: the changed supplier confirms again, the others carry over', async () => {
        const db = makeDb(); seed(db, ['sup-a', 'sup-b']);
        const { svc } = makeService(db);
        await svc.supplierAccept('ord-1', 'sup-a');
        await svc.supplierAccept('ord-1', 'sup-b');
        expect(await code(svc.amendOrder('ord-1', 'admin', { lines: [{ itemId: 'it-sup-a', quantity: 3 }], reason: 'buyer wants more' }))).toBe('INVALID_QUANTITY');
        await svc.amendOrder('ord-1', 'admin', { lines: [{ itemId: 'it-sup-a', quantity: 1 }], reason: 'Only one pallet available' });
        const o = db.t.orders[0];
        expect(o.termsVersion).toBe(2);
        expect(o.totalAmount).toBe(3000);
        expect(db.t.products.get('p-sup-a').stock).toBe(180); // 80 cases back
        const v2 = db.t.confs.filter((c: any) => c.termsVersion === 2);
        expect(v2.find((c: any) => c.supplierId === 'sup-a').status).toBe('PENDING');
        expect(v2.find((c: any) => c.supplierId === 'sup-b').status).toBe('ACCEPTED');
        expect(await code(svc.approveOrder('ord-1', 'admin'))).toBe('CANNOT_APPROVE');
        await svc.supplierAccept('ord-1', 'sup-a');
        await svc.approveOrder('ord-1', 'admin');
        // terms differ from what the buyer submitted → the buyer accepts before shipping
        expect(await code(svc.updateStatus('ord-1', 'SHIPPED' as any, 'admin'))).toBe('APPROVAL_REQUIRED');
        expect(await code(svc.buyerAcceptTerms('ord-1', 'buyer', 1))).toBe('TERMS_CHANGED');
        expect(await code(svc.buyerAcceptTerms('ord-1', 'someone-else', 2))).toBe('Order not found');
        await svc.buyerAcceptTerms('ord-1', 'buyer', 2);
        expect(await code(svc.updateStatus('ord-1', 'SHIPPED' as any, 'admin'))).toBe('OK');
    });
    it('a buyer-price-only change is a new version for the buyer, but suppliers’ acceptance carries over', async () => {
        const db = makeDb(); seed(db, ['sup-a']);
        const { svc } = makeService(db);
        await svc.supplierAccept('ord-1', 'sup-a');
        await svc.amendOrder('ord-1', 'admin', { lines: [{ itemId: 'it-sup-a', unitPrice: 950 }], reason: 'Price match agreed' });
        expect(db.t.orders[0]).toMatchObject({ termsVersion: 2, totalAmount: 1900 });
        expect(db.t.items[0].supplierUnitPrice).toBe(900); // the supplier's net price never moves
        expect(db.t.confs.find((c: any) => c.termsVersion === 2)).toMatchObject({ status: 'ACCEPTED' });
        await svc.approveOrder('ord-1', 'admin');
        expect(await code(svc.updateStatus('ord-1', 'SHIPPED' as any, 'admin'))).toBe('APPROVAL_REQUIRED');
        expect(await code(svc.amendOrder('ord-1', 'admin', { lines: [{ itemId: 'it-sup-a', unitPrice: 900 }], reason: 'Too late now' }))).toBe('CANNOT_AMEND');
    });
    it('a delivery charge set after approval is a new version the buyer must accept', async () => {
        const db = makeDb(); seed(db, ['sup-a']);
        const { svc } = makeService(db);
        await svc.supplierAccept('ord-1', 'sup-a');
        await svc.approveOrder('ord-1', 'admin');
        await svc.setShipping('ord-1', 'Carrier X', 450, undefined, 'logistics');
        expect(db.t.orders[0]).toMatchObject({ termsVersion: 2, shippingCost: 450 });
        expect(db.t.orders[0].termsSnapshot.freight).toMatchObject({ amount: 450, status: 'set_by_atlantis' });
        // suppliers weren't asked again (their part didn't change): the buyer still sees them as confirmed
        expect(svc.workflowForBuyer({ ...db.t.orders[0], confirmations: db.t.confs })).toMatchObject({ suppliersConfirmed: 1, suppliersTotal: 1, buyerMustAccept: true });
        expect(await code(svc.updateStatus('ord-1', 'SHIPPED' as any, 'admin'))).toBe('APPROVAL_REQUIRED');
        await svc.buyerAcceptTerms('ord-1', 'buyer', 2);
        expect(await code(svc.updateStatus('ord-1', 'SHIPPED' as any, 'admin'))).toBe('OK');
        // the same figure again is not a change
        await svc.setShipping('ord-1', 'Carrier X', 450, undefined, 'logistics');
        expect(db.t.orders[0].termsVersion).toBe(2);
    });
    it('Atlantis can reject, or ask again after a confirmation expired', async () => {
        const db = makeDb(); seed(db, ['sup-a'], { hoursLeft: -1 });
        const { svc } = makeService(db);
        expect(await svc.expireStaleConfirmations()).toBe(1);
        expect(await code(svc.approveOrder('ord-1', 'admin'))).toBe('CANNOT_APPROVE');
        const r: any = await svc.requestReconfirmation('ord-1', 'admin');
        expect(r.requested).toBe(1);
        expect(db.t.confs[0]).toMatchObject({ status: 'PENDING' });
        await svc.rejectOrder('ord-1', 'admin', 'Buyer withdrew the request');
        expect(db.t.orders[0]).toMatchObject({ status: 'CANCELLED', reviewStatus: 'REJECTED' });
    });
    it('legacy orders (placed before the workflow) keep the old supplier confirm', async () => {
        const db = makeDb(); seed(db, ['sup-a']);
        db.t.orders[0].reviewStatus = 'LEGACY';
        await makeService(db).svc.supplierAccept('ord-1', 'sup-a');
        expect(db.t.orders[0].status).toBe('PROCESSING');
    });
    it('the buyer view never carries supplier ids or supplier prices', async () => {
        const db = makeDb(); seed(db, ['sup-a']);
        const { svc } = makeService(db);
        await svc.supplierAccept('ord-1', 'sup-a');
        await svc.approveOrder('ord-1', 'admin');
        const view = svc.workflowForBuyer({ ...db.t.orders[0], confirmations: db.t.confs });
        expect(JSON.stringify(view)).not.toMatch(/sup-a|supplierUnitPrice|900/);
        expect(view).toMatchObject({ reviewStatus: 'APPROVED', suppliersConfirmed: 1, suppliersTotal: 1, buyerMustAccept: false });
    });
    it('inspections are recorded against the order’s own lines, with findings required for a failure', async () => {
        const db = makeDb(); seed(db, ['sup-a']);
        const { svc } = makeService(db);
        expect(await code(svc.saveInspection('ord-1', 'staff', { status: 'FAILED', inspectedAt: '2026-10-10', inspectorName: 'J. Doe' }))).toBe('Record what was found.');
        expect(await code(svc.saveInspection('ord-1', 'staff', { status: 'PASSED', lines: [{ itemId: 'nope', received: 1 }] }))).toBe('An inspected line isn’t on this order.');
        const r: any = await svc.saveInspection('ord-1', 'staff', { status: 'PASSED_WITH_FINDINGS', inspectedAt: '2026-10-10', inspectorName: 'J. Doe', lines: [{ itemId: 'it-sup-a', received: 2 }], findings: [{ type: 'CONDITION', itemId: 'it-sup-a', note: 'Two cartons crushed' }], photos: ['https://cdn.example.com/a.jpg', 'javascript:alert(1)'], resolution: 'ACCEPTED_WITH_DISCOUNT' });
        expect(r).toMatchObject({ status: 'PASSED_WITH_FINDINGS', photos: ['https://cdn.example.com/a.jpg'], lines: [{ ordered: 2, received: 2, name: 'Biscuits 1' }] });
        expect(await code(svc.saveInspection('ord-1', 'staff', { status: 'PASSED', inspectedAt: '2026-10-10', inspectorName: 'X' }, 'other-inspection'))).toBe('Inspection not found');
    });
});
