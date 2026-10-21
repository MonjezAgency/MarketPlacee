import { permanentRedirect } from 'next/navigation';

/** Special offers live at Admin → Offers → Special offers. Query parameters are kept. */
export default function AdminPromotionsRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams || {})) {
        if (k === 'tab' || v === undefined) continue;
        for (const one of Array.isArray(v) ? v : [v]) u.append(k, one);
    }
    const qs = u.toString();
    permanentRedirect(qs ? `/admin/offers/special?${qs}` : '/admin/offers/special');
}
