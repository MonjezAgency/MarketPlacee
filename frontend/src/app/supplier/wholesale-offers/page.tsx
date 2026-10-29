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
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';

const S = 'supplierOps';
/** Offer tier (API value) → label key. */
const TIER_LABEL: Record<string, string> = { truck: 'woTierTruck', pallet: 'woTierPallet', carton: 'woTierCarton' };

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
    const { t, fmt, meta } = useLanguage();
    const eur = (n: number) => fmt.number(Number(n) || 0, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const list = (items: string[]) => { try { return new Intl.ListFormat(meta.intl, { style: 'long', type: 'conjunction' }).format(items); } catch { return items.join(', '); } };
    const [offers, setOffers] = React.useState<Offer[]>([]);
    const [products, setProducts] = React.useState<any[]>([]);
    // Discount percentage the supplier picked. Stored as a 0-90 integer.
    // We multiply the picked product's current case price by (1 - pct/100)
    // to derive the actual pricePerUnit sent to the API on submit.
    // Default 10% — a reasonable wholesale starting point.
    const [discountPct, setDiscountPct] = React.useState<number>(10);
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
            // AND that have already been approved by Ali FMCG.
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

    const [pickedProductId, setPickedProductId] = React.useState('');
    const [offerImageUrl, setOfferImageUrl] = React.useState('');
    const [isUploadingOfferImg, setIsUploadingOfferImg] = React.useState(false);
    const offerImgRef = React.useRef<HTMLInputElement | null>(null);

    // Per-variant discount overrides — used when the product has
    // variants and the supplier wants different % per variant.
    // Keyed by variant signature (e.g. "Flavour=Diet|Size=Large").
    const [perVariantMode, setPerVariantMode] = React.useState<'same' | 'different'>('same');
    const [variantDiscounts, setVariantDiscounts] = React.useState<Record<string, number>>({});

    // When the supplier picks a product, prefill batch fields from
    // its values so they only have to type the deltas (BBD, lead
    // time, batch photo). Each input is still editable per offer.
    const pickedProduct = React.useMemo(
        () => products.find(p => p.id === pickedProductId),
        [pickedProductId, products],
    );

    // List of variant signatures for the picked product. Pulled
    // from variantMeta (preferred) or variants[]. Empty array if
    // the product is single-SKU.
    const variantSignatures = React.useMemo<string[]>(() => {
        if (!pickedProduct) return [];
        const meta = Array.isArray(pickedProduct.variantMeta) ? pickedProduct.variantMeta : [];
        const sigs = meta
            .map((v: any) => v?.signature || v?.sig || '')
            .filter((s: string) => s && !s.startsWith('__'));
        if (sigs.length > 0) return sigs;
        const vs = Array.isArray(pickedProduct.variants) ? pickedProduct.variants : [];
        return vs.map((v: any) => v?.signature || v?.name || '').filter(Boolean);
    }, [pickedProduct]);

    // Reset per-variant state whenever the picked product changes.
    React.useEffect(() => {
        setPerVariantMode('same');
        setVariantDiscounts({});
    }, [pickedProductId]);

    const handleOfferImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingOfferImg(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await apiFetch('/products/upload-image', { method: 'POST', body: fd });
            if (res.ok) {
                const data = await res.json();
                setOfferImageUrl(data?.url || '');
                toast.success(t(S, 'woImageUploaded'));
            } else {
                toast.error(t(S, 'woUploadFailed'));
            }
        } catch {
            toast.error(t(S, 'woNetworkError'));
        } finally {
            setIsUploadingOfferImg(false);
            if (offerImgRef.current) offerImgRef.current.value = '';
        }
    };

    const handleManualAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // Derive pricePerUnit from discount % × current product price.
        // The form no longer exposes a "price" input — the supplier picks
        // a discount and we compute the resulting offer price here.
        const currentCasePrice = Number(pickedProduct?.basePrice ?? pickedProduct?.price ?? 0);
        const derivedPrice = +(currentCasePrice * (1 - discountPct / 100)).toFixed(2);
        const payload = {
            productId: String(fd.get('productId') || ''),
            pricePerUnit: derivedPrice,
            unit: String(fd.get('unit') || 'carton') as Tier,
            quantity: parseInt(String(fd.get('quantity') || '0'), 10),
            validUntil: String(fd.get('validUntil') || '') || undefined,
            notes: String(fd.get('notes') || '') || undefined,
            // Per-offer batch details (operator-required).
            productNameSnap: String(fd.get('productNameSnap') || '').trim(),
            bbd:             String(fd.get('bbd') || '').trim(),
            eanCode:         String(fd.get('eanCode') || '').trim(),
            unitsPerCase:    parseInt(String(fd.get('unitsPerCase') || '0'), 10) || undefined,
            casesPerPallet:  parseInt(String(fd.get('casesPerPallet') || '0'), 10) || undefined,
            exwLocation:     String(fd.get('exwLocation') || '').trim(),
            leadTime:        String(fd.get('leadTime') || '').trim(),
            origin:          String(fd.get('origin') || '').trim(),
            offerImageUrl:   offerImageUrl || pickedProduct?.images?.[0] || '',
            // Discount fields — backend clamps 0–100 and persists
            // both the headline % and any per-variant overrides.
            discountPercent: discountPct > 0 ? discountPct : undefined,
            variantDiscounts:
                variantSignatures.length > 0 && perVariantMode === 'different'
                    ? Object.fromEntries(
                          variantSignatures
                              .map((sig) => [sig, variantDiscounts[sig] ?? discountPct])
                              .filter(([, v]) => Number(v) > 0),
                      )
                    : undefined,
        };
        if (!payload.productId) return toast.error(t(S, 'woPickProduct'));
        if (!(payload.pricePerUnit > 0)) return toast.error(t(S, 'woInvalidPrice'));
        if (!(payload.quantity > 0)) return toast.error(t(S, 'woInvalidQty'));
        // Frontend pre-validation — backend re-checks. Friendlier UX.
        const missing: string[] = [];
        if (!payload.productNameSnap) missing.push(t(S, 'woFieldProductName'));
        if (!payload.bbd) missing.push(t(S, 'woBbd'));
        if (!payload.eanCode) missing.push(t(S, 'woEan'));
        if (!payload.unitsPerCase) missing.push(t(S, 'woPcsPerCase'));
        if (!payload.casesPerPallet) missing.push(t(S, 'woCasesPerPallet'));
        if (!payload.exwLocation) missing.push(t(S, 'woExwLocation'));
        if (!payload.leadTime) missing.push(t(S, 'woLeadTime'));
        if (!payload.origin) missing.push(t(S, 'woFieldOrigin'));
        if (!payload.offerImageUrl) missing.push(t(S, 'woPicture'));
        if (missing.length > 0) {
            return toast.error(t(S, 'woRequired', { fields: list(missing) }));
        }
        try {
            const res = await apiFetch('/offers', { method: 'POST', body: JSON.stringify(payload) });
            if (res.ok) {
                toast.success(t(S, 'woSubmitted'));
                setIsAddOpen(false);
                setPickedProductId('');
                setOfferImageUrl('');
                fetchAll();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || t(S, 'woCreateFailed'));
            }
        } catch {
            toast.error(t(S, 'woNetworkError'));
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
                toast.success(t(S, 'woBulkUploaded', { count: Number(report.created) || 0 }));
                fetchAll();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || t(S, 'woUploadFailed'));
            }
        } catch {
            toast.error(t(S, 'woNetworkError'));
        } finally {
            setIsUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t(S, 'woDeleteConfirm'))) return;
        try {
            const res = await apiFetch(`/offers/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success(t(S, 'woRemoved'));
                fetchAll();
            } else {
                toast.error(t(S, 'woDeleteFailed'));
            }
        } catch {
            toast.error(t(S, 'woNetworkError'));
        }
    };

    // label = dictionary key
    const STATUS_STYLE: Record<Status, { label: string; cls: string; icon: any }> = {
        PENDING:  { label: 'woStatusPending', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
        APPROVED: { label: 'woStatusApproved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
        REJECTED: { label: 'woStatusRejected', cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
        EXPIRED:  { label: 'woStatusExpired', cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: Clock },
    };

    return (
        <div data-no-translate className="space-y-6 animate-in fade-in duration-700 pb-16">
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleBulkUpload} className="hidden" />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2EC4B6] rtl:tracking-normal">{t(S, 'woEyebrow')}</p>
                    <h1 className="text-[28px] font-black tracking-tight text-[#0F172A]">{t(S, 'woTitle')}</h1>
                    <p className="text-[13px] text-slate-500 mt-1 max-w-xl">{t(S, 'woIntro')}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setIsUploadInfoOpen(true)}
                        disabled={isUploading}
                        className="h-11 px-5 bg-white border border-slate-200 hover:border-[#2EC4B6] rounded-xl text-[12px] font-black uppercase tracking-widest rtl:tracking-normal flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {t(S, 'woUploadSheet')}
                    </button>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="h-11 px-6 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-xl text-[12px] font-black uppercase tracking-widest rtl:tracking-normal flex items-center gap-2 transition-all shadow"
                    >
                        <Plus size={16} /> {t(S, 'woAddOffer')}
                    </button>
                </div>
            </div>

            {/* Upload report */}
            {uploadReport && (
                <div className="bg-white border border-emerald-200 rounded-2xl p-5 flex items-start gap-4">
                    <CheckCircle2 size={22} className="text-emerald-500 mt-0.5" />
                    <div className="flex-1 text-[13px]">
                        <p className="font-black mb-1">{t(S, 'woUploadFinished')}</p>
                        <p><span className="font-bold text-emerald-600">{t(S, 'woCreated', { count: Number(uploadReport.created) || 0 })}</span> · <span className="font-bold text-amber-600">{t(S, 'woSkipped', { count: uploadReport.errors?.length || 0 })}</span> · {t(S, 'woRowsTotal', { count: Number(uploadReport.totalRows) || 0 })}</p>
                        {uploadReport.errors?.length > 0 && (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-amber-700 font-bold">{t(S, 'woSkippedDetails', { count: uploadReport.errors.length })}</summary>
                                <ul className="mt-2 ms-4 list-disc text-[12px] text-slate-600 space-y-0.5 max-h-[180px] overflow-y-auto">
                                    {uploadReport.errors.slice(0, 50).map((e: any, i: number) => (
                                        <li key={i}>{t(S, 'woRowReason', { row: e.row })} <span lang="en">{e.reason}</span></li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                    <button onClick={() => setUploadReport(null)} aria-label={t(S, 'woClose')} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
            )}

            {/* Offers list */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-x-auto">
                {isLoading ? (
                    <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#2EC4B6]" size={28} /></div>
                ) : offers.length === 0 ? (
                    <div className="py-20 text-center text-slate-400">
                        <Tag size={32} className="mx-auto mb-3 opacity-40" />
                        <p className="font-bold text-slate-500">{t(S, 'woEmptyTitle')}</p>
                        <p className="text-[13px] mt-1"><Trans text={t(S, 'woEmptyBody')} tags={{ b: (c) => <span className="text-[#0F172A] font-bold">{c}</span> }} /></p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-5 py-3 text-start text-[10px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woColProduct')}</th>
                                <th className="px-5 py-3 text-start text-[10px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woColTier')}</th>
                                <th className="px-5 py-3 text-end text-[10px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woColPrice')}</th>
                                <th className="px-5 py-3 text-end text-[10px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woColQty')}</th>
                                <th className="px-5 py-3 text-start text-[10px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woColStatus')}</th>
                                <th className="px-5 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {offers.map(o => {
                                const St = STATUS_STYLE[o.status]?.icon || Clock;
                                const stClass = STATUS_STYLE[o.status]?.cls || '';
                                const stLabel = STATUS_STYLE[o.status] ? t(S, STATUS_STYLE[o.status].label) : o.status;
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
                                        <td className="px-5 py-4 text-[12px] font-bold capitalize">{TIER_LABEL[o.unit] ? t(S, TIER_LABEL[o.unit]) : o.unit}</td>
                                        <td className="px-5 py-4 text-end font-mono text-[13px] font-bold tabular-nums">{eur(o.pricePerUnit)}</td>
                                        <td className="px-5 py-4 text-end text-[13px] font-bold tabular-nums">{fmt.number(o.quantity)}</td>
                                        <td className="px-5 py-4">
                                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold', stClass)}>
                                                <St size={12} /> {stLabel}
                                            </span>
                                            {o.adminNotes && (
                                                <p className="text-[11px] text-slate-500 mt-1 italic">{o.adminNotes}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-end">
                                            <button onClick={() => handleDelete(o.id)} aria-label={t(S, 'woDelete')} title={t(S, 'woDelete')} className="text-slate-400 hover:text-rose-500"><Trash2 size={16} /></button>
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
                                    <h2 className="text-[18px] font-black text-[#0F172A]">{t(S, 'woBeforeUpload')}</h2>
                                    <p className="text-[13px] text-slate-500 mt-1">{t(S, 'woRulesIntro')}</p>
                                </div>
                                <button onClick={() => setIsUploadInfoOpen(false)} aria-label={t(S, 'woClose')} className="p-1 hover:bg-slate-100 rounded"><X size={20} /></button>
                            </div>

                            <ul className="space-y-3 text-[13px]">
                                {['woRuleOwn', 'woRuleRequired', 'woRuleOptional', 'woRuleOneRow', 'woRuleReview'].map((key) => (
                                    <li key={key} className="flex items-start gap-3"><span className="text-[#2EC4B6] mt-0.5">●</span><span><Trans text={t(S, key)} tags={{
                                        b: (c) => <strong>{c}</strong>,
                                        code: (c) => <code dir="ltr" className="bg-slate-100 px-1.5 py-0.5 rounded">{c}</code>,
                                    }} /></span></li>
                                ))}
                            </ul>

                            <button
                                onClick={() => { setIsUploadInfoOpen(false); fileRef.current?.click(); }}
                                className="w-full h-12 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-xl font-black uppercase text-[13px] tracking-widest rtl:tracking-normal transition-all flex items-center justify-center gap-2"
                            >
                                <Upload size={16} /> {t(S, 'woChooseFile')}
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
                            /* Modal taller now (9 fields) — max-h + scroll
                               so the submit button stays reachable on every
                               screen size. */
                            className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-3xl shadow-2xl flex flex-col"
                        >
                            <input ref={offerImgRef} type="file" accept="image/*" onChange={handleOfferImageUpload} className="hidden" />

                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-[18px] font-black text-[#0F172A]">{t(S, 'woNewOffer')}</h2>
                                    <p className="text-[11px] text-slate-500">{t(S, 'woAllRequired')}</p>
                                </div>
                                <button type="button" onClick={() => setIsAddOpen(false)} aria-label={t(S, 'woClose')} className="p-1 hover:bg-slate-100 rounded"><X size={20} /></button>
                            </div>

                            <div className="p-6 space-y-5 overflow-y-auto flex-1">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woProduct')} *</label>
                                    <select
                                        required
                                        name="productId"
                                        value={pickedProductId}
                                        onChange={e => setPickedProductId(e.target.value)}
                                        className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-[14px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]"
                                    >
                                        <option value="">{t(S, 'woPickPlaceholder')}</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-slate-400">
                                        {products.length === 0
                                            ? t(S, 'woNoApproved')
                                            : t(S, 'woPrefillHint')}
                                    </p>
                                </div>

                                {/* 1. Product name + weight (g/kg). Pre-filled from picked product. */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woProductNameLabel')} *</label>
                                    <input
                                        required
                                        name="productNameSnap"
                                        type="text"
                                        defaultValue={pickedProduct?.name ? `${pickedProduct.name}${pickedProduct.weight ? ` ${pickedProduct.weight}` : ''}` : ''}
                                        key={`pname-${pickedProductId}`}
                                        placeholder={t(S, 'woEg', { example: 'KitKat Chunky 40g' })}
                                        className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]"
                                    />
                                </div>

                                {/* ── Reference card — current product context ──
                                    Operator request: the supplier won't remember
                                    what they listed the product at. Surface the
                                    current case price, EXW location, and live
                                    stock right above the price input so they
                                    have an anchor when picking a discount. */}
                                {pickedProduct && (
                                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 grid grid-cols-3 gap-4">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-400">{t(S, 'woCurrentPrice')}</p>
                                            <p className="text-[18px] font-bold text-slate-900 mt-1 tabular-nums">
                                                {eur(Number(pickedProduct.basePrice ?? pickedProduct.price ?? 0))}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-400">{t(S, 'woExwCurrently')}</p>
                                            <p className="text-[14px] font-bold text-slate-900 mt-1 truncate">
                                                {pickedProduct.exwLocation || '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-400">{t(S, 'woInStock')}</p>
                                            <p className="text-[14px] font-bold text-slate-900 mt-1">
                                                {fmt.number(Number(pickedProduct.stock ?? 0))}
                                                <span className="text-[11px] text-slate-400 font-medium ms-1">{t(S, 'woCasesWord', { count: Number(pickedProduct.stock ?? 0) })}</span>
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Tier / Discount picker / Qty */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woColTier')} *</label>
                                        <select required name="unit" defaultValue="carton" className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]">
                                            <option value="truck">🚛 {t(S, 'woTierTruck')}</option>
                                            <option value="pallet">📦 {t(S, 'woTierPallet')}</option>
                                            <option value="carton">🗃️ {t(S, 'woTierCarton')}</option>
                                        </select>
                                    </div>
                                    {/* Discount % picker — operator-requested.
                                        Suppliers won't remember the absolute
                                        case price, so they pick a discount
                                        relative to the live price above
                                        (5/10/15/25/50% chips + custom slider).
                                        We derive the offer price below and
                                        ship it as `pricePerUnit` to the API,
                                        so backend doesn't change. */}
                                    {/* ── Discount % picker ──
                                        Operator bug: on smaller screens the chip
                                        row + custom input collided and the
                                        selected value wasn't obvious. Redesign:
                                          • Big "Selected: -X%" headline at top
                                            so the supplier always sees what
                                            they've picked, even on a phone.
                                          • Chips wrap with flex-wrap and have
                                            a fixed min-width.
                                          • Custom input shown on its OWN row
                                            with a "Custom %" label so it
                                            doesn't compete with the chip row.
                                          • Input clamped 1-90 (over 90 is a
                                            free product, not a discount).
                                    */}
                                    <div className="space-y-2 col-span-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">
                                                {t(S, 'woDiscount')} *
                                            </label>
                                            <div className="inline-flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase tracking-widest rtl:tracking-normal text-slate-400">{t(S, 'woSelected')}</span>
                                                <span className="inline-flex items-center h-7 px-3 rounded-full bg-[#2EC4B6] text-white text-[13px] font-black tabular-nums">
                                                    <bdi dir="ltr">-{discountPct}%</bdi>
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {[5, 10, 15, 25, 50].map((p) => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setDiscountPct(p)}
                                                    className={cn(
                                                        'flex-1 min-w-[80px] h-12 rounded-xl text-[13px] font-black border-2 transition-all',
                                                        discountPct === p
                                                            ? 'bg-[#2EC4B6] border-[#2EC4B6] text-white shadow-md'
                                                            : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100 hover:border-slate-200',
                                                    )}
                                                >
                                                    <bdi dir="ltr">-{p}%</bdi>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2 pt-1">
                                            <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                                                {t(S, 'woCustom')}
                                            </label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={90}
                                                step={1}
                                                value={discountPct}
                                                onChange={(e) => {
                                                    const v = parseInt(e.target.value);
                                                    setDiscountPct(isNaN(v) ? 0 : Math.max(0, Math.min(90, v)));
                                                }}
                                                placeholder="0"
                                                className={cn(
                                                    'flex-1 h-10 px-3 border-2 rounded-xl text-[14px] font-bold text-center outline-none transition-colors',
                                                    [5, 10, 15, 25, 50].includes(discountPct)
                                                        ? 'bg-slate-50 border-slate-100 text-slate-600 focus:bg-white focus:border-[#2EC4B6]'
                                                        : 'bg-[#2EC4B6]/10 border-[#2EC4B6] text-[#0F766E] focus:bg-white',
                                                )}
                                            />
                                            <span className="text-[11px] font-bold text-slate-400" dir="ltr">(1–90)</span>
                                        </div>
                                        {pickedProduct && (
                                            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                                <Trans text={t(S, 'woOfferPriceLine', {
                                                    price: eur(Number(pickedProduct.basePrice ?? pickedProduct.price ?? 0) * (1 - discountPct / 100)),
                                                    old: eur(Number(pickedProduct.basePrice ?? pickedProduct.price ?? 0)),
                                                    saving: eur(Number(pickedProduct.basePrice ?? pickedProduct.price ?? 0) * (discountPct / 100)),
                                                })} tags={{ b: (c) => <strong className="text-[#2EC4B6]">{c}</strong>, s: (c) => <s className="text-slate-400">{c}</s> }} />
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Per-variant discount overrides — only when
                                    the picked product actually has variants.
                                    Operator request: ask the supplier whether
                                    the headline % applies to every variant
                                    or whether each variant has its own. */}
                                {variantSignatures.length > 0 && discountPct > 0 && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                                        <div>
                                            <p className="text-[12px] font-black text-[#0F172A]">
                                                {t(S, 'woVariantsCount', { count: variantSignatures.length })}
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                {t(S, 'woVariantsQuestion', { discount: `\u2066-${discountPct}%\u2069` })}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setPerVariantMode('same')}
                                                className={cn(
                                                    'h-11 rounded-xl text-[12px] font-black border-2 transition-all',
                                                    perVariantMode === 'same'
                                                        ? 'bg-[#2EC4B6] border-[#2EC4B6] text-white shadow-sm'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300',
                                                )}
                                            >
                                                {t(S, 'woSameForAll', { discount: `\u2066-${discountPct}%\u2069` })}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPerVariantMode('different')}
                                                className={cn(
                                                    'h-11 rounded-xl text-[12px] font-black border-2 transition-all',
                                                    perVariantMode === 'different'
                                                        ? 'bg-[#2EC4B6] border-[#2EC4B6] text-white shadow-sm'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300',
                                                )}
                                            >
                                                {t(S, 'woDifferentPerVariant')}
                                            </button>
                                        </div>
                                        {perVariantMode === 'different' && (
                                            <div className="space-y-2 pt-1">
                                                {variantSignatures.map((sig) => {
                                                    const pretty = sig.replace(/\|/g, ' · ').replace(/=/g, ': ');
                                                    const val = variantDiscounts[sig] ?? discountPct;
                                                    return (
                                                        <div key={sig} className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
                                                            <span className="flex-1 text-[12px] font-bold text-slate-700 truncate">{pretty}</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={90}
                                                                step={1}
                                                                value={val}
                                                                onChange={(e) => {
                                                                    const v = parseInt(e.target.value);
                                                                    setVariantDiscounts((prev) => ({
                                                                        ...prev,
                                                                        [sig]: isNaN(v) ? 0 : Math.max(0, Math.min(90, v)),
                                                                    }));
                                                                }}
                                                                className="w-20 h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-bold text-center outline-none focus:border-[#2EC4B6]"
                                                            />
                                                            <span className="text-[11px] font-bold text-slate-400">%</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Quantity */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">
                                            {t(S, 'woQuantity')} * <span className="text-slate-400 font-medium normal-case tracking-normal">{t(S, 'woMaxInStock', { count: pickedProduct?.stock ?? '?' })}</span>
                                        </label>
                                        <input
                                            required
                                            name="quantity"
                                            type="number"
                                            min="1"
                                            max={pickedProduct?.stock || undefined}
                                            placeholder="0"
                                            className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[14px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]"
                                        />
                                    </div>
                                </div>

                                {/* 2. BBD + 3. EAN code */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woBbd')} *</label>
                                        <input required name="bbd" type="text" defaultValue={pickedProduct?.shelfLife || ''} key={`bbd-${pickedProductId}`} placeholder={t(S, 'woBbdPlaceholder')} className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                        <p className="text-[10px] text-slate-400">{t(S, 'woBbdHint')}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woEan')} *</label>
                                        <input required name="eanCode" type="text" defaultValue={pickedProduct?.ean || ''} key={`ean-${pickedProductId}`} placeholder={t(S, 'woEg', { example: '5449000000996' })} className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-mono tracking-wider outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                    </div>
                                </div>

                                {/* 4. Pcs per case + 5. Cases per pallet */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woPcsPerCase')} *</label>
                                        <input required name="unitsPerCase" type="number" min="1" defaultValue={pickedProduct?.unitsPerCase || ''} key={`upc-${pickedProductId}`} placeholder={t(S, 'woEg', { example: '24' })} className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woCasesPerPallet')} *</label>
                                        <input required name="casesPerPallet" type="number" min="1" defaultValue={pickedProduct?.casesPerPallet || ''} key={`cpp-${pickedProductId}`} placeholder={t(S, 'woEg', { example: '60' })} className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                    </div>
                                </div>

                                {/* 6. EXW + 7. Lead time */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woExwLocation')} *</label>
                                        <input required name="exwLocation" type="text" defaultValue={pickedProduct?.exwLocation || ''} key={`exw-${pickedProductId}`} placeholder={t(S, 'woExwPlaceholder')} className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                        <p className="text-[10px] text-slate-400">{t(S, 'woExwHint')}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woLeadTime')} *</label>
                                        <input required name="leadTime" type="text" placeholder={t(S, 'woLeadTimePlaceholder')} className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                        <p className="text-[10px] text-slate-400">{t(S, 'woLeadTimeHint')}</p>
                                    </div>
                                </div>

                                {/* 8. Origin */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woOrigin')} *</label>
                                    <input required name="origin" type="text" defaultValue={pickedProduct?.origin || ''} key={`org-${pickedProductId}`} placeholder={t(S, 'woOriginPlaceholder')} className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                </div>

                                {/* 9. Picture of product */}
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woPicture')} *</label>
                                    <div className="flex items-start gap-3">
                                        <div className="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                            {(offerImageUrl || pickedProduct?.images?.[0]) ? (
                                                <img src={offerImageUrl || pickedProduct?.images?.[0]} alt={t(S, 'woPreviewAlt')} className="w-full h-full object-cover" />
                                            ) : (
                                                <Package size={28} className="text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <button
                                                type="button"
                                                onClick={() => offerImgRef.current?.click()}
                                                disabled={isUploadingOfferImg}
                                                className="w-full h-10 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-[#2EC4B6] text-[12px] font-bold text-slate-600 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                            >
                                                {isUploadingOfferImg ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                                {isUploadingOfferImg ? t(S, 'woUploading') : t(S, 'woUploadBatchPhoto')}
                                            </button>
                                            <p className="text-[10px] text-slate-400">
                                                {offerImageUrl
                                                    ? `✅ ${t(S, 'woPhotoUploaded')}`
                                                    : pickedProduct?.images?.[0]
                                                        ? t(S, 'woUsingCatalogPhoto')
                                                        : t(S, 'woPhotoRequired')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Optional fields */}
                                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woValidUntil')} <span className="text-slate-400 normal-case font-normal">{t(S, 'woOptional')}</span></label>
                                        <input name="validUntil" type="date" className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase tracking-widest rtl:tracking-normal text-slate-500">{t(S, 'woNotes')} <span className="text-slate-400 normal-case font-normal">{t(S, 'woOptional')}</span></label>
                                        <input name="notes" type="text" placeholder={t(S, 'woNotesPlaceholder')} className="w-full h-12 px-3 bg-slate-50 border-2 border-transparent rounded-xl text-[13px] font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 border-t border-slate-100 bg-slate-50/50">
                                <button type="submit" className="w-full h-12 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-xl font-black uppercase text-[13px] tracking-widest rtl:tracking-normal transition-all flex items-center justify-center gap-2">
                                    <Plus size={16} /> {t(S, 'woSubmit')}
                                </button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
