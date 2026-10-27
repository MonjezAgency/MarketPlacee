/**
 * Per-user records (notifications today) addressed by a user id in the URL:
 * the caller may read their own; only Atlantis administrators may read
 * someone else's. Everyone else gets 403 for another user's id.
 */
const READ_ANY = new Set(['ADMIN', 'OWNER']);

export function mayReadUserRecord(viewer: { sub?: string; userId?: string; role?: string } | null | undefined, userId: string): boolean {
    if (!viewer) return false;
    const me = viewer.sub ?? viewer.userId;
    if (me && userId && me === userId) return true;
    return READ_ANY.has(String(viewer.role || '').toUpperCase());
}
