'use client';

import * as React from 'react';
import {
    User, Shield, Bell, CreditCard, MapPin, ChevronRight,
    Camera, Save, Loader2, Lock, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

// Email = standard RFC pattern, Phone = 8-15 digits with optional + prefix
// (covers EU, Gulf, etc; rejects letters and obviously-bogus inputs).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d{8,15}$/;

type TabId = 'profile' | 'security' | 'notifications' | 'payment' | 'shipping';

export default function SettingsPage() {
    const { user, refreshUser } = useAuth() as any;
    const { currency: currentCurrency, setCurrency } = useCurrency();

    const [activeTab, setActiveTab] = React.useState<TabId>('profile');
    const [isSaving, setIsSaving] = React.useState(false);
    const [avatarUploading, setAvatarUploading] = React.useState(false);
    const [avatarUrl, setAvatarUrl] = React.useState<string | null>(user?.avatar || null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Form fields with controlled state so we can validate on blur and on save
    const [name, setName] = React.useState(user?.name || '');
    const [phone, setPhone] = React.useState(user?.phone || '');
    const [description, setDescription] = React.useState(user?.companyDescription || '');
    const [phoneError, setPhoneError] = React.useState<string | null>(null);

    React.useEffect(() => {
        setName(user?.name || '');
        setPhone(user?.phone || '');
        setAvatarUrl(user?.avatar || null);
        setDescription(user?.companyDescription || '');
    }, [user]);

    const tabs: { id: TabId; label: string; icon: any; locked?: boolean }[] = [
        { id: 'profile', label: 'Profile Information', icon: User },
        { id: 'security', label: 'Login & Security', icon: Shield },
        { id: 'notifications', label: 'Email Preferences', icon: Bell },
        { id: 'payment', label: 'Payment Methods', icon: CreditCard, locked: true },
        { id: 'shipping', label: 'Shipping Addresses', icon: MapPin },
    ];

    const handleAvatarPick = () => fileInputRef.current?.click();

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) {
            toast.error('Image too large (max 4 MB)');
            return;
        }
        setAvatarUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await apiFetch('/users/me/avatar', { method: 'POST', body: fd });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();
            setAvatarUrl(data.url);
            toast.success('Profile picture updated');
            if (refreshUser) refreshUser();
        } catch (err: any) {
            toast.error(err.message || 'Could not upload image');
        } finally {
            setAvatarUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const validatePhone = (v: string) => {
        const stripped = v.replace(/[\s()-]/g, '');
        if (!stripped) return null; // empty allowed at form level — required check happens on save
        return PHONE_RE.test(stripped) ? null : 'Phone must be 8-15 digits with optional + prefix';
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (activeTab !== 'profile') return; // other tabs handle their own saves
        const phoneStripped = phone.replace(/[\s()-]/g, '');
        const phoneErr = phone ? validatePhone(phone) : null;
        if (phoneErr) {
            setPhoneError(phoneErr);
            toast.error(phoneErr);
            return;
        }
        setPhoneError(null);
        setIsSaving(true);
        try {
            const res = await apiFetch('/users/me', {
                method: 'PATCH',
                body: JSON.stringify({
                    name,
                    phone: phoneStripped || null,
                    companyDescription: description || null,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Save failed');
            }
            toast.success('Settings saved');
            if (refreshUser) refreshUser();
        } catch (err: any) {
            toast.error(err.message || 'Could not save changes');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div>
                <h1 className="text-3xl font-black text-[#0B1F3A] tracking-tight">Account Settings</h1>
                <p className="text-sm text-slate-500 font-medium mt-1">Manage your global business identity and preferences.</p>
            </div>

            <main className="space-y-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar Tabs */}
                    <aside className="w-full lg:w-72 space-y-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => !tab.locked && setActiveTab(tab.id)}
                                disabled={tab.locked}
                                className={cn(
                                    'w-full flex items-center justify-between px-5 h-14 rounded-2xl font-bold text-sm transition-all',
                                    tab.locked
                                        ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed opacity-70'
                                        : activeTab === tab.id
                                            ? 'bg-[#0B1F3A] text-white shadow-xl shadow-[#0B1F3A]/20 scale-[1.02]'
                                            : 'bg-white text-slate-500 hover:bg-slate-50 border border-[#E6EAF0]',
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <tab.icon size={18} />
                                    <span>{tab.label}</span>
                                </div>
                                {tab.locked
                                    ? <Lock size={14} className="opacity-50" />
                                    : activeTab === tab.id && <ChevronRight size={16} className="opacity-50" />}
                            </button>
                        ))}
                    </aside>

                    {/* Main Settings Content */}
                    <div className="flex-1">
                        <div className="bg-white border border-[#E6EAF0] rounded-[32px] overflow-hidden shadow-sm">
                            {/* Header — avatar + identity strip */}
                            <div className="p-8 border-b border-slate-100 flex items-center gap-6">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-3xl bg-slate-100 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center text-[#0B1F3A] font-black text-3xl">
                                        {avatarUrl
                                            ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                            : (user?.name?.[0] || 'A')}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAvatarPick}
                                        disabled={avatarUploading}
                                        className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#1ABC9C] text-white rounded-xl flex items-center justify-center border-4 border-white shadow-lg hover:scale-110 transition-transform disabled:opacity-60"
                                        aria-label="Change profile picture"
                                    >
                                        {avatarUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={18} />}
                                    </button>
                                    <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-black text-[#0B1F3A]">{user?.name || 'Partner Account'}</h2>
                                    <p className="text-sm text-slate-500 font-medium">{user?.email || 'business@atlantis.com'}</p>
                                    <div className="flex items-center gap-2 pt-1">
                                        <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-black uppercase tracking-widest rounded-md border border-green-100">Verified Entity</span>
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-md">ID: {user?.id?.slice(-8) || 'GLOBAL'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Per-tab content */}
                            {activeTab === 'profile' && (
                                <form onSubmit={handleSave} className="p-8 space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Business Name</label>
                                            <input
                                                value={name}
                                                onChange={e => setName(e.target.value)}
                                                className="w-full h-14 px-6 bg-[#F7F9FC] border-2 border-transparent rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-[#1ABC9C] transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Work Email Address</label>
                                            <input
                                                readOnly
                                                value={user?.email || ''}
                                                className="w-full h-14 px-6 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold text-slate-400 outline-none cursor-not-allowed"
                                                title="Email cannot be changed — contact support"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number (WhatsApp) <span className="text-red-500">*</span></label>
                                            <input
                                                value={phone}
                                                onChange={e => { setPhone(e.target.value); setPhoneError(null); }}
                                                onBlur={() => setPhoneError(validatePhone(phone))}
                                                placeholder="+971 00 000 0000"
                                                className={cn(
                                                    'w-full h-14 px-6 bg-[#F7F9FC] border-2 rounded-2xl text-sm font-bold outline-none focus:bg-white transition-all',
                                                    phoneError ? 'border-red-400 focus:border-red-500' : 'border-transparent focus:border-[#1ABC9C]',
                                                )}
                                            />
                                            {phoneError && (
                                                <p className="text-[11px] text-red-500 font-bold flex items-center gap-1.5"><AlertCircle size={11} /> {phoneError}</p>
                                            )}
                                            <p className="text-[10px] text-slate-400">We'll WhatsApp you about your orders. Required before checkout.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Preferred Currency</label>
                                            <select
                                                value={currentCurrency}
                                                onChange={e => setCurrency(e.target.value)}
                                                className="w-full h-14 px-6 bg-[#F7F9FC] border-2 border-transparent rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-[#1ABC9C] transition-all appearance-none"
                                            >
                                                {SUPPORTED_CURRENCIES.map(c => (
                                                    <option key={c.code} value={c.code}>{c.symbol} {c.code} - {c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Company Description</label>
                                        <textarea
                                            rows={4}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            placeholder="Tell us more about your sourcing requirements..."
                                            className="w-full p-6 bg-[#F7F9FC] border-2 border-transparent rounded-2xl text-sm font-medium outline-none focus:bg-white focus:border-[#1ABC9C] transition-all resize-none"
                                        />
                                    </div>

                                    <div className="pt-4 flex items-center justify-end">
                                        <button
                                            type="submit"
                                            disabled={isSaving}
                                            className="h-14 px-10 bg-[#0B1F3A] text-white rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-3 hover:bg-[#1ABC9C] transition-all shadow-xl shadow-black/10 active:scale-95 disabled:opacity-50"
                                        >
                                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                            {isSaving ? 'Saving…' : 'Save Changes'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {activeTab === 'security' && (
                                <div className="p-8 space-y-6">
                                    <div className="rounded-2xl border border-slate-100 p-6 flex items-start gap-4">
                                        <Shield size={20} className="text-[#1ABC9C] mt-1 shrink-0" />
                                        <div>
                                            <h3 className="font-black text-[#0B1F3A] text-base">Password & Two-Factor</h3>
                                            <p className="text-[13px] text-slate-500 mt-1">
                                                Manage your password and 2FA setup from the dedicated security page.
                                            </p>
                                            <a href="/dashboard/security" className="inline-block mt-3 text-[12px] font-bold text-[#1ABC9C] hover:underline">
                                                Go to Security Center →
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'notifications' && (
                                <div className="p-8 space-y-4">
                                    <h3 className="font-black text-[#0B1F3A] text-base">Email Notifications</h3>
                                    {[
                                        { id: 'order_updates', label: 'Order updates', desc: 'Status changes, shipping, delivery confirmation' },
                                        { id: 'price_alerts', label: 'Price drops', desc: 'When products in your wishlist change price' },
                                        { id: 'platform_news', label: 'Platform news', desc: 'New features, supplier announcements (max 1/month)' },
                                    ].map(opt => (
                                        <label key={opt.id} className="flex items-start gap-4 p-5 rounded-2xl border border-slate-100 cursor-pointer hover:border-slate-300">
                                            <input type="checkbox" defaultChecked className="mt-1 w-5 h-5 accent-[#1ABC9C]" />
                                            <div>
                                                <p className="font-bold text-[#0B1F3A] text-sm">{opt.label}</p>
                                                <p className="text-[12px] text-slate-500 mt-0.5">{opt.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                    <p className="text-[11px] text-slate-400 mt-2">Preference syncing coming soon — defaults apply for now.</p>
                                </div>
                            )}

                            {activeTab === 'shipping' && (
                                <div className="p-8 space-y-4">
                                    <h3 className="font-black text-[#0B1F3A] text-base">Shipping Addresses</h3>
                                    <p className="text-[13px] text-slate-500">
                                        Manage delivery addresses from the dedicated address book.
                                    </p>
                                    <a href="/account/address" className="inline-block mt-2 text-[12px] font-bold text-[#1ABC9C] hover:underline">
                                        Open address book →
                                    </a>
                                </div>
                            )}

                            {/* Payment Methods is locked at the tab level — this branch is unreachable but kept defensively */}
                            {activeTab === 'payment' && (
                                <div className="p-8">
                                    <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center space-y-3">
                                        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center"><Lock size={28} className="text-slate-400" /></div>
                                        <h3 className="font-black text-[#0B1F3A] text-lg">Payments Coming Soon</h3>
                                        <p className="text-[13px] text-slate-500 max-w-md mx-auto">
                                            Card and bank-transfer methods will appear here once Atlantis launches escrow checkout. For now, orders are negotiated through the support team.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
