'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
    Camera,
    Save,
    User,
    Lock,
    Eye,
    EyeOff,
    Check,
    AlertCircle,
    Bell,
    Shield,
    Percent,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
export default function AdminSettingsPage() {
    const { user, updateUser } = useAuth();
    const [avatar, setAvatar] = React.useState<string | null>(null);
    const [name, setName] = React.useState(user?.name || 'Admin');
    const [phone, setPhone] = React.useState(user?.phone || '+20 100 000 0000');
    const [email] = React.useState(user?.email || 'admin@atlantis.com');

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [oldPass, setOldPass] = React.useState('');
    const [newPass, setNewPass] = React.useState('');
    const [confirmPass, setConfirmPass] = React.useState('');
    const [showPass, setShowPass] = React.useState(false);

    const [isSaving, setIsSaving] = React.useState(false);
    const [toast, setToast] = React.useState<{ type: 'success' | 'error', msg: string } | null>(null);

    // ── Markup settings ──────────────────────────────────────
    // Stored as multipliers (e.g. 1.10 = 10%). We display as % to the admin.
    const [markupPiece, setMarkupPiece] = React.useState('10');       // default 10%
    const [markupPallet, setMarkupPallet] = React.useState('5');      // default 5%
    const [markupContainer, setMarkupContainer] = React.useState('2'); // default 2%
    const [isLoadingMarkup, setIsLoadingMarkup] = React.useState(true);
    const [isSavingMarkup, setIsSavingMarkup] = React.useState(false);

    React.useEffect(() => {
        apiFetch(`/admin/config/markup`)
            .then(r => r.json())
            .then(data => {
                if (data?.markup) {
                    // Convert multiplier → percentage string: 1.10 → "10"
                    setMarkupPiece(String(Math.round((data.markup.piece - 1) * 100)));
                    setMarkupPallet(String(Math.round((data.markup.pallet - 1) * 100)));
                    setMarkupContainer(String(Math.round((data.markup.container - 1) * 100)));
                }
            })
            .catch(() => {})
            .finally(() => setIsLoadingMarkup(false));
    }, []);

    const handleSaveMarkup = async () => {
        setIsSavingMarkup(true);
        try {
            
            // Convert percentage → multiplier: "10" → 1.10
            const payload = {
                piece:     1 + (parseFloat(markupPiece) || 0) / 100,
                pallet:    1 + (parseFloat(markupPallet) || 0) / 100,
                container: 1 + (parseFloat(markupContainer) || 0) / 100,
            };
            const res = await apiFetch(`/admin/config/markup`, {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            if (res.ok) showToast('success', 'Markup percentages saved. New products will use the updated rates.');
            else showToast('error', 'Failed to save markup settings.');
        } catch (_e) {
            showToast('error', 'Network error. Please try again.');
        } finally {
            setIsSavingMarkup(false);
        }
    };
    // ─────────────────────────────────────────────────────────

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
                showToast('success', 'Avatar updated!');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        // Update global auth state
        updateUser({ name, phone });

        // Simulate API call
        await new Promise(r => setTimeout(r, 800));
        setIsSaving(false);
        showToast('success', 'Profile settings updated successfully!');
    };

    return (
        <div className="max-w-4xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="space-y-1">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Account Settings</h1>
                <p className="text-muted-foreground font-medium">Manage your professional profile and security preferences.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Left: Profile Information */}
                <div className="lg:col-span-2 space-y-8">
                    <form onSubmit={handleSave} className="bg-card border border-border/50 rounded-[32px] overflow-hidden p-8 space-y-8">
                        <h3 className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                            <User size={16} className="text-primary" />
                            Personal Information
                        </h3>

                        <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                            <div className="relative group shrink-0">
                                <div className="w-24 h-24 rounded-3xl bg-muted/50 border border-border/50 flex items-center justify-center text-3xl font-black text-primary overflow-hidden">
                                    {avatar || user?.avatar ? <img src={avatar || user?.avatar} className="w-full h-full object-cover" /> : name[0]}
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute -bottom-2 -end-2 w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg hover:scale-110 transition-transform"
                                >
                                    <Camera size={14} strokeWidth={3} />
                                </button>
                            </div>
                            <div className="space-y-1 flex-1">
                                <p className="text-[11px] font-black text-muted-foreground/50 uppercase tracking-[0.2em]">Avatar Upload</p>
                                <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-xs">
                                    Pick a professional photo. Recommended size 400x400px. JPG or PNG allowed.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Full Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-6 outline-none focus:border-primary/50 text-foreground font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Business Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    disabled
                                    className="w-full h-14 bg-muted/30 rounded-2xl border border-border/50 px-6 text-muted-foreground/50 font-medium cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Phone Number</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-6 outline-none focus:border-primary/50 text-foreground font-medium"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border/50 flex justify-end">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="h-12 px-8 bg-primary text-primary-foreground font-black text-[11px] uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
                            >
                                {isSaving ? 'Processing...' : <><Save size={14} /> Save Profile Changes</>}
                            </button>
                        </div>
                    </form>

                    {/* Security */}
                    <div className="bg-card border border-border/50 rounded-[32px] p-8 space-y-8">
                        <h3 className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                            <Shield size={16} className="text-primary" />
                            Security & Password
                        </h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">Current Password</label>
                                    <input
                                        type="password"
                                        value={oldPass}
                                        onChange={e => setOldPass(e.target.value)}
                                        className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-6 outline-none focus:border-primary/50 text-foreground font-medium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">New Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPass ? 'text' : 'password'}
                                            value={newPass}
                                            onChange={e => setNewPass(e.target.value)}
                                            placeholder="Leave blank to keep current"
                                            className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-6 outline-none focus:border-primary/50 text-foreground font-medium placeholder:text-muted-foreground/50"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPass(!showPass)}
                                            className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                                        >
                                            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <button className="h-10 px-6 bg-muted border border-border/50 text-muted-foreground font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-muted/80 transition-all flex items-center gap-2">
                                <Lock size={12} /> Update Password
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Preferences */}
                <div className="space-y-6">
                    <div className="bg-card border border-border/50 rounded-[32px] p-8 space-y-6">
                        <h3 className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                            <Bell size={16} className="text-primary" />
                            Notifications
                        </h3>

                        <div className="space-y-4">
                            {[
                                { label: 'Order Alerts', desc: 'Get notified about new orders' },
                                { label: 'Market Updates', desc: 'Daily pricing trends' },
                                { label: 'Security Logins', desc: 'New device detection' },
                            ].map((pref, i) => (
                                <div key={i} className="flex items-center justify-between group">
                                    <div>
                                        <p className="text-xs font-black text-foreground group-hover:text-primary transition-colors">{pref.label}</p>
                                        <p className="text-[10px] text-muted-foreground/50 font-medium">{pref.desc}</p>
                                    </div>
                                    <div className="w-10 h-5 bg-primary/20 rounded-full relative cursor-pointer border border-primary/20">
                                        <div className="absolute top-1 end-1 w-3 h-3 bg-primary rounded-full shadow-lg" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-primary/5 border border-primary/10 rounded-[32px] p-8 space-y-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                            <Check size={20} strokeWidth={3} />
                        </div>
                        <h4 className="text-sm font-black text-foreground uppercase tracking-widest">Enterprise Verified</h4>
                        <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                            Your account is fully verified. You have maximum listing capacity and priority support access.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Platform Markup Settings ───────────────────────── */}
            <div className="bg-card border border-border/50 rounded-[32px] p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                        <Percent size={16} className="text-primary" />
                        Platform Markup Settings
                    </h3>
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-widest">
                        Admin Only
                    </span>
                </div>

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                    <p className="text-xs text-amber-600 font-medium leading-relaxed">
                        <strong>How it works:</strong> When a supplier lists a product at $5.00, the customer sees $5.00 + markup% (e.g. $5.50 at 10%).
                        The supplier always receives their original price — the markup is platform revenue. Suppliers never see these percentages.
                    </p>
                </div>

                {isLoadingMarkup ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs font-bold">Loading current rates...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            {
                                label: 'Per Unit / Piece',
                                desc: 'Products sold individually or by case',
                                value: markupPiece,
                                set: setMarkupPiece,
                                example: markupPiece ? `$5.00 → $${(5 * (1 + parseFloat(markupPiece) / 100)).toFixed(2)}` : '',
                            },
                            {
                                label: 'Per Pallet',
                                desc: 'Bulk pallet orders',
                                value: markupPallet,
                                set: setMarkupPallet,
                                example: markupPallet ? `$100 → $${(100 * (1 + parseFloat(markupPallet) / 100)).toFixed(2)}` : '',
                            },
                            {
                                label: 'Container / Truck',
                                desc: 'Full container or truck load',
                                value: markupContainer,
                                set: setMarkupContainer,
                                example: markupContainer ? `$1000 → $${(1000 * (1 + parseFloat(markupContainer) / 100)).toFixed(2)}` : '',
                            },
                        ].map(field => (
                            <div key={field.label} className="space-y-2">
                                <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ms-1">
                                    {field.label}
                                </label>
                                <p className="text-[10px] text-muted-foreground/60 ms-1">{field.desc}</p>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        value={field.value}
                                        onChange={e => field.set(e.target.value)}
                                        className="w-full h-14 bg-muted rounded-2xl border border-border/50 px-6 pe-10 outline-none focus:border-primary/50 text-foreground font-black text-xl transition-all"
                                    />
                                    <span className="absolute end-4 top-1/2 -translate-y-1/2 text-primary font-black text-lg">%</span>
                                </div>
                                {field.example && (
                                    <p className="text-[10px] text-emerald-500 font-bold ms-1">{field.example}</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="pt-4 border-t border-border/50 flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground font-medium">
                        Changes apply to <strong>new products only</strong>. Existing products keep their current markup.
                    </p>
                    <button
                        onClick={handleSaveMarkup}
                        disabled={isSavingMarkup || isLoadingMarkup}
                        className="h-11 px-7 bg-primary text-primary-foreground font-black text-[11px] uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
                    >
                        {isSavingMarkup ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Markup Rates
                    </button>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed bottom-8 end-8 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-end-4 z-[100]",
                    toast.type === 'success' ? "bg-emerald-500 text-primary-foreground" : "bg-red-500 text-primary-foreground"
                )}>
                    {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                    <span className="text-xs font-black uppercase tracking-widest">{toast.msg}</span>
                </div>
            )}
        </div>
    );
}
