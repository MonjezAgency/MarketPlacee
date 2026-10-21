/**
 * Tiny in-memory Prisma double for the newsletter specs: just the query
 * shapes the newsletter services use (equality, in, equals/mode insensitive,
 * null, OR-free). No database, no email sent.
 */
type Row = Record<string, any>;

const lc = (v: any) => (typeof v === 'string' ? v.toLowerCase() : v);
function matchField(val: any, cond: any): boolean {
    if (cond === null) return val === null || val === undefined;
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        const ins = cond.mode === 'insensitive';
        if ('in' in cond) return cond.in.some((x: any) => (ins ? lc(x) === lc(val) : x === val));
        if ('notIn' in cond) return !cond.notIn.includes(val);
        if ('equals' in cond) return ins ? lc(cond.equals) === lc(val) : cond.equals === val;
        if ('gt' in cond) return val > cond.gt;
        if ('contains' in cond) return String(val ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
        return true;
    }
    return val === cond;
}
const matches = (row: Row, where: any = {}) => Object.entries(where || {}).every(([k, c]) => k === 'OR' ? (c as any[]).some((w) => matches(row, w)) : matchField(row[k], c));

let seq = 0;
function table(rows: Row[], defaults: () => Row = () => ({})) {
    return {
        rows,
        findMany: jest.fn(async (a: any = {}) => rows.filter((r) => matches(r, a.where)).slice(0, a.take ?? Infinity).map((r) => ({ ...r }))),
        findUnique: jest.fn(async (a: any) => { const r = rows.find((x) => matches(x, a.where)); return r ? { ...r } : null; }),
        findFirst: jest.fn(async (a: any = {}) => { const r = rows.find((x) => matches(x, a.where)); return r ? { ...r } : null; }),
        create: jest.fn(async (a: any) => { const r = { id: `id${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...a.data }; rows.push(r); return { ...r }; }),
        createMany: jest.fn(async (a: any) => { let n = 0; for (const d of a.data) { if (a.skipDuplicates && rows.some((r) => r.campaignId === d.campaignId && r.email === d.email)) continue; rows.push({ id: `id${++seq}`, createdAt: new Date(Date.now() + n), ...defaults(), ...d }); n++; } return { count: n }; }),
        update: jest.fn(async (a: any) => { const r = rows.find((x) => matches(x, a.where)); if (!r) throw new Error('not found'); Object.assign(r, a.data, { updatedAt: new Date() }); return { ...r }; }),
        updateMany: jest.fn(async (a: any) => { const hit = rows.filter((x) => matches(x, a.where)); hit.forEach((r) => Object.assign(r, a.data)); return { count: hit.length }; }),
        upsert: jest.fn(async (a: any) => { const r = rows.find((x) => matches(x, a.where)); if (r) { Object.assign(r, a.update); return { ...r }; } const n = { id: `id${++seq}`, createdAt: new Date(), ...defaults(), ...a.create }; rows.push(n); return { ...n }; }),
        delete: jest.fn(async (a: any) => { const i = rows.findIndex((x) => matches(x, a.where)); const [r] = rows.splice(i, 1); return r; }),
        deleteMany: jest.fn(async (a: any) => { const before = rows.length; for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], a.where)) rows.splice(i, 1); return { count: before - rows.length }; }),
        groupBy: jest.fn(async (a: any) => {
            const out = new Map<string, Row>();
            for (const r of rows.filter((x) => matches(x, a.where))) {
                const key = a.by.map((k: string) => r[k]).join('|');
                if (!out.has(key)) out.set(key, { ...Object.fromEntries(a.by.map((k: string) => [k, r[k] ?? null])), _count: { _all: 0 } });
                out.get(key)!._count._all++;
            }
            return [...out.values()];
        }),
    };
}

export function fakePrisma(seed: { subscribers?: Row[]; users?: Row[]; suppressions?: Row[]; products?: Row[]; campaigns?: Row[] } = {}) {
    return {
        newsletterSubscriber: table(seed.subscribers || [], () => ({ status: 'ACTIVE' })),
        user: table(seed.users || []),
        marketingSuppression: table(seed.suppressions || [], () => ({ liftedAt: null, accountPrefCleared: false })),
        marketingConsentEvent: table([]),
        marketingUnsubscribeToken: table([], () => ({ usedAt: null })),
        campaign: table(seed.campaigns || []),
        campaignRecipient: table([], () => ({ status: 'PENDING', skipReason: null, error: null })),
        emailEvent: table([]),
        product: table(seed.products || []),
        appConfig: table([]),
    };
}
