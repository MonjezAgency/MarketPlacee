'use client';

/**
 * Admin Wholesale Offers Approval Queue.
 *
 * Shows the supplier-submitted wholesale offers waiting for review,
 * plus tabs for already-approved / rejected. Each row shows
 * everything an admin needs to make a yes/no call:
 *   - product (name + image + EAN + EXW location)
 *   - supplier (name + company + email)
 *   - offer terms (tier, price, quantity, validity, notes)
 *
 * Approve fires a campaign blast to every active newsletter
 * subscriber + every active CUSTOMER on the platform — the supplier
 * doesn't manage the recipient list themselves.
 *
 * NOTE: this is intentionally a separate route from /admin/offers
 * (which is the legacy ad-placements page) so the two systems
 * don't get conflated. Long-term we may consolidate them.
 */

import * as React from 'react';
import {
    CheckCircle2, XCircle, Clock, Loader2, Package, Building2, Mail,
    ExternalLink,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

interface AdminOffer {
    id: string;
    pricePerUnit: number;
    unit: 'truck' | 'pallet' | 'carton';
    quantity: number;
    validUntil?: string | null;
    notes?: string | null;
    status: Status;
    adminNotes?: string | null;
    createdAt: string;

    // Per-offer batch details (filled by the supplier on the New Offer
    // form). Each field falls back to product.* in the UI when the
    // supplier didn't override it.
    productNameSnap?: string | null;
    bbd?: string | null;
    eanCode?: string | null;
    unitsPerCase?: number | null;
    casesPerPallet?: number | null;
    exwLocation?: string | null;
    leadTime?: string | null;
    origin?: string | null;
    offerImageUrl?: string | null;

    product?: {
        id: string; name: string; brand?: string; images?: string[];
        ean?: string; exwLocation?: string;
        unitsPerCase?: number; casesPerPallet?: number;
        origin?: string; shelfLife?: string; weight?: string;
    };
    supplier?: { id: string; name: string; email: string; companyName?: string; role?: string };
}

const asArray = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.items)) return raw.items;
    return [];
};

export default function AdminWholesaleOffersPage() {
    const [offers, setOffers] = React.useState<AdminOffer[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [statusFilter, setStatusFilter] = React.useState<Status | 'ALL'>('PENDING');
    /** Source split — admin's own offers vs supplier-submitted. */
    const [sourceTab, setSourceTab] = React.useState<'Atlantis Offers' | 'Supplier Submissions'>('Supplier Submissions');
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [rejectingId, setRejectingId] = React.useState<string | null>(null);
    const [rejectReason, setRejectReason] = React.useState('');

    // Admin offer = the offer was posted by an admin/owner/staff
    // user (e.g. the operator backfilling on behalf of a supplier);
    // everything else is a real supplier submission.
    const STAFF_ROLES = new Set(['ADMIN', 'OWNER', 'MODERATOR', 'EDITOR', 'DEVELOPER', 'LOGISTICS', 'SUPPORT']);
    const isAdminOffer = (o: AdminOffer) => {
        const role = (o.supplier?.role || '').toUpperCase();
        if (STAFF_ROLES.has(role)) return true;
        if ((o.supplier?.email || '').toLowerCase() === 'info@atlantisfmcg.com') return true;
        return false;
    };

    const fetchAll = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const url = statusFilter === 'ALL' ? '/offers' : `/offers?status=${statusFilter}`;
            const res = await apiFetch(url);
            if (res.ok) setOffers(asArray(await res.json()));
        } finally {
            setIsLoading(false);
        }
    }, [statusFilter]);

    React.useEffect(() => { fetchAll(); }, [fetchAll]);

    // Apply the source filter first; status counts + the rendered
    // list are then scoped to that source.
    const sourceFilteredOffers = React.useMemo(
        () => offers.filter(o => sourceTab === 'Atlantis Offers' ? isAdminOffer(o) : !isAdminOffer(o)),
        [offers, sourceTab],
    );

    const counts = React.useMemo(() => {
        const c: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0 };
        sourceFilteredOffers.forEach(o => { c[o.status] = (c[o.status] || 0) + 1; });
        return c;
    }, [sourceFilteredOffers]);

    const adminOfferCount    = offers.filter(isAdminOffer).length;
    const supplierOfferCount = offers.filter(o => !isAdminOffer(o)).length;
    const supplierPendingOffersCount = offers.filter(o => !isAdminOffer(o) && o.status === 'PENDING').length;

    const handleApprove = async (id: string) => {
        setBusyId(id);
        try {
            const res = await apiFetch(`/offers/${id}/approve`, { method: 'PATCH' });
            if (res.ok) {
                toast.success('Offer approved — emails are going out now');
                fetchAll();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Approval failed');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setBusyId(null);
        }
    };

    const handleReject = async (id: string) => {
        setBusyId(id);
        try {
            const res = await apiFetch(`/offers/${id}/reject`, {
                method: 'PATCH',
                body: JSON.stringify({ reason: rejectReason || 'Rejected by admin' }),
            });
            if (res.ok) {
                toast.success('Offer rejected');
                setRejectingId(null);
                setRejectReason('');
                fetchAll();
            } else {
                toast.error('Rejection failed');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setBusyId(null);
        }
    };

    const TABS: { key: Status | 'ALL'; label: string; count?: number }[] = [
        { key: 'PENDING',  label: 'Pending review', count: counts.PENDING },
        { key: 'APPROVED', label: 'Approved',       count: counts.APPROVED },
        { key: 'REJECTED', label: 'Rejected',       count: counts.REJECTED },
        { key: 'ALL',      label: 'All' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-16">
            <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2EC4B6]">Marketplace</p>
                <h1 className="text-[28px] font-black tracking-tight text-[#0F172A]">Approve Wholesale Offers</h1>
                <p className="text-[13px] text-slate-500 mt-1 max-w-xl">Suppliers post wholesale offers on existing platform products. When you approve, the offer is emailed to every active client + newsletter subscriber.</p>
            </div>

            {/* Source tabs — Atlantis vs Supplier */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                <button
                    onClick={() => setSourceTab('Atlantis Offers')}
                    className={cn(
                        'h-10 px-5 rounded-lg text-[12px] font-black uppercase tracking-widest flex items-center gap-2',
                        sourceTab === 'Atlantis Offers' ? 'bg-white shadow-sm text-[#0F172A]' : 'text-slate-500 hover:text-slate-700',
                    )}
                >
                    🏛 Atlantis Offers
                    <span className="text-[10px] tabular-nums opacity-70">{adminOfferCount}</span>
                </button>
                <button
                    onClick={() => setSourceTab('Supplier Submissions')}
                    className={cn(
                        'h-10 px-5 rounded-lg text-[12px] font-black uppercase tracking-widest flex items-center gap-2',
                        sourceTab === 'Supplier Submissions' ? 'bg-white shadow-sm text-[#0F172A]' : 'text-slate-500 hover:text-slate-700',
                    )}
                >
                    🚚 Supplier Submissions
                    <span className="text-[10px] tabular-nums opacity-70">{supplierOfferCount}</span>
                    {supplierPendingOffersCount > 0 && (
                        <span className="text-[10px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                            {supplierPendingOffersCount} pending
                        </span>
                    )}
                </button>
            </div>

            {/* Status tabs */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setStatusFilter(t.key)}
                        className={cn(
                            'h-10 px-4 rounded-lg text-[12px] font-black uppercase tracking-widest flex items-center gap-2',
                            statusFilter === t.key ? 'bg-white shadow-sm text-[#0F172A]' : 'text-slate-500 hover:text-slate-700',
                        )}
                    >
                        {t.label}
                        {typeof t.count === 'number' && (
                            <span className="text-[11px] tabular-nums">{t.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#2EC4B6]" size={28} /></div>
            ) : sourceFilteredOffers.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center text-slate-400">
                    <Clock size={28} className="mx-auto mb-3 opacity-40" />
                    <p className="font-bold text-slate-500">No offers in this view</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {sourceFilteredOffers.map(o => {
                        // Per-offer batch values fall back to the linked
                        // product when the supplier didn't override them.
                        const offerImg  = o.offerImageUrl  || o.product?.images?.[0] || '';
                        const offerName = o.productNameSnap || o.product?.name || '—';
                        const ean       = o.eanCode        || o.product?.ean || '';
                        const upc       = o.unitsPerCase   || o.product?.unitsPerCase;
                        const cpp       = o.casesPerPallet || o.product?.casesPerPallet;
                        const exw       = o.exwLocation    || o.product?.exwLocation || '';
                        const origin    = o.origin         || o.product?.origin || '';
                        const bbd       = o.bbd            || o.product?.shelfLife || '';
                        return (
                        <div key={o.id} className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                            {/* Product + batch details */}
                            <div className="md:col-span-5 flex items-start gap-4">
                                {offerImg ? (
                                    <img src={offerImg} alt={offerName} className="w-20 h-20 rounded-xl object-cover bg-slate-100 shrink-0" />
                                ) : (
                                    <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Package size={22} className="text-slate-400" /></div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Product (this batch)</p>
                                    <h3 className="text-[15px] font-black text-[#0F172A]">{offerName}</h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">{o.product?.brand || ''}</p>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px]">
                                        {bbd && <p><span className="text-slate-400">BBD:</span> <span className="font-bold text-slate-700">{bbd}</span></p>}
                                        {ean && <p><span className="text-slate-400">EAN:</span> <span className="font-mono text-slate-700">{ean}</span></p>}
                                        {upc !== null && upc !== undefined && upc > 0 && (
                                            <p><span className="text-slate-400">Pcs/case:</span> <span className="font-bold text-slate-700">{upc}</span></p>
                                        )}
                                        {cpp !== null && cpp !== undefined && cpp > 0 && (
                                            <p><span className="text-slate-400">Cases/pallet:</span> <span className="font-bold text-slate-700">{cpp}</span></p>
                                        )}
                                        {exw && <p className="col-span-2"><span className="text-slate-400">EXW:</span> <span className="font-bold text-slate-700">{exw}</span></p>}
                                        {origin && <p className="col-span-2"><span className="text-slate-400">Origin:</span> <span className="font-bold text-slate-700">{origin}</span></p>}
                                        {o.leadTime && <p className="col-span-2"><span className="text-slate-400">Lead time:</span> <span className="font-bold text-slate-700">{o.leadTime}</span></p>}
                                    </div>
                                </div>
                            </div>

                            {/* Supplier */}
                            <div className="md:col-span-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Supplier</p>
                                <div className="text-[13px] font-bold text-[#0F172A] flex items-center gap-1.5">
                                    <Building2 size={13} className="text-slate-400" />
                                    {o.supplier?.companyName || o.supplier?.name || '—'}
                                </div>
                                {o.supplier?.email && (
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                        <Mail size={11} className="text-slate-400" /> {o.supplier.email}
                                    </div>
                                )}
                            </div>

                            {/* Terms */}
                            <div className="md:col-span-2 text-[12px] space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Terms</p>
                                <p><span className="text-slate-500">Tier:</span> <span className="font-bold capitalize">{o.unit}</span></p>
                                <p><span className="text-slate-500">Price:</span> <span className="font-bold font-mono">€ {Number(o.pricePerUnit).toFixed(2)}</span></p>
                                <p><span className="text-slate-500">Qty:</span> <span className="font-bold">{o.quantity}</span></p>
                                {o.validUntil && (
                                    <p><span className="text-slate-500">Valid until:</span> <span className="font-bold">{new Date(o.validUntil).toLocaleDateString()}</span></p>
                                )}
                                {o.notes && (
                                    <p className="italic text-slate-500 mt-1">"{o.notes}"</p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="md:col-span-2 flex flex-col gap-2 items-stretch">
                                {o.status === 'PENDING' ? (
                                    <>
                                        <button
                                            onClick={() => handleApprove(o.id)}
                                            disabled={busyId === o.id}
                                            className="h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {busyId === o.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => { setRejectingId(o.id); setRejectReason(''); }}
                                            disabled={busyId === o.id}
                                            className="h-10 bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-rose-600 rounded-lg text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                                        >
                                            <XCircle size={14} /> Reject
                                        </button>
                                    </>
                                ) : (
                                    <span className={cn(
                                        'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-[11px] font-bold',
                                        o.status === 'APPROVED' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                        o.status === 'REJECTED' && 'bg-rose-50 text-rose-700 border-rose-200',
                                    )}>
                                        {o.status === 'APPROVED' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                        {o.status}
                                    </span>
                                )}
                                {o.product && (
                                    <a href={`/products/${o.product.id}`} target="_blank" rel="noreferrer"
                                       className="h-9 inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-[#0F172A]">
                                        <ExternalLink size={12} /> View product
                                    </a>
                                )}
                            </div>

                            {/* Reject reason input */}
                            {rejectingId === o.id && (
                                <div className="md:col-span-12 bg-rose-50 border border-rose-200 rounded-xl p-4 mt-2 flex flex-col md:flex-row gap-3 items-start">
                                    <input
                                        autoFocus
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                        placeholder="Reason for rejection — visible to the supplier"
                                        className="flex-1 h-10 px-3 rounded-lg border border-rose-200 bg-white text-[13px] outline-none focus:border-rose-400"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => handleReject(o.id)} disabled={busyId === o.id} className="h-10 px-5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[12px] font-black uppercase tracking-widest disabled:opacity-50">Confirm</button>
                                        <button onClick={() => setRejectingId(null)} className="h-10 px-5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[12px] font-bold">Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
