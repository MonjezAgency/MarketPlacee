'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Package,
    Truck,
    CheckCircle2,
    Clock,
    User as UserIcon,
    Mail,
    Phone,
    MapPin,
    CreditCard,
    Trash2,
    Printer,
    Download,
    ExternalLink,
    Building2,
    MessageSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import OrderChatModal from '@/components/chat/OrderChatModal';

type AdminOrderItem = {
    id: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    product?: {
        id: string;
        name?: string;
        brand?: string;
        category?: string;
        ean?: string;
        sku?: string;
        weight?: string | number;
        unit?: string;
        unitsPerCase?: number;
        casesPerPallet?: number;
        unitsPerPallet?: number;
        palletsPerShipment?: number;
        shelfLife?: string;
        images?: string[];
    };
};

type AdminOrder = {
    id: string;
    status: string;
    paymentStatus?: string;
    total: number;
    createdAt: string;
    updatedAt?: string;
    trackingNumber?: string | null;
    carrier?: string | null;
    expectedDelivery?: string | null;
    paymentMethod?: string | null;
    customer?: {
        id: string;
        name?: string;
        email?: string;
        phone?: string;
        companyName?: string;
        country?: string;
        vatNumber?: string;
        address?: string;
    };
    shippingAddress?: string;
    items?: AdminOrderItem[];
};

const STEPS = [
    { key: 'CREATED', label: 'Order Created', icon: Package },
    { key: 'PAID',    label: 'Paid',          icon: CreditCard },
    { key: 'SHIPPED', label: 'Shipped',       icon: Truck },
    { key: 'DELIVERED', label: 'Delivered',   icon: CheckCircle2 },
];

function statusIndex(s?: string) {
    switch ((s || '').toUpperCase()) {
        case 'PENDING':   return 0;
        case 'PAID':
        case 'COMPLETED': return 1;
        case 'SHIPPED':   return 2;
        case 'DELIVERED': return 3;
        case 'CANCELLED': return -1;
        default:          return 0;
    }
}

function fmtMoney(n?: number) {
    if (n === undefined || n === null) return '—';
    return new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtDate(s?: string) {
    if (!s) return '—';
    try {
        return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return s; }
}

export default function AdminOrderDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [order, setOrder] = React.useState<AdminOrder | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [updating, setUpdating] = React.useState(false);
    const [chatOpen, setChatOpen] = React.useState(false);

    React.useEffect(() => {
        if (!params?.id) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await apiFetch(`/orders/${params.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) setOrder(data);
                } else if (!cancelled) {
                    toast.error('Could not load order');
                }
            } catch {
                if (!cancelled) toast.error('Network error loading order');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [params?.id]);

    const setStatus = async (next: string) => {
        if (!order) return;
        setUpdating(true);
        try {
            const res = await apiFetch(`/orders/${order.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: next }),
            });
            if (res.ok) {
                const updated = await res.json();
                setOrder(prev => prev ? { ...prev, status: updated.status } : prev);
                toast.success(`Order marked as ${next}`);
            } else {
                toast.error('Could not update status');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setUpdating(false);
        }
    };

    const printInvoice = () => {
        if (typeof window !== 'undefined') window.print();
    };

    const exportJson = () => {
        if (!order) return;
        const blob = new Blob([JSON.stringify(order, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `order-${order.id.slice(-6).toUpperCase()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const handleDelete = async () => {
        if (!order) return;
        if (!confirm(`Delete order #${order.id.slice(-6).toUpperCase()}? This cannot be undone.`)) return;
        try {
            const res = await apiFetch(`/orders/${order.id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Order deleted');
                router.push('/admin/orders');
            } else {
                toast.error('Could not delete order');
            }
        } catch {
            toast.error('Network error');
        }
    };

    if (loading) {
        return (
            <div className="p-8 max-w-7xl mx-auto animate-pulse space-y-6">
                <div className="h-8 w-48 bg-slate-200 rounded" />
                <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-4">
                        <div className="h-44 bg-slate-200 rounded-2xl" />
                        <div className="h-72 bg-slate-200 rounded-2xl" />
                    </div>
                    <div className="space-y-4">
                        <div className="h-32 bg-slate-200 rounded-2xl" />
                        <div className="h-48 bg-slate-200 rounded-2xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-12 text-center">
                <Package size={48} className="text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Order not found.</p>
                <Link href="/admin/orders" className="text-teal-600 font-semibold mt-2 inline-block">Back to Orders</Link>
            </div>
        );
    }

    const sIdx = statusIndex(order.status);
    const cancelled = (order.status || '').toUpperCase() === 'CANCELLED';

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

            {/* Top bar — Back + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <Link
                        href="/admin/orders"
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-teal-600 transition-colors"
                    >
                        <ArrowLeft size={14} /> Back to Orders
                    </Link>
                    <div className="flex items-center gap-3 mt-1.5">
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                            Order #{order.id.slice(-6).toUpperCase()}
                        </h1>
                        <span className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            cancelled                       ? 'bg-red-50 text-red-700 border border-red-200' :
                            sIdx >= 3                       ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            sIdx >= 1                       ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                                                              'bg-amber-50 text-amber-700 border border-amber-200'
                        )}>
                            <CheckCircle2 size={11} /> {(order.status || '—').toUpperCase()}
                        </span>
                        {(order.paymentStatus) && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-50 text-slate-700 border border-slate-200">
                                {order.paymentStatus}
                            </span>
                        )}
                    </div>
                    <p className="text-[12px] text-slate-500 mt-1">{fmtDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={printInvoice} className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2">
                        <Printer size={14} /> Print Invoice
                    </button>
                    <button onClick={exportJson} className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2">
                        <Download size={14} /> Export
                    </button>
                    <button onClick={handleDelete} className="h-10 px-4 bg-white border border-red-200 rounded-xl text-[13px] font-semibold text-red-600 hover:bg-red-50 transition-all flex items-center gap-2">
                        <Trash2 size={14} /> Delete
                    </button>
                </div>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT — products + tracking */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Items */}
                    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                        <h2 className="text-[15px] font-bold text-slate-900 mb-4">
                            Products ({order.items?.length || 0})
                        </h2>

                        <div className="overflow-x-auto -mx-2 sm:mx-0">
                            <table className="w-full text-left min-w-[520px]">
                                <thead>
                                    <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                        <th className="py-3 px-2 sm:px-3">Product</th>
                                        <th className="py-3 px-2 sm:px-3">SKU / EAN</th>
                                        <th className="py-3 px-2 sm:px-3">Qty</th>
                                        <th className="py-3 px-2 sm:px-3">Unit Price</th>
                                        <th className="py-3 px-2 sm:px-3 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {(order.items || []).map((it) => {
                                        const p = (it.product || {}) as NonNullable<AdminOrderItem['product']>;
                                        return (
                                            <tr key={it.id} className="align-top">
                                                <td className="py-4 px-2 sm:px-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                                            {p.images?.[0] ? (
                                                                <img src={p.images[0]} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt={p.name} />
                                                            ) : (
                                                                <Package size={18} className="text-slate-300" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <Link href={p.id ? `/admin/products?focus=${p.id}` : '#'} className="text-[13px] font-bold text-slate-900 hover:text-teal-600 line-clamp-1 transition-colors">
                                                                {p.name || 'Unknown product'}
                                                            </Link>
                                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                                {p.brand ? `${p.brand} · ` : ''}{p.category || '—'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-2 sm:px-3">
                                                    <p className="text-[12px] font-mono text-slate-700">{p.sku || p.ean || '—'}</p>
                                                    {p.ean && p.sku && (
                                                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">EAN: {p.ean}</p>
                                                    )}
                                                </td>
                                                <td className="py-4 px-2 sm:px-3 text-[13px] font-bold text-slate-900">
                                                    {it.quantity}
                                                </td>
                                                <td className="py-4 px-2 sm:px-3 text-[13px] font-semibold text-slate-700">
                                                    {fmtMoney(it.unitPrice)}
                                                </td>
                                                <td className="py-4 px-2 sm:px-3 text-[13px] font-bold text-slate-900 text-right">
                                                    {fmtMoney(it.totalPrice)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Per-item product specs (compact) */}
                        {(order.items || []).map((it) => {
                            const p = (it.product || {}) as NonNullable<AdminOrderItem['product']>;
                            const specs: Array<[string, string]> = [];
                            if (p.weight) specs.push(['Weight', String(p.weight)]);
                            if (p.unit) specs.push(['Unit', String(p.unit)]);
                            if (p.unitsPerCase) specs.push(['Pcs / Case', String(p.unitsPerCase)]);
                            if (p.casesPerPallet) specs.push(['Cases / Pallet', String(p.casesPerPallet)]);
                            if (p.unitsPerPallet) specs.push(['Pcs / Pallet', String(p.unitsPerPallet)]);
                            if (p.palletsPerShipment) specs.push(['Pallets / Truck', String(p.palletsPerShipment)]);
                            if (p.shelfLife) specs.push(['BBD', String(p.shelfLife)]);
                            if (specs.length === 0) return null;
                            return (
                                <div key={`specs-${it.id}`} className="mt-4 p-4 bg-slate-50/60 border border-slate-100 rounded-xl">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">{p.name} — specifications</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {specs.map(([k, v]) => (
                                            <div key={k}>
                                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{k}</p>
                                                <p className="text-[12px] font-bold text-slate-800 mt-0.5">{v}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </section>

                    {/* Logistics & Tracking */}
                    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                        <h2 className="text-[15px] font-bold text-slate-900 mb-5">Logistics &amp; Tracking</h2>

                        <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-5">
                            {STEPS.map((step, i) => {
                                const reached = !cancelled && i <= sIdx;
                                const current = !cancelled && i === sIdx + (order.status?.toUpperCase() === 'DELIVERED' ? 0 : 0);
                                return (
                                    <div key={step.key} className="flex flex-col items-center text-center">
                                        <div className="relative w-full flex items-center justify-center">
                                            {i < STEPS.length - 1 && (
                                                <div className={cn(
                                                    'absolute h-[2px] left-1/2 right-0 top-1/2 -translate-y-1/2 transition-colors',
                                                    reached && i < sIdx ? 'bg-teal-500' : 'bg-slate-200'
                                                )} style={{ left: 'calc(50% + 18px)', right: '-50%' }} />
                                            )}
                                            <div className={cn(
                                                'relative z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all',
                                                reached ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/30' : 'bg-slate-100 text-slate-400'
                                            )}>
                                                <step.icon size={16} />
                                            </div>
                                        </div>
                                        <p className={cn(
                                            'mt-2 text-[11px] font-bold',
                                            reached ? 'text-teal-700' : 'text-slate-400'
                                        )}>
                                            {step.label}
                                        </p>
                                        <p className="text-[10px] text-slate-400">
                                            {step.key === 'CREATED'   && fmtDate(order.createdAt)}
                                            {step.key === 'PAID'      && (sIdx >= 1 ? fmtDate(order.updatedAt || order.createdAt) : 'Pending')}
                                            {step.key === 'SHIPPED'   && (sIdx >= 2 ? fmtDate(order.updatedAt || order.createdAt) : 'Pending')}
                                            {step.key === 'DELIVERED' && (sIdx >= 3 ? fmtDate(order.updatedAt || order.createdAt) : 'Pending')}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50/60 border border-slate-100 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Truck size={16} className="text-slate-400" />
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracking #</p>
                                    <p className="text-[12px] font-bold text-slate-800 font-mono">{order.trackingNumber || '—'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Building2 size={16} className="text-slate-400" />
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carrier</p>
                                    <p className="text-[12px] font-bold text-slate-800">{order.carrier || '—'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Clock size={16} className="text-slate-400" />
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est. Delivery</p>
                                    <p className="text-[12px] font-bold text-slate-800">{order.expectedDelivery ? fmtDate(order.expectedDelivery) : '—'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Status actions */}
                        <div className="flex flex-wrap items-center gap-2 mt-5">
                            {order.status === 'PENDING' && (
                                <button onClick={() => setStatus('PAID')} disabled={updating}
                                    className="h-10 px-5 bg-teal-600 text-white rounded-xl text-[13px] font-semibold hover:bg-teal-700 transition-all disabled:opacity-50">
                                    Mark as Paid
                                </button>
                            )}
                            {order.status === 'PAID' && (
                                <button onClick={() => setStatus('SHIPPED')} disabled={updating}
                                    className="h-10 px-5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 transition-all disabled:opacity-50">
                                    Mark as Shipped
                                </button>
                            )}
                            {order.status === 'SHIPPED' && (
                                <button onClick={() => setStatus('DELIVERED')} disabled={updating}
                                    className="h-10 px-5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50">
                                    Mark as Delivered
                                </button>
                            )}
                            {!cancelled && order.status !== 'DELIVERED' && (
                                <button onClick={() => setStatus('CANCELLED')} disabled={updating}
                                    className="h-10 px-5 bg-white border border-slate-200 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-all">
                                    Cancel Order
                                </button>
                            )}
                        </div>
                    </section>
                </div>

                {/* RIGHT — summary + customer + payment */}
                <div className="space-y-6">

                    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                        <h3 className="text-[14px] font-bold text-slate-900 mb-4">Order Summary</h3>
                        <div className="space-y-2.5">
                            <div className="flex justify-between text-[13px] text-slate-600">
                                <span>Subtotal</span>
                                <span className="font-semibold">{fmtMoney(order.total)}</span>
                            </div>
                            <div className="flex justify-between text-[13px] text-slate-600">
                                <span>Shipping</span>
                                <span className="font-semibold text-teal-600">Free</span>
                            </div>
                            <div className="border-t border-slate-100 pt-2.5 flex justify-between">
                                <span className="text-[14px] font-bold text-slate-900">Total</span>
                                <span className="text-[16px] font-bold text-teal-600">{fmtMoney(order.total)}</span>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                        <h3 className="text-[14px] font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <UserIcon size={16} className="text-slate-400" /> Customer Information
                        </h3>
                        {order.customer ? (
                            <div className="space-y-3 text-[13px]">
                                {order.customer.companyName && (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company</p>
                                        <p className="font-bold text-slate-900">{order.customer.companyName}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Buyer</p>
                                    <Link
                                        href={order.customer.id ? `/admin/buyers?focus=${order.customer.id}` : '#'}
                                        className="font-bold text-slate-900 hover:text-teal-600 inline-flex items-center gap-1 transition-colors"
                                    >
                                        {order.customer.name || 'Unknown'} <ExternalLink size={11} />
                                    </Link>
                                </div>
                                {order.customer.email && (
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Mail size={13} className="text-slate-400 shrink-0" />
                                        <span className="truncate">{order.customer.email}</span>
                                    </div>
                                )}
                                {order.customer.phone && (
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Phone size={13} className="text-slate-400 shrink-0" />
                                        <span>{order.customer.phone}</span>
                                    </div>
                                )}
                                {(order.customer.country || order.shippingAddress) && (
                                    <div className="flex items-start gap-2 text-slate-600">
                                        <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                                        <span className="leading-snug">{order.shippingAddress || order.customer.country}</span>
                                    </div>
                                )}
                                {order.customer.vatNumber && (
                                    <div className="pt-2 border-t border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">VAT</p>
                                        <p className="font-mono text-[12px] text-slate-700">{order.customer.vatNumber}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-[12px] text-slate-400">Customer details unavailable.</p>
                        )}

                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Handled by</p>
                            <p className="text-[13px] font-bold text-teal-600">Atlantis Marketplace</p>
                        </div>

                        {/* Contact Customer button */}
                        <button
                            onClick={() => setChatOpen(true)}
                            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0B1F3A] hover:bg-[#1a3a6b] text-white font-bold text-[13px] rounded-2xl transition-all shadow-sm"
                        >
                            <MessageSquare size={16} />
                            Contact Customer
                        </button>
                    </section>

                    {/* Order Chat Modal */}
                    <AnimatePresence>
                        {chatOpen && order && (
                            <OrderChatModal
                                orderId={order.id}
                                orderTotal={order.total}
                                customerName={order.customer?.name}
                                isAdmin={true}
                                onClose={() => setChatOpen(false)}
                            />
                        )}
                    </AnimatePresence>

                    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                        <h3 className="text-[14px] font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <CreditCard size={16} className="text-slate-400" /> Payment
                        </h3>
                        <div className="space-y-2 text-[13px]">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Method</span>
                                <span className="font-bold text-slate-900">{order.paymentMethod || 'Card'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Status</span>
                                <span className="font-bold text-slate-900">{order.paymentStatus || (order.status === 'PAID' || order.status === 'SHIPPED' || order.status === 'DELIVERED' ? 'Paid' : 'Pending')}</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
