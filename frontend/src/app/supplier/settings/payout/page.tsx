'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
    ShieldCheck,
    Lock,
    CreditCard,
    ArrowLeft,
    Building2,
    Globe,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ExternalLink,
    Landmark
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Suspense } from 'react';

function PayoutSettingsContent() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const [isLoading, setIsLoading] = React.useState(false);
    const [isOnboarding, setIsOnboarding] = React.useState(false);
    const [status, setStatus] = React.useState<{ type: 'success' | 'error', msg: string } | null>(() => {
        return null;
    });

    // Handle Stripe Connect return URLs
    React.useEffect(() => {
        const successParam = searchParams.get('success');
        const refreshParam = searchParams.get('refresh');
        if (successParam === 'true') {
            setStatus({ type: 'success', msg: 'Stripe account connected successfully! You can now receive payouts.' });
        } else if (refreshParam === 'true') {
            setStatus({ type: 'error', msg: 'Stripe onboarding session expired. Please try connecting again.' });
        }
    }, [searchParams]);

    // Form states
    const [formData, setFormData] = React.useState({
        accountHolderName: user?.name || '',
        iban: '',
        swiftCode: '',
        bankName: '',
        countryCode: user?.country || 'US',
        vatNumber: '',
    });

    const [stripeStatus, setStripeStatus] = React.useState<{
        connected: boolean;
        onboarded: boolean;
        accountId: string | null;
    } | null>(null);

    React.useEffect(() => {
        const fetchStripeStatus = async () => {
            try {
                const res = await apiFetch('/payments/connect/status');
                if (res.ok) {
                    const data = await res.json();
                    setStripeStatus(data);
                }
            } catch (err) {
                console.error('Failed to fetch Stripe status');
            }
        };
        fetchStripeStatus();
    }, []);

    const handleOnboardStripe = async () => {
        if (user?.kycStatus !== 'VERIFIED') {
            setStatus({ 
                type: 'error', 
                msg: 'Complete KYC verification before connecting your bank account.' 
            });
            return;
        }

        setIsOnboarding(true);
        setStatus(null);
        try {
            const res = await apiFetch('/payments/connect/onboard', { method: 'POST' });
            if (res.status === 403) {
                setStatus({ type: 'error', msg: 'Complete KYC verification first' });
                return;
            }
            if (!res.ok) {
                throw new Error('Connection failed');
            }
            const { url } = await res.json();
            window.location.href = url;
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message || 'Failed to connect. Try again.' });
        } finally {
            setIsOnboarding(false);
        }
    };

    const handleSubmitSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await apiFetch('/payments/payout-settings', {
                method: 'PATCH',
                body: JSON.stringify(formData),
            });
            if (res.ok) {
                setStatus({ type: 'success', msg: 'Payout settings updated securely.' });
            } else {
                const err = await res.json();
                setStatus({ type: 'error', msg: err.message || 'Update failed.' });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: 'Connection error.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="space-y-4">
                <Link 
                    href="/supplier/settings" 
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-xs font-black uppercase tracking-widest"
                >
                    <ArrowLeft size={14} /> Back to Settings
                </Link>
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Payout & Financials</h1>
                    <p className="text-muted-foreground font-medium">Configure how you receive payments and manage your Stripe Connect account.</p>
                </div>
            </div>

            {status && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                        "p-4 rounded-2xl border flex items-center gap-3",
                        status.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                    )}
                >
                    {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <p className="text-xs font-black uppercase tracking-widest">{status.msg}</p>
                </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-8">
                    {/* Stripe Connect Section */}
                    <div className="bg-card shadow-premium border border-border rounded-[32px] p-8 space-y-8 relative overflow-hidden">
                        <div className="absolute top-0 end-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -me-10 -mt-10" />
                        
                        <div className="space-y-4">
                            <h3 className="text-sm font-black text-card-foreground uppercase tracking-widest flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                    <CreditCard size={16} className="text-indigo-500" />
                                </span>
                                Stripe Connect Status
                            </h3>
                            
                            <div className="p-6 bg-muted/30 rounded-2xl border border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-black text-foreground uppercase text-xs tracking-widest">
                                            {stripeStatus?.connected ? (stripeStatus.onboarded ? 'Connected & Verified' : 'Connection Pending') : 'Not Connected'}
                                        </p>
                                        {stripeStatus?.onboarded ? (
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        ) : stripeStatus?.connected ? (
                                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                                        ) : (
                                            <span className="w-2 h-2 rounded-full bg-red-500" />
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground max-w-sm">
                                        {stripeStatus?.onboarded 
                                            ? `Your Stripe account (${stripeStatus.accountId}) is active. Platform takes 5% commission on all orders.` 
                                            : "Connect your bank account via Stripe Express to receive automated payouts. Platform takes 5% commission."}
                                    </p>
                                </div>
                                
                                <button
                                    onClick={handleOnboardStripe}
                                    disabled={isOnboarding}
                                    className={cn(
                                        "h-12 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shrink-0",
                                        stripeStatus?.connected 
                                            ? "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80" 
                                            : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20"
                                    )}
                                >
                                    {isOnboarding ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                                    {stripeStatus?.connected ? 'Manage Account' : 'Connect Stripe →'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bank Transfer Form */}
                    <form onSubmit={handleSubmitSettings} className="bg-card shadow-premium border border-border rounded-[32px] p-8 space-y-8">
                        <h3 className="text-sm font-black text-card-foreground uppercase tracking-widest flex items-center gap-2">
                             <span className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <Landmark size={16} className="text-emerald-500" />
                            </span>
                            Direct Bank Transfer (Manual Fallback)
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Account Holder Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.accountHolderName}
                                    onChange={e => setFormData({...formData, accountHolderName: e.target.value})}
                                    className="w-full h-14 bg-background rounded-2xl border border-border px-6 outline-none focus:border-primary/50 text-card-foreground font-medium"
                                    placeholder="Full Legal Name"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Bank Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.bankName}
                                    onChange={e => setFormData({...formData, bankName: e.target.value})}
                                    className="w-full h-14 bg-background rounded-2xl border border-border px-6 outline-none focus:border-primary/50 text-card-foreground font-medium"
                                    placeholder="e.g. HSBC"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">IBAN</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.iban}
                                    onChange={e => setFormData({...formData, iban: e.target.value.toUpperCase()})}
                                    className="w-full h-14 bg-background rounded-2xl border border-border px-6 outline-none focus:border-primary/50 text-card-foreground font-medium"
                                    placeholder="EU40 0000 ..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">SWIFT / BIC</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.swiftCode}
                                    onChange={e => setFormData({...formData, swiftCode: e.target.value.toUpperCase()})}
                                    className="w-full h-14 bg-background rounded-2xl border border-border px-6 outline-none focus:border-primary/50 text-card-foreground font-medium"
                                    placeholder="CHAS US 33"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">VAT Number / Tax ID</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.vatNumber}
                                    onChange={e => setFormData({...formData, vatNumber: e.target.value})}
                                    className="w-full h-14 bg-background rounded-2xl border border-border px-6 outline-none focus:border-primary/50 text-card-foreground font-medium"
                                    placeholder="GB12345678"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border flex justify-between items-center">
                            <p className="text-[10px] text-muted-foreground max-w-[250px] font-medium leading-relaxed italic">
                                * Payout details are encrypted with AES-256 before storage.
                            </p>
                            <button
                                type="submit"
                                disabled={isLoading || user?.kycStatus !== 'VERIFIED'}
                                className="h-12 px-8 bg-primary text-primary-foreground font-black text-[11px] uppercase tracking-widest rounded-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                Update Payout Settings
                            </button>
                        </div>
                    </form>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-6">
                    <div className="bg-card shadow-premium border border-border rounded-[32px] p-8 space-y-6">
                        <h3 className="text-sm font-black text-card-foreground uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={18} className="text-emerald-500" />
                            KYC Status
                        </h3>
                        
                        <div className={cn(
                            "p-4 rounded-2xl border space-y-2",
                            user?.kycStatus === 'VERIFIED' ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/20"
                        )}>
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Identity Check</p>
                                {user?.kycStatus === 'VERIFIED' ? (
                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                ) : (
                                    <AlertCircle size={14} className="text-amber-500" />
                                )}
                            </div>
                            <p className="text-[11px] font-bold text-foreground">
                                {user?.kycStatus || 'UNVERIFIED'}
                            </p>
                        </div>

                        {user?.kycStatus !== 'VERIFIED' && (
                            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                                <p className="text-[10px] text-amber-600 font-black uppercase leading-relaxed">
                                    Financial laws require identity verification before we can process payouts. Please complete KYC first.
                                </p>
                                <Link href="/dashboard/kyc" className="inline-block mt-3 text-[10px] font-black text-amber-700 underline underline-offset-4">
                                    GO TO VERIFICATION
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PayoutSettingsPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
        }>
            <PayoutSettingsContent />
        </Suspense>
    );
}
