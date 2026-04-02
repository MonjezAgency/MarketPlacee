'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
    Building2, CreditCard, ShieldCheck, AlertCircle, CheckCircle2,
    Eye, EyeOff, Save, Loader2, Lock, Landmark, ExternalLink, Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

function maskIban(iban: string) {
    if (!iban || iban.length < 8) return iban;
    return iban.slice(0, 4) + ' •••• •••• •••• ' + iban.slice(-4);
}

export default function PaymentMethodsPage() {
    const { user } = useAuth();
    const [kycStatus, setKycStatus] = React.useState<string>('UNVERIFIED');
    const [loadingKyc, setLoadingKyc] = React.useState(true);

    // Bank form state
    const [iban, setIban] = React.useState('');
    const [swiftCode, setSwiftCode] = React.useState('');
    const [bankAddress, setBankAddress] = React.useState('');
    const [showIban, setShowIban] = React.useState(false);
    const [showSwift, setShowSwift] = React.useState(false);

    // Saved state (masked from profile)
    const [savedIban, setSavedIban] = React.useState('');
    const [hasBank, setHasBank] = React.useState(false);
    const [editing, setEditing] = React.useState(false);

    const [saving, setSaving] = React.useState(false);
    const [toast, setToast] = React.useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // Stripe Connect state
    const [connectStatus, setConnectStatus] = React.useState<any>(null);
    const [isConnecting, setIsConnecting] = React.useState(false);

    const token = typeof window !== 'undefined' ? localStorage.getItem('bev-token') : '';
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 4000);
    };

    React.useEffect(() => {
        if (!token) return;
        Promise.all([
            fetch(`${API_URL}/kyc/status`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
            fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
            fetch(`${API_URL}/payments/connect/status`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
        ]).then(([kyc, profile, connect]) => {
            setKycStatus(kyc.kycStatus || 'UNVERIFIED');
            if (profile?.iban) { setSavedIban(maskIban(profile.iban)); setHasBank(true); }
            if (connect) setConnectStatus(connect);
        }).catch(() => {}).finally(() => setLoadingKyc(false));
    }, []);

    const handleStripeConnect = async () => {
        setIsConnecting(true);
        try {
            const res = await fetch(`${API_URL}/payments/connect/onboard`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) { showToast('error', 'Failed to start Stripe Connect onboarding'); return; }
            const { url } = await res.json();
            if (url) window.location.href = url;
        } catch { showToast('error', 'Connection error. Please try again.'); }
        finally { setIsConnecting(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!iban.trim() || !swiftCode.trim()) {
            showToast('error', 'IBAN and SWIFT/BIC are required.');
            return;
        }
        if (!user?.id) return;

        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/users/${user.id}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ iban: iban.trim(), swiftCode: swiftCode.trim(), bankAddress: bankAddress.trim() }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Failed to save payment details');
            }
            setSavedIban(maskIban(iban));
            setHasBank(true);
            setEditing(false);
            setIban('');
            setSwiftCode('');
            setBankAddress('');
            showToast('success', 'Bank account saved securely. Data is encrypted at rest.');
        } catch (err: any) {
            showToast('error', err.message || 'Something went wrong.');
        } finally {
            setSaving(false);
        }
    };

    const kycBlocked = kycStatus !== 'VERIFIED';

    if (loadingKyc) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black">Payment Methods</h1>
                    <p className="text-sm text-muted-foreground">Manage your bank account and payout details</p>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className={cn(
                        "flex items-center gap-3 p-4 rounded-xl text-sm font-bold border",
                        toast.type === 'success'
                            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-50 dark:bg-red-950/30 border-red-200 text-red-700 dark:text-red-400"
                    )}
                >
                    {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    {toast.msg}
                </motion.div>
            )}

            {/* KYC Block */}
            {kycBlocked && (
                <div className="flex items-start gap-4 p-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-2xl">
                    <ShieldCheck className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-black text-amber-800 dark:text-amber-300">
                            {kycStatus === 'PENDING' ? 'KYC Under Review' : 'Identity Verification Required'}
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                            {kycStatus === 'PENDING'
                                ? 'Your documents are under review. Payment methods will be unlocked once verified.'
                                : 'You must complete KYC (identity verification) before adding payment methods.'}
                        </p>
                    </div>
                    {kycStatus !== 'PENDING' && (
                        <Link href="/dashboard/kyc" className="shrink-0 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-colors">
                            Verify Now
                        </Link>
                    )}
                </div>
            )}

            {/* Security Note */}
            <div className="flex items-center gap-3 p-3.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <Lock size={16} className="text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-400 font-bold">
                    All payment data is encrypted with AES-256. Your IBAN and SWIFT are never stored in plain text.
                </p>
            </div>

            {/* Bank Account Card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Landmark size={20} className="text-primary" />
                        </div>
                        <div>
                            <p className="font-black text-sm">Bank Account (Wire Transfer)</p>
                            <p className="text-xs text-muted-foreground">Used for payouts and order settlements</p>
                        </div>
                    </div>
                    {hasBank && !editing && (
                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle2 size={10} /> Saved
                        </span>
                    )}
                </div>

                {hasBank && !editing ? (
                    /* Show masked saved account */
                    <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">IBAN</p>
                                <p className="font-black text-sm font-mono mt-0.5">{savedIban}</p>
                            </div>
                            <Building2 size={18} className="text-muted-foreground" />
                        </div>
                        <button
                            disabled={kycBlocked}
                            onClick={() => setEditing(true)}
                            className="w-full py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Update Bank Details
                        </button>
                    </div>
                ) : (
                    /* Add / Edit form */
                    <form onSubmit={handleSave} className="p-5 space-y-4">
                        {kycBlocked && (
                            <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl">
                                Complete identity verification to add payment methods.
                            </p>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                IBAN *
                            </label>
                            <div className="relative">
                                <input
                                    type={showIban ? 'text' : 'password'}
                                    value={iban}
                                    onChange={e => setIban(e.target.value.toUpperCase().replace(/\s/g, ''))}
                                    placeholder="e.g. EG380019000500000000263180002"
                                    disabled={kycBlocked}
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 text-sm font-mono outline-none focus:border-primary/50 disabled:opacity-50"
                                />
                                <button type="button" onClick={() => setShowIban(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                                    {showIban ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">International Bank Account Number — do not include spaces</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                SWIFT / BIC *
                            </label>
                            <div className="relative">
                                <input
                                    type={showSwift ? 'text' : 'password'}
                                    value={swiftCode}
                                    onChange={e => setSwiftCode(e.target.value.toUpperCase())}
                                    placeholder="e.g. NBEGEGCX"
                                    disabled={kycBlocked}
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 text-sm font-mono outline-none focus:border-primary/50 disabled:opacity-50"
                                />
                                <button type="button" onClick={() => setShowSwift(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                                    {showSwift ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Bank Address (optional)
                            </label>
                            <input
                                type="text"
                                value={bankAddress}
                                onChange={e => setBankAddress(e.target.value)}
                                placeholder="e.g. 123 Bank Street, Cairo, Egypt"
                                disabled={kycBlocked}
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary/50 disabled:opacity-50"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            {editing && (
                                <button type="button" onClick={() => setEditing(false)}
                                    className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors">
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={saving || kycBlocked}
                                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                            >
                                {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Save size={16} /> Save Securely</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Stripe Connect — Automatic Payouts */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#635BFF]/10 flex items-center justify-center">
                            <Zap size={20} className="text-[#635BFF]" />
                        </div>
                        <div>
                            <p className="font-black text-sm">Stripe Payouts (Automatic)</p>
                            <p className="text-xs text-muted-foreground">Receive payments directly after order delivery</p>
                        </div>
                    </div>
                    {connectStatus?.chargesEnabled && (
                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle2 size={10} /> Active
                        </span>
                    )}
                </div>
                <div className="p-5">
                    {connectStatus?.connected && connectStatus?.chargesEnabled ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                    Your Stripe account is connected and ready to receive payouts.
                                </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Payouts are automatically processed after order delivery. Platform fee: {process.env.NEXT_PUBLIC_PLATFORM_FEE || '5'}%.
                            </p>
                        </div>
                    ) : connectStatus?.connected && !connectStatus?.chargesEnabled ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                                <AlertCircle size={16} className="text-yellow-500 shrink-0" />
                                <p className="text-sm font-bold text-yellow-600 dark:text-yellow-400">
                                    Stripe account connected but onboarding incomplete.
                                </p>
                            </div>
                            <button onClick={handleStripeConnect} disabled={isConnecting || kycBlocked}
                                className="w-full py-3 bg-[#635BFF] text-white rounded-xl font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#5851eb] transition-colors">
                                {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                                Complete Stripe Onboarding
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-xs text-muted-foreground">
                                Connect your Stripe account to receive automatic payouts when orders are delivered. Stripe handles all compliance and identity verification.
                            </p>
                            <button onClick={handleStripeConnect} disabled={isConnecting || kycBlocked}
                                className="w-full py-3 bg-[#635BFF] text-white rounded-xl font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#5851eb] transition-colors">
                                {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                                Connect with Stripe
                            </button>
                            {kycBlocked && (
                                <p className="text-[10px] text-muted-foreground text-center">Complete KYC verification first to enable Stripe Connect.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Card Payment placeholder */}
            <div className="bg-card border border-border rounded-2xl p-5 opacity-60">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                        <CreditCard size={20} className="text-muted-foreground" />
                    </div>
                    <div>
                        <p className="font-black text-sm">Credit / Debit Card</p>
                        <p className="text-xs text-muted-foreground">Tokenized via Stripe / Fawry</p>
                    </div>
                    <span className="ml-auto text-[10px] font-black text-muted-foreground bg-muted px-2.5 py-1 rounded-full uppercase tracking-wider">Coming Soon</span>
                </div>
                <p className="text-xs text-muted-foreground">Card payments will be available once our payment gateway integration is complete. Cards are never stored — tokenized only.</p>
            </div>
        </div>
    );
}
