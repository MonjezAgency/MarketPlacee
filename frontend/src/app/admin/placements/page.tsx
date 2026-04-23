'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Layout, Image as ImageIcon, DollarSign, Lock, Unlock, Plus, Trash2,
    X, Eye, Settings, Monitor, Smartphone, Info, CheckCircle, Upload, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAdPlacements, setAdPlacements } from '@/lib/api';

interface PlacementSlot {
    id: string;
    name: string;
    description: string;
    type: 'HERO_BANNER' | 'SPONSORED_CARD' | 'SIDEBAR';
    price: number;
    currency: string;
    isOpen: boolean;
    imageWidth: number;
    imageHeight: number;
    maxFileSize: string;
    guidelines: string;
    ads: PlacementAd[];
}

interface PlacementAd {
    id: string;
    title: string;
    subtitle: string;
    image: string;
    link: string;
    badge: string;
    addedAt: string;
}

const STORAGE_KEY = 'admin-placements';

const DEFAULT_SLOTS: PlacementSlot[] = [
    {
        id: 'hero-banner',
        name: 'Hero Banner Carousel',
        description: 'Full-width premium hero banner on homepage. Auto-rotates every 5 seconds. Maximum visibility.',
        type: 'HERO_BANNER',
        price: 500,
        currency: 'EUR',
        isOpen: true,
        imageWidth: 2000,
        imageHeight: 600,
        maxFileSize: '5MB',
        guidelines: 'Image must be exactly 2000×600px. High-res, landscape, professional product photography only. No text overlays — title & subtitle are added automatically.',
        ads: []
    },
    {
        id: 'sponsored-cards',
        name: 'Sponsored Highlights',
        description: 'Premium product cards shown in the "Sponsored Highlights" section. 3 cards per row.',
        type: 'SPONSORED_CARD',
        price: 200,
        currency: 'EUR',
        isOpen: true,
        imageWidth: 800,
        imageHeight: 800,
        maxFileSize: '3MB',
        guidelines: 'Square image (800×800px). Product-focused photography on clean background. Professional quality required.',
        ads: []
    },
    {
        id: 'sidebar-banner',
        name: 'Sidebar Banner',
        description: 'Vertical banner shown in category pages sidebar. Great for brand awareness.',
        type: 'SIDEBAR',
        price: 100,
        currency: 'EUR',
        isOpen: true,
        imageWidth: 300,
        imageHeight: 600,
        maxFileSize: '2MB',
        guidelines: 'Portrait image (300×600px). Clear branding and call-to-action. No animation.',
        ads: []
    }
];

export default function AdminPlacementsPage() {
    const [slots, setSlots] = useState<PlacementSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<PlacementSlot | null>(null);
    const [showAddAd, setShowAddAd] = useState(false);
    const [editingPrice, setEditingPrice] = useState<string | null>(null);
    const [priceInput, setPriceInput] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const imageUploadRef = React.useRef<HTMLInputElement>(null);

    // Ad form
    const [adForm, setAdForm] = useState({ title: '', subtitle: '', image: '', link: '', badge: 'Sponsored' });

    useEffect(() => {
        const load = async () => {
            const data = await getAdPlacements();
            if (data && Array.isArray(data)) {
                setSlots(data);
            } else {
                setSlots(DEFAULT_SLOTS);
            }
        };
        load();
    }, []);

    const showMsg = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleSaveToBackend = async (currentSlots: PlacementSlot[]) => {
        setIsSaving(true);
        const ok = await setAdPlacements(currentSlots);
        setIsSaving(false);
        if (ok) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSlots));
        } else {
            showMsg('error', 'Failed to sync with server. Changes saved locally only.');
        }
    };

    const updateSlot = (id: string, updates: Partial<PlacementSlot>) => {
        const updated = slots.map(s => s.id === id ? { ...s, ...updates } : s);
        setSlots(updated);
        handleSaveToBackend(updated);
    };

    const toggleOpen = (id: string) => {
        const slot = slots.find(s => s.id === id);
        if (!slot) return;
        updateSlot(id, { isOpen: !slot.isOpen });
        showMsg('success', `${slot.name} is now ${slot.isOpen ? 'CLOSED' : 'OPEN'} for submissions.`);
    };

    const savePrice = (id: string) => {
        const val = parseInt(priceInput);
        if (isNaN(val) || val < 0) { showMsg('error', 'Invalid price.'); return; }
        updateSlot(id, { price: val });
        setEditingPrice(null);
        showMsg('success', 'Price updated!');
    };

    const addAdToSlot = (slotId: string) => {
        if (!adForm.title.trim() || !adForm.image.trim()) {
            showMsg('error', 'Title and image are required.');
            return;
        }
        const slot = slots.find(s => s.id === slotId);
        if (!slot) return;
        const newAd: PlacementAd = {
            id: 'PAD-' + Date.now().toString(36).toUpperCase(),
            title: adForm.title.trim(),
            subtitle: adForm.subtitle.trim(),
            image: adForm.image,
            link: adForm.link.trim() || '/',
            badge: adForm.badge.trim() || 'Sponsored',
            addedAt: new Date().toISOString().split('T')[0]
        };
        updateSlot(slotId, { ads: [...slot.ads, newAd] });
        setAdForm({ title: '', subtitle: '', image: '', link: '', badge: 'Sponsored' });
        setShowAddAd(false);
        showMsg('success', `Ad "${newAd.title}" added to ${slot.name}!`);
        // Update selected slot view
        setSelectedSlot(prev => prev ? { ...prev, ads: [...prev.ads, newAd] } : null);
    };

    const removeAdFromSlot = (slotId: string, adId: string) => {
        const slot = slots.find(s => s.id === slotId);
        if (!slot) return;
        const updatedAds = slot.ads.filter(a => a.id !== adId);
        updateSlot(slotId, { ads: updatedAds });
        showMsg('success', 'Ad removed.');
        setSelectedSlot(prev => prev ? { ...prev, ads: updatedAds } : null);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { showMsg('error', 'Image must be under 5MB.'); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            setAdForm(f => ({ ...f, image: ev.target?.result as string }));
            showMsg('success', 'Image uploaded!');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const typeIcons = { 'HERO_BANNER': Monitor, 'SPONSORED_CARD': Layout, 'SIDEBAR': Smartphone };
    const typeColors = {
        'HERO_BANNER': 'from-[#FF9900] to-[#FF6600]',
        'SPONSORED_CARD': 'from-blue-500 to-blue-700',
        'SIDEBAR': 'from-purple-500 to-purple-700'
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[#0F1111] dark:text-white flex items-center gap-2">
                    <Layout className="text-[#FF9900]" size={24} />
                    Ad Placements Manager
                </h1>
                <p className="text-sm text-[#555] dark:text-[#999] mt-1">
                    Manage premium advertising slots, set pricing, and control availability.
                </p>
            </div>

            {/* Message */}
            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-3 rounded-md border text-sm font-medium ${message.type === 'success' ? 'bg-[#F0FFF4] border-[#067D62]/30 text-[#067D62] dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400' : 'bg-[#FCF4F4] border-[#C40000]/30 text-[#C40000] dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400'}`}
                    >
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Placement Slots */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {slots.map(slot => {
                    const Icon = typeIcons[slot.type];
                    return (
                        <div key={slot.id} className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            {/* Header Gradient */}
                            <div className={cn("p-4 bg-gradient-to-r text-white relative", typeColors[slot.type])}>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Icon size={18} />
                                            <h3 className="font-bold text-sm">{slot.name}</h3>
                                        </div>
                                        <p className="text-white/70 text-[10px]">{slot.description}</p>
                                    </div>
                                    <button
                                        onClick={() => toggleOpen(slot.id)}
                                        className={cn("w-8 h-8 rounded-md flex items-center justify-center transition-all", slot.isOpen ? "bg-white/20 hover:bg-white/30" : "bg-black/20 hover:bg-black/30")}
                                        title={slot.isOpen ? 'Close slot' : 'Open slot'}
                                    >
                                        {slot.isOpen ? <Unlock size={14} /> : <Lock size={14} />}
                                    </button>
                                </div>
                                {/* Status badge */}
                                <div className={cn("absolute top-2 end-12 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest", slot.isOpen ? "bg-emerald-400 text-emerald-900" : "bg-red-400 text-red-900")}>
                                    {slot.isOpen ? 'OPEN' : 'CLOSED'}
                                </div>
                            </div>

                            {/* Body */}
                            <div className="p-4 space-y-3">
                                {/* Pricing */}
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Price / Slot</span>
                                    {editingPrice === slot.id ? (
                                        <div className="flex items-center gap-1">
                                            <input
                                                value={priceInput}
                                                onChange={e => setPriceInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && savePrice(slot.id)}
                                                className="w-20 h-7 text-xs border border-[#E77600] rounded px-2 outline-none text-end bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white"
                                                autoFocus
                                            />
                                            <button onClick={() => savePrice(slot.id)} className="text-emerald-500 hover:text-emerald-600"><CheckCircle size={14} /></button>
                                            <button onClick={() => setEditingPrice(null)} className="text-[#888] hover:text-[#555]"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => { setEditingPrice(slot.id); setPriceInput(String(slot.price)); }}
                                            className="text-lg font-black text-[#0F1111] dark:text-white hover:text-[#FF9900] transition-colors flex items-center gap-1"
                                        >
                                            <DollarSign size={14} className="text-[#FF9900]" />{slot.price}
                                        </button>
                                    )}
                                </div>

                                {/* Image specs */}
                                <div className="bg-[#F9F9F9] dark:bg-white/5 rounded-md p-2.5 space-y-1">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#555] dark:text-[#999]">
                                        <ImageIcon size={10} /> Image Requirements
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px]">
                                        <span className="font-bold text-[#0F1111] dark:text-white">{slot.imageWidth}×{slot.imageHeight}px</span>
                                        <span className="text-[#888]">Max {slot.maxFileSize}</span>
                                    </div>
                                    <p className="text-[9px] text-[#888] leading-relaxed">{slot.guidelines}</p>
                                </div>

                                {/* Active ads count */}
                                <div className="flex items-center justify-between pt-1 border-t border-[#EAEDED] dark:border-white/10">
                                    <span className="text-[10px] font-bold text-[#888] uppercase tracking-wider">Active Ads</span>
                                    <span className="text-sm font-bold text-[#0F1111] dark:text-white">{slot.ads.length}</span>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setSelectedSlot(slot); setShowAddAd(false); }}
                                        className="flex-1 h-9 bg-[#F3F3F3] dark:bg-white/10 text-[#0F1111] dark:text-white text-xs font-bold rounded-md hover:bg-[#EAEDED] dark:hover:bg-white/15 transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <Eye size={13} /> Manage Ads
                                    </button>
                                    <button
                                        onClick={() => { setSelectedSlot(slot); setShowAddAd(true); }}
                                        disabled={!slot.isOpen}
                                        className={cn(
                                            "flex-1 h-9 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5",
                                            slot.isOpen
                                                ? "bg-gradient-to-b from-[#F7DFA5] to-[#F0C14B] border border-[#A88734] text-[#0F1111] hover:from-[#F5D78E] hover:to-[#EEB933]"
                                                : "bg-[#DDD] dark:bg-white/5 text-[#888] cursor-not-allowed"
                                        )}
                                    >
                                        {slot.isOpen ? <><Plus size={13} /> Add Ad</> : <><Lock size={13} /> Closed</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Manage/Add Ad Modal */}
            <AnimatePresence>
                {selectedSlot && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setSelectedSlot(null); setShowAddAd(false); }}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-[#131921] w-full max-w-2xl rounded-lg border border-[#DDD] dark:border-white/10 shadow-2xl relative z-10 overflow-hidden max-h-[85vh] flex flex-col"
                        >
                            {/* Modal Header */}
                            <div className={cn("px-5 py-4 flex items-center justify-between bg-gradient-to-r text-white", typeColors[selectedSlot.type])}>
                                <div>
                                    <h3 className="font-bold text-sm">{selectedSlot.name}</h3>
                                    <p className="text-white/70 text-[10px]">{selectedSlot.imageWidth}×{selectedSlot.imageHeight}px · ${selectedSlot.price}/slot</p>
                                </div>
                                <button onClick={() => { setSelectedSlot(null); setShowAddAd(false); }} className="text-white/70 hover:text-white"><X size={18} /></button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                {/* Add Ad Form */}
                                {showAddAd && selectedSlot.isOpen && (
                                    <div className="border border-dashed border-[#FF9900]/50 bg-[#FEF8E8] dark:bg-[#FF9900]/5 rounded-md p-4 space-y-3">
                                        <h4 className="text-xs font-bold text-[#0F1111] dark:text-white flex items-center gap-1.5">
                                            <Plus size={14} className="text-[#FF9900]" /> Add New Ad
                                        </h4>

                                        {/* Image spec reminder */}
                                        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded p-2">
                                            <Info size={12} className="text-blue-500 flex-shrink-0" />
                                            <p className="text-[10px] text-blue-700 dark:text-blue-400">
                                                Required: <strong>{selectedSlot.imageWidth}×{selectedSlot.imageHeight}px</strong> image. Max {selectedSlot.maxFileSize}. {selectedSlot.guidelines}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-[#888] uppercase">Title *</label>
                                                <input value={adForm.title} onChange={e => setAdForm(f => ({ ...f, title: e.target.value }))} placeholder="Ad headline..." className="w-full h-9 border border-[#888] dark:border-white/20 rounded px-2.5 text-xs outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-[#888] uppercase">Badge</label>
                                                <input value={adForm.badge} onChange={e => setAdForm(f => ({ ...f, badge: e.target.value }))} placeholder="e.g. Hot Deal" className="w-full h-9 border border-[#888] dark:border-white/20 rounded px-2.5 text-xs outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white" />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-[#888] uppercase">Subtitle</label>
                                            <input value={adForm.subtitle} onChange={e => setAdForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="Short description..." className="w-full h-9 border border-[#888] dark:border-white/20 rounded px-2.5 text-xs outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white" />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-[#888] uppercase">Link URL</label>
                                            <input value={adForm.link} onChange={e => setAdForm(f => ({ ...f, link: e.target.value }))} placeholder="/categories or https://..." className="w-full h-9 border border-[#888] dark:border-white/20 rounded px-2.5 text-xs outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white" />
                                        </div>

                                        {/* Image upload */}
                                        <div className="space-y-2 border border-dashed border-[#DDD] dark:border-white/10 rounded p-3 bg-white dark:bg-[#0F1111]">
                                            <label className="text-[10px] font-bold text-[#888] uppercase block">Image *</label>

                                            {adForm.image && (
                                                <div className="relative inline-block">
                                                    <img src={adForm.image} alt="Preview" className="h-20 rounded border border-[#DDD] dark:border-white/10" style={{ aspectRatio: `${selectedSlot.imageWidth}/${selectedSlot.imageHeight}` }} />
                                                    <button onClick={() => setAdForm(f => ({ ...f, image: '' }))} className="absolute -top-1 -end-1 w-4 h-4 bg-[#C40000] text-white rounded-full flex items-center justify-center text-[8px]"><X size={8} /></button>
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                <input type="file" ref={imageUploadRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                                                <button type="button" onClick={() => imageUploadRef.current?.click()} className="h-8 px-3 border border-[#DDD] dark:border-white/10 rounded text-[10px] font-bold text-[#555] dark:text-[#999] hover:border-[#FF9900] hover:text-[#FF9900] transition-all flex items-center gap-1 bg-white dark:bg-[#0F1111]">
                                                    <Upload size={11} /> Upload
                                                </button>
                                                <input
                                                    value={adForm.image.startsWith('data:') ? '' : adForm.image}
                                                    onChange={e => setAdForm(f => ({ ...f, image: e.target.value }))}
                                                    placeholder="or paste image URL..."
                                                    className="flex-1 h-8 border border-[#888] dark:border-white/20 rounded px-2 text-[10px] outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-end gap-2 pt-1">
                                            <button onClick={() => setShowAddAd(false)} className="h-8 px-3 text-xs font-bold text-[#888] hover:text-[#0F1111] dark:hover:text-white transition-colors">Cancel</button>
                                            <button onClick={() => addAdToSlot(selectedSlot.id)} className="h-8 px-4 bg-gradient-to-b from-[#F7DFA5] to-[#F0C14B] border border-[#A88734] rounded text-xs font-bold text-[#0F1111] hover:from-[#F5D78E] hover:to-[#EEB933] transition-all">
                                                Add to {selectedSlot.name}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Existing ads list */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-[#0F1111] dark:text-white">Active Ads ({selectedSlot.ads.length})</h4>
                                        {!showAddAd && selectedSlot.isOpen && (
                                            <button onClick={() => setShowAddAd(true)} className="text-[10px] font-bold text-[#FF9900] hover:underline flex items-center gap-1">
                                                <Plus size={12} /> Add Ad
                                            </button>
                                        )}
                                    </div>

                                    {selectedSlot.ads.length === 0 ? (
                                        <div className="py-8 text-center border border-dashed border-[#DDD] dark:border-white/10 rounded-md">
                                            <ImageIcon className="w-10 h-10 text-[#DDD] dark:text-white/20 mx-auto mb-2" />
                                            <p className="text-xs text-[#888]">No ads in this placement yet.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {selectedSlot.ads.map(ad => (
                                                <div key={ad.id} className="flex items-center gap-3 bg-[#F9F9F9] dark:bg-white/5 border border-[#EAEDED] dark:border-white/10 rounded-md p-3">
                                                    <img src={ad.image} alt={ad.title} className="w-16 h-10 object-cover rounded border border-[#DDD] dark:border-white/10" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold text-[#0F1111] dark:text-white truncate">{ad.title}</p>
                                                        <p className="text-[10px] text-[#888] truncate">{ad.subtitle || ad.badge}</p>
                                                    </div>
                                                    <span className="text-[9px] text-[#888]">{ad.addedAt}</span>
                                                    <button
                                                        onClick={() => removeAdFromSlot(selectedSlot.id, ad.id)}
                                                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-[#C40000] transition-colors"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Info box */}
            <div className="bg-[#F0F4FF] dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-md p-4">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">ℹ️ How Premium Placements Work</p>
                <ul className="text-[11px] text-blue-600 dark:text-blue-400/70 space-y-1 list-disc list-inside">
                    <li><strong>Hero Banner</strong> — Full-width carousel on homepage. Must be 2000×600px. Auto-rotates every 5s.</li>
                    <li><strong>Sponsored Highlights</strong> — Product cards (3 per row). 800×800px square images.</li>
                    <li><strong>Sidebar Banner</strong> — Category page sidebars. 300×600px portrait.</li>
                    <li>Set <strong>pricing</strong> per slot by clicking the dollar amount. Toggle <strong>Open/Closed</strong> with the lock icon.</li>
                </ul>
            </div>
        </div>
    );
}
