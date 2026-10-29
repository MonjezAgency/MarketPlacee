'use client';

import ProductsWorkspace from '@/components/admin/ProductsWorkspace';

/** Products → Supplier Submissions: products suppliers created, reviewed (never edited) by Ali FMCG. */
export default function SupplierSubmissionsPage() {
    return <ProductsWorkspace scope="submissions" />;
}
