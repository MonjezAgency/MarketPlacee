import { redirect } from 'next/navigation';

/**
 * KYC Verification now lives in Support HQ (KYC tab). Old links keep working:
 * `?id=<documentId>` opens that submission, `?user=<userId>` that account's
 * latest submission.
 */
export default function AdminKycRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const ok = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
    const id = ok(searchParams?.id) ? searchParams.id : null;
    const user = ok(searchParams?.user) ? searchParams.user : null;
    const q = new URLSearchParams({ tab: 'kyc' });
    if (id) q.set('id', id as string); else if (user) q.set('user', user as string);
    redirect(`/admin/support?${q.toString()}`);
}
