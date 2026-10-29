'use client';

import SupportCenter from '@/components/support/SupportCenter';

/** Buyer support inside the account area: the assistant and per-order threads with Ali FMCG. */
export default function BuyerSupportPage() {
    return <SupportCenter role="buyer" heightClass="h-[calc(100dvh-18.5rem)] min-h-[26rem] max-h-[52rem]" />;
}
