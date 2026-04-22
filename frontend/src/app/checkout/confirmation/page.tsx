'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ShoppingBag, ArrowRight, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCart } from '@/lib/cart';

function ConfirmationContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { clearCart } = useCart();
    const orderId = searchParams.get('orderId');
    
    const [countdown, setCountdown] = useState(15);

    // Clear the cart once order is confirmed
    useEffect(() => {
        if (orderId) {
            clearCart();
        }
    }, [orderId]);

    useEffect(() => {
        if (!orderId) {
            router.replace('/');
            return;
        }

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    router.push('/');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [orderId, router]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="max-w-xl w-full">
                {/* Success Card */}
                <div className="bg-card border border-border rounded-[2rem] p-8 lg:p-12 text-center relative overflow-hidden">
                    {/* Top Gradient Bar */}
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-primary to-secondary"></div>
                    
                    <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-in zoom-in duration-500">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                    </div>

                    <h1 className="text-3xl lg:text-4xl font-black text-foreground mb-4 tracking-tight">
                        Order <span className="text-emerald-500">Received!</span>
                    </h1>
                    
                    <p className="text-muted-foreground mb-4 text-lg">
                        Thank you for your order. We&apos;ve received it successfully.
                    </p>

                    <p className="text-muted-foreground mb-8 text-base leading-relaxed max-w-md mx-auto">
                        A member of our Marketplace team will contact you shortly to confirm details and arrange fulfillment.
                    </p>

                    <div className="inline-flex flex-col items-center gap-2 mb-8 p-4 bg-muted/30 rounded-2xl border border-border w-full">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Order Reference</span>
                        <code className="text-xl font-mono text-primary font-bold">{orderId}</code>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                        <Link href="/" className="w-full">
                            <button className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <ShoppingBag className="w-4 h-4" />
                                <span>Continue Shopping</span>
                            </button>
                        </Link>
                        <Link href="/contact" className="w-full">
                            <button className="w-full py-4 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <Phone className="w-4 h-4" />
                                <span>Contact Us</span>
                            </button>
                        </Link>
                    </div>

                    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-full mx-auto">
                        <Mail className="w-4 h-4 text-emerald-500/50" />
                        <span className="text-xs text-muted-foreground font-medium">We&apos;ll reach out via email or phone</span>
                    </div>
                </div>

                {/* Redirect Notice */}
                <div className="mt-8 text-center">
                    <p className="text-sm text-muted-foreground animate-pulse">
                        Redirecting to homepage in <span className="text-foreground font-bold">{countdown}s</span>...
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function ConfirmationPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <ConfirmationContent />
        </Suspense>
    );
}
