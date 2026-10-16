'use client';

import SupportCenter from '@/components/support/SupportCenter';

/** Supplier support: the assistant (answers from the supplier's own data) and per-order threads with Atlantis. */
export default function SupplierSupportPage() {
    // Fills the hub's content area: viewport − top bar (4rem) − page padding (3rem) − page header (~6rem).
    return <SupportCenter role="supplier" heightClass="h-[calc(100dvh-17.5rem)] min-h-[26rem] sm:h-[calc(100dvh-13.5rem)] sm:min-h-[34rem]" />;
}
