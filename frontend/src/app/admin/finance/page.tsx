import { Suspense } from 'react';
import FinanceWorkspace from '@/components/admin/finance/FinanceWorkspace';

/** Admin → Finance & logistics: invoices, credit terms, tax exemptions, supplier dispatch locations (?tab=). */
export default function AdminFinancePage() {
    return (
        <Suspense fallback={null}>
            <FinanceWorkspace />
        </Suspense>
    );
}
