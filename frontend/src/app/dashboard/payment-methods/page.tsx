'use client';

// Customer payment methods page — re-exports the supplier implementation with customer context
// Customers currently only need bank info for refunds; card tokenization coming in Phase 2

import * as React from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Lock, Landmark, Eye, EyeOff, Save, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const API_URL = '/api';

function maskIban(iban: string) {
    if (!iban || iban.length < 8) return iban;
    return iban.slice(0, 4) + ' •••• •••• •••• ' + iban.slice(-4);
}

export default function CustomerPaymentMethodsPage() {
    const { user } = useAuth();
    const [iban, setIban] = React.useState('');
    const [swiftCode, setSwiftCode] = React.useState('');
    const [showIban, setShowIban] = React.useState(false);
    const [savedIban, setSavedIban] = React.useState('');
    const [hasBank, setHasBank] = React.useState(false);
    const [editing, setEditing] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [toast, setToast] = React.useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    
    const headers = { 'Content-Type': 'application/json' };

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 4000);
    };

    React.useEffect(() => {
        fetch(`${API_URL}/auth/me`, { headers: {  } })
            .then(r => r.json())
            .then(profile => {
                if (profile?.iban) { setSavedIban(maskIban(profile.iban)); setHasBank(true); }
            }).catch(() => {});
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!iban.trim()) { showToast('error', 'IBAN is required.'); return; }
        if (!user?.id) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/users/${user.id}`, {
                method: 'POST', headers,
                body: JSON.stringify({ iban: iban.trim(), swiftCode: swiftCode.trim() }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to save');
            setSavedIban(maskIban(iban));
            setHasBank(true);
            setEditing(false);
            setIban(''); setSwiftCode('');
            showToast('success', 'Bank account saved securely.');
        } catch (err: any) {
            showToast('error', err.message || 'Something went wrong.');
        } finally { setSaving(false); }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 p-6">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black">Payment Methods</h1>
                    <p className="text-sm text-muted-foreground">Manage your bank account for refunds and settlements</p>
                </div>
            </div>

            {toast && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className={cn("flex items-center gap-3 p-4 rounded-xl text-sm font-bold border",
                        toast.type === 'success' ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-50 dark:bg-red-950/30 border-red-200 text-red-700 dark:text-red-400")}>
                    {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    {toast.msg}
                </motion.div>
            )}

            <div className="flex items-center gap-3 p-3.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <Lock size={16} className="text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-400 font-bold">
                    All payment data is encrypted with AES-256. Your IBAN is never stored in plain text.
                </p>
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Landmark size={20} className="text-primary" />
                        </div>
                        <div>
                            <p className="font-black text-sm">Bank Account (Refunds)</p>
                            <p className="text-xs text-muted-foreground">Used for order refunds and credits</p>
                        </div>
                    </div>
                    {hasBank && !editing && (
                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle2 size={10} /> Saved
                        </span>
                    )}
                </div>

                {hasBank && !editing ? (
                    <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">IBAN</p>
                                <p className="font-black text-sm font-mono mt-0.5">{savedIban}</p>
                            </div>
                        </div>
                        <button onClick={() => setEditing(true)} className="w-full py-2.5 border border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors">
                            Update Bank Details
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSave} className="p-5 space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">IBAN *</label>
                            <div className="relative">
                                <input type={showIban ? 'text' : 'password'} value={iban}
                                    onChange={e => setIban(e.target.value.toUpperCase().replace(/\s/g, ''))}
                                    placeholder="e.g. EG380019000500000000263180002"
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 text-sm font-mono outline-none focus:border-primary/50" />
                                <button type="button" onClick={() => setShowIban(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    {showIban ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">SWIFT / BIC (optional)</label>
                            <input type="text" value={swiftCode} onChange={e => setSwiftCode(e.target.value.toUpperCase())}
                                placeholder="e.g. NBEGEGCX"
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-primary/50" />
                        </div>
                        <div className="flex gap-2 pt-2">
                            {editing && <button type="button" onClick={() => setEditing(false)} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors">Cancel</button>}
                            <button type="submit" disabled={saving}
                                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors">
                                {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Save size={16} /> Save Securely</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 opacity-60">
                <div className="flex items-center gap-3 mb-2">
                    <CreditCard size={20} className="text-muted-foreground" />
                    <p className="font-black text-sm">Credit / Debit Card</p>
                    <span className="ml-auto text-[10px] font-black text-muted-foreground bg-muted px-2.5 py-1 rounded-full uppercase">Coming Soon</span>
                </div>
                <p className="text-xs text-muted-foreground">Card tokenization via payment gateway — coming in the next release.</p>
            </div>
        </div>
    );
}
