'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
    Package, Truck, CheckCircle2, Clock,
    ChevronRight, ShoppingCart, Bell, Search,
    Loader2, LogOut, MapPin, Hash, Ship,
    Star, ArrowRight, Menu, X
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fetchProducts, apiFetch } from '@/lib/api';
import type { Product } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useCart } from '@/lib/cart';
import { useLanguage } from '@/contexts/LanguageContext';

// Design Constants
const COLORS = {
    navy: '#0B1F3A',
    teal: '#1ABC9C',
    background: '#F7F9FC',
    card: '#FFFFFF',
    border: '#E6EAF0',
    textPrimary: '#1A1F36',
    textSecondary: '#6B7280',
    success: '#22C55E',
    warning: '#F59E0B',
    pending: '#9CA3AF'
};

type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface Order {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    createdAt: string;
    shippingCompany: string | null;
    trackingNumber?: string;
    origin?: string;
    destination?: string;
    items: { id: string; quantity: number; price: number; product?: { name: string; images?: string[] } }[];
}

const TRACKING_STEPS = [
    { label: 'Confirmed', key: 'PENDING' },
    { label: 'Processing', key: 'PROCESSING' },
    { label: 'Shipped', key: 'SHIPPED' },
    { label: 'In Transit', key: 'IN_TRANSIT' },
    { label: 'Delivered', key: 'DELIVERED' }
];

export default function CustomerDashboard() {
    const { user, logout } = useAuth();
    const { items } = useCart();
    const { t } = useLanguage();
    const [orders, setOrders] = React.useState<Order[]>([]);
    const [products, setProducts] = React.useState<Product[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = React.useState(true);
    const [isLoadingProducts, setIsLoadingProducts] = React.useState(true);
    const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

    const fetchOrders = React.useCallback(async () => {
        setIsLoadingOrders(true);
        try {
            const res = await apiFetch(`/orders/my-orders`);
            if (res.ok) {
                const data = await res.json();
                // Add some mock logistics data if missing
                const enrichedData = data.map((o: any) => ({
                    ...o,
                    trackingNumber: o.trackingNumber || `ATL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
                    origin: o.origin || 'Istanbul, Turkey',
                    destination: o.destination || 'Dubai, UAE',
                    shippingCompany: o.shippingCompany || 'Scan Cargo'
                }));
                setOrders(enrichedData);
            }
        } catch (_e) { /* offline */ }
        finally { setIsLoadingOrders(false); }
    }, []);

    React.useEffect(() => {
        fetchOrders();
        fetchProducts().then(data => { 
            setProducts(data); 
            setIsLoadingProducts(false); 
        });
    }, [fetchOrders]);

    const activeOrder = orders.find(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED') || orders[0];

    const getStepStatus = (stepKey: string, currentStatus: OrderStatus) => {
        const orderOfStatus: Record<string, number> = {
            'PENDING': 0,
            'PROCESSING': 1,
            'SHIPPED': 2,
            'IN_TRANSIT': 3,
            'DELIVERED': 4
        };
        const currentIdx = orderOfStatus[currentStatus] ?? 0;
        const stepIdx = orderOfStatus[stepKey] ?? 0;

        if (stepIdx < currentIdx) return 'completed';
        if (stepIdx === currentIdx) return 'active';
        return 'upcoming';
    };

    const handleLogout = async () => {
        await logout();
        window.location.href = '/auth/login';
    };

    return (
        <div className="min-h-screen bg-[#F7F9FC] font-inter text-[#1A1F36] selection:bg-[#1ABC9C]/20">
            {/* Header Section (72px height) */}
            <header className="h-[72px] bg-white border-b border-[#E6EAF0] sticky top-0 z-[100] px-8 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 group shrink-0">
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white shadow-sm border border-[#E6EAF0]">
                            <img src="/icon.png" alt="Atlantis" className="w-full h-full object-cover" />
                        </div>
                        <span className="font-heading font-black text-xl tracking-tight text-[#0B1F3A] uppercase">
                            Atlan<span className="text-[#1ABC9C]">tis.</span>
                        </span>
                    </Link>

                    {/* Search Bar */}
                    <div className="relative hidden md:block">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-[#6B7280]" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search products, orders, or suppliers..."
                            className="w-[420px] h-10 bg-[#F7F9FC] border border-[#E6EAF0] rounded-[10px] ps-11 pe-4 text-sm font-medium focus:border-[#1ABC9C] focus:bg-white transition-all outline-none"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="w-10 h-10 rounded-[10px] border border-[#E6EAF0] flex items-center justify-center text-[#1A1F36] hover:bg-[#F7F9FC] transition-all relative">
                        <Bell size={18} />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-[#1ABC9C] rounded-full border-2 border-white"></span>
                    </button>
                    <Link href="/cart" className="w-10 h-10 rounded-[10px] border border-[#E6EAF0] flex items-center justify-center text-[#1A1F36] hover:bg-[#F7F9FC] transition-all relative">
                        <ShoppingCart size={18} />
                        {cartCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-[#1ABC9C] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                                {cartCount}
                            </span>
                        )}
                    </Link>
                    <div className="w-px h-6 bg-[#E6EAF0] mx-2" />
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 h-10 rounded-[10px] text-red-500 hover:bg-red-50 font-bold text-xs uppercase tracking-widest transition-all"
                    >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                    </button>
                </div>
            </header>

            <main className="max-w-[1280px] mx-auto px-8 py-8 space-y-8">
                {/* Welcome Section */}
                <div>
                    <h1 className="text-[28px] font-bold text-[#1A1F36] leading-tight">
                        Welcome back, {user?.name?.split(' ')[0] || 'Partner'}! 👋
                    </h1>
                    <p className="text-sm text-[#6B7280] mt-2 font-medium">
                        Track your wholesale orders and curated recommendations in real-time.
                    </p>
                </div>

                {/* Active Shipment Card */}
                <section className="bg-white rounded-[16px] border border-[#E6EAF0] shadow-sm overflow-hidden">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#1ABC9C]/10 flex items-center justify-center text-[#1ABC9C]">
                                    <Truck size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-[#1A1F36]">Active Shipment</h3>
                                    <p className="text-xs text-[#6B7280] font-medium">Track your current orders in real-time</p>
                                </div>
                            </div>
                            <Link href="/dashboard/customer/orders" className="text-sm font-semibold text-[#1ABC9C] hover:underline flex items-center gap-1">
                                View All Orders <ChevronRight size={16} />
                            </Link>
                        </div>

                        {isLoadingOrders ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-[#1ABC9C]" />
                            </div>
                        ) : activeOrder ? (
                            <div className="space-y-10">
                                {/* Timeline Wrapper */}
                                <div className="relative py-4">
                                    {/* Tracking ID & Status */}
                                    <div className="mb-10">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280] mb-1">Order #AT-{activeOrder.id.slice(-8).toUpperCase()}</p>
                                        <div className="flex items-end gap-3">
                                            <h2 className="text-3xl font-bold text-[#0B1F3A]">{activeOrder.status.replace(/_/g, ' ')}</h2>
                                            <p className="text-sm font-medium text-[#6B7280] pb-1">
                                                Estimated Delivery: <span className="text-[#1A1F36] font-bold">May 28, 2025</span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Timeline */}
                                    <div className="relative px-4">
                                        {/* Progress Line */}
                                        <div className="absolute top-5 start-8 end-8 h-[2px] bg-[#E6EAF0] z-0" />
                                        <div 
                                            className="absolute top-5 start-8 h-[2px] bg-[#1ABC9C] transition-all duration-1000 ease-out z-0"
                                            style={{ 
                                                width: `${(TRACKING_STEPS.findIndex(s => s.key === activeOrder.status) / (TRACKING_STEPS.length - 1)) * 100}%` 
                                            }}
                                        />

                                        {/* Steps */}
                                        <div className="flex justify-between relative z-10">
                                            {TRACKING_STEPS.map((step) => {
                                                const status = getStepStatus(step.key, activeOrder.status);
                                                return (
                                                    <div key={step.key} className="flex flex-col items-center gap-4 text-center">
                                                        <div className={cn(
                                                            "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 border-[3px]",
                                                            status === 'completed' ? "bg-[#22C55E] border-white text-white shadow-lg" :
                                                            status === 'active' ? "bg-[#1ABC9C] border-white text-white shadow-lg scale-110" :
                                                            "bg-white border-[#E6EAF0] text-[#9CA3AF]"
                                                        )}>
                                                            {status === 'completed' ? <CheckCircle2 size={18} /> : 
                                                             step.key === 'SHIPPED' ? <Truck size={18} /> : 
                                                             step.key === 'DELIVERED' ? <Package size={18} /> :
                                                             <div className="w-2 h-2 rounded-full bg-current" />}
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className={cn(
                                                                "text-xs font-bold",
                                                                status !== 'upcoming' ? "text-[#1A1F36]" : "text-[#9CA3AF]"
                                                            )}>{step.label}</p>
                                                            <p className="text-[10px] text-[#6B7280] font-medium uppercase">
                                                                {status === 'active' ? 'May 24, 09:20 AM' : status === 'upcoming' ? 'Pending' : 'Completed'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Order Info Row */}
                                <div className="border-t border-[#E6EAF0] pt-6 flex flex-col md:flex-row items-center justify-between gap-8">
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-4 flex-1">
                                        <div className="flex items-center gap-3">
                                            <Ship size={20} className="text-[#6B7280]" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Carrier</span>
                                                <span className="text-sm font-bold text-[#1A1F36]">{activeOrder.shippingCompany}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Hash size={20} className="text-[#6B7280]" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Tracking Number</span>
                                                <span className="text-sm font-bold text-[#1A1F36]">{activeOrder.trackingNumber}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <MapPin size={20} className="text-[#6B7280]" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Origin</span>
                                                <span className="text-sm font-bold text-[#1A1F36]">{activeOrder.origin}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <MapPin size={20} className="text-[#6B7280]" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Destination</span>
                                                <span className="text-sm font-bold text-[#1A1F36]">{activeOrder.destination}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        <button className="h-10 px-5 border border-[#E6EAF0] rounded-[10px] text-sm font-bold text-[#1A1F36] hover:bg-[#F7F9FC] transition-all">
                                            View Details
                                        </button>
                                        <button className="h-10 px-6 bg-[#1ABC9C] text-white rounded-[10px] text-sm font-bold hover:bg-[#16a085] transition-all shadow-md flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                            Track Live
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                                <div className="w-16 h-16 rounded-full bg-[#F7F9FC] flex items-center justify-center text-[#9CA3AF]">
                                    <Package size={32} />
                                </div>
                                <div>
                                    <p className="font-bold text-[#1A1F36]">No active orders found</p>
                                    <p className="text-sm text-[#6B7280] mt-1">Start sourcing products from our catalog to see updates here.</p>
                                </div>
                                <Link href="/categories" className="h-10 px-8 bg-[#0B1F3A] text-white rounded-[10px] text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all">
                                    Start Shopping <ArrowRight size={16} />
                                </Link>
                            </div>
                        )}
                    </div>
                </section>

                {/* Handpicked Section */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[18px] font-bold text-[#1A1F36]">Handpicked for You</h2>
                        <Link href="/categories" className="text-sm font-bold text-[#1ABC9C] hover:underline flex items-center gap-1">
                            Browse all <ArrowRight size={14} />
                        </Link>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {isLoadingProducts ? (
                            Array(5).fill(0).map((_, i) => (
                                <div key={i} className="w-[220px] h-[280px] bg-white rounded-2xl border border-[#E6EAF0] animate-pulse" />
                            ))
                        ) : (
                            products.slice(0, 5).map((product) => (
                                <Link 
                                    key={product.id}
                                    href={`/products/${product.id}`}
                                    className="w-full bg-white rounded-[16px] border border-[#E6EAF0] overflow-hidden group hover:shadow-xl transition-all"
                                >
                                    <div className="h-[140px] relative overflow-hidden bg-slate-50">
                                        <img 
                                            src={product.images?.[0] || '/placeholder.png'} 
                                            alt={product.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute top-2 start-2">
                                            <span className="bg-[#1ABC9C]/10 text-[#1ABC9C] text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border border-[#1ABC9C]/20 backdrop-blur-sm">
                                                Top Rated
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-2">
                                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">{product.brand || 'Premium Brand'}</p>
                                        <h4 className="text-sm font-bold text-[#1A1F36] line-clamp-1 group-hover:text-[#1ABC9C] transition-colors">{product.name}</h4>
                                        <div className="pt-2 flex items-center justify-between">
                                            <span className="text-base font-bold text-[#1A1F36]">${product.price.toFixed(2)}<span className="text-[10px] text-[#6B7280] font-medium ms-0.5">/unit</span></span>
                                            <div className="w-8 h-8 rounded-lg bg-[#F7F9FC] flex items-center justify-center text-[#1A1F36] group-hover:bg-[#1ABC9C] group-hover:text-white transition-all">
                                                <ShoppingCart size={14} />
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </section>
            </main>

            {/* Bottom Spacing */}
            <div className="h-20" />
        </div>
    );
}
