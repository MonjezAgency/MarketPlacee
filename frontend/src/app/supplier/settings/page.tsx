'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    Camera,
    Save,
    User,
    Mail,
    Phone,
    Lock,
    Eye,
    EyeOff,
    Check,
    AlertCircle,
    Bell,
    CreditCard,
    Building,
    ShieldCheck,
    Activity,
    FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

export default function SupplierSettingsPage() {
    const { user, updateUser } = useAuth();
    const [avatar, setAvatar] = React.useState<string | null>(null);
    const [name, setName] = React.useState(user?.name || 'Vendor');
    const [company, setCompany] = React.useState('Hellenic Beverages Ltd.');
    const [phone, setPhone] = React.useState(user?.phone || '+20 123 456 7890');
    const [email] = React.useState(user?.email || 'vendor@atlantis.com');

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [isSaving, setIsSaving] = React.useState(false);
    const [toast, setToast] = React.useState<{ type: 'success' | 'error', msg: string } | null>(null);

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3000);
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setAvatar(base64String);
                updateUser({ avatar: base64String });
                showToast('success', 'Logo updated!');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        updateUser({ name, phone });

        await new Promise(r => setTimeout(r, 800));
        setIsSaving(false);
        showToast('success', 'Supplier settings updated!');
    };

    return (
        <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-1">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Business Settings</h1>
                <p className="text-muted-foreground font-medium">Manage your vendor profile, company details, and billing.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-8">
                    <form onSubmit={handleSave} className="bg-card shadow-premium border border-border rounded-[32px] p-8 space-y-8">
                        <h3 className="text-sm font-black text-card-foreground uppercase tracking-widest flex items-center gap-2">
                            <Building size={16} className="text-primary" />
                            Company Profile
                        </h3>

                        <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                            <div className="relative group shrink-0">
                                <div className="w-24 h-24 rounded-3xl bg-muted border border-border flex items-center justify-center text-3xl font-black text-primary overflow-hidden">
                                    {avatar ? <img src={avatar} className="w-full h-full object-cover" /> : company[0]}
                                </div>
                                <button type="button" className="absolute -bottom-2 -end-2 w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg">
                                    <Camera size={14} strokeWidth={3} />
                                </button>
                            </div>
                            <div className="space-y-1 flex-1">
                                <p className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em]">Company Logo</p>
                                <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                                    This logo will be visible to all buyers on your product pages.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Company Name</label>
                                <input
                                    type="text"
                                    value={company}
                                    onChange={e => setCompany(e.target.value)}
                                    className="w-full h-14 bg-background rounded-2xl border border-border px-6 outline-none focus:border-primary/50 text-card-foreground font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Representative</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full h-14 bg-background rounded-2xl border border-border px-6 outline-none focus:border-primary/50 text-card-foreground font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Work Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    disabled
                                    className="w-full h-14 bg-muted rounded-2xl border border-border px-6 text-muted-foreground font-medium cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Direct Phone</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    className="w-full h-14 bg-background rounded-2xl border border-border px-6 outline-none focus:border-primary/50 text-card-foreground font-medium"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border flex justify-end">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="h-12 px-8 bg-primary text-primary-foreground font-black text-[11px] uppercase tracking-widest rounded-xl hover:scale-[1.02] transition-all flex items-center gap-2"
                            >
                                {isSaving ? 'Updating...' : <><Save size={14} /> Update Business Profile</>}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="space-y-6">
                    <div className="bg-card shadow-premium border border-border rounded-[32px] p-8 space-y-8 relative overflow-hidden group">
                        {/* High Security Aesthetic Background Glow */}
                        <div className="absolute top-0 end-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -me-20 -mt-20 pointer-events-none" />

                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className="text-sm font-black text-card-foreground uppercase tracking-widest flex items-center gap-2">
                                    <ShieldCheck size={18} className="text-emerald-500" />
                                    Billing & Financials
                                </h3>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Enterprise-Grade Security</p>
                            </div>
                            
                            {/* RBAC Notice */}
                            <div className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-2 min-w-max">
                                <Lock size={12} className="text-primary" />
                                <span className="text-[9px] font-black text-primary uppercase tracking-[0.1em]">Access Restricted</span>
                            </div>
                        </div>

                        {/* Security Badges Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-background border border-border rounded-xl space-y-2">
                                <Lock size={14} className="text-emerald-500" />
                                <p className="text-[10px] font-black text-card-foreground uppercase tracking-widest">AES-256 Encryption</p>
                                <p className="text-[9px] text-muted-foreground font-medium leading-tight">Data secured at rest and in transit.</p>
                            </div>
                            <div className="p-3 bg-background border border-border rounded-xl space-y-2">
                                <Activity size={14} className="text-emerald-500" />
                                <p className="text-[10px] font-black text-card-foreground uppercase tracking-widest">Live Monitoring</p>
                                <p className="text-[9px] text-muted-foreground font-medium leading-tight">Continuous anomaly & fraud detection.</p>
                            </div>
                            <div className="p-3 bg-background border border-border rounded-xl space-y-2">
                                <FileText size={14} className="text-emerald-500" />
                                <p className="text-[10px] font-black text-card-foreground uppercase tracking-widest">PCI-DSS Compliant</p>
                                <p className="text-[9px] text-muted-foreground font-medium leading-tight">Secure tier-1 payment processing standards.</p>
                            </div>
                            <div className="p-3 bg-background border border-border rounded-xl space-y-2">
                                <Check size={14} className="text-emerald-500" />
                                <p className="text-[10px] font-black text-card-foreground uppercase tracking-widest">Strict Access Control</p>
                                <p className="text-[9px] text-muted-foreground font-medium leading-tight">Multi-layered RBAC mechanisms enforced.</p>
                            </div>
                        </div>

                        <div className="relative mt-6">
                            <div className="p-4 bg-muted rounded-2xl border border-border space-y-4">
                                <div className="flex justify-between items-center">
                                    <p className="text-[10px] font-black text-emerald-500/80 uppercase tracking-widest flex items-center gap-1">
                                        <Lock size={10} /> Protected Payout Details
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm font-black text-card-foreground tracking-[0.2em] blur-sm transition-all hover:blur-none cursor-pointer">•••• •••• •••• 9012</p>
                                    <p className="text-[9px] text-muted-foreground mt-1 uppercase">Hover to reveal</p>
                                </div>
                            </div>
                            
                            <Link 
                                href="/supplier/settings/payout"
                                className="w-full h-12 mt-4 bg-secondary text-secondary-foreground flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest rounded-xl border border-border hover:bg-secondary/80 transition-all"
                            >
                                <CreditCard size={14} /> Update Financials Securely
                            </Link>
                        </div>
                    </div>

                    <div className="bg-card shadow-premium border border-border rounded-[32px] p-8 space-y-6">
                        <h3 className="text-sm font-black text-card-foreground uppercase tracking-widest flex items-center gap-2">
                            <Bell size={16} className="text-primary" />
                            Notifications
                        </h3>
                        <div className="flex items-center justify-between group">
                            <p className="text-xs font-black text-card-foreground">Stock Alerts</p>
                            <div className="w-10 h-5 bg-primary/20 rounded-full border border-primary/20 relative cursor-pointer">
                                <div className="absolute top-1 end-1 w-3 h-3 bg-primary rounded-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {toast && (
                <div className="fixed bottom-8 end-8 px-6 py-4 bg-emerald-500 text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-end-4 z-[100]">
                    <Check size={18} />
                    <span className="text-xs font-black uppercase tracking-widest">{toast.msg}</span>
                </div>
            )}
        </div>
    );
}
