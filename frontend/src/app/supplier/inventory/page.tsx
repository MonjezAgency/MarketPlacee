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
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

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
    reserved: number;
    sold: number;
    cancelled: number;
    totalOrdered: number;
}

export default function SupplierInventoryPage() {
    const [rows, setRows] = React.useState<InventoryRow[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [search, setSearch] = React.useState('');

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
                                {filtered.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50/60">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
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
                                                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                                        {r.ean || '—'}{r.exwLocation ? ` · EXW ${r.exwLocation}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <span
                                                className={cn(
                                                    'inline-flex items-center justify-center min-w-[40px] h-7 px-3 rounded-full text-[12px] font-black tabular-nums',
                                                    r.stock <= 0
                                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                        : r.stock < 10
                                                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                          : 'bg-slate-100 text-slate-700',
                                                )}
                                            >
                                                {r.stock}
                                            </span>
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
                                ))}
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
