'use client';

/**
 * Supplier Inventory page — operator-requested.
 *
 * Per product, shows four stock buckets so the supplier can reason
 * about commitments without opening every order:
 *
 *   Stock      — current Product.stock, what's still sellable
 *   Reserved   — committed to ship (PENDING + PROCESSING + SHIPPED
 *                orders that already decremented the stock)
 *   Sold       — delivered to customers (final, won't come back)
 *   Cancelled  — orders that were cancelled and returned the units
 *                to the stock pool
 *
 * Backend builds the breakdown in one round-trip via GET
 * /products/inventory. The page is read-only — actions still live on
 * the existing Inventory Manager page; this one is a dashboard.
 */

import * as React from 'react';
import Link from 'next/link';
import {
    Package, ShoppingCart, Truck, Check, XCircle, Search, Loader2, Box,
    ChevronDown, ChevronRight, Plus, Minus, Layers,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface VariantRow {
    signature: string;
    picks: Record<string, string>;
    stock: number;
}

interface InventoryRow {
    id: string;
    name: string;
    image: string | null;
    ean: string | null;
    category: string;
    unit: string;
    status: string;
    exwLocation: string | null;
    price: number;
    unitsPerCase: number | null;
    casesPerPallet: number | null;
    stock: number;
    stockPallets: number;
    stockTrucks: number;
    palletsPerShipment?: number | null;
    reserved: number;
    sold: number;
    cancelled: number;
    totalOrdered: number;
    variantBreakdown: VariantRow[];
    hasVariants: boolean;
}

export default function SupplierInventoryPage() {
    const [rows, setRows] = React.useState<InventoryRow[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [search, setSearch] = React.useState('');
    // Expansion state for variant breakdown rows. Keyed by product id.
    // Defaulting to expanded when the product has variants would crowd
    // the table; collapse instead and surface a chevron the supplier
    // toggles per row.
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
    // In-flight set for variant stock updates so we can dim the +/-
    // controls while the PATCH is pending. Keyed by `${productId}::${sig}`.
    const [savingVariants, setSavingVariants] = React.useState<Set<string>>(new Set());

    React.useEffect(() => {
        (async () => {
            setIsLoading(true);
            try {
                const res = await apiFetch('/products/inventory', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setRows(Array.isArray(data) ? data : []);
                }
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    /**
     * Adjust a variant's stock by `delta` (signed integer). Optimistic
     * UI: bump the local state first, fire the PATCH, then either
     * confirm with the server value or roll back on failure. The
     * supplier sees the change instantly, the spinner only protects
     * against double-clicks.
     */
    const adjustVariantStock = async (
        productId: string,
        signature: string,
        delta: number,
    ) => {
        const key = `${productId}::${signature}`;
        if (savingVariants.has(key)) return;
        let original = 0;
        let next = 0;
        // Optimistic update
        setRows((prev) =>
            prev.map((r) => {
                if (r.id !== productId) return r;
                const variantBreakdown = r.variantBreakdown.map((v) => {
                    if (v.signature !== signature) return v;
                    original = v.stock;
                    next = Math.max(0, v.stock + delta);
                    return { ...v, stock: next };
                });
                return { ...r, variantBreakdown };
            }),
        );
        if (next === original) return; // nothing to do (e.g. minus on 0)
        setSavingVariants((s) => new Set(s).add(key));
        try {
            const res = await apiFetch(`/products/${productId}/variant-stock`, {
                method: 'PATCH',
                body: JSON.stringify({ signature, stock: next }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Failed to update stock');
                // Rollback
                setRows((prev) =>
                    prev.map((r) => {
                        if (r.id !== productId) return r;
                        return {
                            ...r,
                            variantBreakdown: r.variantBreakdown.map((v) =>
                                v.signature === signature ? { ...v, stock: original } : v,
                            ),
                        };
                    }),
                );
            }
        } catch (err: any) {
            toast.error(err?.message || 'Network error');
        } finally {
            setSavingVariants((s) => {
                const n = new Set(s);
                n.delete(key);
                return n;
            });
        }
    };

    const toggleExpanded = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const filtered = rows.filter((r) =>
        !search.trim() ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.ean || '').includes(search) ||
        (r.category || '').toLowerCase().includes(search.toLowerCase()),
    );

    // Aggregate KPIs across all products — quick "fleet view" at the top.
    const totals = React.useMemo(() => {
        return rows.reduce(
            (acc, r) => ({
                stock: acc.stock + r.stock,
                reserved: acc.reserved + r.reserved,
                sold: acc.sold + r.sold,
                cancelled: acc.cancelled + r.cancelled,
            }),
            { stock: 0, reserved: 0, sold: 0, cancelled: 0 },
        );
    }, [rows]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-16">
            {/* Header */}
            <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2EC4B6]">Warehouse</p>
                <h1 className="text-[28px] font-black tracking-tight text-[#0F172A]">Stock &amp; Reservations</h1>
                <p className="text-[13px] text-slate-500 mt-1 max-w-xl">
                    For every product you list: what's still on the shelf, what's committed
                    to active orders, what already shipped, and what came back via cancellations.
                    Updates in real time as customers place and orders move through fulfillment.
                </p>
            </div>

            {/* Aggregate KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi label="In stock"   value={totals.stock}     icon={Box}          tone="slate"   help="Units still available for new orders." />
                <Kpi label="Reserved"   value={totals.reserved}  icon={Truck}        tone="amber"   help="Committed to PENDING / PROCESSING / SHIPPED orders." />
                <Kpi label="Delivered"  value={totals.sold}      icon={Check}        tone="emerald" help="Units that left the warehouse and were received." />
                <Kpi label="Cancelled"  value={totals.cancelled} icon={XCircle}      tone="rose"    help="Orders that were cancelled — units returned to stock." />
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                    type="text"
                    placeholder="Search by product name, EAN or category…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-12 ps-12 pe-4 bg-white border border-slate-200 rounded-2xl text-[13px] outline-none focus:border-[#2EC4B6]"
                />
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="py-16 flex justify-center">
                    <Loader2 className="animate-spin text-[#2EC4B6]" size={28} />
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-16 text-center bg-white border border-slate-200 rounded-2xl">
                    <Package size={36} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-[14px] font-semibold text-slate-700">
                        {rows.length === 0 ? 'No products listed yet' : 'No products match your search'}
                    </p>
                    {rows.length === 0 && (
                        <Link href="/supplier/products" className="inline-block mt-3 text-[12px] font-bold text-[#2EC4B6] hover:underline">
                            Add your first product →
                        </Link>
                    )}
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                    <th className="px-6 py-4">Product</th>
                                    <th className="px-4 py-4 text-right">In stock</th>
                                    <th className="px-4 py-4 text-right">Reserved</th>
                                    <th className="px-4 py-4 text-right">Delivered</th>
                                    <th className="px-4 py-4 text-right">Cancelled</th>
                                    <th className="px-4 py-4 text-right">Lifetime ordered</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((r) => {
                                    const isOpen = expanded.has(r.id);
                                    return (
                                        <React.Fragment key={r.id}>
                                            <tr className="hover:bg-slate-50/60">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        {/* Expand-collapse chevron — only present
                                                            when the product carries variants. We
                                                            keep the slot occupied (invisible spacer)
                                                            for plain products so column widths
                                                            line up. */}
                                                        {r.hasVariants ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleExpanded(r.id)}
                                                                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors flex-shrink-0"
                                                                aria-label={isOpen ? 'Hide variants' : 'Show variants'}
                                                            >
                                                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                            </button>
                                                        ) : (
                                                            <div className="w-6 h-6 flex-shrink-0" />
                                                        )}
                                                        <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                            {r.image ? (
                                                                <img
                                                                    src={r.image}
                                                                    alt={r.name}
                                                                    referrerPolicy="no-referrer"
                                                                    onError={(e) => {
                                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                                    }}
                                                                    className="w-full h-full object-contain"
                                                                />
                                                            ) : (
                                                                <Package size={16} className="text-slate-300" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <Link
                                                                href={`/supplier/products/${r.id}/edit`}
                                                                className="text-[13px] font-bold text-slate-900 hover:text-[#2EC4B6] line-clamp-1 transition-colors"
                                                            >
                                                                {r.name}
                                                            </Link>
                                                            <p className="text-[10px] text-slate-500 mt-0.5 font-mono flex items-center gap-2">
                                                                <span>{r.ean || '—'}{r.exwLocation ? ` · EXW ${r.exwLocation}` : ''}</span>
                                                                {r.hasVariants && (
                                                                    <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-md bg-violet-50 border border-violet-200 text-violet-700 text-[9px] font-bold uppercase tracking-wider">
                                                                        <Layers size={9} />
                                                                        {r.variantBreakdown.length} variants
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    {/* Stock cell — primary pill is cases
                                                        (canonical unit). Underneath in tiny
                                                        text we show the same stock expressed
                                                        in pallets and trucks so the supplier
                                                        knows "42 cases = 1 pallet = 0 trucks"
                                                        without doing the math themselves.
                                                        Computed server-side using the
                                                        supplier's own pack-size config. */}
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span
                                                            className={cn(
                                                                'inline-flex items-center justify-center min-w-[40px] h-7 px-3 rounded-full text-[12px] font-black tabular-nums',
                                                                r.stock <= 0
                                                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                    : r.stock < 10
                                                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                      : 'bg-slate-100 text-slate-700',
                                                            )}
                                                            title={`${r.stock} cases · ${r.stockPallets} pallets · ${r.stockTrucks} trucks`}
                                                        >
                                                            {r.stock}
                                                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-60 ms-1">cases</span>
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 font-medium tabular-nums">
                                                            {r.stockPallets} pallets · {r.stockTrucks} trucks
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <span className="text-[12px] font-bold text-amber-700 tabular-nums">
                                                        {r.reserved}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <span className="text-[12px] font-bold text-emerald-700 tabular-nums">
                                                        {r.sold}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <span className="text-[12px] font-bold text-rose-600 tabular-nums">
                                                        {r.cancelled}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <span className="text-[12px] font-bold text-slate-700 tabular-nums">
                                                        {r.totalOrdered}
                                                    </span>
                                                </td>
                                            </tr>

                                            {/* ── Variant sub-rows ──
                                                Rendered only when the product has variants
                                                AND the supplier expanded the row. Each
                                                sub-row shows the variant signature (Size:
                                                Large, Flavour: Vanilla) as a chip stack,
                                                with inline +/- controls and a typed
                                                input that PATCH-saves on blur. The total
                                                of all variant stocks doesn't have to equal
                                                Product.stock — they're tracked independently
                                                for now (operator decision). */}
                                            {r.hasVariants && isOpen && r.variantBreakdown.map((v) => {
                                                const key = `${r.id}::${v.signature}`;
                                                const saving = savingVariants.has(key);
                                                return (
                                                    <tr key={key} className="bg-slate-50/40 border-l-2 border-violet-300">
                                                        <td className="px-6 py-3 pl-20">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                {Object.entries(v.picks).map(([k, val]) => (
                                                                    <span
                                                                        key={k}
                                                                        className="inline-flex items-center gap-1 h-6 px-2.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold"
                                                                    >
                                                                        <span className="text-slate-400 font-normal">{k}:</span>
                                                                        <span>{val}</span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="inline-flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => adjustVariantStock(r.id, v.signature, -1)}
                                                                    disabled={saving || v.stock <= 0}
                                                                    className="w-7 h-7 rounded-md bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                                                                    title="Decrease stock"
                                                                >
                                                                    <Minus size={12} />
                                                                </button>
                                                                <span
                                                                    className={cn(
                                                                        'inline-flex items-center justify-center min-w-[36px] h-7 px-2 rounded-md text-[12px] font-black tabular-nums',
                                                                        v.stock <= 0
                                                                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                            : v.stock < 5
                                                                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                              : 'bg-slate-100 text-slate-700',
                                                                    )}
                                                                >
                                                                    {saving ? <Loader2 size={12} className="animate-spin" /> : v.stock}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => adjustVariantStock(r.id, v.signature, +1)}
                                                                    disabled={saving}
                                                                    className="w-7 h-7 rounded-md bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                                                                    title="Increase stock"
                                                                >
                                                                    <Plus size={12} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td colSpan={4} className="px-4 py-3 text-[11px] text-slate-400">
                                                            <span className="font-mono">{v.signature}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function Kpi({
    label,
    value,
    icon: Icon,
    tone,
    help,
}: {
    label: string;
    value: number;
    icon: any;
    tone: 'slate' | 'amber' | 'emerald' | 'rose';
    help: string;
}) {
    const palette: Record<string, { bg: string; text: string; ring: string }> = {
        slate:   { bg: 'bg-slate-100',   text: 'text-slate-700',   ring: 'ring-slate-200' },
        amber:   { bg: 'bg-amber-50',    text: 'text-amber-700',   ring: 'ring-amber-200' },
        emerald: { bg: 'bg-emerald-50',  text: 'text-emerald-700', ring: 'ring-emerald-200' },
        rose:    { bg: 'bg-rose-50',     text: 'text-rose-700',    ring: 'ring-rose-200' },
    };
    const p = palette[tone];
    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-2.5">
                <div className={cn('w-9 h-9 rounded-lg ring-1 flex items-center justify-center', p.bg, p.text, p.ring)}>
                    <Icon size={16} />
                </div>
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-[28px] font-black text-slate-900 mt-1 tabular-nums">{value.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">{help}</p>
        </div>
    );
}
