'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    Package, Truck, CheckCircle2, Clock,
    ChevronRight, ShoppingBag, Heart, Star,
    Loader2, XCircle, RefreshCw, Trash2
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fetchProducts, apiFetch } from '@/lib/api';
import type { Product } from '@/lib/types';
import ProductCard from '@/components/product/ProductCard';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface Order {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    createdAt: string;
    shippingCompany: string | null;
    items: { id: string; quantity: number; price: number; product?: { name: string; images?: string[] } }[];
}

const STATUS_STYLES: Record<OrderStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    PROCESSING: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    SHIPPED: 'bg-primary/10 text-primary border-primary/20',
    DELIVERED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_ICONS: Record<OrderStatus, React.ElementType> = {
    PENDING: Clock,
    PROCESSING: CheckCircle2,
    SHIPPED: Truck,
    DELIVERED: Package,
    CANCELLED: XCircle,
};

const TRACKING_STEPS: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

export default function CustomerDashboard() {
    const { user } = useAuth();
    const [orders, setOrders] = React.useState<Order[]>([]);
    const [products, setProducts] = React.useState<Product[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = React.useState(true);
    const [isLoadingProducts, setIsLoadingProducts] = React.useState(true);

    const fetchOrders = React.useCallback(async () => {
        setIsLoadingOrders(true);
        try {
            const res = await apiFetch(`/orders/my-orders`);
            if (res.ok) setOrders(await res.json());
        } catch (_e) { /* offline */ }
        finally { setIsLoadingOrders(false); }
    }, []);

    const handleDeleteOrder = async (orderId: string) => {
        const tid = toast.loading('Hiding order...');
        try {
            const res = await apiFetch(`/orders/${orderId}/customer-hide`, {
                method: 'DELETE'
            });
            if (res.ok) {
                toast.success('Order removed from your dashboard', { id: tid });
                setOrders(prev => prev.filter(o => o.id !== orderId));
            } else {
                toast.error('Failed to remove order', { id: tid });
            }
        } catch (err) {
            toast.error('Network error', { id: tid });
        }
    };

    React.useEffect(() => {
        fetchOrders();
        fetchProducts().then(data => { setProducts(data); setIsLoadingProducts(false); });
    }, [fetchOrders]);

    const activeOrder = orders.find(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
    const openCount = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;

    return (
        <div className="min-h-screen bg-[#F5F7F7] dark:bg-[#0A0D12]">
            {/* Dashboard Header */}
            <header className="fixed top-0 start-0 end-0 h-20 bg-white/80 dark:bg-[#131921]/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 z-[100] px-4 md:px-8 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 bg-white rounded-xl overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 shadow-lg shadow-black/5 border border-black/5">
                        <img src="/icon.png" alt="Atlantis" className="w-full h-full object-cover" />
                    </div>
                    <span className="font-heading font-black text-xl tracking-tighter text-[#111] dark:text-white uppercase">
                        Atlan<span className="text-primary">tis.</span>
                    </span>
                </Link>
                
                <div className="flex items-center gap-4">
                    <Link href="/" className="text-[11px] font-black uppercase tracking-widest text-[#888] hover:text-primary transition-colors">
                        Back to Shop
                    </Link>
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                        <Star size={18} fill="currentColor" />
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto space-y-10 p-4 md:p-8 pt-28 pb-20">
            {/* Greeting */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-[#111] dark:text-white tracking-tight">
                        Welcome back, <span className="text-primary">{user?.name?.split(' ')[0]}</span>
                    </h1>
                    <p className="text-[#555] dark:text-white/40 font-medium italic">Track your wholesale orders and curated recommendations.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="p-4 bg-white dark:bg-[#131921] rounded-2xl shadow-sm border border-black/5 dark:border-white/5 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <ShoppingBag size={20} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-black text-[#888] tracking-widest leading-none">Open Orders</span>
                            <span className="text-lg font-black text-[#111] dark:text-white">
                                {isLoadingOrders ? '—' : String(openCount).padStart(2, '0')}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={fetchOrders}
                        className="w-11 h-11 bg-white dark:bg-[#131921] rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    >
                        <RefreshCw size={16} className={isLoadingOrders ? 'animate-spin text-primary' : ''} />
                    </button>
                </div>
            </div>

            {/* Active Order Tracking */}
            <div className="bg-white dark:bg-[#131921] rounded-3xl border border-black/5 dark:border-white/5 p-8 space-y-8 layered-3d-shadow">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-[#111] dark:text-white tracking-tight flex items-center gap-3">
                        <Truck className="text-primary" /> Active Shipment
                    </h3>
                    <Link href="/dashboard/customer/orders" className="text-xs font-bold text-primary hover:underline">
                        View All Orders
                    </Link>
                </div>

                {isLoadingOrders ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                ) : !activeOrder ? (
                    <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                        <ShoppingBag className="w-10 h-10 opacity-20" />
                        <p className="font-bold text-sm">No active orders</p>
                        <Link href="/categories" className="text-primary text-xs font-black hover:underline uppercase tracking-widest">
                            Browse Products →
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* Stepper */}
                        <div className="relative pt-4 pb-2 px-4">
                            <div className="absolute top-10 start-8 end-8 h-1 bg-[#E6E6E6] dark:bg-white/5 rounded-full" />
                            <div
                                className="absolute top-10 start-8 h-1 bg-primary rounded-full shadow-[0_0_10px_rgba(255,107,0,0.4)] transition-all duration-700"
                                style={{
                                    width: `${(Math.max(0, TRACKING_STEPS.indexOf(activeOrder.status)) / (TRACKING_STEPS.length - 1)) * 100}%`
                                }}
                            />
                            <div className="flex justify-between relative z-10">
                                {TRACKING_STEPS.map((status) => {
                                    const Icon = STATUS_ICONS[status];
                                    const done = TRACKING_STEPS.indexOf(status) <= TRACKING_STEPS.indexOf(activeOrder.status);
                                    const active = status === activeOrder.status;
                                    const labels: Record<string, string> = {
                                        PENDING: 'Ordered', PROCESSING: 'Confirmed', SHIPPED: 'In Transit', DELIVERED: 'Delivered'
                                    };
                                    return (
                                        <div key={status} className="flex flex-col items-center gap-3">
                                            <div className={cn(
                                                'w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all',
                                                done ? 'bg-primary border-[#F5F7F7] dark:border-[#131921] text-white' :
                                                    'bg-white dark:bg-gray-800 border-[#E6E6E6] dark:border-white/10 text-muted-foreground',
                                                active && 'animate-pulse'
                                            )}>
                                                <Icon size={20} />
                                            </div>
                                            <p className={cn('text-xs font-black uppercase tracking-tight', done ? 'text-[#111] dark:text-white' : 'text-muted-foreground')}>
                                                {labels[status]}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Order details */}
                        <div className="flex items-center justify-between p-4 bg-[#F5F7F7] dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                            <div className="flex items-center gap-4">
                                {activeOrder.items[0]?.product?.images?.[0] ? (
                                    <img src={activeOrder.items[0].product.images[0]} alt="" className="w-14 h-14 rounded-xl object-cover border border-border/50" />
                                ) : (
                                    <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
                                        <Package size={20} className="text-muted-foreground" />
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm font-bold text-[#111] dark:text-white">
                                        {activeOrder.items[0]?.product?.name || `${activeOrder.items.length} item(s)`}
                                        {activeOrder.items.length > 1 && ` +${activeOrder.items.length - 1} more`}
                                    </p>
                                    <p className="text-xs text-[#888]">
                                        Order #{activeOrder.id.slice(-8).toUpperCase()} • ${activeOrder.totalAmount.toFixed(2)}
                                    </p>
                                </div>
                            </div>
                            <Link
                                href={`/dashboard/customer/orders/${activeOrder.id}`}
                                className="flex items-center gap-1 text-xs font-black text-primary hover:underline"
                            >
                                Track <ChevronRight size={14} />
                            </Link>
                        </div>
                    </>
                )}
            </div>

            {/* Recent Orders */}
            {!isLoadingOrders && orders.length > 0 && (
                <div className="bg-white dark:bg-[#131921] rounded-3xl border border-black/5 dark:border-white/5 p-8 space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black text-[#111] dark:text-white">Recent Orders</h3>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{orders.length} total</span>
                    </div>
                    <div className="space-y-3">
                        {orders.slice(0, 5).map(order => {
                            const Icon = STATUS_ICONS[order.status];
                            return (
                                <Link
                                    key={order.id}
                                    href={`/dashboard/customer/orders/${order.id}`}
                                    className="flex items-center justify-between p-4 rounded-2xl border border-black/5 dark:border-white/5 hover:border-primary/20 hover:bg-primary/5 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center border', STATUS_STYLES[order.status])}>
                                            <Icon size={16} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black">#{order.id.slice(-8).toUpperCase()}</p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {new Date(order.createdAt).toLocaleDateString()} • {order.items.length} item(s)
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-end">
                                            <p className="text-sm font-black">${order.totalAmount.toFixed(2)}</p>
                                            <span className={cn('text-[9px] font-black uppercase tracking-widest', STATUS_STYLES[order.status].split(' ')[1])}>
                                                {order.status}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleDeleteOrder(order.id);
                                            }}
                                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Personalized Recommendations */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black text-[#111] dark:text-white tracking-tight flex items-center gap-3">
                        <Heart className="text-primary" fill="currentColor" /> Handpicked for You
                    </h2>
                    <Link href="/categories" className="text-sm font-bold text-[#888] hover:text-primary transition-colors inline-flex items-center gap-2">
                        Browse all <ChevronRight size={16} />
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {isLoadingProducts ? (
                        <div className="col-span-full py-8 text-center text-muted-foreground font-medium">Loading recommendations...</div>
                    ) : (
                        products.slice(4, 8).map((product, i) => (
                            <div key={product.id} className="group relative">
                                <div className="absolute -inset-1 bg-gradient-to-r from-primary to-[#FF8C33] rounded-3xl blur opacity-0 group-hover:opacity-20 transition duration-500" />
                                <div className="relative">
                                    <ProductCard product={product} index={i} />
                                </div>
                                <div className="absolute top-2 start-2 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg border border-black/5 flex items-center gap-1.5 shadow-sm">
                                    <Star size={10} className="text-primary" fill="currentColor" />
                                    <span className="text-[9px] font-black uppercase text-primary">Best Match</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    </div>
);
}
