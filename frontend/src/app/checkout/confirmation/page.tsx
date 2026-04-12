'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ShoppingBag, ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function ConfirmationContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderId = searchParams.get('orderId');
    const paymentIntent = searchParams.get('payment_intent');
    
    const [countdown, setCountdown] = useState(10);

    useEffect(() => {
        if (!orderId) {
            router.replace('/');
            return;
        }

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    router.push(`/dashboard/customer/orders/${orderId}`);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [orderId, router]);

    return (
        <div className="min-h-screen bg-[#0D1117] flex items-center justify-center p-4">
            <div className="max-w-xl w-full">
                {/* Success Card */}
                <div className="bg-[#161B22] border border-[#30363D] rounded-[2rem] p-8 lg:p-12 text-center relative overflow-hidden">
                    {/* Background Glow */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 blur-[120px] -z-10"></div>
                    
                    <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-in zoom-in duration-500">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                    </div>

                    <h1 className="text-4xl lg:text-5xl font-black text-white mb-4 tracking-tight uppercase">
                        Payment <span className="text-primary">Successful!</span>
                    </h1>
                    
                    <p className="text-muted-foreground mb-8 text-lg">
                        Your order has been placed successfully and the funds are held securely.
                    </p>

                    <div className="inline-flex flex-col items-center gap-2 mb-12 p-4 bg-[#0D1117]/50 rounded-2xl border border-[#30363D] w-full">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Order Reference</span>
                        <code className="text-xl font-mono text-primary font-bold">{orderId}</code>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
                        <Link href={`/dashboard/customer/orders/${orderId}`} className="w-full">
                            <button className="w-full py-4 bg-primary hover:bg-primary/90 text-[#0D1117] font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <span>Track Your Order</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </Link>
                        <Link href="/" className="w-full">
                            <button className="w-full py-4 bg-[#21262D] hover:bg-[#30363D] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <ShoppingBag className="w-4 h-4" />
                                <span>Continue Shopping</span>
                            </button>
                        </Link>
                    </div>

                    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500/5 border border-green-500/10 rounded-full inline-flex mx-auto">
                        <ShieldCheck className="w-4 h-4 text-green-500/50" />
                        <span className="text-xs text-muted-foreground font-medium">Funds held in escrow until delivery</span>
                    </div>
                </div>

                {/* Redirect Notice */}
                <div className="mt-8 text-center">
                    <p className="text-sm text-muted-foreground animate-pulse">
                        Redirecting to order dashboard in <span className="text-white font-bold">{countdown}s</span>...
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function ConfirmationPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <ConfirmationContent />
        </Suspense>
    );
}
