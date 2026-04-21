'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { apiFetch } from '@/lib/api';
import PaymentForm from './PaymentForm';
import OrderSummary from './OrderSummary';
import { ShoppingBag, ShieldCheck, ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Initialize inside component to secure SSR boundary

function PaymentContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const orderId = searchParams.get('orderId');

    const [stripePromise, setStripePromise] = useState<any>(null);
    const [stripeInitError, setStripeInitError] = useState(false);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initialize Stripe JS gracefully strictly in client environment
    useEffect(() => {
        if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
            setStripePromise(loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY));
        } else if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
            console.error('[Stripe Init Error] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing');
            setStripeInitError(true);
        }
    }, []);

    useEffect(() => {
        if (!orderId) {
            setError('No order ID provided');
            setLoading(false);
            return;
        }

        const initializePayment = async () => {
            try {
                const res = await apiFetch('/payments/create-intent', {
                    method: 'POST',
                    body: JSON.stringify({ orderId }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    if (data.message === 'PAYMENT_ALREADY_COMPLETED') {
                        router.replace(`/checkout/confirmation?orderId=${orderId}`);
                        return;
                    }
                    throw new Error(data.message || 'Failed to initialize payment');
                }

                const data = await res.json();
                setClientSecret(data.clientSecret);
                setOrder(data.order);
            } catch (err: any) {
                console.error('Payment initialization error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        initializePayment();
    }, [orderId]);

    if (loading || (!stripePromise && !stripeInitError)) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground animate-pulse">Initializing secure checkout...</p>
                </div>
            </div>
        );
    }

    // Check for Stripe configuration error
    if (stripeInitError) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-card border border-red-500/20 rounded-3xl p-8 text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShoppingBag className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground mb-2">Payment Configuration Error</h1>
                    <p className="text-muted-foreground mb-4">
                        Stripe payment system is not properly configured.
                    </p>
                    <p className="text-xs text-muted-foreground mb-8">
                        ⚠️ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing or invalid.
                    </p>
                    <Link
                        href="/cart"
                        className="inline-flex items-center justify-center w-full py-4 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl transition-all"
                    >
                        Back to Cart
                    </Link>
                </div>
            </div>
        );
    }

    if (error || !clientSecret) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-card border border-red-500/20 rounded-3xl p-8 text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShoppingBag className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground mb-2">Checkout Error</h1>
                    <p className="text-muted-foreground mb-4">{error || 'Could not initialize payment session.'}</p>
                    {!clientSecret && (
                        <p className="text-xs text-muted-foreground mb-8">
                            ⚠️ Debug: clientSecret is missing. Check Backend logs and STRIPE_SECRET_KEY.
                        </p>
                    )}
                    <Link
                        href="/cart"
                        className="inline-flex items-center justify-center w-full py-4 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl transition-all"
                    >
                        Back to Cart
                    </Link>
                </div>
            </div>
        );
    }

    const appearance = isDark
        ? { theme: 'night' as const }
        : { theme: 'stripe' as const };

    return (
        <div className="min-h-screen bg-background">
            {/* Sticky Header */}
            <header className="sticky top-[80px] z-40 bg-background/80 backdrop-blur-md border-b border-border">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/cart" className="text-muted-foreground hover:text-foreground transition-colors">
                            <ShoppingBag className="w-6 h-6" />
                        </Link>
                        <div className="h-4 w-px bg-border"></div>
                        <nav className="hidden md:flex items-center gap-2 text-sm">
                            <Link href="/cart" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                                Cart
                            </Link>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            <Link href={`/checkout?orderId=${orderId}`} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                                Details
                            </Link>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            <span className="text-foreground font-medium">Payment</span>
                        </nav>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-medium text-green-500 uppercase tracking-wider">Secured by Stripe</span>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                    {/* Left Column: Payment Elements */}
                    <div className="lg:col-span-12 xl:col-span-7">
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold text-foreground mb-2">Secure Payment</h1>
                            <p className="text-muted-foreground">Complete your B2B order with full escrow protection.</p>
                        </div>

                        <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
                            <PaymentForm orderId={orderId!} totalAmount={order.totalAmount} clientSecret={clientSecret} />
                        </Elements>
                    </div>

                    {/* Right Column: Summary */}
                    <aside className="lg:col-span-12 xl:col-span-5">
                        <div className="xl:sticky xl:top-32">
                            <OrderSummary order={order} />
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}

export default function PaymentPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <PaymentContent />
        </Suspense>
    );
}
