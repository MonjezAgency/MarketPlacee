import {
    DEFAULT_LIMIT, MAX_LIMIT, SENSITIVE_USER_FIELDS, USER_LIST_SELECT, USER_SAFE_SELECT,
    countBy, parseUserListQuery, toListRow, toProfile, userListOrderBy, userListWhere,
} from '../admin-users-query';

/** Admin → Users: query parsing, filters, ordering and the field whitelist. */
describe('parseUserListQuery', () => {
    it('defaults to newest first, page 1, 25 per page, no filters', () => {
        expect(parseUserListQuery({})).toEqual({ q: '', role: null, status: null, country: null, kyc: null, sort: 'newest', page: 1, limit: DEFAULT_LIMIT });
    });
    it('accepts canonical enum values case-insensitively and maps BUYER to CUSTOMER', () => {
        const q = parseUserListQuery({ role: 'buyer', status: 'pending_approval', kyc: 'verified', sort: 'NAME', country: ' Romania ' });
        expect(q).toMatchObject({ role: 'CUSTOMER', status: 'PENDING_APPROVAL', kyc: 'VERIFIED', sort: 'name', country: 'Romania' });
        expect(parseUserListQuery({ role: 'SUPPLIER' }).role).toBe('SUPPLIER');
    });
    it('ignores unknown roles, statuses, KYC values and sorts instead of passing them to the database', () => {
        const q = parseUserListQuery({ role: 'SUPERUSER', status: 'APPROVED', kyc: 'MAYBE', sort: 'password' });
        expect(q).toMatchObject({ role: null, status: null, kyc: null, sort: 'newest' });
    });
    it('clamps paging and trims the search text', () => {
        expect(parseUserListQuery({ page: '-3', limit: '5000' })).toMatchObject({ page: 1, limit: MAX_LIMIT });
        expect(parseUserListQuery({ page: 'abc', limit: '0' })).toMatchObject({ page: 1, limit: DEFAULT_LIMIT });
        expect(parseUserListQuery({ page: '3', limit: '10' })).toMatchObject({ page: 3, limit: 10 });
        expect(parseUserListQuery({ q: '  acme  ' }).q).toBe('acme');
        expect(parseUserListQuery({ search: 'legacy' }).q).toBe('legacy');
        expect(parseUserListQuery({ q: 'x'.repeat(500) }).q).toHaveLength(120);
    });
});

describe('userListWhere', () => {
    const and = (w: any) => w.AND as any[];
    it('always hides anonymised (deleted) accounts', () => {
        expect(and(userListWhere(parseUserListQuery({})))).toEqual([{ NOT: { email: { contains: '@removed.invalid' } } }]);
    });
    it('searches name, email and company only (never phone or private fields)', () => {
        const or = and(userListWhere(parseUserListQuery({ q: 'acme' }))).find((c) => c.OR)?.OR;
        expect(or).toEqual([
            { name: { contains: 'acme', mode: 'insensitive' } },
            { email: { contains: 'acme', mode: 'insensitive' } },
            { companyName: { contains: 'acme', mode: 'insensitive' } },
        ]);
    });
    it('combines role, status, country and KYC filters', () => {
        const w = and(userListWhere(parseUserListQuery({ role: 'BUYER', status: 'ACTIVE', country: 'Romania', kyc: 'PENDING' })));
        expect(w).toEqual(expect.arrayContaining([
            { role: 'CUSTOMER' }, { status: 'ACTIVE' }, { country: { equals: 'Romania', mode: 'insensitive' } }, { kycStatus: 'PENDING' },
        ]));
    });
    it('drops exactly one filter for the counts of that dimension', () => {
        const q = parseUserListQuery({ role: 'SUPPLIER', status: 'ACTIVE' });
        expect(and(userListWhere(q, 'role'))).not.toContainEqual({ role: 'SUPPLIER' });
        expect(and(userListWhere(q, 'role'))).toContainEqual({ status: 'ACTIVE' });
        expect(and(userListWhere(q, 'status'))).not.toContainEqual({ status: 'ACTIVE' });
        expect(and(userListWhere(q, 'status'))).toContainEqual({ role: 'SUPPLIER' });
    });
});

describe('userListOrderBy', () => {
    it('orders by the chosen column with a stable tie-breaker', () => {
        expect(userListOrderBy('newest')[0]).toEqual({ createdAt: 'desc' });
        expect(userListOrderBy('oldest')[0]).toEqual({ createdAt: 'asc' });
        expect(userListOrderBy('name')[0]).toEqual({ name: 'asc' });
        expect(userListOrderBy('orders')[0]).toEqual({ customerOrders: { _count: 'desc' } });
        expect(userListOrderBy('products')[0]).toEqual({ products: { _count: 'desc' } });
        for (const s of ['newest', 'oldest', 'name', 'company', 'email', 'orders', 'products'] as const) {
            expect(userListOrderBy(s).at(-1)).toEqual({ id: 'asc' });
        }
    });
});

describe('sensitive fields', () => {
    const full = {
        id: 'u1', name: 'Ana', email: 'ana@acme.test', role: 'CUSTOMER', status: 'ACTIVE', kycStatus: 'VERIFIED', emailVerified: true,
        companyName: 'Acme', country: 'Romania', phone: '+40700000000', createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-02'),
        password: '$2b$10$hash', verificationToken: 'tok', resetPasswordToken: 'reset', resetPasswordExpires: new Date(),
        stripeCustomerId: 'cus_1', stripeAccountId: 'acct_1', twoFactorSecret: 'secret', twoFactorBackupCodes: ['h1'],
        emailOtpCode: '123456', emailVerifyCodeHash: 'hash', pendingEmail: 'new@acme.test', pendingEmailCodeHash: 'hash2',
        iban: 'enc', swiftCode: 'enc', taxId: 'enc', vatNumber: 'enc', bankAddress: 'addr', permissions: ['x'],
        tokensValidAfter: new Date(), notificationPrefs: {}, productTours: {},
        _count: { customerOrders: 4, products: 0, targetPriceRequests: 2 },
    };
    it('the database select never asks for a sensitive column', () => {
        for (const f of SENSITIVE_USER_FIELDS) {
            expect(USER_SAFE_SELECT).not.toHaveProperty(f);
            expect(USER_LIST_SELECT).not.toHaveProperty(f);
        }
    });
    it('profiles and list rows are rebuilt from the whitelist, so stray fields are dropped', () => {
        const json = JSON.stringify([toProfile(full), toListRow(full, 0)]);
        for (const f of SENSITIVE_USER_FIELDS) expect(json).not.toContain(`"${f}"`);
        for (const secret of ['$2b$10$hash', 'cus_1', 'acct_1', 'secret', '123456', 'new@acme.test']) expect(json).not.toContain(secret);
        expect(Object.keys(toProfile(full)).sort()).toEqual(Object.keys(USER_SAFE_SELECT).sort());
    });
});

describe('toListRow activity', () => {
    const base = { id: 'u', name: 'N', email: 'e@x.test', status: 'ACTIVE', kycStatus: 'UNVERIFIED', createdAt: new Date(), updatedAt: new Date() };
    it('buyers show orders placed and target prices; product counts do not apply', () => {
        const r = toListRow({ ...base, role: 'CUSTOMER', _count: { customerOrders: 3, products: 0, targetPriceRequests: 1 } });
        expect(r.activity).toEqual({ orders: 3, targetPrices: 1, products: null, liveProducts: null });
    });
    it('suppliers show products and live products; order counts do not apply', () => {
        const r = toListRow({ ...base, role: 'SUPPLIER', _count: { customerOrders: 0, products: 7, targetPriceRequests: 0 } }, 5);
        expect(r.activity).toEqual({ orders: null, targetPrices: null, products: 7, liveProducts: 5 });
    });
    it('staff accounts show no activity figures', () => {
        expect(toListRow({ ...base, role: 'ADMIN', _count: { customerOrders: 0, products: 2 } }).activity).toEqual({ orders: null, targetPrices: null, products: null, liveProducts: null });
    });
});

describe('countBy', () => {
    it('turns groupBy rows into a map and merges null keys as empty', () => {
        expect(countBy([{ role: 'CUSTOMER', _count: { _all: 3 } }, { role: 'SUPPLIER', _count: { _all: 2 } }], 'role')).toEqual({ CUSTOMER: 3, SUPPLIER: 2 });
        expect(countBy([{ country: null, _count: { _all: 1 } }, { country: null, _count: 2 }], 'country')).toEqual({ '': 3 });
    });
});
