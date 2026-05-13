'use client';

/**
 * Logistics carrier dashboard.
 *
 * Every order whose `shippingCompany` matches the logged-in carrier's
 * name / companyName shows up here. Carriers can see what they need to
 * pick up, tracking numbers, customer addresses, and order status —
 * read-only, no commercial pricing exposed.
 *
 * Backed by GET /orders/logistics/assigned (LOGISTICS / ADMIN / OWNER).
 */

import * as React from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Truck, Search, Package, MapPin, Calendar, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogisticsOrder {
    id: string;
    status: string;
    totalAmount?: number;
    trackingNumber?: string;
    shippingCompany?: string;
    shippingAddress?: string;
    createdAt: string;
    customer?: { id: string; name?: string; email?: string; phone?: string };
    items?: Array<{
        id: string;
        quantity: number;
        product?: { id: string; name?: string; images?: string[]; weight?: string };
    }>;
}

const STATUS_TINT: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200',
    SHIPPED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function LogisticsOrdersPage() {
    const [orders, setOrders] = React.useState<LogisticsOrder[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [search, setSearch] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

    React.useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch('/orders/logistics/assigned');
                if (res.ok) {
                    const data = await res.json();
                    setOrders(Array.isArray(data) ? data : []);
                }
            } catch (e) {
                console.error('Failed to load logistics orders', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return orders.filter(o => {
            if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
            if (!q) return true;
            const hay = [
                o.id,
                o.trackingNumber,
                o.customer?.name,
                o.customer?.email,
                o.shippingAddress,
                ...(o.items?.map(i => i.product?.name) || []),
            ].filter(Boolean).map(s => String(s).toLowerCase()).join(' ');
            return hay.includes(q);
        });
    }, [orders, search, statusFilter]);

    const stats = React.useMemo(() => {
        const by: Record<string, number> = {};
        for (const o of orders) by[o.status] = (by[o.status] || 0) + 1;
        return by;
    }, [orders]);

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <Truck size={22} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carrier Portal</p>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">My Assigned Orders</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Every Atlantis order where you've been listed as the shipping carrier.
                        </p>
                    </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s === statusFilter ? 'ALL' : s)}
                            className={cn(
                                'p-4 rounded-2xl border text-start transition-all',
                                statusFilter === s
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white border-slate-200 hover:border-slate-300',
                            )}
                        >
                            <p className={cn('text-[10px] font-black uppercase tracking-widest', statusFilter === s ? 'text-white/60' : 'text-slate-400')}>{s}</p>
                            <p className="text-xl font-black mt-1">{stats[s] || 0}</p>
                        </button>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[260px]">
                        <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by tracking #, customer, address, product…"
                            className="w-full h-11 ps-10 pe-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                        />
                    </div>
                    {statusFilter !== 'ALL' && (
                        <button
                            onClick={() => setStatusFilter('ALL')}
                            className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                            Clear filter
                        </button>
                    )}
                </div>

                {/* List */}
                {loading ? (
                    <div className="py-20 flex justify-center">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center bg-white border border-slate-200 rounded-2xl">
                        <Package size={36} className="text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-bold text-slate-500">No orders assigned to your company yet.</p>
                        <p className="text-xs text-slate-400 mt-1">
                            When an Atlantis admin chooses your company as the shipping carrier, the order appears here automatically.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(o => (
                            <div
                                key={o.id}
                                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4 hover:border-indigo-200 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-black text-slate-900">
                                            Order #{o.id.slice(-8).toUpperCase()}
                                        </p>
                                        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', STATUS_TINT[o.status] || 'bg-slate-50 text-slate-600 border-slate-200')}>
                                            {o.status}
                                        </span>
                                        {o.trackingNumber && (
                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                {o.trackingNumber}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {(o.items || []).map(it => it.product?.name).filter(Boolean).slice(0, 3).join(' · ') || 'No items'}
                                        {(o.items?.length || 0) > 3 && ` · +${(o.items?.length || 0) - 3} more`}
                                    </p>
                                    <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500 flex-wrap">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Calendar size={12} />
                                            {new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                        {o.customer?.name && (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Package size={12} />
                                                {o.customer.name}
                                            </span>
                                        )}
                                        {o.shippingAddress && (
                                            <span className="inline-flex items-center gap-1.5 truncate max-w-[300px]">
                                                <MapPin size={12} />
                                                {o.shippingAddress}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Link
                                        href={`/admin/orders/${o.id}`}
                                        className="h-10 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-2 hover:bg-slate-800"
                                    >
                                        View details <ExternalLink size={12} />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
