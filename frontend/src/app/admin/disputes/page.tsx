import { redirect } from 'next/navigation';

/**
 * The Dispute Center now lives in Support HQ (Disputes tab). Old links keep
 * working: `?id=<disputeId>` (or `?dispute=`) opens that dispute; `?status=`
 * is dropped (the tab has its own filters).
 */
export default function AdminDisputesRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const id = [searchParams?.id, searchParams?.dispute].find((v): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v));
    redirect(id ? `/admin/support?tab=disputes&id=${encodeURIComponent(id)}` : '/admin/support?tab=disputes');
}
