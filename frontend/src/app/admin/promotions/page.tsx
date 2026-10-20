import { redirect } from 'next/navigation';

/**
 * Special offers moved to Admin → Offers (tab "Special offers").
 * Query parameters (e.g. ?id=) are kept; the tab is set here.
 */
export default function AdminPromotionsRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams || {})) {
        if (k === 'tab' || v === undefined) continue;
        for (const one of Array.isArray(v) ? v : [v]) u.append(k, one);
    }
    u.set('tab', 'special');
    redirect(`/admin/offers?${u}`);
}
