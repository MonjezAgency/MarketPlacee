/**
 * Ali FMCG Catalog vs Supplier Submissions — the ONE rule for which side of the
 * admin Products page a product belongs to.
 *
 * Products have no "source" column. What tells the two apart is who owns the
 * row: `Product.supplierId`. Staff accounts (the platform owner and the team,
 * see STAFF_ROLES) create and import products on behalf of Ali FMCG — the
 * controller even re-attributes admin uploads to the platform account
 * (ProductsController.resolvePlatformSupplierId). Everything owned by a
 * non-staff account was submitted by a supplier.
 *
 * Every product is therefore in exactly one scope, so counts never overlap.
 * The same rule is applied here on the server for lists, counts and the
 * Overview; the admin page only displays it.
 */
export const STAFF_ROLES = ['OWNER', 'ADMIN', 'MODERATOR', 'EDITOR', 'DEVELOPER', 'LOGISTICS', 'SUPPORT'] as const;
export const CATALOG_SCOPES = ['catalog', 'submissions'] as const;
export type CatalogScope = (typeof CATALOG_SCOPES)[number];

export const isStaffRole = (role: unknown): boolean => (STAFF_ROLES as readonly string[]).includes(String(role || '').toUpperCase());

/** Which scope a product belongs to, given the role of the account that owns it. */
export function scopeOf(ownerRole: unknown): CatalogScope {
    return isStaffRole(ownerRole) ? 'catalog' : 'submissions';
}

export function parseScope(raw: unknown): CatalogScope | null {
    const s = String(raw || '').toLowerCase();
    return (CATALOG_SCOPES as readonly string[]).includes(s) ? (s as CatalogScope) : null;
}

/** Prisma `where` fragment selecting one scope, given the ids of every staff account. */
export function scopeWhere(scope: CatalogScope, staffIds: string[]): Record<string, unknown> {
    if (scope === 'catalog') return { supplierId: { in: staffIds } };
    return staffIds.length ? { supplierId: { notIn: staffIds } } : {};
}
