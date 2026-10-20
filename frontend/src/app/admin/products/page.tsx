import { redirect } from 'next/navigation';

/**
 * /admin/products has no page of its own: Products is a sidebar parent with two
 * routes. Old links (`?tab=catalog`, filters, the overview's earlier links) keep working.
 */
export default function AdminProductsIndex({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams || {})) if (k !== 'tab' && typeof v === 'string') q.set(k, v);
    const dest = searchParams?.tab === 'catalog' ? '/admin/products/catalog' : '/admin/products/submissions';
    redirect(q.toString() ? `${dest}?${q}` : dest);
}
