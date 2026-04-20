'use client';
import { apiFetch } from '@/lib/api';


import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ShoppingCart, Search, Filter, ArrowUpRight, 
    Clock, CheckCircle2, XCircle, MoreVertical, 
    Truck, DollarSign, Briefcase, ChevronRight,
    ArrowRight, Globe, Zap, ShieldCheck, 
    CreditCard, Receipt, Package, TrendingUp, User, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/currency';

interface AdminOrder {
    id: string;
    customer: string;
    supplier: string;
    total: number;
    supplierProfit: number;
    adminProfit: number;
    status: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
    date: string;
    shippingCompany?: string;
    shippingCost?: number;
    items: { product: string; quantity: number; price: number }[];
}

export default function AdminOrdersPage() {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [orders, setOrders] = React.useState<AdminOrder[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [selectedOrder, setSelectedOrder] = React.useState<AdminOrder | null>(null);

    React.useEffect(() => {
        const fetchOrders = async () => {
            try {
                
                const res = await apiFetch('/orders', {
                });
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                setOrders(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, []);

    const handleUpdateStatus = async (id: string, status: string) => {
        try {
            
            const res = await apiFetch(`/orders/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                const newStatus = status as 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
                setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
                if (selectedOrder?.id === id) setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
            }
        } catch (err) { console.error(err); }
    };

    const filteredOrders = orders.filter(o => 
        o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.supplier.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = {
        totalVolume: orders.reduce((acc, o) => acc + o.total, 0),
        activeOrders: orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length,
        adminYield: orders.reduce((acc, o) => acc + o.adminProfit, 0)
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Header Area */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black text-foreground tracking-tighter uppercase leading-none">Global Ledger</h1>
                    <p className="text-muted-foreground font-black text-[11px] uppercase tracking-[0.4em] opacity-70">Commerce Stream Monitoring & Settlement</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <button
                        onClick={async () => {
                            const res = await apiFetch('/orders/export/excel');
                            if (res.ok) {
                                const blob = await res.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `orders-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                            }
                        }}
                        className="h-16 px-8 bg-emerald-500 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest hover:scale-105 transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-3"
                    >
                        <Receipt size={18} />
                        Export Ledger
                    </button>
                    <div className="relative group">
                        <Search className="absolute start-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Search by Order ID, Stakeholder, or SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-16 ps-16 pe-8 bg-card rounded-[2rem] border border-border/50 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground font-bold text-sm min-w-[350px] transition-all shadow-xl"
                        />
                    </div>
                </div>
            </div>

            {/* Financial Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card-strong p-8 overflow-hidden relative group">
                    <div className="absolute top-0 end-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><CreditCard size={120} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Transaction Volume</p>
                    <h2 className="text-5xl font-black tracking-tighter">{formatPrice(stats.totalVolume)}</h2>
                    <div className="flex items-center gap-2 mt-4 text-emerald-500 font-black text-[10px] uppercase tracking-widest">
                        <TrendingUp size={14} /> Historical Revenue
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-primary">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Platform Yield (Admin)</p>
                    <h2 className="text-5xl font-black tracking-tighter text-primary">{formatPrice(stats.adminYield)}</h2>
                    <div className="flex items-center gap-2 mt-4 text-primary font-black text-[10px] uppercase tracking-widest">
                        <DollarSign size={14} /> Net Service Fees
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-secondary">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Active Pipeline</p>
                    <h2 className="text-5xl font-black tracking-tighter text-secondary">{stats.activeOrders}</h2>
                    <div className="flex items-center gap-2 mt-4 text-secondary font-black text-[10px] uppercase tracking-widest">
                        <Zap size={14} /> Open Transactions
                    </div>
                </div>
            </div>

            {/* Orders Table Container */}
            <div className="glass-card-strong min-h-[600px] overflow-hidden">
                <table className="w-full text-start border-collapse">
                    <thead>
                        <tr className="border-b border-border/50">
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Transaction Protocol</th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Lifecycle State</th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Settlement Value</th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em] text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        <AnimatePresence mode="popLayout">
                            {filteredOrders.map((order) => (
                                <motion.tr
                                    key={order.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="group hover:bg-primary/5 transition-all cursor-pointer"
                                    onClick={() => setSelectedOrder(order)}
                                >
                                    <td className="px-10 py-8">
                                        <div className="flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-muted glass flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-lg border border-border/50">
                                                <Receipt size={24} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-primary uppercase tracking-tighter mb-1 select-all">#ORD-{order.id.substring(0, 8).toUpperCase()}</p>
                                                <div className="flex gap-4">
                                                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60 flex items-center gap-1"><User size={10} /> {order.customer}</p>
                                                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60 flex items-center gap-1"><Briefcase size={10} /> {order.supplier}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-10 py-8">
                                        <div className={cn(
                                            "inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border shadow-sm",
                                            order.status === 'PAID' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                            order.status === 'SHIPPED' ? "bg-primary/10 text-primary border-primary/20" :
                                            order.status === 'PENDING' ? "bg-amber-400/10 text-amber-500 border-amber-400/20" :
                                            "bg-red-500/10 text-red-500 border-red-500/20"
                                        )}>
                                            <div className={cn("w-2 h-2 rounded-full animate-pulse", 
                                                order.status === 'PAID' ? "bg-emerald-500" : 
                                                order.status === 'PENDING' ? "bg-amber-500" :
                                                order.status === 'SHIPPED' ? "bg-primary" : "bg-red-500"
                                            )} />
                                            {order.status}
                                        </div>
                                    </td>
                                    <td className="px-10 py-8">
                                        <p className="text-2xl font-black tracking-tighter">{formatPrice(order.total)}</p>
                                        <p className="text-[9px] text-primary font-black uppercase tracking-widest opacity-60">Admin Yield: {formatPrice(order.adminProfit)}</p>
                                    </td>
                                    <td className="px-10 py-8 text-end">
                                        <button className="w-12 h-12 glass rounded-2xl flex items-center justify-center hover:bg-primary hover:text-white transition-all ms-auto group-hover:scale-110 shadow-lg">
                                            <ChevronRight size={20} />
                                        </button>
                                    </td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Sophisticated Order Detail Modal */}
            <AnimatePresence>
                {selectedOrder && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setSelectedOrder(null)} className="absolute inset-0 bg-background/80 backdrop-blur-3xl" />
                        
                        <motion.div 
                            initial={{ scale: 0.9, y: 50, opacity: 0 }} 
                            animate={{ scale: 1, y: 0, opacity: 1 }} 
                            exit={{ scale: 0.9, y: 50, opacity: 0 }}
                            className="glass-card-strong w-full max-w-5xl relative z-10 overflow-hidden flex flex-col md:flex-row h-[850px] shadow-[0_0_120px_rgba(0,0,0,0.6)] border-primary/20"
                        >
                            {/* Left Column: Settlement & Actors */}
                            <div className="w-full md:w-[40%] bg-primary/5 p-12 flex flex-col h-full border-e border-border/10">
                                <section className="mb-12">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-14 h-14 rounded-3xl bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/30">
                                            <ShoppingCart size={28} />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black uppercase tracking-tighter leading-none mb-2">Protocol <span className="text-primary">{selectedOrder.id.substring(0, 8)}</span></h2>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">Confirmed: {selectedOrder.date}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-6">
                                        <div className="glass p-6 rounded-3xl border-s-4 border-primary">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Entity: Buyer</p>
                                            <p className="text-xl font-black">{selectedOrder.customer}</p>
                                        </div>
                                        <div className="glass p-6 rounded-3xl border-s-4 border-secondary">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Entity: Vendor</p>
                                            <p className="text-xl font-black">{selectedOrder.supplier}</p>
                                        </div>
                                    </div>
                                </section>

                                <section className="flex-1 mt-auto">
                                    <div className="glass-card-strong !bg-primary/10 border-primary/20 p-8 rounded-[2.5rem] relative overflow-hidden group">
                                        <div className="absolute -end-8 -bottom-8 opacity-5 text-primary rotate-12 group-hover:scale-110 transition-transform duration-700">
                                            <TrendingUp size={160} />
                                        </div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-6">Settlement Breakdown</p>
                                        <div className="space-y-4 relative z-10">
                                            <div className="flex justify-between items-end">
                                                <span className="text-[11px] font-bold text-muted-foreground uppercase">Base Volume</span>
                                                <span className="text-xl font-black">{formatPrice(selectedOrder.total)}</span>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <span className="text-[11px] font-bold text-muted-foreground uppercase text-emerald-500">Payout</span>
                                                <span className="text-xl font-black text-emerald-500">-{formatPrice(selectedOrder.supplierProfit)}</span>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <span className="text-[11px] font-bold text-muted-foreground uppercase text-primary">Logistics</span>
                                                <span className="text-xl font-black text-primary">-{formatPrice(selectedOrder.shippingCost || 0)}</span>
                                            </div>
                                            <div className="pt-4 border-t border-primary/20 mt-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-lg font-black uppercase tracking-widest text-primary">Yield</span>
                                                    <span className="text-4xl font-black text-primary">{formatPrice(selectedOrder.adminProfit)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Right Column: Execution Data */}
                            <div className="flex-1 p-12 flex flex-col h-full bg-card/10 overflow-y-auto">
                                <div className="flex-1 space-y-12">
                                    <section>
                                        <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 border-b border-border/20 pb-6 mb-8">
                                            <Package className="text-primary" size={20} /> Fulfillment Cargo
                                        </h3>
                                        <div className="space-y-4">
                                            {selectedOrder.items.map((item, i) => (
                                                <div key={i} className="flex items-center justify-between p-6 glass rounded-3xl border border-border/10 hover:border-primary/20 transition-all">
                                                    <div className="flex items-center gap-5">
                                                        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center font-black text-sm uppercase">
                                                            {item.product.substring(0, 2)}
                                                        </div>
                                                        <div>
                                                            <p className="text-base font-black tracking-tight">{item.product}</p>
                                                            <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">Qty: {item.quantity} units</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-end">
                                                        <p className="text-lg font-black">{formatPrice(item.price * item.quantity)}</p>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Unit: {formatPrice(item.price)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    {selectedOrder.shippingCompany && (
                                        <section className="glass p-8 rounded-[2.5rem] border-s-4 border-emerald-500">
                                            <div className="flex items-start gap-5">
                                                <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0 border border-emerald-500/20 shadow-lg">
                                                    <Truck size={24} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black uppercase tracking-widest mb-2">Transit Intelligence</h4>
                                                    <p className="text-2xl font-black text-foreground">{selectedOrder.shippingCompany}</p>
                                                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Cargo is currently in active routing phase.</p>
                                                </div>
                                            </div>
                                        </section>
                                    )}
                                </div>

                                <div className="pt-12 border-t border-border/20 grid grid-cols-2 gap-6">
                                    {selectedOrder.status === 'PENDING' ? (
                                        <>
                                            <button onClick={() => handleUpdateStatus(selectedOrder.id, 'REJECTED')} className="h-20 flex items-center justify-center gap-3 rounded-[2rem] border-2 border-red-500/20 text-red-500 font-black uppercase text-xs tracking-widest hover:bg-red-500 hover:text-white transition-all group">
                                                <XCircle size={24} className="group-hover:rotate-90 transition-transform" /> Void Transaction
                                            </button>
                                            <button onClick={() => handleUpdateStatus(selectedOrder.id, 'PAID')} className="h-20 flex items-center justify-center gap-3 rounded-[2rem] bg-emerald-500 text-white font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-emerald-500/30">
                                                <CheckCircle2 size={24} /> Authorize Settlement
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={() => setSelectedOrder(null)} className="h-20 col-span-2 flex items-center justify-center gap-3 rounded-[2rem] bg-primary text-white font-black uppercase text-xs tracking-widest hover:scale-105 transition-all shadow-2xl shadow-primary/30">
                                            Protocol View Mode Active
                                        </button>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="absolute top-8 end-8 w-14 h-14 glass rounded-full flex items-center justify-center hover:rotate-90 transition-transform duration-500">
                                <X size={28} />
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
