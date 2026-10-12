/** Date windows for the "New offers" filter. All boundaries are UTC. */
export type ListedRange = 'today' | 'week' | 'month';

export function listedSince(range: string | undefined, now = new Date()): Date | null {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (range === 'today') return d;
    if (range === 'week') { d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; } // Monday
    if (range === 'month') { d.setUTCDate(1); return d; }
    return null;
}
