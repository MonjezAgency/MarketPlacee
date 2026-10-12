/** Pure helpers for shopping lists (kept free of Prisma for testing). */
export type ListTier = 'carton' | 'pallet' | 'truck';
export interface ListLine { productId: string; variantKey: string; selectedVariants: Record<string, string> | null; tier: ListTier; quantity: number }

export const MAX_LIST_ITEMS = 200;
export const MAX_QTY = 100_000;

export function variantKeyOf(v: unknown): string {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
    return Object.entries(v as Record<string, unknown>)
        .filter(([k, val]) => k && val != null && String(val) !== '' && !k.startsWith('__'))
        .map(([k, val]) => `${k}=${String(val)}`)
        .sort()
        .join('|');
}

export function normaliseTier(t: unknown): ListTier {
    const s = String(t || '').toLowerCase();
    if (s === 'truck' || s === 'pallet') return s;
    return 'carton';
}

export function cleanQty(n: unknown): number {
    const q = Math.floor(Number(n));
    if (!Number.isFinite(q) || q < 1) return 0;
    return Math.min(q, MAX_QTY);
}

/** Order lines → list lines. Mixed loads are expanded into their real product lines. Duplicates merge (quantities add). */
export function linesFromOrderItems(items: any[]): ListLine[] {
    const out = new Map<string, ListLine>();
    const push = (l: ListLine) => {
        if (!l.productId || l.quantity < 1) return;
        const k = `${l.productId}::${l.variantKey}::${l.tier}`;
        const prev = out.get(k);
        out.set(k, prev ? { ...prev, quantity: Math.min(MAX_QTY, prev.quantity + l.quantity) } : l);
    };
    for (const it of items || []) {
        const comp = Array.isArray(it?.mixComposition) ? it.mixComposition : null;
        if (comp && comp.length && comp[0]?.productId) {
            for (const c of comp) {
                const sel = typeof c.variant === 'string' && c.variant
                    ? Object.fromEntries(String(c.variant).split('|').map((kv: string) => kv.split('=')).filter((kv: string[]) => kv.length === 2))
                    : null;
                push({ productId: String(c.productId), variantKey: variantKeyOf(sel), selectedVariants: sel, tier: c.unit === 'pallet' ? 'pallet' : 'carton', quantity: cleanQty(c.quantity) });
            }
            continue;
        }
        if (!it?.productId) continue; // deleted product, or a legacy line without one
        const sel = it.selectedVariants && typeof it.selectedVariants === 'object' ? it.selectedVariants : null;
        push({ productId: String(it.productId), variantKey: variantKeyOf(sel), selectedVariants: sel, tier: normaliseTier(it.selectedTier), quantity: cleanQty(it.quantity) });
    }
    return [...out.values()];
}
