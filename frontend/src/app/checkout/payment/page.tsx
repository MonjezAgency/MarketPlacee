'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { apiFetch } from '@/lib/api';
import PaymentForm from './PaymentForm';
import OrderSummary from './OrderSummary';
import { ShoppingBag, ShieldCheck, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

function PaymentContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderId = searchParams.get('orderId');
    
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    if (loading) {
        return (
            <div className="min-h-screen bg-[#06090B] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground animate-pulse">Initializing secure checkout...</p>
                </div>
            </div>
        );
    }

    if (error || !clientSecret) {
        return (
            <div className="min-h-screen bg-[#06090B] flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-card border border-red-500/20 rounded-3xl p-8 text-center shadow-premium">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShoppingBag className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Checkout Error</h1>
                    <p className="text-muted-foreground mb-8">{error || 'Could not initialize payment session.'}</p>
                    <Link 
                        href="/cart"
                        className="inline-flex items-center justify-center w-full py-4 bg-[#21262D] hover:bg-[#30363D] text-white font-semibold rounded-xl transition-all"
                    >
                        Back to Cart
                    </Link>
                </div>
            </div>
        );
    }

    const appearance = {
        theme: 'night' as const,
        variables: {
            colorPrimary: '#1BC7C9',
            colorBackground: '#0D1117',
            colorText: '#E2E8F0',
            colorDanger: '#EF4444',
            fontFamily: 'system-ui, sans-serif',
            borderRadius: '12px',
        },
    };

    return (
        <div className="min-h-screen bg-[#0D1117]">
            {/* Sticky Header */}
            <header className="sticky top-0 z-50 bg-[#0D1117]/80 backdrop-blur-md border-b border-[#30363D]">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/cart" className="text-muted-foreground hover:text-white transition-colors">
                            <ShoppingBag className="w-6 h-6" />
                        </Link>
                        <div className="h-4 w-px bg-[#30363D]"></div>
                        <nav className="hidden md:flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Cart</span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Details</span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            <span className="text-white font-medium">Payment</span>
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
                            <h1 className="text-3xl font-bold text-white mb-2">Secure Payment</h1>
                            <p className="text-muted-foreground">Complete your B2B order with full escrow protection.</p>
                        </div>
                        
                        <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
                            <PaymentForm orderId={orderId!} totalAmount={order.totalAmount} />
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
            <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <PaymentContent />
        </Suspense>
    );
}
