import { redirect } from 'next/navigation';

/**
 * Supplier offer review moved to Admin → Offers (tab "Supplier offers").
 * Query parameters (e.g. ?id=, ?status=) are kept; the tab is set here.
 */
export default function WholesaleOffersRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    redirect(offersUrl('supplier', searchParams));
}

function offersUrl(tab: 'supplier' | 'special', searchParams: Record<string, string | string[] | undefined>) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams || {})) {
        if (k === 'tab' || v === undefined) continue;
        for (const one of Array.isArray(v) ? v : [v]) u.append(k, one);
    }
    u.set('tab', tab);
    return `/admin/offers?${u}`;
}
