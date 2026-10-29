import { KYCStatus, Prisma, Role, UserStatus } from '@prisma/client';

/**
 * Admin → Users (GET /admin/users/list, GET /admin/users/:id).
 *
 * Pure rules for the unified user directory: which query parameters are
 * accepted, how they become a Prisma filter and order, and — above all —
 * which user fields may leave the server. Every read selects an explicit
 * whitelist (USER_SAFE_SELECT) and every row is rebuilt from that whitelist
 * (toListRow / toProfile), so passwords, tokens, 2FA secrets and codes,
 * Stripe ids, bank and tax fields can never reach the client, even if a
 * caller passes a full user record by mistake.
 */

/** Fields that must never be returned by the admin user endpoints. */
export const SENSITIVE_USER_FIELDS = [
    'password', 'verificationToken', 'resetPasswordToken', 'resetPasswordExpires',
    'stripeCustomerId', 'stripeAccountId', 'permissions',
    'twoFactorSecret', 'twoFactorBackupCodes', 'emailOtpCode', 'emailOtpExpiry',
    'emailVerifyCodeHash', 'emailVerifyExpiry', 'emailVerifyAttempts', 'emailVerifySentAt',
    'pendingEmail', 'pendingEmailCodeHash', 'pendingEmailExpiry', 'pendingEmailAttempts', 'pendingEmailSentAt',
    'tokensValidAfter', 'iban', 'swiftCode', 'taxId', 'vatNumber', 'bankAddress',
    'notificationPrefs', 'productTours',
] as const;

/** The only user columns the admin user endpoints read. */
export const USER_SAFE_SELECT = {
    id: true, name: true, email: true, emailVerified: true, phone: true, avatar: true,
    companyName: true, website: true, country: true, businessType: true, businessCity: true,
    preferredBrands: true, role: true, status: true, kycStatus: true,
    onboardingCompleted: true, twoFactorEnabled: true, createdAt: true, updatedAt: true,
} as const satisfies Prisma.UserSelect;

const ROLES = Object.values(Role) as string[];
const STATUSES = Object.values(UserStatus) as string[];
const KYC = Object.values(KYCStatus) as string[];
export const USER_SORTS = ['newest', 'oldest', 'name', 'company', 'email', 'orders', 'products'] as const;
export type UserSort = (typeof USER_SORTS)[number];
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;
/** Anonymised (deleted) accounts keep their row for order history but are not users any more. */
export const REMOVED_EMAIL_MARK = '@removed.invalid';

export interface UserListQuery {
    q: string; role: Role | null; status: UserStatus | null; country: string | null; kyc: KYCStatus | null;
    sort: UserSort; page: number; limit: number;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const pick = <T extends string>(v: unknown, allowed: string[]): T | null => {
    const s = str(v).toUpperCase();
    return allowed.includes(s) ? (s as T) : null;
};

/** Normalises raw query parameters. Unknown values are ignored rather than rejected. */
export function parseUserListQuery(raw: Record<string, unknown> = {}): UserListQuery {
    const sort = str(raw.sort).toLowerCase();
    const page = Math.floor(Number(raw.page));
    const limit = Math.floor(Number(raw.limit));
    // "BUYER" is the interface word for the CUSTOMER role.
    const roleRaw = str(raw.role).toUpperCase() === 'BUYER' ? 'CUSTOMER' : raw.role;
    return {
        q: str(raw.q ?? raw.search).slice(0, 120),
        role: pick<Role>(roleRaw, ROLES),
        status: pick<UserStatus>(raw.status, STATUSES),
        country: str(raw.country).slice(0, 80) || null,
        kyc: pick<KYCStatus>(raw.kyc, KYC),
        sort: (USER_SORTS as readonly string[]).includes(sort) ? (sort as UserSort) : 'newest',
        page: Number.isFinite(page) && page > 0 ? page : 1,
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT,
    };
}

/**
 * Prisma filter for the list. `omit` drops one filter, so the role and status
 * counts can show how many rows each choice would return with the other filters kept.
 */
export function userListWhere(q: UserListQuery, omit?: 'role' | 'status' | 'country'): Prisma.UserWhereInput {
    const and: Prisma.UserWhereInput[] = [{ NOT: { email: { contains: REMOVED_EMAIL_MARK } } }];
    if (q.q) {
        and.push({ OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { email: { contains: q.q, mode: 'insensitive' } },
            { companyName: { contains: q.q, mode: 'insensitive' } },
        ] });
    }
    if (q.role && omit !== 'role') and.push({ role: q.role });
    if (q.status && omit !== 'status') and.push({ status: q.status });
    if (q.country && omit !== 'country') and.push({ country: { equals: q.country, mode: 'insensitive' } });
    if (q.kyc) and.push({ kycStatus: q.kyc });
    return { AND: and };
}

export function userListOrderBy(sort: UserSort): Prisma.UserOrderByWithRelationInput[] {
    switch (sort) {
        case 'oldest': return [{ createdAt: 'asc' }, { id: 'asc' }];
        case 'name': return [{ name: 'asc' }, { id: 'asc' }];
        case 'company': return [{ companyName: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }];
        case 'email': return [{ email: 'asc' }, { id: 'asc' }];
        case 'orders': return [{ customerOrders: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'asc' }];
        case 'products': return [{ products: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'asc' }];
        default: return [{ createdAt: 'desc' }, { id: 'asc' }];
    }
}

/** List select: the safe columns plus the activity counts. */
export const USER_LIST_SELECT = {
    ...USER_SAFE_SELECT,
    _count: { select: {
        customerOrders: true,
        products: true,
        targetPriceRequests: true,
    } },
} as const satisfies Prisma.UserSelect;

export type SafeUserFields = { [K in keyof typeof USER_SAFE_SELECT]: unknown };

export interface UserProfile {
    id: string; name: string; email: string; emailVerified: boolean; phone: string | null; avatar: string | null;
    companyName: string | null; website: string | null; country: string | null; businessType: string | null; businessCity: string | null;
    preferredBrands: string[]; role: string; status: string; kycStatus: string;
    onboardingCompleted: boolean; twoFactorEnabled: boolean; createdAt: Date; updatedAt: Date;
}

const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Rebuilds a user from the whitelist only. Anything else on the input is dropped. */
export function toProfile(u: Record<string, any>): UserProfile {
    return {
        id: String(u.id), name: String(u.name ?? ''), email: String(u.email ?? ''), emailVerified: u.emailVerified === true,
        phone: s(u.phone), avatar: s(u.avatar), companyName: s(u.companyName), website: s(u.website), country: s(u.country),
        businessType: s(u.businessType), businessCity: s(u.businessCity),
        preferredBrands: Array.isArray(u.preferredBrands) ? u.preferredBrands.filter((b: unknown) => typeof b === 'string') : [],
        role: String(u.role), status: String(u.status), kycStatus: String(u.kycStatus ?? 'UNVERIFIED'),
        onboardingCompleted: u.onboardingCompleted === true, twoFactorEnabled: u.twoFactorEnabled === true,
        createdAt: u.createdAt, updatedAt: u.updatedAt,
    };
}

export interface UserListRow {
    id: string; name: string; email: string; companyName: string | null; country: string | null; avatar: string | null;
    role: string; status: string; kycStatus: string; emailVerified: boolean; createdAt: Date;
    /** Buyers: orders placed. Suppliers: products (all statuses) and live (approved) products. Null where it doesn't apply. */
    activity: { orders: number | null; products: number | null; liveProducts: number | null; targetPrices: number | null };
}

/** One list row. Activity counts only for the roles they describe. */
export function toListRow(u: Record<string, any>, liveProducts?: number): UserListRow {
    const p = toProfile(u);
    const c = u._count || {};
    const isBuyer = p.role === 'CUSTOMER';
    const isSupplier = p.role === 'SUPPLIER';
    return {
        id: p.id, name: p.name, email: p.email, companyName: p.companyName, country: p.country, avatar: p.avatar,
        role: p.role, status: p.status, kycStatus: p.kycStatus, emailVerified: p.emailVerified, createdAt: p.createdAt,
        activity: {
            orders: isBuyer ? Number(c.customerOrders ?? 0) : null,
            targetPrices: isBuyer ? Number(c.targetPriceRequests ?? 0) : null,
            products: isSupplier ? Number(c.products ?? 0) : null,
            liveProducts: isSupplier ? Number(liveProducts ?? 0) : null,
        },
    };
}

/** groupBy rows → { KEY: count }. */
export function countBy<K extends string>(rows: { _count: { _all: number } | number; [k: string]: any }[], key: K): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows) {
        const k = r[key] == null ? '' : String(r[key]);
        const n = typeof r._count === 'number' ? r._count : r._count?._all ?? 0;
        out[k] = (out[k] || 0) + n;
    }
    return out;
}

/** Product review decisions made by Ali FMCG (not the supplier's own submissions). */
export const REVIEW_DECISION_ACTIONS = ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'STATUS_CHANGED'] as const;
