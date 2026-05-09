'use client';

/**
 * Supplier Wholesale Offers — separate tab from Ad Placements.
 *
 * Concept: a supplier picks an existing platform product and posts an
 * offer on it (price + quantity + tier). Admin reviews, approves, and
 * the platform email-blasts the offer to every newsletter subscriber
 * + every customer. Each row = ONE offer = ONE product.
 *
 * IMPORTANT: a supplier can NOT post an offer on a product that has
 * not yet been published on the platform. The picker only lists
 * APPROVED products from the catalog — bulk uploads match by name
 * and reject rows that don't resolve.
 */

import * as React from 'react';
import {
    Plus, Upload, X, Trash2, Loader2, CheckCircle2, Clock, XCircle, Info,
    Package, Tag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
type Tier = 'truck' | 'pallet' | 'carton';

interface Offer {
    id: string;
    pricePerUnit: number;
    unit: Tier;
    quantity: number;
    validUntil?: string | null;
    notes?: string | null;
    status: Status;
    adminNotes?: string | null;
    createdAt: string;
    product?: { id: string; name: string; brand?: string; images?: string[]; ean?: string; exwLocation?: string };
}

const asArray = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.products)) return raw.products;
    return [];
};

export default function SupplierOffersPage() {
    const [offers, setOffers] = React.useState<Offer[]>([]);
    const [products, setProducts] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isAddOpen, setIsAddOpen] = React.useState(false);
    const [isUploadInfoOpen, setIsUploadInfoOpen] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const [uploadReport, setUploadReport] = React.useState<any>(null);
    const fileRef = React.useRef<HTMLInputElement | null>(null);

    const fetchAll = React.useCallback(async () => {
        setIsLoading(true);
        try {
            // /products/my-products returns ONLY this supplier's listings
            // (any status). We filter client-side to APPROVED — a
            // supplier can only post offers on products they uploaded
            // AND that have already been approved by Atlantis.
            const [oRes, pRes] = await Promise.all([
                apiFetch('/offers/mine'),
                apiFetch('/products/my-products'),
            ]);
            if (oRes.ok) setOffers(asArray(await oRes.json()));
            if (pRes.ok) {
                const all = asArray(await pRes.json());
                setProducts(all.filter((p: any) => String(p.status).toUpperCase() === 'APPROVED'));
            }
        } catch (err) {
            console.error('Failed to load offers', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleManualAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload = {
            productId: String(fd.get('productId') || ''),
            pricePerUnit: parseFloat(String(fd.get('pricePerUnit') || '0')),
            unit: String(fd.get('unit') || 'carton') as Tier,
            quantity: parseInt(String(fd.get('quantity') || '0'), 10),
            validUntil: String(fd.get('validUntil') || '') || undefined,
            notes: String(fd.get('notes') || '') || undefined,
        };
        if (!payload.productId) return toast.error('Pick a product from the catalog');
        if (!(payload.pricePerUnit > 0)) return toast.error('Enter a valid price');
        if (!(payload.quantity > 0)) return toast.error('Enter a valid quantity');
        try {
            const res = await apiFetch('/offers', { method: 'POST', body: JSON.stringify(payload) });
            if (res.ok) {
                toast.success('Offer submitted — waiting for admin approval');
                setIsAddOpen(false);
                fetchAll();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Failed to create offer');
            }
        } catch {
            toast.error('Network error');
        }
    };

    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        setUploadReport(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await apiFetch('/offers/bulk-upload', { method: 'POST', body: fd });
            if (res.ok) {
                const report = await res.json();
                setUploadReport(report);
                toast.success(`Uploaded ${report.created} offer(s) — waiting for admin approval`);
                fetchAll();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Upload failed');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setIsUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this offer?')) return;
        try {
            const res = await apiFetch(`/offers/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Offer removed');
                fetchAll();
            } else {
                toast.error('Delete failed');
            }
        } catch {
            toast.error('Network error');
        }
    };

    const STATUS_STYLE: Record<Status, { label: string; cls: string; icon: any }> = {
        PENDING:  { label: 'Pending review', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
        APPROVED: { label: 'Approved · live',cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
        REJECTED: { label: 'Rejected',       cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
        EXPIRED:  { label: 'Expired',        cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: Clock },
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-16">
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleBulkUpload} className="hidden" />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2EC4B6]">Wholesale</p>
                    <h1 className="text-[28px] font-black tracking-tight text-[#0F172A]">My Offers</h1>
                    <p className="text-[13px] text-slate-500 mt-1 max-w-xl">Post a price-and-quantity offer on a product that's already on Atlantis. Once approved, it goes out to every active client on the platform.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setIsUploadInfoOpen(true)}
                        disabled={isUploading}
                        className="h-11 px-5 bg-white border border-slate-200 hover:border-[#2EC4B6] rounded-xl text-[12px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        Upload Sheet
                    </button>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="h-11 px-6 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-xl text-[12px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow"
                    >
                        <Plus size={16} /> Add Offer
                    </button>
                </div>
            </div>

            {/* Upload report */}
            {uploadReport && (
                <div className="bg-white border border-emerald-200 rounded-2xl p-5 flex items-start gap-4">
                    <CheckCircle2 size={22} className="text-emerald-500 mt-0.5" />
                    <div className="flex-1 text-[13px]">
                        <p className="font-black mb-1">Upload finished</p>
                        <p><span className="font-bold text-emerald-600">{uploadReport.created} created</span> · <span className="font-bold text-amber-600">{uploadReport.errors?.length || 0} skipped</span> · {uploadReport.totalRows} rows total</p>
                        {uploadReport.errors?.length > 0 && (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-amber-700 font-bold">{uploadReport.errors.length} skipped row(s) — click to see why</summary>
                                <ul className="mt-2 ml-4 list-disc text-[12px] text-slate-600 space-y-0.5 max-h-[180px] overflow-y-auto">
                                    {uploadReport.errors.slice(0, 50).map((e: any, i: number) => (
                                        <li key={i}>Row {e.row}: {e.reason}</li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                    <button onClick={() => setUploadReport(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
            )}

            {/* Offers list */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                {isLoading ? (
                    <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#2EC4B6]" size={28} /></div>
                ) : offers.length === 0 ? (
                    <div className="py-20 text-center text-slate-400">
                        <Tag size={32} className="mx-auto mb-3 opacity-40" />
                        <p className="font-bold text-slate-500">No offers yet</p>
                        <p className="text-[13px] mt-1">Click <span className="text-[#0F172A] font-bold">Add Offer</span> to post your first wholesale offer.</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Product</th>
                                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Tier</th>
                                <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Price / unit</th>
                                <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Qty</th>
                                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                                <th className="px-5 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {offers.map(o => {
                                const St = STATUS_STYLE[o.status]?.icon || Clock;
                                const stClass = STATUS_STYLE[o.status]?.cls || '';
                                const stLabel = STATUS_STYLE[o.status]?.label || o.status;
                                return (
                                    <tr key={o.id} className="hover:bg-slate-50/60">
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                {o.product?.images?.[0] ? (
                                                    <img src={o.product.images[0]} alt={o.product.name} className="w-10 h-10 rounded-lg object-cover bg-slate-100" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Package size={16} className="text-slate-400" /></div>
                                                )}
                                                <div>
                                                    <div className="text-[13px] font-black text-[#0F172A]">{o.product?.name || '—'}</div>
                                                    <div className="text-[11px] text-slate-500">{o.product?.brand || ''}{o.product?.exwLocation ? ` · EXW ${o.product.exwLocation}` : ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-[12px] font-bold capitalize">{o.unit}</td>
                                        <td className="px-5 py-4 text-right font-mono text-[13px] font-bold">€ {Number(o.pricePerUnit).toFixed(2)}</td>
                                        <td className="px-5 py-4 text-right text-[13px] font-bold">{o.quantity}</td>
                                        <td className="px-5 py-4">
                                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold', stClass)}>
                                                <St size={12} /> {stLabel}
                                            </span>
                                            {o.adminNotes && (
                                                <p className="text-[11px] text-slate-500 mt-1 italic">{o.adminNotes}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button onClick={() => handleDelete(o.id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Upload info modal — explains required fields BEFORE the file picker opens */}
            <AnimatePresence>
                {isUploadInfoOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsUploadInfoOpen(false)} className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-md" />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-7 space-y-5"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-xl bg-[#2EC4B6]/10 flex items-center justify-center text-[#2EC4B6] shrink-0"><Info size={20} /></div>
                                <div className="flex-1">
                                    <h2 className="text-[18px] font-black text-[#0F172A]">Before you upload</h2>
                                    <p className="text-[13px] text-slate-500 mt-1">A few rules so your offers land cleanly:</p>
                                </div>
                                <button onClick={() => setIsUploadInfoOpen(false)} className="p-1 hover:bg-slate-100 rounded"><X size={20} /></button>
                            </div>

                            <ul className="space-y-3 text-[13px]">
                                <li className="flex items-start gap-3"><span className="text-[#2EC4B6] mt-0.5">●</span><span><strong>You can only post offers on YOUR own approved products.</strong> Each row's product name is matched against your catalog (and only your catalog) — rows that don't resolve are skipped.</span></li>
                                <li className="flex items-start gap-3"><span className="text-[#2EC4B6] mt-0.5">●</span><span><strong>Required columns:</strong> <code className="bg-slate-100 px-1.5 py-0.5 rounded">Product</code> · <code className="bg-slate-100 px-1.5 py-0.5 rounded">Price</code> · <code className="bg-slate-100 px-1.5 py-0.5 rounded">Quantity</code></span></li>
                                <li className="flex items-start gap-3"><span className="text-[#2EC4B6] mt-0.5">●</span><span><strong>Optional columns:</strong> <code className="bg-slate-100 px-1.5 py-0.5 rounded">Unit</code> (truck / pallet / carton — defaults to carton) · <code className="bg-slate-100 px-1.5 py-0.5 rounded">ValidUntil</code> · <code className="bg-slate-100 px-1.5 py-0.5 rounded">Notes</code></span></li>
                                <li className="flex items-start gap-3"><span className="text-[#2EC4B6] mt-0.5">●</span><span>One row = one offer. If you have 20 offers, send 20 rows.</span></li>
                                <li className="flex items-start gap-3"><span className="text-[#2EC4B6] mt-0.5">●</span><span>Every offer is reviewed by an Atlantis admin before going out — you'll see "Approved" once it goes live.</span></li>
                            </ul>

                            <button
                                onClick={() => { setIsUploadInfoOpen(false); fileRef.current?.click(); }}
                                className="w-full h-12 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-xl font-black uppercase text-[13px] tracking-widest transition-all flex items-center justify-center gap-2"
                            >
                                <Upload size={16} /> Choose File
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add offer modal */}
            <AnimatePresence>
                {isAddOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddOpen(false)} className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-md" />
                        <motion.form
                            onSubmit={handleManualAdd}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl p-7 space-y-4"
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="text-[18px] font-black text-[#0F172A]">New offer</h2>
                                <button type="button" onClick={() => setIsAddOpen(false)} className="p-1 hover:bg-slate-100 rounded"><X size={20} /></button>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Product *</label>
                                <select required name="productId" className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-[14px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]">
                                    <option value="">— Pick from your approved products —</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-slate-400">
                                    {products.length === 0
                                        ? 'You have no approved products yet. Upload a product from /supplier/products and wait for admin approval before posting offers.'
                                        : 'You can only post offers on YOUR own products that Atlantis has already approved. Pending or rejected listings won\'t appear here.'}
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tier *</label>
                                    <select required name="unit" defaultValue="carton" className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]">
                                        <option value="truck">🚛 Truck</option>
                                        <option value="pallet">📦 Pallet</option>
                                        <option value="carton">🗃️ Case</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Price / unit (€) *</label>
                                    <input required name="pricePerUnit" type="number" step="0.01" min="0" placeholder="0.00" className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[14px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6] font-mono" />
                                </div>
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Quantity *</label>
                                    <input required name="quantity" type="number" min="1" placeholder="0" className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[14px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Valid until (optional)</label>
                                    <input name="validUntil" type="date" className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Notes (optional)</label>
                                    <input name="notes" type="text" placeholder="e.g. Mixed pallet OK" className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                </div>
                            </div>

                            <button type="submit" className="w-full h-12 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-xl font-black uppercase text-[13px] tracking-widest transition-all flex items-center justify-center gap-2">
                                <Plus size={16} /> Submit for review
                            </button>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
