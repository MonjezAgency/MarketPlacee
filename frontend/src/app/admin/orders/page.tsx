'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Filter, Download, MoreVertical,
    CheckCircle, XCircle, Clock, Truck,
    ClipboardList, DollarSign, Calendar, User,
    ChevronRight, X, Printer, Package, History,
    CheckSquare, Square, RefreshCw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';

interface AdminOrder {
    id: string;
    customer: string;
    customerEmail?: string;
    customerPhone?: string;
    supplier: string;
    total: number;
    supplierProfit: number;
    adminProfit: number;
    status: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
    date: string;
    shippingCompany?: string;
    shippingCost?: number;
    trackingNumber?: string;
    carrier?: string;
    items: { product: string; quantity: number; price: number }[];
}

const STATUS_CONFIG = {
    PENDING: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Clock },
    PAID: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle },
    SHIPPED: { color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Truck },
    DELIVERED: { color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: CheckCircle },
    CANCELLED: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle },
};

export default function AdminOrdersPage() {
    const [orders, setOrders] = React.useState<AdminOrder[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [sortOrder, setSortOrder] = React.useState<'DESC' | 'ASC'>('DESC');
    const [filterStatus, setFilterStatus] = React.useState<string>('ALL');
    const [selectedOrder, setSelectedOrder] = React.useState<AdminOrder | null>(null);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [isBulkLoading, setIsBulkLoading] = React.useState(false);
    const [isStatusUpdating, setIsStatusUpdating] = React.useState<string | null>(null);
    const [shipmentForm, setShipmentForm] = React.useState({ trackingNumber: '', carrier: 'DHL' });
    const [isNotifying, setIsNotifying] = React.useState(false);

    const loadOrders = async () => {
        try {
            const res = await apiFetch('/orders');
            if (res.ok) {
                const data = await res.json();
                setOrders(data);
            }
        } catch (err) {
            console.error('Failed to load orders:', err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadOrders();
    }, []);

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleAllSelections = () => {
        if (selectedIds.size === filteredOrders.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredOrders.map(o => o.id)));
        }
    };

    const handleBulkAction = async (status: string) => {
        if (selectedIds.size === 0) return;
        
        const actionLabel = status === 'PAID' ? 'approving' : 'cancelling';
        const tid = toast.loading(`Bulk ${actionLabel} ${selectedIds.size} orders...`);
        setIsBulkLoading(true);
        
        try {
            const res = await apiFetch('/orders/bulk-status', {
                method: 'PATCH',
                body: JSON.stringify({
                    ids: Array.from(selectedIds),
                    status
                })
            });
            
            if (res.ok) {
                toast.success(`Successfully ${status.toLowerCase()} ${selectedIds.size} orders`, { id: tid });
                await loadOrders();
                setSelectedIds(new Set());
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || "Failed to process bulk action", { id: tid });
            }
        } catch (err) {
            console.error('Bulk action failed:', err);
            toast.error("Network error during bulk action", { id: tid });
        } finally {
            setIsBulkLoading(false);
        }
    };

    const updateStatus = async (id: string, status: string) => {
        setIsStatusUpdating(id);
        const tid = toast.loading(`Updating status to ${status}...`);
        try {
            const res = await apiFetch(`/orders/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                const updated = await res.json();
                setOrders(prev => prev.map(o => o.id === id ? { ...o, status: updated.status as any } : o));
                if (selectedOrder?.id === id) {
                    setSelectedOrder(prev => prev ? { ...prev, status: updated.status as any } : null);
                }
                toast.success(`Order ${status.toLowerCase()} successfully`, { id: tid });
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.message || `Failed to update status`, { id: tid });
            }
        } catch (err) {
            console.error('Failed to update status:', err);
            toast.error('Connection error', { id: tid });
        } finally {
            setIsStatusUpdating(null);
        }
    };

    const handleSaveShipment = async (orderId: string) => {
        const tid = toast.loading('Saving shipment details...');
        try {
            const res = await apiFetch('/shipments', {
                method: 'POST',
                body: JSON.stringify({
                    orderId,
                    trackingNumber: shipmentForm.trackingNumber,
                    carrier: shipmentForm.carrier
                })
            });
            if (res.ok) {
                toast.success('Shipment information updated', { id: tid });
                await loadOrders();
            } else {
                toast.error('Failed to update shipment', { id: tid });
            }
        } catch (err) {
            toast.error('Network error', { id: tid });
        }
    };

    const handleNotifyArriving = async (orderId: string) => {
        setIsNotifying(true);
        const tid = toast.loading('Sending "Arriving Today" notification...');
        try {
            const res = await apiFetch(`/orders/${orderId}/notify-delivery-day`, {
                method: 'POST'
            });
            if (res.ok) {
                toast.success('Notification sent successfully', { id: tid });
            } else {
                toast.error('Failed to send notification', { id: tid });
            }
        } catch (err) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsNotifying(false);
        }
    };

    const filteredOrders = orders
        .filter(o => filterStatus === 'ALL' || o.status === filterStatus)
        .filter(o =>
            o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.supplier.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => {
            // By default sortNewest First
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return sortOrder === 'DESC' ? dateB - dateA : dateA - dateB;
        });

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header / Stats Overlay */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase mb-2">Settlement Ledger</h1>
                    <div className="flex items-center gap-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground opacity-70">
                            Global Transaction Registry
                        </p>
                        <div className="h-4 w-px bg-border"></div>
                        <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black rounded-full uppercase tracking-widest">
                            {orders.length} ACTIVE POS
                        </span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative group">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Find by Transaction ID, Customer, Supplier..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-12 ps-12 pe-6 bg-card rounded-2xl border border-border outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm font-bold min-w-[320px] transition-all"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="h-12 px-4 bg-card rounded-2xl border border-border outline-none focus:border-primary text-sm font-bold transition-all cursor-pointer"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="PAID">Confirmed</option>
                        <option value="SHIPPED">Shipped</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="CANCELLED">Rejected/Cancelled</option>
                    </select>
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as 'DESC'|'ASC')}
                        className="h-12 px-4 bg-card rounded-2xl border border-border outline-none focus:border-primary text-sm font-bold transition-all cursor-pointer"
                    >
                        <option value="DESC">Newest First</option>
                        <option value="ASC">Oldest First</option>
                    </select>
                    <button 
                        onClick={async () => {
                            const tid = toast.loading('Generating Excel report...');
                            try {
                                const res = await apiFetch('/orders/export/excel');
                                if (res.ok) {
                                    const blob = await res.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `orders-ledger-${new Date().toISOString().split('T')[0]}.xlsx`;
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    toast.success('Report downloaded', { id: tid });
                                } else {
                                    toast.error('Failed to export', { id: tid });
                                }
                            } catch (err) {
                                toast.error('Network error', { id: tid });
                            }
                        }}
                        className="h-12 px-6 flex items-center gap-2 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-xl shadow-primary/20"
                    >
                        <Download size={16} />
                        Export Ledger
                    </button>
                </div>
            </div>

            {/* Bulk Action Bar */}
            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] w-fit"
                    >
                        <div className="bg-foreground text-background px-8 py-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.4)] flex items-center gap-8 border border-white/10 backdrop-blur-3xl">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Selected</span>
                                <span className="text-xl font-black">{selectedIds.size} Orders</span>
                            </div>
                            <div className="h-10 w-px bg-white/10"></div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => handleBulkAction('PAID')}
                                    disabled={isBulkLoading}
                                    className="h-12 px-6 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
                                >
                                    <CheckCircle size={16} /> Approve All
                                </button>
                                <button
                                    onClick={() => handleBulkAction('CANCELLED')}
                                    disabled={isBulkLoading}
                                    className="h-12 px-6 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
                                >
                                    <XCircle size={16} /> Cancel All
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="h-12 w-12 flex items-center justify-center bg-white/10 text-white rounded-2xl hover:bg-white/20 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table Section */}
            <div className="bg-card border border-border/50 rounded-3xl overflow-hidden shadow-xl p-2">
                <div className="overflow-x-auto rounded-2xl border border-border/50">
                    <table className="w-full text-start border-collapse">
                        <thead>
                            <tr className="bg-muted/30">
                                <th className="border border-border/40 px-4 py-4 w-12 bg-muted/20">
                                    <button onClick={toggleAllSelections} className="text-muted-foreground hover:text-primary transition-colors">
                                        {selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
                                    </button>
                                </th>
                                <th className="border border-border/40 px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-start bg-muted/20">Order Entry</th>
                                <th className="border border-border/40 px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-start">Counterparty</th>
                                <th className="border border-border/40 px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-start bg-muted/20">Global Value</th>
                                <th className="border border-border/40 px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-start">Settlement State</th>
                                <th className="border border-border/40 px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-end bg-muted/20">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.length > 0 ? (
                                filteredOrders.map((order) => {
                                    const Config = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;
                                    const StatusIcon = Config.icon;
                                    const isSelected = selectedIds.has(order.id);

                                    return (
                                        <motion.tr
                                            key={order.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className={cn(
                                                "group transition-all cursor-pointer",
                                                isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                                            )}
                                        >
                                            <td className="border border-border/40 px-4 py-3 bg-muted/50" onClick={(e) => { e.stopPropagation(); toggleSelection(order.id); }}>
                                                <div className={cn("transition-colors", isSelected ? "text-primary" : "text-muted-foreground opacity-30 group-hover:opacity-100")}>
                                                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                            </td>
                                            <td className="border border-border/40 px-4 py-3" onClick={() => setSelectedOrder(order)}>
                                                <div className="space-y-1">
                                                    <p className="text-xs font-black text-primary uppercase tracking-tighter">#{order.id.slice(-8).toUpperCase()}</p>
                                                    <p className="text-[10px] font-black text-muted-foreground uppercase opacity-60 flex items-center gap-1">
                                                        <Calendar size={10} /> {order.date}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="border border-border/40 px-4 py-3 bg-muted/50" onClick={() => setSelectedOrder(order)}>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-black text-foreground max-w-[200px] truncate">{order.customer}</p>
                                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">
                                                        via {order.supplier}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="border border-border/40 px-4 py-3" onClick={() => setSelectedOrder(order)}>
                                                <div className="space-y-1">
                                                    <p className="text-base font-black text-foreground">{formatPrice(order.total)}</p>
                                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest opacity-80">
                                                        Profit: {formatPrice(order.adminProfit)}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="border border-border/40 px-4 py-3 bg-muted/50" onClick={() => setSelectedOrder(order)}>
                                                <div className={cn(
                                                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm",
                                                    Config.color, Config.bg, Config.border
                                                )}>
                                                    <StatusIcon size={12} strokeWidth={3} />
                                                    {order.status}
                                                </div>
                                            </td>
                                            <td className="border border-border/40 px-4 py-3 text-end" onClick={() => setSelectedOrder(order)}>
                                                <button className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center hover:bg-primary hover:text-white transition-all ms-auto">
                                                    <ChevronRight size={18} />
                                                </button>
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-32 text-center">
                                        <div className="flex flex-col items-center gap-4 opacity-20">
                                            <ClipboardList size={64} />
                                            <p className="text-xl font-black uppercase tracking-[0.3em]">No Transactions Found</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Order Details Modal - Professional Redesign */}
            <AnimatePresence>
                {selectedOrder && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedOrder(null)}
                            className="fixed inset-0 w-full h-full bg-black/90 backdrop-blur-md z-[-1]"
                        />
                        
                        <motion.div
                            initial={{ scale: 0.95, y: 30, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 30, opacity: 0 }}
                            className="bg-card glass-card-strong w-full max-w-4xl relative z-10 overflow-hidden flex flex-col md:flex-row h-[min(700px,85vh)] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-primary/20 rounded-3xl"
                        >
                            {/* Left Panel: High Level Summary & Stats (Non-scrollable) */}
                            <div className="w-full md:w-[360px] bg-primary/5 p-6 lg:p-8 flex flex-col border-e border-border/10 overflow-y-auto no-scrollbar">
                                <div className="space-y-8 h-full flex flex-col">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 mb-2">
                                            <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary">
                                                <Package size={24} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">ORDER REFERENCE</p>
                                                <h2 className="text-xl font-black uppercase tracking-tighter">#{selectedOrder.id.slice(-8).toUpperCase()}</h2>
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border",
                                            STATUS_CONFIG[selectedOrder.status].bg,
                                            STATUS_CONFIG[selectedOrder.status].color,
                                            STATUS_CONFIG[selectedOrder.status].border
                                        )}>
                                            {selectedOrder.status}
                                        </div>
                                    </div>

                                    {/* Action Deck (Moved to top) */}
                                    <div className="space-y-2 pt-2 border-t border-border/10">
                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50 mb-2 block">Quick Actions</span>
                                        {selectedOrder.status === 'PENDING' && (
                                            <>
                                                <button 
                                                    disabled={isStatusUpdating === selectedOrder.id}
                                                    onClick={() => updateStatus(selectedOrder.id, 'PAID')} 
                                                    className="w-full h-12 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                                                >
                                                    {isStatusUpdating === selectedOrder.id ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle size={16} />} 
                                                    Approve & Fill
                                                </button>
                                                <button 
                                                    disabled={isStatusUpdating === selectedOrder.id}
                                                    onClick={() => updateStatus(selectedOrder.id, 'CANCELLED')} 
                                                    className="w-full h-12 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-red-500/20 transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                                                >
                                                    {isStatusUpdating === selectedOrder.id ? <RefreshCw className="animate-spin" size={16} /> : <XCircle size={16} />} 
                                                    Cancel Order
                                                </button>
                                            </>
                                        )}
                                        {selectedOrder.status === 'PAID' && (
                                            <button onClick={() => updateStatus(selectedOrder.id, 'SHIPPED')} className="w-full h-12 bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-3">
                                                <Truck size={16} /> Mark as Shipped
                                            </button>
                                        )}
                                        {selectedOrder.status === 'SHIPPED' && (
                                            <button onClick={() => updateStatus(selectedOrder.id, 'DELIVERED')} className="w-full h-12 bg-purple-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-3">
                                                <CheckCircle size={16} /> Confirm Delivery
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50">Financial Summary</p>
                                            <div className="p-6 bg-card border border-border/50 rounded-3xl space-y-4 shadow-xl">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold text-muted-foreground">Volume Total</span>
                                                    <span className="text-lg font-black">{formatPrice(selectedOrder.total)}</span>
                                                </div>
                                                <div className="h-px bg-border/50 w-full"></div>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center text-[10px]">
                                                        <span className="font-black text-muted-foreground uppercase opacity-60">Supplier Settlement</span>
                                                        <span className="font-black text-foreground">{formatPrice(selectedOrder.supplierProfit)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-[10px]">
                                                        <span className="font-black text-primary uppercase">Atlantis Fee</span>
                                                        <span className="font-black text-primary">{formatPrice(selectedOrder.adminProfit)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-4">
                                            <div className="p-4 bg-muted/40 rounded-2xl border border-border/20">
                                                <User className="text-secondary mb-2" size={16} />
                                                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Purchaser Info</p>
                                                <p className="text-xs font-black truncate">{selectedOrder.customer}</p>
                                                {selectedOrder.customerEmail && (
                                                    <p className="text-[10px] font-medium text-muted-foreground mt-1 select-all">{selectedOrder.customerEmail}</p>
                                                )}
                                                {selectedOrder.customerPhone && (
                                                    <p className="text-[10px] font-medium text-muted-foreground mt-0.5 select-all">{selectedOrder.customerPhone}</p>
                                                )}
                                            </div>

                                            {/* Logistics Management */}
                                            <div className="p-4 bg-card rounded-2xl border border-primary/20 flex-1 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Truck className="text-primary" size={16} />
                                                        <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Logistics Hub</p>
                                                    </div>
                                                    {selectedOrder.status === 'SHIPPED' && (
                                                        <button 
                                                            onClick={() => handleNotifyArriving(selectedOrder.id)}
                                                            disabled={isNotifying}
                                                            className="text-[8px] font-black uppercase text-primary hover:underline"
                                                        >
                                                            Notify Delivery
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[8px] font-black text-muted-foreground uppercase">Tracking Number</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="AWB / Ref Number"
                                                            className="w-full h-8 px-3 bg-muted rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary/30"
                                                            value={shipmentForm.trackingNumber || selectedOrder.trackingNumber || ''}
                                                            onChange={(e) => setShipmentForm({...shipmentForm, trackingNumber: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[8px] font-black text-muted-foreground uppercase">Carrier</label>
                                                        <select 
                                                            className="w-full h-8 px-2 bg-muted rounded-lg text-[10px] font-bold outline-none"
                                                            value={shipmentForm.carrier || selectedOrder.carrier || 'DHL'}
                                                            onChange={(e) => setShipmentForm({...shipmentForm, carrier: e.target.value})}
                                                        >
                                                            <option value="DHL">DHL Express</option>
                                                            <option value="FEDEX">FedEx Corp</option>
                                                            <option value="UPS">UPS Logistics</option>
                                                            <option value="ARAMEX">Aramex</option>
                                                            <option value="OTHER">Internal / Other</option>
                                                        </select>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleSaveShipment(selectedOrder.id)}
                                                        className="w-full h-8 bg-foreground text-background rounded-lg text-[8px] font-black uppercase tracking-widest hover:opacity-90"
                                                    >
                                                        Update Shipment
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* Right Panel: Scrollable Detail View */}
                            <div className="flex-1 flex flex-col h-full bg-card/40">
                                <div className="p-8 lg:p-12 overflow-y-auto no-scrollbar flex-1 space-y-12">
                                    {/* SKU Inventory Ledger */}
                                    <section className="space-y-8">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-black uppercase tracking-[0.3em] flex items-center gap-3">
                                                <ClipboardList className="text-primary" /> Inventory Ledger
                                            </h3>
                                            <span className="text-[10px] font-black text-muted-foreground bg-muted px-3 py-1 rounded-full uppercase tracking-tighter">
                                                {selectedOrder.items.length} SKUs
                                            </span>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            {selectedOrder.items.map((item, idx) => (
                                                <div key={idx} className="bg-card border border-border/50 p-6 rounded-3xl flex items-center justify-between group hover:border-primary/30 transition-all">
                                                    <div className="flex items-center gap-5">
                                                        <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center font-black text-lg text-primary">
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-foreground mb-1 group-hover:text-primary transition-colors">{item.product}</p>
                                                            <div className="flex items-center gap-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                                                <span>Unit Price: {formatPrice(item.price)}</span>
                                                                <span className="h-1 w-1 bg-border rounded-full"></span>
                                                                <span>Qty: {item.quantity}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-end">
                                                        <p className="text-base font-black text-foreground">{formatPrice(item.price * item.quantity)}</p>
                                                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Market Value Correct</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Transaction Audit Log */}
                                    <section className="space-y-8">
                                        <h3 className="text-sm font-black uppercase tracking-[0.3em] flex items-center gap-3">
                                            <History className="text-primary" /> Audit Trail
                                        </h3>
                                        <div className="relative ps-8 space-y-8 border-s-2 border-border/50">
                                            <div className="relative">
                                                <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10"></div>
                                                <div className="space-y-1">
                                                    <p className="text-xs font-black uppercase text-foreground">Transaction Initialized</p>
                                                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                                                        {selectedOrder.date} 09:42:15 GMT
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-500/10"></div>
                                                <div className="space-y-1">
                                                    <p className="text-xs font-black uppercase text-foreground">Escrow Auth Token Generated</p>
                                                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                                                        System Verified: Stripe Connect Node #24
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-amber-500 ring-4 ring-amber-500/10 animate-pulse"></div>
                                                <div className="space-y-1">
                                                    <p className="text-xs font-black uppercase text-foreground">Awaiting Administrative Release</p>
                                                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                                                        Current Queue Status: Priority Alpha
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>

                            <button onClick={() => setSelectedOrder(null)} className="absolute top-10 right-10 w-12 h-12 glass rounded-full flex items-center justify-center hover:rotate-90 transition-transform">
                                <X size={24} />
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
