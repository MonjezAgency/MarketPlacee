'use client';

import SupportAssistant from '@/components/support/SupportAssistant';

/** Supplier support: the assistant answers from the supplier's own products, stock, prices and orders. */
export default function SupplierSupportPage() {
    return (
        <div className="max-w-5xl mx-auto">
            <SupportAssistant />
        </div>
    );
}
