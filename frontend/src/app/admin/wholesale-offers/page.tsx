import { permanentRedirect } from 'next/navigation';

/** Supplier offer review lives at Admin → Offers → Supplier offers. Query parameters (e.g. ?id=, ?status=) are kept. */
export default function WholesaleOffersRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams || {})) {
        if (k === 'tab' || v === undefined) continue;
        for (const one of Array.isArray(v) ? v : [v]) u.append(k, one);
    }
    const qs = u.toString();
    permanentRedirect(qs ? `/admin/offers/supplier?${qs}` : '/admin/offers/supplier');
}
