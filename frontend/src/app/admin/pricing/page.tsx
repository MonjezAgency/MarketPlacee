'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
    Tag,
    Save,
    Percent,
    TrendingUp,
    AlertCircle,
    Check,
    RefreshCw,
    DollarSign,
    Info,
    Package,
    Layers,
    Truck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';

type MarkupData = { pallet: number; container: number };

export default function AdminPricingPage() {
    const { user } = useAuth();
    const [currentMarkup, setCurrentMarkup] = React.useState<MarkupData>({ pallet: 1.05, container: 1.02 });
    const [newMarkup, setNewMarkup] = React.useState<MarkupData>({ pallet: 1.05, container: 1.02 });
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState(false);
    const [toast, setToast] = React.useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchMarkup = async () => {
        setIsLoading(true);
        try {
            
            const res = await apiFetch(`/admin/config/markup`);
            if (res.ok) {
                const data = await res.json();
                if (data.markup && typeof data.markup === 'object') {
                    // Filter out piece if it exists in the data from backend
                    const { piece, ...filtered } = data.markup as MarkupData & { piece?: number };
                    setCurrentMarkup(filtered);
                    setNewMarkup(filtered);
                } else if (typeof data.markup === 'number') {
                    // Legacy fallback
                    const legacy = { pallet: 1.05, container: 1.02 };
                    setCurrentMarkup(legacy);
                    setNewMarkup(legacy);
                }
            }
        } catch (err) {
            console.error('Failed to fetch markup:', err);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        fetchMarkup();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            
            const res = await apiFetch(`/admin/config/markup`, {
                method: 'POST',
                body: JSON.stringify(newMarkup),
            });
            if (res.ok) {
                setCurrentMarkup(newMarkup);
                showToast('success', 'Markup percentages updated successfully!');
            } else {
                showToast('error', 'Failed to update markup percentages.');
            }
        } catch (err) {
            showToast('error', 'Network error. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const hasChanges =
        newMarkup.pallet !== currentMarkup.pallet ||
        newMarkup.container !== currentMarkup.container;

    const exampleVendorPrice = 100;

    const renderSlider = (key: keyof MarkupData, label: string, icon: React.ReactNode, colorClass: string) => {
        const val = newMarkup[key];
        const displayPercent = ((val - 1) * 100).toFixed(1);

        return (
            <div className="space-y-4 p-6 bg-[#F7F8F8] dark:bg-white/5 rounded-2xl border border-[#EAEDED] dark:border-white/10">
                <div className="flex items-center gap-3 mb-2">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-white dark:bg-[#131921] shadow-sm", colorClass)}>
                        {icon}
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest">{label}</h4>
                        <p className="text-[10px] text-[#888] font-bold">Current: {((currentMarkup[key] - 1) * 100).toFixed(1)}%</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <input
                        type="range"
                        min="1.00"
                        max="2.00"
                        step="0.01"
                        value={val}
                        onChange={e => setNewMarkup({ ...newMarkup, [key]: parseFloat(e.target.value) })}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[#EAEDED] dark:bg-white/10 accent-[#FF9900]"
                    />
                    <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                        <div className="flex-1 space-y-2 w-full">
                            <label className="text-[10px] font-black text-[#888] uppercase tracking-widest ms-1">Percentage (%)</label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={displayPercent}
                                onChange={e => {
                                    const pct = parseFloat(e.target.value);
                                    if (!isNaN(pct) && pct >= 0 && pct <= 100) {
                                        setNewMarkup({ ...newMarkup, [key]: 1 + pct / 100 });
                                    }
                                }}
                                className="w-full h-12 bg-white dark:bg-[#131921] rounded-xl border border-[#DDD] dark:border-white/10 px-4 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-bold text-base"
                            />
                        </div>
                        <div className="flex-1 space-y-2 w-full">
                            <label className="text-[10px] font-black text-[#888] uppercase tracking-widest ms-1">Multiplier (×)</label>
                            <input
                                type="number"
                                min="1.00"
                                max="2.00"
                                step="0.01"
                                value={val.toFixed(2)}
                                onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v) && v >= 1 && v <= 2) {
                                        setNewMarkup({ ...newMarkup, [key]: v });
                                    }
                                }}
                                className="w-full h-12 bg-white dark:bg-[#131921] rounded-xl border border-[#DDD] dark:border-white/10 px-4 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-bold text-base"
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FF9900]/10 flex items-center justify-center text-[#FF9900]">
                        <Tag size={20} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-[#0F1111] dark:text-white tracking-tight">Pricing & Markup</h1>
                        <p className="text-[#555] dark:text-[#999] font-medium text-sm">Configure different markup percentages based on the order unit type.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Main Control Card */}
                <div className="xl:col-span-2 space-y-8">
                    <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 space-y-8 shadow-sm">
                        <h3 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <Percent size={16} className="text-[#FF9900]" />
                            Unit-Based Markups
                        </h3>

                        {isLoading ? (
                            <div className="py-16 flex flex-col items-center gap-4 text-[#888]">
                                <RefreshCw size={24} className="animate-spin" />
                                <p className="text-sm font-bold">Loading markup settings...</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {renderSlider('pallet', 'Pallet Markup', <Layers size={20} />, "text-emerald-500")}
                                {renderSlider('container', 'Container / Truck Markup', <Truck size={20} />, "text-purple-500")}

                                {/* Save Button */}
                                <div className="pt-4 border-t border-[#EAEDED] dark:border-white/10 flex items-center justify-between">
                                    {hasChanges && (
                                        <p className="text-xs text-[#FF9900] font-bold flex items-center gap-1.5">
                                            <AlertCircle size={14} />
                                            Unsaved changes
                                        </p>
                                    )}
                                    <div className="flex-1" />
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving || !hasChanges}
                                        className={cn(
                                            "h-12 px-8 font-black text-[11px] uppercase tracking-widest rounded-xl flex items-center gap-2 transition-all",
                                            hasChanges
                                                ? "bg-[#FF9900] text-white hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#FF9900]/20"
                                                : "bg-[#F7F8F8] dark:bg-white/5 text-[#888] cursor-not-allowed"
                                        )}
                                    >
                                        {isSaving ? (
                                            <>
                                                <RefreshCw size={14} className="animate-spin" /> Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save size={14} /> Save Changes
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="space-y-6">
                    {/* Example Preview */}
                    <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-6 lg:p-8 space-y-6 shadow-sm">
                        <h3 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <DollarSign size={16} className="text-[#FF9900]" />
                            Price Previews
                        </h3>

                        <div className="space-y-4">
                            <div className="p-4 bg-[#F7F8F8] dark:bg-white/5 rounded-2xl border border-[#EAEDED] dark:border-white/10 space-y-1">
                                <p className="text-[10px] font-black text-[#888] uppercase tracking-widest">Base Vendor Price</p>
                                <p className="text-2xl font-black text-[#0F1111] dark:text-white">{formatPrice(exampleVendorPrice)}</p>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex justify-between items-center">
                                    <div>
                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Pallet Buyer</p>
                                        <p className="text-[10px] text-emerald-500/70 font-bold">+{((newMarkup.pallet - 1) * 100).toFixed(1)}%</p>
                                    </div>
                                    <p className="text-lg font-black text-emerald-600">{formatPrice(exampleVendorPrice * newMarkup.pallet)}</p>
                                </div>

                                <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-2xl border border-purple-100 dark:border-purple-900/30 flex justify-between items-center">
                                    <div>
                                        <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Container Buyer</p>
                                        <p className="text-[10px] text-purple-500/70 font-bold">+{((newMarkup.container - 1) * 100).toFixed(1)}%</p>
                                    </div>
                                    <p className="text-lg font-black text-purple-600">{formatPrice(exampleVendorPrice * newMarkup.container)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Info Card */}
                    <div className="bg-[#FEF8E8] dark:bg-[#FF9900]/5 border border-[#FF9900]/10 rounded-[32px] p-6 lg:p-8 space-y-4">
                        <div className="w-10 h-10 rounded-xl bg-[#FF9900]/20 flex items-center justify-center text-[#FF9900]">
                            <Info size={20} />
                        </div>
                        <h4 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest">Dynamic Markups</h4>
                        <ul className="space-y-2 text-[11px] text-[#555] dark:text-[#999] font-medium leading-relaxed">
                            <li className="flex items-start gap-2">
                                <span className="text-[#FF9900] font-black">1.</span>
                                Bulk orders (Pallets/Containers) usually require lower markups to remain competitive.
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-[#FF9900] font-black">2.</span>
                                When a product is created or updated with a specific unit, the system auto-applies the percentage you set here.
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-[#FF9900] font-black">3.</span>
                                The vendor will always see their original `Vendor Sets Price` on their dashboard.
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={cn(
                    "fixed bottom-8 end-8 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-end-4 z-[100]",
                    toast.type === 'success' ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                )}>
                    {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                    <span className="text-xs font-black uppercase tracking-widest">{toast.msg}</span>
                </div>
            )}
        </div>
    );
}
