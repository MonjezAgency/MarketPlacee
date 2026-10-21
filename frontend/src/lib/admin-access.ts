/**
 * Atlantis staff roles → admin pages. Least privilege, mirrored by the backend
 * @Roles decorators (the backend is the authority; this decides what the sidebar
 * shows and which pages render a "no access" state). Backend tests:
 * backend/src/admin/__tests__/rbac-matrix.spec.ts. Team rules: backend/src/admin/staff-access.ts.
 *
 *  OWNER      everything, including the Owner area. Can't be changed from Team.
 *  ADMIN      everything except Owner; manages the team except admins and the owner.
 *  MODERATOR  catalog / product review, wholesale offers review, reviews, KYC documents, homepage content.
 *  SUPPORT    Support HQ conversations; reads orders, users, target prices and disputes to help.
 *             No approvals, prices, finance or team.
 *  EDITOR     homepage content (banners, categories).
 *  DEVELOPER  Support HQ conversations (technical support) and the Tech status page.
 *  LOGISTICS  reads orders, updates shipping and inspections, logistics page, order conversations.
 *  PAIR, SUBLAYER exist in the database enum but nothing uses them: no admin access.
 */
export type StaffRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'SUPPORT' | 'EDITOR' | 'DEVELOPER' | 'LOGISTICS';

export const STAFF_ROLES: StaffRole[] = ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];
/** Roles that can be given through Team (OWNER never; ADMIN by the owner only). */
export const GRANTABLE_ROLES: StaffRole[] = ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];

const OA: StaffRole[] = ['OWNER', 'ADMIN'];
const CATALOG: StaffRole[] = ['OWNER', 'ADMIN', 'MODERATOR'];
const CONTENT: StaffRole[] = ['OWNER', 'ADMIN', 'MODERATOR', 'EDITOR'];
const ORDERS: StaffRole[] = ['OWNER', 'ADMIN', 'SUPPORT', 'LOGISTICS'];
// Support HQ: conversations for OWNER/ADMIN/SUPPORT/DEVELOPER/LOGISTICS; MODERATOR reaches only its KYC review tab there.
const SUPPORT_HQ: StaffRole[] = ['OWNER', 'ADMIN', 'SUPPORT', 'DEVELOPER', 'LOGISTICS', 'MODERATOR'];

/** Sidebar entries (keyed by href) and who sees them. */
export const ADMIN_NAV_ROLES: Record<string, StaffRole[]> = {
    '/admin': OA,
    '/admin/products/catalog': CATALOG,
    '/admin/products/submissions': CATALOG,
    '/admin/orders': ORDERS,
    '/admin/offers': CATALOG,
    '/admin/offers/supplier': CATALOG,
    '/admin/offers/special': OA, // special offers change prices
    '/admin/target-prices': ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT'],
    '/admin/users': ['OWNER', 'ADMIN', 'SUPPORT'],
    '/admin/finance': OA,
    '/admin/newsletter': OA,
    '/admin/email-analytics': OA,
    '/admin/email-setup': OA,
    '/admin/coupons': OA,
    '/admin/placements': OA,
    '/admin/support': SUPPORT_HQ,
    '/admin/team': OA,
    '/admin/settings': OA,
    '/admin/owner': ['OWNER'],
};

/**
 * Every /admin route. Longest matching prefix wins; a prefix matches the path itself
 * and anything below it. Routes not listed are OWNER/ADMIN only (default deny).
 */
const ROUTE_ROLES: [string, StaffRole[]][] = [
    ...Object.entries(ADMIN_NAV_ROLES),
    ['/admin/products', CATALOG], // review list + /admin/products/[id] review
    ['/admin/products/new', OA],
    ['/admin/products/catalog/import', OA],
    ['/admin/offers/new', OA],
    ['/admin/offers/placement-request', OA],
    ['/admin/wholesale-offers', CATALOG], // redirects to /admin/offers
    ['/admin/promotions', OA], // special offers change prices
    ['/admin/buyers', ['OWNER', 'ADMIN', 'SUPPORT']], // redirect to /admin/users
    ['/admin/suppliers', ['OWNER', 'ADMIN', 'SUPPORT']],
    ['/admin/kyc', CATALOG],
    ['/admin/reviews', CATALOG],
    ['/admin/disputes', ['OWNER', 'ADMIN', 'SUPPORT']],
    ['/admin/banners', CONTENT],
    ['/admin/homepage', CONTENT],
    ['/admin/categories', CONTENT],
    ['/admin/terms', OA],
    ['/admin/logistics', ['OWNER', 'ADMIN', 'LOGISTICS']],
    ['/admin/tech', ['OWNER', 'ADMIN', 'DEVELOPER']],
    ['/admin/invite', OA], // redirects to /admin/team
    ['/admin/billing', OA],
    ['/admin/pricing', OA],
    ['/admin/discounts', OA],
    ['/admin/delivery', OA],
    ['/admin/fulfillment', OA],
    ['/admin/security', OA],
    ['/admin/ai-agent', OA],
];

export const normalizeRole = (role: string | null | undefined): string => String(role ?? '').trim().toUpperCase();
export const isStaffRole = (role: string | null | undefined): role is StaffRole => (STAFF_ROLES as string[]).includes(normalizeRole(role));

/** Roles allowed on a path (the most specific rule), or null when no rule matches. */
export function rolesForAdminPath(pathname: string): StaffRole[] | null {
    const path = ('/' + String(pathname || '').split(/[?#]/)[0].replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
    let best: [string, StaffRole[]] | null = null;
    for (const rule of ROUTE_ROLES) {
        const [prefix] = rule;
        const hit = prefix === '/admin' ? path === '/admin' : path === prefix || path.startsWith(prefix + '/');
        if (hit && (!best || prefix.length > best[0].length)) best = rule;
    }
    return best ? best[1] : null;
}

export function canAccessAdminPath(role: string | null | undefined, pathname: string): boolean {
    const r = normalizeRole(role);
    if (!isStaffRole(r)) return false;
    if (r === 'OWNER') return true;
    const roles = rolesForAdminPath(pathname) ?? OA;
    return roles.includes(r as StaffRole);
}

/** Where a staff member lands when /admin itself isn't theirs: their first sidebar entry. */
export function defaultAdminPath(role: string | null | undefined): string | null {
    const r = normalizeRole(role);
    if (!isStaffRole(r)) return null;
    const first = Object.entries(ADMIN_NAV_ROLES).find(([, roles]) => roles.includes(r as StaffRole));
    if (first) return first[0];
    // Roles whose pages aren't sidebar entries (Editor: homepage content, linked from Settings for others).
    const off = ROUTE_ROLES.find(([, roles]) => roles.includes(r as StaffRole));
    return off ? off[0] : null;
}

/** Actions inside pages, for hiding controls the backend would refuse. */
export const ADMIN_ACTION_ROLES = {
    approveOrders: OA,           // approve / reject / amend / request confirmation
    changeOrderStatus: ['OWNER', 'ADMIN', 'LOGISTICS'] as StaffRole[],
    exportOrders: OA,
    reviewProducts: CATALOG,
    reviewOffers: CATALOG,
    manageSpecialOffers: OA,
    answerTargetPrices: OA,
    accountDecisions: OA,        // approve / reject / block / delete accounts
    manageTeam: OA,
    pricing: OA,
} satisfies Record<string, StaffRole[]>;
export type AdminAction = keyof typeof ADMIN_ACTION_ROLES;

export function canDo(role: string | null | undefined, action: AdminAction): boolean {
    const r = normalizeRole(role);
    return r === 'OWNER' || (ADMIN_ACTION_ROLES[action] as string[]).includes(r);
}

/** Roles this viewer may give through Team (matches the backend's grantableBy). */
export function grantableRoles(role: string | null | undefined): StaffRole[] {
    const r = normalizeRole(role);
    if (r === 'OWNER') return [...GRANTABLE_ROLES];
    if (r === 'ADMIN') return GRANTABLE_ROLES.filter((x) => x !== 'ADMIN');
    return [];
}

/**
 * What each role can do, in the order shown on the Team page's permissions summary.
 * Values are dictionary keys in the `adminTeam` locale section.
 */
export const ROLE_CAPABILITY_KEYS: Record<StaffRole, { can: string[]; cannot: string[] }> = {
    OWNER: { can: ['capEverything', 'capOwnerArea', 'capManageAdmins'], cannot: [] },
    ADMIN: { can: ['capOrdersApprove', 'capCatalog', 'capOffers', 'capUsersManage', 'capFinance', 'capCampaigns', 'capSettings', 'capTeamNonAdmin'], cannot: ['capNoOwnerArea', 'capNoAdmins'] },
    MODERATOR: { can: ['capCatalog', 'capOffersReview', 'capReviewsKyc', 'capContent'], cannot: ['capNoOrders', 'capNoPricing', 'capNoFinance', 'capNoTeam'] },
    SUPPORT: { can: ['capSupportHq', 'capReadOrders', 'capReadUsers', 'capReadTargets'], cannot: ['capNoApprovals', 'capNoPricing', 'capNoFinance', 'capNoTeam'] },
    EDITOR: { can: ['capContent'], cannot: ['capNoOrders', 'capNoPricing', 'capNoFinance', 'capNoTeam'] },
    DEVELOPER: { can: ['capSupportHq', 'capTech'], cannot: ['capNoOrders', 'capNoPricing', 'capNoFinance', 'capNoTeam'] },
    LOGISTICS: { can: ['capReadOrders', 'capShipping', 'capOrderChats'], cannot: ['capNoApprovals', 'capNoPricing', 'capNoFinance', 'capNoTeam'] },
};
