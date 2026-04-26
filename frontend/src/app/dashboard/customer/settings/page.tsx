'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { 
    User, 
    Shield, 
    Bell, 
    CreditCard, 
    Globe, 
    MapPin, 
    ChevronRight,
    Camera,
    Save,
    Loader2,
    ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = React.useState('profile');
    const [isSaving, setIsSaving] = React.useState(false);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            alert('Settings updated successfully!');
        }, 1500);
    };

    const tabs = [
        { id: 'profile', label: 'Profile Information', icon: User },
        { id: 'security', label: 'Login & Security', icon: Shield },
        { id: 'notifications', label: 'Email Preferences', icon: Bell },
        { id: 'payment', label: 'Payment Methods', icon: CreditCard },
        { id: 'shipping', label: 'Shipping Addresses', icon: MapPin },
    ];

    return (
        <div className="min-h-screen bg-[#F7F9FC] pb-20">
            {/* Header Area */}
            <div className="bg-white border-b border-[#E6EAF0] sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/customer" className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all">
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <h1 className="text-xl font-black text-[#0B1F3A] tracking-tight">Account Settings</h1>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manage your global business identity</p>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-5xl mx-auto px-6 py-10">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar Tabs */}
                    <aside className="w-full lg:w-72 space-y-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "w-full flex items-center justify-between px-5 h-14 rounded-2xl font-bold text-sm transition-all",
                                    activeTab === tab.id 
                                        ? "bg-[#0B1F3A] text-white shadow-xl shadow-[#0B1F3A]/20 scale-[1.02]" 
                                        : "bg-white text-slate-500 hover:bg-slate-50 border border-[#E6EAF0]"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <tab.icon size={18} />
                                    <span>{tab.label}</span>
                                </div>
                                {activeTab === tab.id && <ChevronRight size={16} className="opacity-50" />}
                            </button>
                        ))}
                    </aside>

                    {/* Main Settings Content */}
                    <div className="flex-1">
                        <div className="bg-white border border-[#E6EAF0] rounded-[32px] overflow-hidden shadow-sm">
                            <div className="p-8 border-b border-slate-100 flex items-center gap-6">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-3xl bg-slate-100 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center text-[#0B1F3A] font-black text-3xl">
                                        {user?.name?.[0] || 'A'}
                                    </div>
                                    <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#1ABC9C] text-white rounded-xl flex items-center justify-center border-4 border-white shadow-lg hover:scale-110 transition-transform">
                                        <Camera size={18} />
                                    </button>
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

                            <form onSubmit={handleSave} className="p-8 space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Business Name</label>
                                        <input 
                                            defaultValue={user?.name || ''}
                                            className="w-full h-14 px-6 bg-[#F7F9FC] border-2 border-transparent rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-[#1ABC9C] transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Work Email Address</label>
                                        <input 
                                            readOnly
                                            defaultValue={user?.email || ''}
                                            className="w-full h-14 px-6 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold text-slate-400 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number (WhatsApp)</label>
                                        <input 
                                            placeholder="+971 00 000 0000"
                                            className="w-full h-14 px-6 bg-[#F7F9FC] border-2 border-transparent rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-[#1ABC9C] transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Preferred Currency</label>
                                        <select className="w-full h-14 px-6 bg-[#F7F9FC] border-2 border-transparent rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-[#1ABC9C] transition-all appearance-none">
                                            <option>USD - US Dollar</option>
                                            <option>EUR - Euro</option>
                                            <option>TRY - Turkish Lira</option>
                                            <option>AED - UAE Dirham</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Company Description</label>
                                    <textarea 
                                        rows={4}
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
                                        {isSending ? 'Synchronizing...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
