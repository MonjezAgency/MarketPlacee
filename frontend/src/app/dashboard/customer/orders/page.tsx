'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
    Package, 
    Search, 
    Filter, 
    ChevronRight, 
    ArrowLeft,
    Clock,
    CheckCircle2,
    Truck,
    XCircle,
    Loader2,
    ArrowRight
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface Order {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    createdAt: string;
    items: { id: string; quantity: number; price: number; product?: { name: string; images?: string[] } }[];
}

export default function OrdersPage() {
    const { t } = useLanguage();
    const [orders, setOrders] = React.useState<Order[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');

    const fetchOrders = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch(`/orders/my-orders`);
            if (res.ok) {
                const data = await res.json();
                // Handle both direct array and paginated object { data: [...] }
                const ordersList = Array.isArray(data) ? data : (data.data || []);
                setOrders(ordersList);
            }
        } catch (_e) { /* offline */ }
        finally { setIsLoading(false); }
    }, []);

    React.useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const getStatusStyles = (status: OrderStatus) => {
        switch (status) {
            case 'DELIVERED': return 'bg-green-50 text-green-600 border-green-100';
            case 'SHIPPED': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'PROCESSING': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'CANCELLED': return 'bg-red-50 text-red-600 border-red-100';
            default: return 'bg-slate-50 text-slate-600 border-slate-100';
        }
    };

    const getStatusIcon = (status: OrderStatus) => {
        switch (status) {
            case 'DELIVERED': return <CheckCircle2 size={14} />;
            case 'SHIPPED': return <Truck size={14} />;
            case 'PROCESSING': return <Clock size={14} />;
            case 'CANCELLED': return <XCircle size={14} />;
            default: return <Clock size={14} />;
        }
    };

    const filteredOrders = (Array.isArray(orders) ? orders : []).filter(o => 
        (o?.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o?.status || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div>
                <h1 className="text-3xl font-black text-[#0B1F3A] tracking-tight">Order History</h1>
                <p className="text-sm text-slate-500 font-medium mt-1">Manage and track your global wholesale acquisitions.</p>
            </div>

            <main className="space-y-8">
                {/* Search & Filter Bar */}
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1ABC9C] transition-colors" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search by Order ID or status..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-14 pl-12 pr-6 bg-white border border-[#E6EAF0] rounded-2xl text-sm font-bold outline-none focus:border-[#1ABC9C] focus:ring-4 focus:ring-[#1ABC9C]/5 transition-all"
                        />
                    </div>
                    <button className="h-14 px-6 bg-white border border-[#E6EAF0] rounded-2xl text-slate-600 font-bold text-sm flex items-center gap-3 hover:bg-slate-50 transition-all">
                        <Filter size={18} /> Filter
                    </button>
                </div>

                {/* Orders List */}
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="w-10 h-10 animate-spin text-[#1ABC9C]" />
                            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Synchronizing your order ledger...</p>
                        </div>
                    ) : filteredOrders.length > 0 ? (
                        filteredOrders.map((order) => (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={order.id}
                                className="bg-white border border-[#E6EAF0] rounded-[24px] overflow-hidden hover:shadow-xl hover:border-[#1ABC9C]/20 transition-all group"
                            >
                                <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-8">
                                    <div className="flex items-start gap-6">
                                        <div className="w-16 h-16 rounded-2xl bg-[#F8FAFC] flex items-center justify-center text-slate-400 border border-[#E6EAF0] group-hover:text-[#1ABC9C] group-hover:bg-[#1ABC9C]/5 transition-all">
                                            <Package size={28} />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-base font-black text-[#0B1F3A]">Order #AT-{(order?.id || '0000').slice(-8).toUpperCase()}</h3>
                                                {order?.status && (
                                                    <div className={cn(
                                                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5",
                                                        getStatusStyles(order.status)
                                                    )}>
                                                        {getStatusIcon(order.status)}
                                                        {order.status}
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 font-medium">
                                                Placed on {order?.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown Date'}
                                            </p>
                                            <div className="flex items-center gap-2 pt-2">
                                                <div className="flex -space-x-2">
                                                    {(order?.items || []).slice(0, 3).map((item, idx) => (
                                                        <div key={idx} className="w-8 h-8 rounded-lg border-2 border-white bg-slate-100 overflow-hidden shadow-sm">
                                                            <img src={item.product?.images?.[0] || '/placeholder.png'} className="w-full h-full object-cover" alt="Product" />
                                                        </div>
                                                    ))}
                                                    {(order?.items?.length || 0) > 3 && (
                                                        <div className="w-8 h-8 rounded-lg border-2 border-white bg-slate-900 text-white text-[8px] font-black flex items-center justify-center shadow-sm">
                                                            +{(order?.items?.length || 0) - 3}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider ml-2">{(order?.items?.length || 0)} Product Items</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between md:flex-col md:items-end gap-2 border-t md:border-t-0 pt-6 md:pt-0">
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Value</p>
                                            <p className="text-2xl font-black text-[#0B1F3A]">
                                                ${(order?.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <Link 
                                            href={`/dashboard/customer/orders/${order.id}`}
                                            className="h-11 px-6 bg-[#0B1F3A] text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#1ABC9C] transition-all shadow-lg active:scale-95"
                                        >
                                            Track Order <ChevronRight size={14} />
                                        </Link>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        <div className="bg-white border border-dashed border-slate-300 rounded-[32px] p-20 text-center space-y-6">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto">
                                <Package size={40} />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-black text-[#0B1F3A]">No orders found</h2>
                                <p className="text-sm text-slate-500 font-medium max-w-xs mx-auto">You haven't initiated any wholesale transactions yet. Explore our global catalog to start sourcing.</p>
                            </div>
                            <Link href="/categories" className="inline-flex h-12 px-8 bg-[#1ABC9C] text-white rounded-xl text-sm font-black items-center gap-2 hover:opacity-90 transition-all shadow-xl shadow-[#1ABC9C]/20">
                                Browse Categories <ArrowRight size={18} />
                            </Link>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
