'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Percent, Plus, Trash2, Users, Package, Save, RefreshCw,
    Check, AlertCircle, Search, ChevronDown, X, Layers,
    UserPlus, ArrowRight, Calculator
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const API_URL = '/api';

// ── Types ──────────────────────────────────────────────────
import { Product } from '@/lib/types';

interface TierRow { id: string; minQty: number; maxQty: number | null; discountPercent: number; }
interface PriceGroup { id: string; name: string; discountPercent: number; description: string | null; _count: { members: number }; members: any[]; }
interface ProductOption { id: string; name: string; price: number; basePrice: number | null; }

type Tab = 'tiers' | 'groups';

export default function AdminDiscountsPage() {
    const { user } = useAuth();
    
    const [tab, setTab] = React.useState<Tab>('tiers');
    const [toast, setToast] = React.useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const showToast = (type: 'success' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

    // ── Tiered Pricing State ───────────────────────────────
    const [products, setProducts] = React.useState<ProductOption[]>([]);
    const [selectedProduct, setSelectedProduct] = React.useState<string>('');
    const [tiers, setTiers] = React.useState<TierRow[]>([]);
    const [isLoadingTiers, setIsLoadingTiers] = React.useState(false);
    const [newTier, setNewTier] = React.useState({ minQty: 10, maxQty: 49, discountPercent: 5, unlimited: false });
    const [productSearch, setProductSearch] = React.useState('');

    // Calculator state
    const [calcQty, setCalcQty] = React.useState(1);
    const [calcResult, setCalcResult] = React.useState<any>(null);

    // ── Customer Groups State ──────────────────────────────
    const [groups, setGroups] = React.useState<PriceGroup[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = React.useState(false);
    const [newGroup, setNewGroup] = React.useState({ name: '', discountPercent: 5, description: '' });
    const [showNewGroupForm, setShowNewGroupForm] = React.useState(false);

    // Add member
    const [addMemberGroupId, setAddMemberGroupId] = React.useState<string | null>(null);
    const [memberUserId, setMemberUserId] = React.useState('');
    const [buyers, setBuyers] = React.useState<any[]>([]);

    // ── Fetch Products ─────────────────────────────────────
    React.useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await fetch(`${API_URL}/products?status=APPROVED`, { headers: {  } });
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : data.data || [];
                    setProducts(list.map((p: any) => ({ id: p.id, name: p.name, price: p.price, basePrice: p.basePrice })));
                }
            } catch (e) { console.error(e); }
        };
        fetchProducts();
    }, []);

    // ── Fetch Buyers ───────────────────────────────────────
    React.useEffect(() => {
        const fetchBuyers = async () => {
            try {
                const res = await fetch(`${API_URL}/admin/users`, { headers: {  } });
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : data.data || [];
                    setBuyers(list.filter((u: any) => u.role === 'CUSTOMER'));
                }
            } catch (e) { console.error(e); }
        };
        fetchBuyers();
    }, []);

    // ── Fetch Tiers ────────────────────────────────────────
    const fetchTiers = async (productId: string) => {
        setIsLoadingTiers(true);
        try {
            const res = await fetch(`${API_URL}/discounts/tiers/${productId}`, { headers: {  } });
            if (res.ok) setTiers(await res.json());
        } catch (e) { console.error(e); }
        setIsLoadingTiers(false);
    };

    React.useEffect(() => { if (selectedProduct) fetchTiers(selectedProduct); }, [selectedProduct]);

    // ── Add Tier ───────────────────────────────────────────
    const handleAddTier = async () => {
        try {
            const res = await fetch(`${API_URL}/discounts/tiers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json',  },
                body: JSON.stringify({
                    productId: selectedProduct,
                    minQty: newTier.minQty,
                    maxQty: newTier.unlimited ? null : newTier.maxQty,
                    discountPercent: newTier.discountPercent,
                }),
            });
            if (res.ok) {
                showToast('success', 'Tier added successfully!');
                fetchTiers(selectedProduct);
                setNewTier({ minQty: 10, maxQty: 49, discountPercent: 5, unlimited: false });
            } else {
                const err = await res.json();
                showToast('error', err.message || 'Failed to add tier');
            }
        } catch { showToast('error', 'Network error'); }
    };

    // ── Delete Tier ────────────────────────────────────────
    const handleDeleteTier = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/discounts/tiers/${id}`, { method: 'DELETE', headers: {  } });
            if (res.ok) { showToast('success', 'Tier deleted'); fetchTiers(selectedProduct); }
        } catch { showToast('error', 'Failed to delete tier'); }
    };

    // ── Calculate Price ────────────────────────────────────
    const handleCalcPrice = async () => {
        try {
            const res = await fetch(`${API_URL}/discounts/calculate?productId=${selectedProduct}&quantity=${calcQty}`, { headers: {  } });
            if (res.ok) setCalcResult(await res.json());
        } catch { showToast('error', 'Calculation failed'); }
    };

    // ── Fetch Groups ───────────────────────────────────────
    const fetchGroups = async () => {
        setIsLoadingGroups(true);
        try {
            const res = await fetch(`${API_URL}/discounts/groups`, { headers: {  } });
            if (res.ok) setGroups(await res.json());
        } catch (e) { console.error(e); }
        setIsLoadingGroups(false);
    };

    React.useEffect(() => { if (tab === 'groups') fetchGroups(); }, [tab]);

    // ── Create Group ───────────────────────────────────────
    const handleCreateGroup = async () => {
        try {
            const res = await fetch(`${API_URL}/discounts/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json',  },
                body: JSON.stringify(newGroup),
            });
            if (res.ok) { showToast('success', 'Group created!'); fetchGroups(); setShowNewGroupForm(false); setNewGroup({ name: '', discountPercent: 5, description: '' }); }
            else { const err = await res.json(); showToast('error', err.message || 'Failed'); }
        } catch { showToast('error', 'Network error'); }
    };

    // ── Delete Group ───────────────────────────────────────
    const handleDeleteGroup = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/discounts/groups/${id}`, { method: 'DELETE', headers: {  } });
            if (res.ok) { showToast('success', 'Group deleted'); fetchGroups(); }
        } catch { showToast('error', 'Failed to delete group'); }
    };

    // ── Add Member ─────────────────────────────────────────
    const handleAddMember = async () => {
        if (!addMemberGroupId || !memberUserId) return;
        try {
            const res = await fetch(`${API_URL}/discounts/groups/${addMemberGroupId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json',  },
                body: JSON.stringify({ userId: memberUserId }),
            });
            if (res.ok) { showToast('success', 'Member added!'); fetchGroups(); setAddMemberGroupId(null); setMemberUserId(''); }
            else { const err = await res.json(); showToast('error', err.message || 'Failed'); }
        } catch { showToast('error', 'Network error'); }
    };

    // ── Remove Member ──────────────────────────────────────
    const handleRemoveMember = async (groupId: string, userId: string) => {
        try {
            const res = await fetch(`${API_URL}/discounts/groups/${groupId}/members/${userId}`, { method: 'DELETE', headers: {  } });
            if (res.ok) { showToast('success', 'Member removed'); fetchGroups(); }
        } catch { showToast('error', 'Failed to remove member'); }
    };

    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
    const selectedProductData = products.find(p => p.id === selectedProduct);

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FF9900]/10 flex items-center justify-center text-[#FF9900]">
                        <Percent size={20} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-[#0F1111] dark:text-white tracking-tight">Bulk Discounts</h1>
                        <p className="text-[#555] dark:text-[#999] font-medium text-sm">Manage tiered pricing, customer groups, and volume discounts.</p>
                    </div>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-2 bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-2xl p-1.5 w-fit">
                {[
                    { key: 'tiers' as Tab, label: 'Tiered Pricing', icon: Layers },
                    { key: 'groups' as Tab, label: 'Customer Groups', icon: Users },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                            tab === t.key
                                ? "bg-[#FF9900] text-white shadow-lg shadow-[#FF9900]/20"
                                : "text-[#888] hover:text-[#0F1111] dark:hover:text-white hover:bg-[#F3F3F3] dark:hover:bg-white/10"
                        )}
                    >
                        <t.icon size={14} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ─── Tiered Pricing Tab ──────────────────────── */}
            {tab === 'tiers' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Left: Main */}
                    <div className="xl:col-span-2 space-y-8">
                        {/* Product Selector */}
                        <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 space-y-6 shadow-sm">
                            <h3 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <Package size={16} className="text-[#FF9900]" />
                                Select Product
                            </h3>
                            <div className="relative">
                                <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-[#888]" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search products..."
                                    value={productSearch}
                                    onChange={e => setProductSearch(e.target.value)}
                                    className="w-full h-12 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 ps-12 pe-4 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-medium text-sm"
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1.5 no-scrollbar">
                                {filteredProducts.slice(0, 20).map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setSelectedProduct(p.id); setCalcResult(null); }}
                                        className={cn(
                                            "w-full text-start px-4 py-3 rounded-xl flex items-center justify-between transition-all text-sm",
                                            selectedProduct === p.id
                                                ? "bg-[#FEF8E8] dark:bg-[#FF9900]/10 border border-[#FF9900]/30 font-bold text-[#0F1111] dark:text-white"
                                                : "hover:bg-[#F3F3F3] dark:hover:bg-white/5 text-[#555] dark:text-[#999] font-medium"
                                        )}
                                    >
                                        <span className="truncate">{p.name}</span>
                                        <span className="text-[#FF9900] font-black text-xs ms-2 shrink-0">${p.price.toFixed(2)}</span>
                                    </button>
                                ))}
                                {filteredProducts.length === 0 && <p className="text-sm text-[#888] text-center py-4">No products found.</p>}
                            </div>
                        </div>

                        {/* Existing Tiers */}
                        {selectedProduct && (
                            <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 space-y-6 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                                        <Layers size={16} className="text-[#FF9900]" />
                                        Discount Tiers for: <span className="text-[#FF9900] ms-1">{selectedProductData?.name}</span>
                                    </h3>
                                    {isLoadingTiers && <RefreshCw size={16} className="animate-spin text-[#888]" />}
                                </div>

                                {tiers.length > 0 ? (
                                    <div className="space-y-3">
                                        {tiers.map(tier => (
                                            <div key={tier.id} className="flex items-center justify-between p-4 bg-[#F7F8F8] dark:bg-white/5 rounded-2xl border border-[#EAEDED] dark:border-white/10 group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 font-black text-xs">
                                                        {tier.discountPercent}%
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-[#0F1111] dark:text-white text-sm">
                                                            {tier.minQty} — {tier.maxQty !== null ? tier.maxQty : '∞'} units
                                                        </p>
                                                        <p className="text-[10px] text-[#888] font-bold uppercase tracking-widest">
                                                            {tier.discountPercent}% discount
                                                        </p>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteTier(tier.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-[#888]">
                                        <Layers size={32} className="mx-auto mb-3 opacity-30" />
                                        <p className="text-sm font-medium">No discount tiers yet.</p>
                                        <p className="text-xs">Add tiers below to offer volume discounts.</p>
                                    </div>
                                )}

                                {/* Add Tier Form */}
                                <div className="pt-6 border-t border-[#EAEDED] dark:border-white/10 space-y-4">
                                    <h4 className="text-xs font-black text-[#0F1111] dark:text-white uppercase tracking-widest">Add New Tier</h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Min Qty</label>
                                            <input type="number" min={1} value={newTier.minQty} onChange={e => setNewTier({ ...newTier, minQty: parseInt(e.target.value) || 1 })}
                                                className="w-full h-11 bg-white dark:bg-[#0F1111] rounded-xl border border-[#DDD] dark:border-white/10 px-3 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-bold text-sm" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-[#888] uppercase tracking-widest flex items-center gap-1">
                                                Max Qty
                                                <button onClick={() => setNewTier({ ...newTier, unlimited: !newTier.unlimited })} className={cn("text-[8px] px-1.5 py-0.5 rounded-md transition-all", newTier.unlimited ? "bg-[#FF9900] text-white" : "bg-[#F3F3F3] dark:bg-white/10 text-[#888]")}>
                                                    {newTier.unlimited ? '∞' : 'SET'}
                                                </button>
                                            </label>
                                            <input type="number" min={newTier.minQty} value={newTier.unlimited ? '' : newTier.maxQty} disabled={newTier.unlimited}
                                                onChange={e => setNewTier({ ...newTier, maxQty: parseInt(e.target.value) || newTier.minQty })}
                                                placeholder={newTier.unlimited ? '∞' : ''}
                                                className="w-full h-11 bg-white dark:bg-[#0F1111] rounded-xl border border-[#DDD] dark:border-white/10 px-3 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-bold text-sm disabled:opacity-40" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Discount %</label>
                                            <input type="number" min={0} max={100} step={0.5} value={newTier.discountPercent}
                                                onChange={e => setNewTier({ ...newTier, discountPercent: parseFloat(e.target.value) || 0 })}
                                                className="w-full h-11 bg-white dark:bg-[#0F1111] rounded-xl border border-[#DDD] dark:border-white/10 px-3 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-bold text-sm" />
                                        </div>
                                        <div className="flex items-end">
                                            <button onClick={handleAddTier}
                                                className="w-full h-11 bg-[#FF9900] text-white rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#FF9900]/20">
                                                <Plus size={14} />
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Calculator */}
                    <div className="space-y-6">
                        {selectedProduct && (
                            <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-6 lg:p-8 space-y-6 shadow-sm">
                                <h3 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                                    <Calculator size={16} className="text-[#FF9900]" />
                                    Price Calculator
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Quantity</label>
                                        <input type="number" min={1} value={calcQty} onChange={e => setCalcQty(parseInt(e.target.value) || 1)}
                                            className="w-full h-12 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-bold text-lg" />
                                    </div>
                                    <button onClick={handleCalcPrice}
                                        className="w-full h-12 bg-[#131921] dark:bg-white text-white dark:text-[#0F1111] rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                        <ArrowRight size={14} />
                                        Calculate
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {calcResult && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 pt-4 border-t border-[#EAEDED] dark:border-white/10">
                                            <div className="p-3 bg-[#F7F8F8] dark:bg-white/5 rounded-2xl flex justify-between items-center">
                                                <span className="text-[10px] font-black text-[#888] uppercase tracking-widest">Base Price</span>
                                                <span className="font-black text-[#0F1111] dark:text-white">${calcResult.basePrice.toFixed(2)}</span>
                                            </div>
                                            {calcResult.tierDiscount > 0 && (
                                                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl flex justify-between items-center border border-emerald-100 dark:border-emerald-900/30">
                                                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Volume Discount</span>
                                                    <span className="font-black text-emerald-600">-{calcResult.tierDiscount}%</span>
                                                </div>
                                            )}
                                            {calcResult.groupDiscount > 0 && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-2xl flex justify-between items-center border border-blue-100 dark:border-blue-900/30">
                                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Group Discount</span>
                                                    <span className="font-black text-blue-600">-{calcResult.groupDiscount}%</span>
                                                </div>
                                            )}
                                            <div className="p-4 bg-[#FF9900]/5 rounded-2xl border border-[#FF9900]/20">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="text-[10px] font-black text-[#FF9900] uppercase tracking-widest">Final Unit Price</p>
                                                        <p className="text-2xl font-black text-[#0F1111] dark:text-white">${calcResult.unitPrice.toFixed(2)}</p>
                                                    </div>
                                                    <div className="text-end">
                                                        <p className="text-[10px] font-black text-[#888] uppercase tracking-widest">Total ({calcResult.quantity} units)</p>
                                                        <p className="text-2xl font-black text-[#FF9900]">${calcResult.totalPrice.toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Info */}
                        <div className="bg-[#FEF8E8] dark:bg-[#FF9900]/5 border border-[#FF9900]/10 rounded-[32px] p-6 lg:p-8 space-y-4">
                            <div className="w-10 h-10 rounded-xl bg-[#FF9900]/20 flex items-center justify-center text-[#FF9900]">
                                <AlertCircle size={20} />
                            </div>
                            <h4 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest">How Tiered Pricing Works</h4>
                            <ul className="space-y-2 text-[11px] text-[#555] dark:text-[#999] font-medium leading-relaxed">
                                <li className="flex items-start gap-2"><span className="text-[#FF9900] font-black">1.</span>Select a product, then add quantity tiers with discount percentages.</li>
                                <li className="flex items-start gap-2"><span className="text-[#FF9900] font-black">2.</span>When a buyer orders within a tier's range, the discount is auto-applied.</li>
                                <li className="flex items-start gap-2"><span className="text-[#FF9900] font-black">3.</span>Customer Group discounts stack additively with tier discounts.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Customer Groups Tab ─────────────────────── */}
            {tab === 'groups' && (
                <div className="space-y-8">
                    {/* Create Group Button */}
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-[#0F1111] dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <Users size={16} className="text-[#FF9900]" />
                            Price Groups
                        </h3>
                        <button onClick={() => setShowNewGroupForm(!showNewGroupForm)}
                            className="h-10 px-5 bg-[#FF9900] text-white rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#FF9900]/20">
                            {showNewGroupForm ? <X size={14} /> : <Plus size={14} />}
                            {showNewGroupForm ? 'Cancel' : 'New Group'}
                        </button>
                    </div>

                    {/* New Group Form */}
                    <AnimatePresence>
                        {showNewGroupForm && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 space-y-6 shadow-sm">
                                <h4 className="text-xs font-black text-[#0F1111] dark:text-white uppercase tracking-widest">Create Customer Group</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Group Name</label>
                                        <input type="text" value={newGroup.name} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                                            placeholder="e.g. VIP Wholesalers"
                                            className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-medium text-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Discount %</label>
                                        <input type="number" min={0} max={100} step={0.5} value={newGroup.discountPercent}
                                            onChange={e => setNewGroup({ ...newGroup, discountPercent: parseFloat(e.target.value) || 0 })}
                                            className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-bold text-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Description</label>
                                        <input type="text" value={newGroup.description} onChange={e => setNewGroup({ ...newGroup, description: e.target.value })}
                                            placeholder="Optional description"
                                            className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-medium text-sm" />
                                    </div>
                                </div>
                                <button onClick={handleCreateGroup} disabled={!newGroup.name}
                                    className={cn("h-11 px-8 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all",
                                        newGroup.name ? "bg-[#FF9900] text-white hover:scale-[1.02] shadow-lg shadow-[#FF9900]/20" : "bg-[#F3F3F3] dark:bg-white/5 text-[#888] cursor-not-allowed")}>
                                    <Save size={14} /> Create Group
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Groups List */}
                    {isLoadingGroups ? (
                        <div className="py-16 flex justify-center text-[#888]"><RefreshCw size={24} className="animate-spin" /></div>
                    ) : groups.length === 0 ? (
                        <div className="text-center py-16 text-[#888]">
                            <Users size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="font-bold">No customer groups yet.</p>
                            <p className="text-sm">Create a group to offer custom pricing to specific buyers.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {groups.map(g => (
                                <div key={g.id} className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 space-y-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 font-black text-lg">
                                                {g.discountPercent}%
                                            </div>
                                            <div>
                                                <h4 className="font-black text-[#0F1111] dark:text-white text-lg">{g.name}</h4>
                                                <p className="text-xs text-[#888] font-medium">{g.description || 'No description'} · {g._count.members} member{g._count.members !== 1 ? 's' : ''}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setAddMemberGroupId(addMemberGroupId === g.id ? null : g.id)}
                                                className="h-9 px-4 rounded-xl bg-[#F7F8F8] dark:bg-white/5 text-[#0F1111] dark:text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#FF9900]/10 hover:text-[#FF9900] transition-all flex items-center gap-1.5">
                                                <UserPlus size={13} /> Add Member
                                            </button>
                                            <button onClick={() => handleDeleteGroup(g.id)}
                                                className="h-9 w-9 rounded-xl bg-red-50 dark:bg-red-900/10 text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all flex items-center justify-center">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Add Member Inline */}
                                    <AnimatePresence>
                                        {addMemberGroupId === g.id && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                                className="flex items-end gap-3 pt-4 border-t border-[#EAEDED] dark:border-white/10">
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Select Buyer</label>
                                                    <select value={memberUserId} onChange={e => setMemberUserId(e.target.value)}
                                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none focus:border-[#FF9900]/50 text-[#0F1111] dark:text-white font-medium text-sm">
                                                        <option value="">Choose a buyer...</option>
                                                        {buyers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.email})</option>)}
                                                    </select>
                                                </div>
                                                <button onClick={handleAddMember} disabled={!memberUserId}
                                                    className={cn("h-11 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shrink-0",
                                                        memberUserId ? "bg-[#FF9900] text-white hover:scale-[1.02]" : "bg-[#F3F3F3] dark:bg-white/5 text-[#888] cursor-not-allowed")}>
                                                    <Check size={14} /> Add
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Members List */}
                                    {g.members.length > 0 && (
                                        <div className="pt-4 border-t border-[#EAEDED] dark:border-white/10 space-y-2">
                                            <p className="text-[10px] font-black text-[#888] uppercase tracking-widest">Members</p>
                                            <div className="flex flex-wrap gap-2">
                                                {g.members.map((m: any) => {
                                                    const buyer = buyers.find(b => b.id === m.userId);
                                                    return (
                                                        <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 text-[11px] font-medium text-[#555] dark:text-[#999] group">
                                                            <span>{buyer ? buyer.name : m.userId}</span>
                                                            <button onClick={() => handleRemoveMember(g.id, m.userId)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 50 }}
                        className={cn(
                            "fixed bottom-8 end-8 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-[100]",
                            toast.type === 'success' ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                        )}
                    >
                        {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                        <span className="text-xs font-black uppercase tracking-widest">{toast.msg}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
