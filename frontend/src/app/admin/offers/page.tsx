import { permanentRedirect } from 'next/navigation';

/** Offers is a sidebar parent with two pages; the old tabbed URL (?tab=special) keeps working. */
export default function OffersIndex({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams || {})) {
        if (k === 'tab' || v === undefined) continue;
        for (const one of Array.isArray(v) ? v : [v]) u.append(k, one);
    }
    const tab = Array.isArray(searchParams?.tab) ? searchParams.tab[0] : searchParams?.tab;
    const base = tab === 'special' ? '/admin/offers/special' : '/admin/offers/supplier';
    const qs = u.toString();
    permanentRedirect(qs ? `${base}?${qs}` : base);
}
