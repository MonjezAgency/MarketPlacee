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
    ChevronRight,
    Activity,
    FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';

export default function SupplierSettingsPage() {
    const { t, locale } = useLanguage();
    const { user, updateUser } = useAuth();
    const [avatar, setAvatar] = React.useState<string | null>(user?.avatar || null);
    const [name, setName] = React.useState(user?.name || '');
    const [company, setCompany] = React.useState(user?.companyName || '');
    const [phone, setPhone] = React.useState(user?.phone || '');
    const [email] = React.useState(user?.email || '');

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
                showToast('success', t('common', 'save') + '!');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        // In a real app, this would be an API call
        await updateUser({ name, phone, companyName: company });

        await new Promise(r => setTimeout(r, 800));
        setIsSaving(false);
        showToast('success', t('settings', 'saveChanges'));
    };

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Context */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                    <Link href="/supplier" className="hover:text-primary transition-colors">{t('navbar', 'supplier')}</Link>
                    <ChevronRight size={10} className={cn("opacity-50", locale === 'ar' && "rotate-180")} />
                    <span className="text-primary">{t('settings', 'title')}</span>
                </div>
                <h1 className="text-4xl font-black text-foreground tracking-tight">{t('settings', 'title')}</h1>
                <p className="text-muted-foreground font-medium text-sm max-w-2xl">{t('supplier', 'performanceMetrics')}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Main Content Area */}
                <div className="lg:col-span-8 space-y-8">
                    <form onSubmit={handleSave} className="bg-card shadow-premium border border-border rounded-[40px] overflow-hidden transition-all hover:shadow-2xl hover:shadow-primary/5">
                        
                        {/* Section 1: Identity */}
                        <div className="px-10 py-8 border-b border-border/50 bg-muted/5">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-sm font-black text-card-foreground uppercase tracking-widest flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Building size={16} className="text-primary" />
                                    </div>
                                    {t('settings', 'globalIdentity')}
                                </h3>
                                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{t('settings', 'verifiedNotice')}</span>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-10 items-start md:items-center p-6 bg-card rounded-3xl border border-border group transition-all hover:border-primary/30">
                                <div className="relative shrink-0">
                                    <div className="w-32 h-32 rounded-[40px] bg-muted border-2 border-border/50 flex items-center justify-center text-4xl font-black text-primary overflow-hidden shadow-inner group-hover:border-primary/50 transition-all">
                                        {avatar ? (
                                            <img src={avatar} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="opacity-40">{company?.[0] || name?.[0] || 'A'}</span>
                                        )}
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="absolute -bottom-2 -end-2 w-10 h-10 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all outline-none border-4 border-card"
                                    >
                                        <Camera size={16} strokeWidth={3} />
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="image/*" 
                                        onChange={handleAvatarChange} 
                                    />
                                </div>
                                <div className="space-y-2 flex-1">
                                    <p className="text-xs font-black text-foreground uppercase tracking-widest">{t('settings', 'companyLogo')}</p>
                                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed max-w-sm">
                                        {t('settings', 'logoDescription')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Business Info */}
                        <div className="p-10 space-y-10">
                            <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-widest border-s-4 border-primary ps-4">
                                {t('settings', 'businessVerification')}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ms-1">{t('settings', 'companyName')}</label>
                                    <div className="relative group/field">
                                        <Building className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within/field:text-primary transition-colors" />
                                        <input
                                            type="text"
                                            value={company}
                                            onChange={e => setCompany(e.target.value)}
                                            className="w-full h-14 bg-muted/30 rounded-2xl border border-border ps-12 pe-6 outline-none focus:bg-card focus:border-primary/50 focus:ring-4 ring-primary/5 text-card-foreground font-bold transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ms-1">{t('settings', 'representative')}</label>
                                    <div className="relative group/field">
                                        <User className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within/field:text-primary transition-colors" />
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            className="w-full h-14 bg-muted/30 rounded-2xl border border-border ps-12 pe-6 outline-none focus:bg-card focus:border-primary/50 focus:ring-4 ring-primary/5 text-card-foreground font-bold transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-widest border-s-4 border-secondary ps-4 pt-4">
                                {t('settings', 'contactAccess')}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ms-1">{t('settings', 'workEmail')}</label>
                                    <div className="relative">
                                        <Mail className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <input
                                            type="email"
                                            value={email}
                                            disabled
                                            className="w-full h-14 bg-muted/20 rounded-2xl border border-border/50 ps-12 pe-6 text-muted-foreground font-bold cursor-not-allowed opacity-60"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ms-1">{t('settings', 'directPhone')}</label>
                                    <div className="relative group/field">
                                        <Phone className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within/field:text-primary transition-colors" />
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            className="w-full h-14 bg-muted/30 rounded-2xl border border-border ps-12 pe-6 outline-none focus:bg-card focus:border-primary/50 focus:ring-4 ring-primary/5 text-card-foreground font-bold transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Form Footer */}
                        <div className="px-10 py-8 bg-muted/10 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4">
                            <p className="text-[10px] text-muted-foreground font-bold max-w-xs text-center md:text-start">
                                {t('settings', 'accessRestricted')}. {t('auth', 'militaryGradeSecurity')}
                            </p>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full md:w-auto h-16 px-12 bg-primary text-primary-foreground rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait transition-all flex items-center justify-center gap-4"
                            >
                                {isSaving ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>{t('common', 'loading')}</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        <span>{t('settings', 'saveChanges')}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Sidebar Context */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Security Card */}
                    <div className="bg-card shadow-premium border border-border rounded-[40px] p-8 space-y-8 relative overflow-hidden group">
                        <div className="absolute top-0 end-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -me-20 -mt-20 pointer-events-none" />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                    <ShieldCheck size={24} className="text-emerald-500" />
                                </div>
                                <div className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-2">
                                    <Lock size={12} className="text-primary" />
                                    <span className="text-[9px] font-black text-primary uppercase tracking-widest">{t('settings', 'accountSecurity')}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-black text-card-foreground tracking-tight">{t('settings', 'financialManagement')}</h3>
                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">{t('settings', 'securityGrade')}</p>
                            </div>
                        </div>

                        {/* Encryption Info */}
                        <div className="space-y-5">
                            <div className="flex items-start gap-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                                <div>
                                    <p className="text-[11px] font-black text-foreground uppercase tracking-widest leading-none mb-1">AES-256 Data Encryption</p>
                                    <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">Multi-layer protection for sensitive banking details.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                                <div>
                                    <p className="text-[11px] font-black text-foreground uppercase tracking-widest leading-none mb-1">Real-time Fraud Detection</p>
                                    <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">Continuous monitoring for anomalous activity.</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-border/50">
                            <Link 
                                href="/supplier/settings/payout"
                                className="w-full h-14 bg-secondary text-secondary-foreground flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest rounded-2xl border border-border/50 hover:bg-secondary/90 hover:shadow-lg transition-all"
                            >
                                <CreditCard size={16} /> {t('settings', 'updateFinancials')}
                            </Link>
                        </div>
                    </div>

                    {/* Quick Settings Card */}
                    <div className="bg-card shadow-premium border border-border rounded-[40px] p-8 space-y-6">
                        <h3 className="text-sm font-black text-card-foreground uppercase tracking-widest flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                <Bell size={16} className="text-orange-500" />
                            </div>
                            {t('admin', 'notifications')}
                        </h3>
                        <div className="space-y-4">
                            {[
                                { label: 'Inventory Alerts', active: true },
                                { label: 'Order Updates', active: true },
                                { label: 'Policy Changes', active: false },
                            ].map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between group cursor-pointer">
                                    <p className="text-xs font-bold text-card-foreground group-hover:text-primary transition-colors">{item.label}</p>
                                    <div className={cn(
                                        "w-10 h-6 rounded-full border transition-all relative",
                                        item.active ? "bg-primary/20 border-primary/20" : "bg-muted border-border"
                                    )}>
                                        <div className={cn(
                                            "absolute top-1 w-3 h-3 rounded-full transition-all",
                                            item.active ? "end-1 bg-primary shadow-lg shadow-primary/50" : "start-1 bg-muted-foreground/50"
                                        )} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Toast Notification */}
            {toast && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    className="fixed bottom-10 end-10 px-8 py-5 bg-card border border-primary/20 shadow-2xl rounded-3xl flex items-center gap-5 z-[999] backdrop-blur-xl"
                >
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">{t('settings', 'systemNotice')}</p>
                        <p className="text-xs font-black text-card-foreground uppercase tracking-wider mt-1">{toast.msg}</p>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

    );
}
