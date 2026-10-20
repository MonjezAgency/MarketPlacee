import { redirect } from 'next/navigation';

/**
 * Suppliers now live in the unified Users directory (/admin/users). Old links keep
 * working: `?id=<id>` / `?focus=<id>` open that account (its products, review
 * decisions and orders), anything else opens the directory filtered to suppliers.
 */
export default function AdminSuppliersRedirect({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const id = [searchParams?.id, searchParams?.focus].find((v): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v));
    redirect(id ? `/admin/users/${id}` : '/admin/users?role=SUPPLIER');
}
