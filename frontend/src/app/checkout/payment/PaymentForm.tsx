'use client';

import React, { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, AlertCircle, CreditCard } from 'lucide-react';
import { formatPrice } from '@/lib/currency';

interface Props {
  orderId: string;
  totalAmount: number;
}

export default function PaymentForm({ orderId, totalAmount }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    // 1. Trigger form validation and wallet collection
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message || 'Validation failed');
      setIsProcessing(false);
      return;
    }

    // 2. Confirm the payment
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/confirmation?orderId=${orderId}`,
        },
        redirect: 'if_required',
      });

      if (error) {
          if (error.type === "card_error" || error.type === "validation_error") {
            setErrorMessage(error.message || 'An error occurred');
          } else {
            setErrorMessage("An unexpected error occurred.");
          }
      } else if (paymentIntent && (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded')) {
          router.push(`/checkout/confirmation?orderId=${orderId}&payment_intent=${paymentIntent.id}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Escrow Banner */}
      <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-green-500 uppercase tracking-tight">Protected by Atlantis Escrow</p>
          <p className="text-xs text-muted-foreground mt-0.5">Your payment is held securely and only released when you confirm delivery.</p>
        </div>
      </div>

      {/* Payment Element - NO overlay blocking the Stripe iframe */}
      <div className="bg-white dark:bg-[#1A2332] border border-border/50 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border/30">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-foreground text-sm uppercase tracking-wider">Enter Payment Details</h3>
        </div>
        <PaymentElement />
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}

      <button
        disabled={isProcessing || !stripe || !elements}
        className="w-full py-4 bg-primary hover:bg-primary/90 disabled:bg-[#21262D] disabled:text-muted-foreground text-[#0D1117] font-bold rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group"
      >
        {isProcessing ? (
          <div className="w-5 h-5 border-2 border-[#0D1117] border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <>
            <Lock className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
            <span>Pay {formatPrice(totalAmount)}</span>
          </>
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3" />
        SSL Secured • Encrypted Payment Processing
      </p>
    </form>
  );
}
