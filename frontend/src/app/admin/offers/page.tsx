'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Tag,
    CheckCircle,
    XCircle,
    Clock,
    Search,
    Plus,
    Building2,
    Calendar,
    CircleDollarSign,
    Zap,
    X,
    MapPin,
    Eye,
    Image as ImageIcon,
    Upload,
    Trash2,
    FileSpreadsheet,
    Edit2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Offer {
    id: string;
    title: string;
    description: string;
    type: 'Flash Sale' | 'Bundle' | 'Discount' | 'BOGO';
    slot: 'HERO' | 'FEATURED' | 'BANNER' | 'LISTING';
    discount: string;
    status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED';
    startDate: string;
    endDate: string;
    image?: string;
    showSponsored: boolean;
}

const STORAGE_KEY = 'admin-offers';

function loadOffers(): Offer[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
}

function saveOffers(offers: Offer[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
}

export default function AdminOffersPage() {
    const [offers, setOffers] = React.useState<Offer[]>([]);
    const [showAddModal, setShowAddModal] = React.useState(false);
    const [selectedOffer, setSelectedOffer] = React.useState<Offer | null>(null);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const imageUploadRef = React.useRef<HTMLInputElement>(null);
    const [eanInput, setEanInput] = React.useState('');
    const [eanLoading, setEanLoading] = React.useState(false);

    // Form state
    const [form, setForm] = React.useState({
        title: '',
        description: '',
        type: 'Discount' as Offer['type'],
        slot: 'FEATURED' as Offer['slot'],
        discount: '',
        startDate: '',
        endDate: '',
        image: '',
        showSponsored: true
    });

    React.useEffect(() => {
        setOffers(loadOffers());
    }, []);

    const showMsg = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 4000);
    };

    const resetForm = () => {
        setForm({ title: '', description: '', type: 'Discount', slot: 'FEATURED', discount: '', startDate: '', endDate: '', image: '', showSponsored: true });
        setEanInput('');
    };

    // Image upload handler (file → base64)
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showMsg('error', 'Image must be under 5MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            setForm(f => ({ ...f, image: base64 }));
            showMsg('success', 'Image uploaded!');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    // EAN barcode lookup — prioritizes front-facing product images
    const lookupEAN = async () => {
        const ean = eanInput.trim();
        if (!ean) { showMsg('error', 'Please enter an EAN/barcode.'); return; }
        setEanLoading(true);
        try {
            // Try Open Food Facts first — prioritize front product image, not nutrition labels
            const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
            if (res.ok) {
                const data = await res.json();
                if (data?.status === 1 && data?.product) {
                    const p = data.product;
                    // Priority: front image > selected front > general image
                    const bestImage =
                        p.image_front_url ||
                        p.selected_images?.front?.display?.en ||
                        p.selected_images?.front?.display?.fr ||
                        p.image_front_small_url ||
                        p.image_url;
                    if (bestImage) {
                        // Get highest quality version (replace .400. with .full.)
                        const hqImage = bestImage.replace(/\.\d+\.jpg/, '.full.jpg').replace(/\.\d+\.png/, '.full.png');
                        setForm(f => ({ ...f, image: hqImage }));
                        showMsg('success', `Product image found for EAN ${ean}!`);
                        setEanLoading(false);
                        return;
                    }
                }
            }
            // Fallback: UPC Item DB — usually has good product photos
            const res2 = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`);
            if (res2.ok) {
                const data2 = await res2.json();
                if (data2?.items && data2.items.length > 0 && data2.items[0].images && data2.items[0].images.length > 0) {
                    setForm(f => ({ ...f, image: data2.items[0].images[0] }));
                    showMsg('success', `Product image found via UPC for ${ean}!`);
                    setEanLoading(false);
                    return;
                }
            }
            showMsg('error', `No product image found for EAN ${ean}. Try uploading a professional image manually.`);
        } catch (err) {
            showMsg('error', 'Failed to lookup EAN. Check your connection.');
        } finally {
            setEanLoading(false);
        }
    };

    const addOffer = () => {
        if (!form.title.trim() || !form.discount.trim()) {
            showMsg('error', 'Title and discount are required.');
            return;
        }
        const today = new Date().toISOString().split('T')[0];
        const newOffer: Offer = {
            id: 'OFF-' + Date.now().toString(36).toUpperCase(),
            title: form.title.trim(),
            description: form.description.trim(),
            type: form.type,
            slot: form.slot,
            discount: form.discount.trim(),
            status: (form.startDate && form.startDate > today) ? 'SCHEDULED' : 'ACTIVE',
            startDate: form.startDate || today,
            endDate: form.endDate || '',
            image: form.image || '',
            showSponsored: form.showSponsored
        };
        const updated = [newOffer, ...offers];
        setOffers(updated);
        saveOffers(updated);
        resetForm();
        setShowAddModal(false);
        showMsg('success', `Offer "${newOffer.title}" added successfully!`);
    };

    const deleteOffer = (id: string) => {
        const updated = offers.filter(o => o.id !== id);
        setOffers(updated);
        saveOffers(updated);
        showMsg('success', 'Offer deleted.');
    };

    const toggleSponsored = (id: string) => {
        const updated = offers.map(o => o.id === id ? { ...o, showSponsored: !o.showSponsored } : o);
        setOffers(updated);
        saveOffers(updated);
    };

    // CSV Upload
    const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length < 2) { showMsg('error', 'CSV file must have a header row and at least one data row.'); return; }

                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                const titleIdx = headers.indexOf('title');
                const descIdx = headers.indexOf('description');
                const typeIdx = headers.indexOf('type');
                const discountIdx = headers.indexOf('discount');
                const startIdx = headers.indexOf('startdate');
                const endIdx = headers.indexOf('enddate');

                if (titleIdx === -1 || discountIdx === -1) {
                    showMsg('error', 'CSV must have at least "title" and "discount" columns.');
                    return;
                }

                const today = new Date().toISOString().split('T')[0];
                const newOffers: Offer[] = [];

                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                    const title = cols[titleIdx];
                    if (!title) continue;

                    newOffers.push({
                        id: 'OFF-' + (Date.now() + i).toString(36).toUpperCase(),
                        title,
                        description: descIdx !== -1 ? (cols[descIdx] || '') : '',
                        type: (typeIdx !== -1 && ['Flash Sale', 'Bundle', 'Discount', 'BOGO'].includes(cols[typeIdx])) ? cols[typeIdx] as Offer['type'] : 'Discount',
                        slot: 'FEATURED',
                        discount: cols[discountIdx] || '0%',
                        status: (startIdx !== -1 && cols[startIdx] > today) ? 'SCHEDULED' : 'ACTIVE',
                        startDate: startIdx !== -1 ? (cols[startIdx] || today) : today,
                        endDate: endIdx !== -1 ? (cols[endIdx] || '') : '',
                        showSponsored: true
                    });
                }

                if (newOffers.length === 0) {
                    showMsg('error', 'No valid offers found in CSV.');
                    return;
                }

                const updated = [...newOffers, ...offers];
                setOffers(updated);
                saveOffers(updated);
                showMsg('success', `${newOffers.length} offers imported from CSV!`);
            } catch (err) {
                showMsg('error', 'Failed to parse CSV file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const filtered = offers.filter(o =>
        o.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const statusColors = {
        ACTIVE: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        SCHEDULED: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
        EXPIRED: 'bg-red-500/10 text-red-500 border-red-500/20'
    };

    const typeColors: Record<string, string> = {
        'Flash Sale': 'bg-red-500/10 text-red-500 border-red-500/20',
        'Bundle': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        'Discount': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        'BOGO': 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#0F1111] dark:text-white flex items-center gap-2">
                        <Tag className="text-[#FF9900]" size={24} />
                        Offers Management
                    </h1>
                    <p className="text-sm text-[#555] dark:text-[#999] mt-1">Create, manage, and track promotional offers.</p>
                </div>
                <div className="flex items-center gap-2">
                    <input type="file" ref={fileInputRef} accept=".csv" onChange={handleCSVUpload} className="hidden" />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="h-10 px-4 bg-white dark:bg-[#1A1F26] border border-[#DDD] dark:border-white/10 text-[#555] dark:text-[#999] font-bold text-xs rounded-md hover:border-[#FF9900] hover:text-[#FF9900] transition-all flex items-center gap-2"
                    >
                        <FileSpreadsheet size={16} /> Upload CSV
                    </button>
                    <button
                        onClick={() => { resetForm(); setShowAddModal(true); }}
                        className="h-10 px-5 bg-gradient-to-b from-[#F7DFA5] to-[#F0C14B] border border-[#A88734] text-[#0F1111] font-bold text-xs rounded-md hover:from-[#F5D78E] hover:to-[#EEB933] transition-all flex items-center gap-2 shadow-sm"
                    >
                        <Plus size={16} /> Add Offer
                    </button>
                </div>
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

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Offers', value: offers.length, icon: Tag, color: 'text-[#FF9900]', bg: 'bg-[#FF9900]/10' },
                    { label: 'Active', value: offers.filter(o => o.status === 'ACTIVE').length, icon: Zap, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: 'Scheduled', value: offers.filter(o => o.status === 'SCHEDULED').length, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { label: 'Expired', value: offers.filter(o => o.status === 'EXPIRED').length, icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 p-4 rounded-lg">
                        <div className={cn("w-8 h-8 rounded-md flex items-center justify-center mb-2", stat.bg, stat.color)}>
                            <stat.icon size={16} />
                        </div>
                        <p className="text-[10px] font-bold text-[#888] uppercase tracking-wider">{stat.label}</p>
                        <p className="text-xl font-bold text-[#0F1111] dark:text-white">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-[#888]" size={16} />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search offers..."
                    className="w-full h-10 bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-md ps-10 pe-4 outline-none focus:border-[#FF9900] text-sm text-[#0F1111] dark:text-white transition-all"
                />
            </div>

            {/* Offers Table */}
            <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-lg overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-[#F3F3F3] dark:bg-white/5 border-b border-[#DDD] dark:border-white/10">
                    <h3 className="text-sm font-bold text-[#0F1111] dark:text-white">All Offers ({filtered.length})</h3>
                </div>

                {filtered.length === 0 ? (
                    <div className="py-16 text-center">
                        <Tag className="w-12 h-12 text-[#DDD] dark:text-white/20 mx-auto mb-4" />
                        <p className="text-sm text-[#888] font-medium">No offers yet. Click "Add Offer" or upload a CSV to get started.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-start">
                            <thead>
                                <tr className="bg-[#FAFAFA] dark:bg-white/5">
                                    <th className="px-4 py-3 text-[10px] font-bold text-[#888] uppercase tracking-wider">Offer</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-[#888] uppercase tracking-wider">Type</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-[#888] uppercase tracking-wider">Discount</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-[#888] uppercase tracking-wider">Sponsored</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-[#888] uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-[#888] uppercase tracking-wider">Duration</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-[#888] uppercase tracking-wider text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EAEDED] dark:divide-white/5">
                                {filtered.map((offer) => (
                                    <tr key={offer.id} className="hover:bg-[#F9F9F9] dark:hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-bold text-[#0F1111] dark:text-white">{offer.title}</p>
                                            <p className="text-[10px] text-[#888]">{offer.id}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase border", typeColors[offer.type] || 'bg-gray-100 text-gray-500')}>
                                                {offer.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm font-bold text-[#067D62]">{offer.discount}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => toggleSponsored(offer.id)}
                                                className={cn(
                                                    "relative w-9 h-5 rounded-full transition-colors",
                                                    offer.showSponsored ? "bg-[#FF9900]" : "bg-[#CCC] dark:bg-white/20"
                                                )}
                                                title={offer.showSponsored ? 'Sponsored: ON' : 'Sponsored: OFF'}
                                            >
                                                <span className={cn(
                                                    "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                                                    offer.showSponsored ? "left-[18px]" : "start-0.5"
                                                )} />
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border", statusColors[offer.status])}>
                                                {offer.status === 'ACTIVE' ? <CheckCircle size={10} /> : offer.status === 'SCHEDULED' ? <Clock size={10} /> : <XCircle size={10} />}
                                                {offer.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs text-[#555] dark:text-[#999]">
                                                {offer.startDate}{offer.endDate ? ` → ${offer.endDate}` : ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => setSelectedOffer(offer)} className="p-1.5 rounded-md hover:bg-[#F3F3F3] dark:hover:bg-white/10 text-[#555] dark:text-[#999] transition-colors" title="View">
                                                    <Eye size={14} />
                                                </button>
                                                <button onClick={() => deleteOffer(offer.id)} className="p-1.5 rounded-md hover:bg-[#FCF4F4] dark:hover:bg-red-500/10 text-[#C40000] transition-colors" title="Delete">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add Offer Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowAddModal(false)}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white dark:bg-[#131921] w-full max-w-lg rounded-lg border border-[#DDD] dark:border-white/10 shadow-2xl relative z-10 overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-[#DDD] dark:border-white/10 bg-[#F3F3F3] dark:bg-white/5">
                                <h3 className="text-sm font-bold text-[#0F1111] dark:text-white flex items-center gap-2">
                                    <Plus size={16} className="text-[#FF9900]" /> Add New Offer
                                </h3>
                                <button onClick={() => setShowAddModal(false)} className="text-[#888] hover:text-[#0F1111] dark:hover:text-white transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider">Offer Title *</label>
                                    <input
                                        value={form.title}
                                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                        placeholder="e.g. Summer Sale 50% Off"
                                        className="w-full h-10 border border-[#888] dark:border-white/20 rounded-md px-3 text-sm outline-none focus:border-[#E77600] focus:shadow-[0_0_0_3px_rgba(228,121,17,0.5)] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white transition-all"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider">Description</label>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                        placeholder="Offer details..."
                                        rows={2}
                                        className="w-full border border-[#888] dark:border-white/20 rounded-md px-3 py-2 text-sm outline-none focus:border-[#E77600] focus:shadow-[0_0_0_3px_rgba(228,121,17,0.5)] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white transition-all resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider">Type *</label>
                                        <select
                                            value={form.type}
                                            onChange={e => setForm(f => ({ ...f, type: e.target.value as Offer['type'] }))}
                                            className="w-full h-10 border border-[#888] dark:border-white/20 rounded-md px-3 text-sm outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white cursor-pointer"
                                        >
                                            <option value="Discount">Discount</option>
                                            <option value="Flash Sale">Flash Sale</option>
                                            <option value="Bundle">Bundle</option>
                                            <option value="BOGO">Buy 1 Get 1</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider">Discount *</label>
                                        <input
                                            value={form.discount}
                                            onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                                            placeholder="e.g. 20% or $10"
                                            className="w-full h-10 border border-[#888] dark:border-white/20 rounded-md px-3 text-sm outline-none focus:border-[#E77600] focus:shadow-[0_0_0_3px_rgba(228,121,17,0.5)] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider">Slot</label>
                                        <select
                                            value={form.slot}
                                            onChange={e => setForm(f => ({ ...f, slot: e.target.value as Offer['slot'] }))}
                                            className="w-full h-10 border border-[#888] dark:border-white/20 rounded-md px-3 text-sm outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white cursor-pointer"
                                        >
                                            <option value="HERO">Hero Banner</option>
                                            <option value="FEATURED">Featured</option>
                                            <option value="BANNER">Sidebar Banner</option>
                                            <option value="LISTING">Listing</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider">Image URL</label>
                                        <input
                                            value={form.image.startsWith('data:') ? '' : form.image}
                                            onChange={e => setForm(f => ({ ...f, image: e.target.value }))}
                                            placeholder="https://..."
                                            className="w-full h-10 border border-[#888] dark:border-white/20 rounded-md px-3 text-sm outline-none focus:border-[#E77600] focus:shadow-[0_0_0_3px_rgba(228,121,17,0.5)] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Image Section: Upload / EAN Lookup */}
                                <div className="space-y-3 border border-dashed border-[#DDD] dark:border-white/10 rounded-md p-3 bg-[#FAFAFA] dark:bg-white/5">
                                    <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider block">Product Image</label>

                                    {/* Preview */}
                                    {form.image && (
                                        <div className="relative inline-block">
                                            <img src={form.image} alt="Preview" className="w-24 h-24 object-cover rounded-md border border-[#DDD] dark:border-white/10" />
                                            <button
                                                onClick={() => setForm(f => ({ ...f, image: '' }))}
                                                className="absolute -top-1.5 -end-1.5 w-5 h-5 bg-[#C40000] text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        {/* Upload File */}
                                        <input type="file" ref={imageUploadRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                                        <button
                                            type="button"
                                            onClick={() => imageUploadRef.current?.click()}
                                            className="h-9 px-3 border border-[#DDD] dark:border-white/10 rounded-md text-xs font-bold text-[#555] dark:text-[#999] hover:border-[#FF9900] hover:text-[#FF9900] transition-all flex items-center gap-1.5 bg-white dark:bg-[#0F1111]"
                                        >
                                            <Upload size={13} /> Upload Image
                                        </button>

                                        {/* EAN Lookup */}
                                        <div className="flex items-center gap-1 flex-1 min-w-[180px]">
                                            <input
                                                value={eanInput}
                                                onChange={e => setEanInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), lookupEAN())}
                                                placeholder="Enter EAN barcode..."
                                                className="flex-1 h-9 border border-[#888] dark:border-white/20 rounded-md px-2.5 text-xs outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={lookupEAN}
                                                disabled={eanLoading}
                                                className="h-9 px-3 bg-[#232F3E] text-white dark:bg-[#FF9900] dark:text-[#0F1111] rounded-md text-xs font-bold hover:opacity-90 transition-all flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                {eanLoading ? (
                                                    <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Searching...</>
                                                ) : (
                                                    <><Search size={13} /> Find Image</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider">Start Date</label>
                                        <input
                                            type="date"
                                            value={form.startDate}
                                            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                                            className="w-full h-10 border border-[#888] dark:border-white/20 rounded-md px-3 text-sm outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white cursor-pointer"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-[#555] dark:text-[#999] uppercase tracking-wider">End Date</label>
                                        <input
                                            type="date"
                                            value={form.endDate}
                                            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                                            className="w-full h-10 border border-[#888] dark:border-white/20 rounded-md px-3 text-sm outline-none focus:border-[#E77600] bg-white dark:bg-[#0F1111] text-[#0F1111] dark:text-white cursor-pointer"
                                        />
                                    </div>
                                </div>

                                {/* SPONSORED Tag Toggle */}
                                <div className="flex items-center justify-between bg-[#F9F9F9] dark:bg-white/5 border border-[#EAEDED] dark:border-white/10 rounded-md p-3">
                                    <div>
                                        <p className="text-xs font-bold text-[#0F1111] dark:text-white">Show "SPONSORED" Tag</p>
                                        <p className="text-[10px] text-[#888] mt-0.5">Display a sponsored badge on this offer in the storefront</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, showSponsored: !f.showSponsored }))}
                                        className={cn(
                                            "relative w-11 h-6 rounded-full transition-colors",
                                            form.showSponsored ? "bg-[#FF9900]" : "bg-[#CCC] dark:bg-white/20"
                                        )}
                                    >
                                        <span className={cn(
                                            "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                                            form.showSponsored ? "left-[22px]" : "start-0.5"
                                        )} />
                                    </button>
                                </div>
                            </div>

                            <div className="px-5 py-4 border-t border-[#DDD] dark:border-white/10 bg-[#F9F9F9] dark:bg-white/5 flex justify-end gap-2">
                                <button onClick={() => setShowAddModal(false)} className="h-9 px-4 border border-[#DDD] dark:border-white/10 rounded-md text-xs font-bold text-[#555] dark:text-[#999] hover:bg-[#F3F3F3] dark:hover:bg-white/10 transition-all">
                                    Cancel
                                </button>
                                <button
                                    onClick={addOffer}
                                    className="h-9 px-5 bg-gradient-to-b from-[#F7DFA5] to-[#F0C14B] border border-[#A88734] rounded-md text-xs font-bold text-[#0F1111] hover:from-[#F5D78E] hover:to-[#EEB933] transition-all shadow-sm"
                                >
                                    Add Offer
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedOffer && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedOffer(null)}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-[#131921] w-full max-w-md rounded-lg border border-[#DDD] dark:border-white/10 shadow-2xl relative z-10"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-[#DDD] dark:border-white/10">
                                <h3 className="text-sm font-bold text-[#0F1111] dark:text-white">Offer Details</h3>
                                <button onClick={() => setSelectedOffer(null)} className="text-[#888] hover:text-[#0F1111] dark:hover:text-white transition-colors">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="p-5 space-y-4">
                                {selectedOffer.image && (
                                    <img src={selectedOffer.image} alt={selectedOffer.title} className="w-full h-40 object-cover rounded-md" />
                                )}
                                <div>
                                    <h4 className="text-lg font-bold text-[#0F1111] dark:text-white">{selectedOffer.title}</h4>
                                    <p className="text-xs text-[#888] mt-1">{selectedOffer.id}</p>
                                </div>
                                {selectedOffer.description && (
                                    <p className="text-sm text-[#555] dark:text-[#999]">{selectedOffer.description}</p>
                                )}
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div><span className="text-[10px] font-bold text-[#888] uppercase block">Type</span><span className="font-bold text-[#0F1111] dark:text-white">{selectedOffer.type}</span></div>
                                    <div><span className="text-[10px] font-bold text-[#888] uppercase block">Discount</span><span className="font-bold text-[#067D62]">{selectedOffer.discount}</span></div>
                                    <div><span className="text-[10px] font-bold text-[#888] uppercase block">Slot</span><span className="font-bold text-[#0F1111] dark:text-white">{selectedOffer.slot}</span></div>
                                    <div><span className="text-[10px] font-bold text-[#888] uppercase block">Status</span><span className={cn("font-bold", selectedOffer.status === 'ACTIVE' ? 'text-emerald-600' : selectedOffer.status === 'SCHEDULED' ? 'text-amber-600' : 'text-red-500')}>{selectedOffer.status}</span></div>
                                    <div><span className="text-[10px] font-bold text-[#888] uppercase block">Start</span><span className="text-[#555] dark:text-[#999]">{selectedOffer.startDate}</span></div>
                                    <div><span className="text-[10px] font-bold text-[#888] uppercase block">End</span><span className="text-[#555] dark:text-[#999]">{selectedOffer.endDate || 'Open'}</span></div>
                                </div>
                            </div>
                            <div className="px-5 py-4 border-t border-[#DDD] dark:border-white/10 flex justify-end">
                                <button
                                    onClick={() => { deleteOffer(selectedOffer.id); setSelectedOffer(null); }}
                                    className="h-9 px-4 text-xs font-bold text-[#C40000] hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all flex items-center gap-1.5"
                                >
                                    <Trash2 size={14} /> Delete Offer
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* CSV Format Hint */}
            <div className="bg-[#F0F4FF] dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-md p-4">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">📄 CSV Upload Format</p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400/70 font-mono">title,discount,type,description,startdate,enddate</p>
                <p className="text-[10px] text-blue-500/70 mt-1">Required columns: <strong>title</strong>, <strong>discount</strong>. Optional: type (Discount/Flash Sale/Bundle/BOGO), description, startdate, enddate.</p>
            </div>
        </div>
    );
}
