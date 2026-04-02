'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShoppingBag, Search, Truck, Package, Eye,
    ShieldCheck, Loader2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface SupplierOrder {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    shippingCompany: string | null;
    createdAt: string;
    buyer: { name: string; email: string };
    items: { id: string; name: string; image: string | null; quantity: number; price: number }[];
}

const STATUS_STYLES: Record<OrderStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    PROCESSING: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    SHIPPED: 'bg-primary/10 text-primary border-primary/20',
    DELIVERED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
    PENDING: 'PROCESSING',
    PROCESSING: 'SHIPPED',
};

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
    PENDING: 'Confirm Order',
    PROCESSING: 'Mark as Shipped',
};

export default function SupplierOrdersPage() {
    const [orders, setOrders] = React.useState<SupplierOrder[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const [updatingId, setUpdatingId] = React.useState<string | null>(null);

    const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('bev-token') || '' : '');

    const fetchOrders = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/orders/my-orders`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (res.ok) setOrders(await res.json());
        } catch { /* ignore */ }
        finally { setIsLoading(false); }
    }, []);

    React.useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const handleStatusUpdate = async (orderId: string, status: OrderStatus) => {
        setUpdatingId(orderId);
        try {
            const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ status }),
            });
            if (res.ok) setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
        } catch { /* ignore */ }
        finally { setUpdatingId(null); }
    };

    const filtered = orders.filter(o =>
        o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.buyer.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black tracking-tight">Order Management</h1>
                    <p className="text-muted-foreground font-medium mt-1">Track and fulfill wholesale orders from your customers.</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="text"
                            placeholder="Search order ID or customer..."
                            className="h-11 ps-11 pe-6 bg-card border border-border/50 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm w-64 transition-all"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={fetchOrders}
                        className="h-11 w-11 flex items-center justify-center bg-card border border-border/50 rounded-xl hover:bg-muted/40 transition-colors"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin text-primary' : 'text-muted-foreground'} />
                    </button>
                </div>
            </div>

            {/* Privacy notice */}
            <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl flex items-center gap-4">
                <ShieldCheck className="text-primary shrink-0" size={20} />
                <p className="text-xs text-muted-foreground font-medium">
                    <span className="font-black text-primary uppercase tracking-widest me-2">Secure View:</span>
                    Showing only orders containing your products. Customer data is partially masked for privacy compliance.
                </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as OrderStatus[]).map(status => (
                    <div key={status} className="rounded-2xl p-4 bg-card border border-border/50 text-center">
                        <p className={cn('text-2xl font-black', STATUS_STYLES[status].split(' ')[1])}>
                            {orders.filter(o => o.status === status).length}
                        </p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{status}</p>
                    </div>
                ))}
            </div>

            {/* Orders list */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
                    <ShoppingBag className="w-12 h-12 opacity-20" />
                    <p className="font-bold">{searchTerm ? 'No orders match your search.' : 'No orders yet.'}</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((order, i) => (
                            <motion.div
                                key={order.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="bg-card border border-border/50 rounded-3xl overflow-hidden hover:border-primary/20 transition-all"
                            >
                                {/* Summary row */}
                                <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
                                            <ShoppingBag className="text-primary" size={20} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                                                    #{order.id.slice(-8).toUpperCase()}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground font-bold">
                                                    {new Date(order.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="font-black">{order.buyer.name}</p>
                                            <p className="text-[11px] text-muted-foreground">{order.buyer.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-8">
                                        <div className="text-center">
                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total</p>
                                            <p className="text-lg font-black">${order.totalAmount.toFixed(2)}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Items</p>
                                            <p className="text-lg font-black">{order.items.length}</p>
                                        </div>
                                        <span className={cn('px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border', STATUS_STYLES[order.status])}>
                                            {order.status}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {NEXT_STATUS[order.status] && (
                                            <button
                                                onClick={() => handleStatusUpdate(order.id, NEXT_STATUS[order.status]!)}
                                                disabled={updatingId === order.id}
                                                className="h-10 px-4 bg-primary/10 hover:bg-primary/20 text-primary font-black text-xs rounded-xl border border-primary/20 transition-all flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {updatingId === order.id
                                                    ? <Loader2 size={14} className="animate-spin" />
                                                    : order.status === 'PROCESSING' ? <Truck size={14} /> : <CheckCircle2 size={14} />
                                                }
                                                {NEXT_LABEL[order.status]}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setExpandedId(prev => prev === order.id ? null : order.id)}
                                            className={cn(
                                                'h-10 px-4 text-xs font-black rounded-xl border transition-all flex items-center gap-2',
                                                expandedId === order.id
                                                    ? 'bg-primary/20 text-primary border-primary/30'
                                                    : 'bg-muted/30 text-muted-foreground border-border/50 hover:text-foreground'
                                            )}
                                        >
                                            <Eye size={14} />
                                            {expandedId === order.id ? 'Close' : 'Details'}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded details */}
                                <AnimatePresence>
                                    {expandedId === order.id && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="border-t border-border/50 bg-muted/20 overflow-hidden"
                                        >
                                            <div className="p-6 space-y-4">
                                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Line Items</p>
                                                <div className="space-y-2">
                                                    {order.items.map(item => (
                                                        <div key={item.id} className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border/50">
                                                            <div className="flex items-center gap-3">
                                                                {item.image ? (
                                                                    <img src={item.image} alt="" className="w-10 h-10 rounded-xl object-cover border border-border/50" />
                                                                ) : (
                                                                    <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center">
                                                                        <Package size={16} className="text-muted-foreground" />
                                                                    </div>
                                                                )}
                                                                <p className="font-bold text-sm">{item.name}</p>
                                                            </div>
                                                            <div className="flex items-center gap-8 text-end">
                                                                <div>
                                                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Qty</p>
                                                                    <p className="font-bold">{item.quantity}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Unit Price</p>
                                                                    <p className="font-bold text-primary">${item.price.toFixed(2)}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Subtotal</p>
                                                                    <p className="font-black">${(item.price * item.quantity).toFixed(2)}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Financial summary */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
                                                    <div className="p-4 bg-card rounded-2xl border border-border/50 space-y-2">
                                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Financial Summary</p>
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-muted-foreground">Gross Value</span>
                                                            <span className="font-bold">${(order.totalAmount * 1.05).toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-red-400">Platform Fee (5%)</span>
                                                            <span className="font-bold text-red-400">-${(order.totalAmount * 0.05).toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                                                            <span className="font-black text-primary">Your Net Revenue</span>
                                                            <span className="font-black text-primary">${order.totalAmount.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                    {order.shippingCompany && (
                                                        <div className="p-4 bg-card rounded-2xl border border-border/50 space-y-2">
                                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Shipping</p>
                                                            <div className="flex items-center gap-2">
                                                                <Truck size={14} className="text-primary" />
                                                                <span className="font-bold text-sm">{order.shippingCompany}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
