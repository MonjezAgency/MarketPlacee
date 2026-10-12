'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ListPlus, ArrowRight, Loader2 } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { SaveToListDialog } from '@/components/account/SaveToListDialog';
import { orderRef } from '@/lib/buyer-orders';

function ConfirmationContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { clearCart } = useCart();
    const orderId = searchParams.get('orderId');
    const [saveOpen, setSaveOpen] = useState(false);

    // Clear the cart once the order is confirmed.
    useEffect(() => { if (orderId) clearCart(); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (!orderId) router.replace('/'); }, [orderId, router]);
    if (!orderId) return null;

    return (
        <main className="min-h-[70vh] bg-surface flex items-center justify-center px-4 py-12 text-start">
            <div className="w-full max-w-[520px] rounded-2xl ring-1 ring-line bg-surface shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-6 sm:p-8">
                <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><CheckCircle2 size={24} /></span>
                <h1 className="mt-5 text-[22px] leading-tight font-semibold text-heading">Order received</h1>
                <p className="mt-1.5 text-[14px] text-ink-2">
                    Reference <span className="font-semibold text-ink tabular-nums">{orderRef(orderId)}</span>. Atlantis will confirm quantities and availability with the supplier before dispatch; you’ll see each update in Orders &amp; tracking.
                </p>

                <div className="mt-6 rounded-xl ring-1 ring-line p-4 flex items-start gap-3">
                    <ListPlus size={18} className="text-teal shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-ink">Save these items to a list for next time</p>
                        <p className="text-[13px] text-ink-3">Reorder the same products in a few clicks — prices are refreshed when you do.</p>
                        <button type="button" onClick={() => setSaveOpen(true)} className="mt-2 text-[13.5px] font-semibold text-teal hover:underline">Choose a list</button>
                    </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-2">
                    <Link href={`/dashboard/customer/orders/${orderId}`} className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold">View order <ArrowRight size={15} /></Link>
                    <Link href="/categories" className="flex-1 h-11 inline-flex items-center justify-center rounded-xl ring-1 ring-line-strong text-[14px] font-semibold text-ink hover:bg-surface-2">Continue shopping</Link>
                </div>
            </div>
            <SaveToListDialog orderId={orderId} open={saveOpen} onClose={() => setSaveOpen(false)} />
        </main>
    );
}

export default function ConfirmationPage() {
    return (
        <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center text-ink-3"><Loader2 className="animate-spin" /></div>}>
            <ConfirmationContent />
        </Suspense>
    );
}
