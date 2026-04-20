'use client';

import React, { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, AlertCircle, CreditCard } from 'lucide-react';
import { formatPrice } from '@/lib/currency';

interface Props {
  orderId: string;
  totalAmount: number;
  clientSecret?: string;
}

export default function PaymentForm({ orderId, totalAmount }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Diagnosing silent rendering failures
  const [isElementReady, setIsElementReady] = useState(false);
  const [showDiagnosticWarning, setShowDiagnosticWarning] = useState(false);
  const [stripeMountError, setStripeMountError] = useState<string | null>(null);

  React.useEffect(() => {
    // If Stripe iframe doesn't mount within 5 seconds, it probably crashed silently due to Key mismatch
    const timer = setTimeout(() => {
      if (!isElementReady) {
        setShowDiagnosticWarning(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [isElementReady]);

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const isLiveKey = publishableKey.startsWith('pk_live_');

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

        {/* Diagnostics Box when Stripe fails silently */}
        {showDiagnosticWarning && !isElementReady && (
            <div className="mb-6 p-4 rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div className="text-sm">
                        <p className="font-bold text-base mb-1">Payment Fields Failed to Mount</p>
                        <p className="mb-2">Stripe's Elements library is refusing to render the card inputs. This typically happens because:</p>
                        <ul className="list-disc pl-5 space-y-1 mb-3 text-xs leading-relaxed">
                            <li><strong>Incompatible Config:</strong> The PaymentIntent (currency/amount/methods) is incompatible with your Stripe Account permissions.</li>
                            <li><strong>Key Mismatch:</strong> Your Backend Secret Key environment (Test vs Live) doesn't perfectly match the Frontend Publishable Key.</li>
                            <li><strong>Ad-Blockers:</strong> The browser is actively blocking Stripe's JavaScript.</li>
                        </ul>
                        <p className="font-semibold text-xs text-white bg-red-500/20 p-2 rounded border border-red-500/30">
                            Action required: Check your Browser Console (F12) right now. Stripe usually prints a red explicit "IntegrationError" explaining exactly what parameter it rejected.
                        </p>
                    </div>
                </div>
            </div>
        )}

        {/* Render PaymentElement with onReady hook */}
        <div className={showDiagnosticWarning && !isElementReady ? "opacity-30 pointer-events-none" : ""}>
            <PaymentElement 
                onReady={() => {
                    setIsElementReady(true);
                    setShowDiagnosticWarning(false);
                    setStripeMountError(null);
                }}
                onChange={(event) => {
                    if (event.error) {
                        setStripeMountError(event.error.message);
                    } else {
                        setStripeMountError(null);
                    }
                }}
            />
        </div>
      </div>

      {(errorMessage || stripeMountError) && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{errorMessage || stripeMountError}</p>
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
