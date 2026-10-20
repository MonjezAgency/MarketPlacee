import { redirect } from 'next/navigation';

/**
 * Buyers now live in the unified Users directory (/admin/users). Old links keep
 * working: `?focus=<id>` / `?id=<id>` open that account, anything else opens the
 * directory filtered to buyers.
 */
export default function AdminBuyersRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const id = [searchParams?.focus, searchParams?.id].find((v): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v));
    redirect(id ? `/admin/users/${id}` : '/admin/users?role=CUSTOMER');
}
