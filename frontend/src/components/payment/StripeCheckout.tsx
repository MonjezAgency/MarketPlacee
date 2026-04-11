'use client';

import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
    Elements,
    PaymentElement,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

const API_URL = '/api';

// ─── Inner form (needs to be inside <Elements>) ──────────────────────────────
function PaymentForm({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setIsProcessing(true);
        setErrorMsg('');

        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: `${window.location.origin}/checkout?status=success` },
            redirect: 'if_required',
        });

        if (error) {
            setErrorMsg(error.message || 'Payment failed');
            onError(error.message || 'Payment failed');
            setIsProcessing(false);
        } else {
            onSuccess();
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement
                options={{
                    layout: 'tabs',
                    paymentMethodOrder: ['card', 'apple_pay', 'google_pay'],
                }}
            />
            {errorMsg && (
                <p className="text-red-500 text-xs font-bold bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                    {errorMsg}
                </p>
            )}
            <button
                type="submit"
                disabled={isProcessing || !stripe}
                className="w-full h-14 bg-primary text-white font-black text-base rounded-2xl hover:bg-primary/90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-primary/30"
            >
                {isProcessing ? (
                    <><Loader2 size={20} className="animate-spin" /> Processing...</>
                ) : (
                    <><Lock size={18} /> Pay Securely</>
                )}
            </button>
            <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <ShieldCheck size={12} className="text-emerald-500" />
                <span>256-bit SSL • PCI DSS Compliant • Powered by Stripe</span>
            </div>
        </form>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface StripeCheckoutProps {
    orderId: string;
    amount: number;
    onSuccess: () => void;
    onCancel: () => void;
}

export default function StripeCheckout({ orderId, amount, onSuccess, onCancel }: StripeCheckoutProps) {
    const [clientSecret, setClientSecret] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const createIntent = async () => {
            try {
                const token = localStorage.getItem('bev-token');
                const res = await fetch(`${API_URL}/payments/create-intent`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ orderId }),
                });
                const data = await res.json();
                if (!res.ok) { setError(data.message || 'Could not initialize payment'); return; }
                setClientSecret(data.clientSecret);
            } catch { setError('Connection error'); }
            finally { setIsLoading(false); }
        };
        createIntent();
    }, [orderId]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground font-medium">Initializing secure payment...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8 space-y-3">
                <p className="text-red-500 font-bold text-sm">{error}</p>
                <button onClick={onCancel} className="text-primary text-xs font-black hover:underline">Go Back</button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Amount Header */}
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Amount Due</p>
                    <p className="text-3xl font-black text-primary mt-1">${amount.toFixed(2)}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Order</p>
                    <p className="text-sm font-black">#{orderId.slice(-8).toUpperCase()}</p>
                </div>
            </div>

            {clientSecret && (
                <Elements
                    stripe={stripePromise}
                    options={{
                        clientSecret,
                        appearance: {
                            theme: 'night',
                            variables: {
                                colorPrimary: '#1BC7C9',
                                colorBackground: '#0A1A2F',
                                colorText: '#ffffff',
                                colorDanger: '#FF4D4D',
                                fontFamily: '"Cairo", sans-serif',
                                spacingUnit: '4px',
                                borderRadius: '16px',
                            },
                        },
                    }}
                >
                    <PaymentForm onSuccess={onSuccess} onError={msg => setError(msg)} />
                </Elements>
            )}

            <button
                onClick={onCancel}
                className="w-full text-center text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
                Cancel and go back
            </button>
        </div>
    );
}
