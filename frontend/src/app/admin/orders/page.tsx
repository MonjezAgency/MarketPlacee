'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
    Search, Filter, Download, MoreHorizontal,
    CheckCircle, XCircle, Clock, Truck,
    ClipboardList, DollarSign, Calendar, User,
    ChevronRight, X, Printer, Package, History,
    CheckSquare, Square, RefreshCw, Trash2,
    ArrowUpRight, ArrowDownRight, MoreVertical,
    FileText, CreditCard, Activity, MessageCircle,
    TrendingUp, TrendingDown, RotateCcw
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';

// ─── Types & Constants ──────────────────────────────────────────────────────

interface AdminOrder {
    id: string;
    customer: string;
    customerId: string;
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

const STATUS_MAP = {
    PENDING: { label: 'Pending', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
    PAID: { label: 'Confirmed', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    SHIPPED: { label: 'Shipped', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    DELIVERED: { label: 'Completed', color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100' },
    CANCELLED: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

function OrderKPICard({ label, value, trend, trendValue, icon: Icon, color, iconColor }: any) {
    const isUp = trend === 'up';
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", color)}>
                    <Icon size={20} className={iconColor} />
                </div>
                {trend && (
                    <div className={cn(
                        "flex items-center gap-1 text-[11px] font-bold",
                        isUp ? "text-emerald-500" : "text-red-500"
                    )}>
                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {trendValue}%
                    </div>
                )}
            </div>
            <div>
                <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
                <p className="text-2xl font-semibold text-slate-900 tracking-tight leading-none">{value}</p>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: keyof typeof STATUS_MAP }) {
    const config = STATUS_MAP[status] || STATUS_MAP.PENDING;
    return (
        <span className={cn(
            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap",
            config.color, config.bg, config.border
        )}>
            {config.label}
        </span>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
    const router = useRouter();
    const [orders, setOrders] = React.useState<AdminOrder[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [filterStatus, setFilterStatus] = React.useState<string>('ALL');
    const [selectedOrder, setSelectedOrder] = React.useState<AdminOrder | null>(null);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [isBulkLoading, setIsBulkLoading] = React.useState(false);
    const [isExporting, setIsExporting] = React.useState(false);
    const [detailTab, setDetailTab] = React.useState<'info' | 'customer' | 'payment' | 'timeline'>('info');

    const [isStatusUpdating, setIsStatusUpdating] = React.useState<string | null>(null);
    const [shipmentForm, setShipmentForm] = React.useState({ trackingNumber: '', carrier: 'DHL' });
    const [isNotifying, setIsNotifying] = React.useState(false);

    const loadOrders = async () => {
        try {
            setLoading(true);
            const res = await apiFetch('/orders');
            if (res.ok) {
                const data = await res.json();
                setOrders(data);
                if (data.length > 0 && !selectedOrder) setSelectedOrder(data[0]);
            }
        } catch (err) {
            console.error('Failed to load orders:', err);
        } finally {
            setLoading(false);
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
                toast.error(`Failed to update status`, { id: tid });
            }
        } catch (err) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsStatusUpdating(null);
        }
    };

    const handleDeleteOrder = async (id: string) => {
        if (!confirm('Are you sure you want to delete this order permanently?')) return;
        const tid = toast.loading('Deleting order...');
        try {
            const res = await apiFetch(`/orders/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Order deleted', { id: tid });
                setOrders(prev => prev.filter(o => o.id !== id));
                setSelectedOrder(null);
            } else {
                toast.error('Failed to delete order', { id: tid });
            }
        } catch (err) {
            toast.error('Connection error', { id: tid });
        }
    };

    const handleContactCustomer = (order: AdminOrder) => {
        // Redirect to Support HQ and pass the customer name/id in the query
        // The Support HQ page can then use this to auto-select the conversation
        router.push(`/admin/support?search=${encodeURIComponent(order.customerId)}`);
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
        const tid = toast.loading('Sending notification...');
        try {
            const res = await apiFetch(`/orders/${orderId}/notify-delivery-day`, { method: 'POST' });
            if (res.ok) toast.success('Notification sent', { id: tid });
            else toast.error('Failed to send', { id: tid });
        } catch (err) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsNotifying(false);
        }
    };

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

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} orders?`)) return;
        const tid = toast.loading('Deleting orders...');
        setIsBulkLoading(true);
        try {
            const ids = Array.from(selectedIds);
            const res = await apiFetch('/orders/bulk', {
                method: 'DELETE',
                body: JSON.stringify({ ids })
            });
            if (res.ok) {
                toast.success('Orders deleted', { id: tid });
                setOrders(prev => prev.filter(o => !selectedIds.has(o.id)));
                setSelectedIds(new Set());
            } else {
                toast.error('Failed to delete', { id: tid });
            }
        } catch (err) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsBulkLoading(false);
        }
    };

    const handleBulkStatusUpdate = async (status: string) => {
        const tid = toast.loading(`Updating ${selectedIds.size} orders to ${status}...`);
        setIsBulkLoading(true);
        try {
            const ids = Array.from(selectedIds);
            const res = await apiFetch('/orders/bulk-status', {
                method: 'PATCH',
                body: JSON.stringify({ ids, status })
            });
            if (res.ok) {
                toast.success('Status updated', { id: tid });
                setOrders(prev => prev.map(o => selectedIds.has(o.id) ? { ...o, status: status as any } : o));
                setSelectedIds(new Set());
            } else {
                toast.error('Failed to update status', { id: tid });
            }
        } catch (err) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsBulkLoading(false);
        }
    };

    React.useEffect(() => {
        loadOrders();
    }, []);

    const filteredOrders = orders
        .filter(o => filterStatus === 'ALL' || o.status === filterStatus)
        .filter(o =>
            o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.supplier.toLowerCase().includes(searchTerm.toLowerCase())
        );

    const stats = {
        total: orders.length,
        pending: orders.filter(o => o.status === 'PENDING').length,
        completed: orders.filter(o => o.status === 'DELIVERED').length,
        cancelled: orders.filter(o => o.status === 'CANCELLED').length,
        returned: 12, // Mocked for visual
    };

    const handleExport = async () => {
        setIsExporting(true);
        const tid = toast.loading('Generating export...');
        try {
            // In a real app, you might fetch all orders or a filtered set
            // For now, we'll convert the current visible 'orders' state to CSV
            if (orders.length === 0) {
                toast.error('No orders to export', { id: tid });
                setIsExporting(false);
                return;
            }

            const headers = ['Order ID', 'Customer', 'Supplier', 'Total', 'Status', 'Date'];
            const rows = orders.map(o => [
                o.id,
                o.customer,
                o.supplier,
                o.total.toString(),
                o.status,
                new Date(o.date).toLocaleDateString()
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `atlantis-orders-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success('Export downloaded successfully', { id: tid });
        } catch (err) {
            toast.error('Export failed', { id: tid });
        } finally {
            setIsExporting(false);
        }
    };

    const [showFilterBar, setShowFilterBar] = React.useState(true);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[600px]">
                <RefreshCw className="w-10 h-10 animate-spin text-teal-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Orders Management</h1>
                    <p className="text-sm text-slate-500 mt-1">Track and manage marketplace transactions globally.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-600 transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search orders..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-10 ps-11 pe-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500/20 transition-all min-w-[280px]"
                        />
                    </div>
                    <button 
                        onClick={() => setShowFilterBar(!showFilterBar)}
                        className={cn(
                            "h-10 px-4 border rounded-xl text-xs font-semibold flex items-center gap-2 transition-all",
                            showFilterBar ? "bg-teal-50 border-teal-200 text-teal-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <Filter size={16} />
                        Filters
                    </button>
                    <button 
                        onClick={handleExport}
                        className="h-10 px-4 bg-teal-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20"
                    >
                        <Download size={16} />
                        Export
                    </button>
                </div>
            </div>

            {/* KPI Strip (5 Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                <OrderKPICard icon={Package} label="Total Orders" value={stats.total} trend="up" trendValue={12} color="bg-slate-50" iconColor="text-slate-600" />
                <OrderKPICard icon={Clock} label="Pending" value={stats.pending} trend="up" trendValue={8} color="bg-orange-50" iconColor="text-orange-600" />
                <OrderKPICard icon={CheckCircle} label="Completed" value={stats.completed} trend="up" trendValue={15} color="bg-teal-50" iconColor="text-teal-600" />
                <OrderKPICard icon={XCircle} label="Cancelled" value={stats.cancelled} trend="down" trendValue={4} color="bg-red-50" iconColor="text-red-600" />
                <OrderKPICard icon={RotateCcw} label="Returned" value={stats.returned} trend="up" trendValue={2} color="bg-slate-50" iconColor="text-slate-500" />
            </div>

            {/* Sticky Filter Bar */}
            <AnimatePresence>
                {showFilterBar && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="sticky top-0 z-20 bg-slate-50/80 backdrop-blur-md py-4 border-b border-slate-200 -mx-6 px-6 lg:-mx-8 lg:px-8 overflow-hidden"
                    >
                        <div className="flex flex-wrap items-center gap-4">
                            <select 
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-teal-500/20"
                            >
                                <option value="ALL">All Statuses</option>
                                <option value="PENDING">Pending</option>
                                <option value="PAID">Confirmed</option>
                                <option value="SHIPPED">Shipped</option>
                                <option value="DELIVERED">Delivered</option>
                                <option value="CANCELLED">Cancelled</option>
                            </select>
                            
                            <div className="h-9 px-4 bg-white border border-slate-200 rounded-lg flex items-center gap-2">
                                <Calendar size={14} className="text-slate-400" />
                                <input type="date" className="bg-transparent border-none outline-none text-[10px] font-bold text-slate-600" />
                                <span className="text-slate-300">→</span>
                                <input type="date" className="bg-transparent border-none outline-none text-[10px] font-bold text-slate-600" />
                            </div>

                            <select className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-teal-500/20">
                                <option>All Payment Statuses</option>
                                <option>Paid</option>
                                <option>Awaiting Payment</option>
                                <option>Refunded</option>
                            </select>

                            <select 
                                onChange={(e) => setSearchTerm(e.target.value === 'All Suppliers' ? '' : e.target.value)}
                                className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-teal-500/20"
                            >
                                <option>All Suppliers</option>
                                {Array.from(new Set(orders.map(o => o.supplier))).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>

                            {(filterStatus !== 'ALL' || searchTerm) && (
                                <button 
                                    onClick={() => { setFilterStatus('ALL'); setSearchTerm(''); }}
                                    className="text-[10px] font-bold text-teal-600 uppercase hover:underline"
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content Grid (65/35) */}
            <div className="grid grid-cols-12 gap-8 items-start">
                
                {/* Orders Table (Left 65%) */}
                <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-start">
                            <thead className="bg-slate-50/50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 w-12">
                                        <button onClick={toggleAllSelections} className="text-slate-400 hover:text-teal-600 transition-colors">
                                            {selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </button>
                                    </th>
                                    <th className="px-6 py-4 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order ID</th>
                                    <th className="px-6 py-4 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</th>
                                    <th className="px-6 py-4 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Price</th>
                                    <th className="px-6 py-4 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-start text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                                    <th className="px-6 py-4 text-end"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredOrders.map((order) => (
                                        <tr 
                                            key={order.id}
                                            className={cn(
                                                "group cursor-pointer transition-all",
                                                selectedOrder?.id === order.id ? "bg-teal-50/30" : "hover:bg-slate-50",
                                                selectedIds.has(order.id) && "bg-teal-50/50"
                                            )}
                                        >
                                            <td className="px-6 py-5" onClick={(e) => { e.stopPropagation(); toggleSelection(order.id); }}>
                                                <div className={cn("transition-colors", selectedIds.has(order.id) ? "text-teal-600" : "text-slate-300 group-hover:text-slate-400")}>
                                                    {selectedIds.has(order.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5" onClick={() => setSelectedOrder(order)}>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-slate-900">{order.customer}</span>
                                                <span className="text-[10px] text-slate-400 font-medium">via {order.supplier}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-sm font-bold text-slate-900">{formatPrice(order.total)}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <StatusBadge status={order.status} />
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-xs text-slate-500 font-medium">{new Date(order.date).toLocaleDateString()}</span>
                                        </td>
                                        <td className="px-6 py-5 text-end">
                                            <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-1 transition-all" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Order Details Panel (Right 35%) */}
                <div className="col-span-12 lg:col-span-4 sticky top-24">
                    <AnimatePresence mode="wait">
                        {selectedOrder ? (
                            <motion.div 
                                key={selectedOrder.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col"
                            >
                                {/* Panel Header */}
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-teal-600 shadow-sm">
                                            <Package size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-900">Order #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Placed on {new Date(selectedOrder.date).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedOrder(null)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Tabs */}
                                <div className="flex items-center gap-6 px-6 py-3 border-b border-slate-100">
                                    {['info', 'customer', 'payment', 'timeline'].map((t) => (
                                        <button 
                                            key={t}
                                            onClick={() => setDetailTab(t as any)}
                                            className={cn(
                                                "text-[10px] font-bold uppercase tracking-widest pb-2 border-b-2 transition-all",
                                                detailTab === t ? "text-teal-600 border-teal-500" : "text-slate-400 border-transparent hover:text-slate-900"
                                            )}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>

                                {/* Panel Content */}
                                <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                                    {detailTab === 'info' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order Summary</p>
                                                <div className="space-y-2">
                                                    {selectedOrder.items.map((item, idx) => (
                                                        <div key={idx} className="flex items-center justify-between text-xs">
                                                            <span className="text-slate-600">{item.product} <span className="text-slate-400 font-medium">x{item.quantity}</span></span>
                                                            <span className="font-bold text-slate-900">{formatPrice(item.price * item.quantity)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="h-px bg-slate-100" />
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-400">Subtotal</span>
                                                    <span className="font-medium text-slate-900">{formatPrice(selectedOrder.total)}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-400">Shipping</span>
                                                    <span className="font-medium text-emerald-600">Free</span>
                                                </div>
                                                <div className="flex justify-between text-sm font-bold pt-2">
                                                    <span className="text-slate-900">Total</span>
                                                    <span className="text-teal-600">{formatPrice(selectedOrder.total)}</span>
                                                </div>
                                            </div>

                                            {/* Logistics / Shipment Form */}
                                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Truck size={14} className="text-teal-600" />
                                                        <span className="text-[10px] font-bold text-slate-900 uppercase">Logistics Hub</span>
                                                    </div>
                                                    {selectedOrder.status === 'SHIPPED' && (
                                                        <button 
                                                            onClick={() => handleNotifyArriving(selectedOrder.id)}
                                                            disabled={isNotifying}
                                                            className="text-[9px] font-bold text-teal-600 hover:underline"
                                                        >
                                                            Notify Arrival
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Tracking #</label>
                                                        <input 
                                                            type="text" 
                                                            className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] outline-none"
                                                            value={shipmentForm.trackingNumber || selectedOrder.trackingNumber || ''}
                                                            onChange={(e) => setShipmentForm({...shipmentForm, trackingNumber: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Carrier</label>
                                                        <select 
                                                            className="w-full h-8 px-1 bg-white border border-slate-200 rounded-lg text-[10px] outline-none"
                                                            value={shipmentForm.carrier || selectedOrder.carrier || 'DHL'}
                                                            onChange={(e) => setShipmentForm({...shipmentForm, carrier: e.target.value})}
                                                        >
                                                            <option value="DHL">DHL</option>
                                                            <option value="FEDEX">FedEx</option>
                                                            <option value="UPS">UPS</option>
                                                            <option value="ARAMEX">Aramex</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => handleSaveShipment(selectedOrder.id)}
                                                    className="w-full h-8 bg-slate-900 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-slate-800 transition-all"
                                                >
                                                    Update Shipment
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {detailTab === 'customer' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-400">
                                                    {selectedOrder.customer[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{selectedOrder.customer}</p>
                                                    <p className="text-xs text-slate-500">{selectedOrder.customerEmail || 'no-email@atlantis.com'}</p>
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shipping Address</p>
                                                <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-600 leading-relaxed">
                                                    123 Commerce Avenue, Building 4<br />
                                                    Tech City, Digital District<br />
                                                    Cairo, Egypt
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleContactCustomer(selectedOrder)}
                                                className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 flex items-center justify-center gap-2 hover:bg-slate-100 transition-all"
                                            >
                                                <MessageCircle size={14} />
                                                Contact Customer
                                            </button>
                                        </div>
                                    )}

                                    {detailTab === 'payment' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="p-4 bg-teal-50 border border-teal-100 rounded-xl flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-teal-600 shadow-sm">
                                                    <CreditCard size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">Payment Method</p>
                                                    <p className="text-xs font-bold text-slate-900 mt-0.5">Credit Card (Stripe)</p>
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transaction Details</p>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-400">Transaction ID</span>
                                                        <span className="font-mono text-slate-900">txn_894125741</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-400">Status</span>
                                                        <span className="font-bold text-emerald-600">Captured</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-400">Date</span>
                                                        <span className="font-medium text-slate-900">May 20, 2024</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {detailTab === 'timeline' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="space-y-6 ps-4 border-s-2 border-slate-100">
                                                {[
                                                    { title: 'Order Placed', time: 'May 20, 09:42 AM', color: 'bg-emerald-500' },
                                                    { title: 'Payment Confirmed', time: 'May 20, 09:45 AM', color: 'bg-emerald-500' },
                                                    { title: 'Processing Order', time: 'May 20, 02:30 PM', color: 'bg-blue-500' },
                                                    { title: 'Awaiting Pickup', time: 'May 21, 08:00 AM', color: 'bg-slate-300' },
                                                ].map((step, idx) => (
                                                    <div key={idx} className="relative">
                                                        <div className={cn("absolute -left-[25px] top-1 w-4 h-4 rounded-full ring-4 ring-white", step.color)} />
                                                        <p className="text-xs font-bold text-slate-900">{step.title}</p>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">{step.time}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Panel Actions */}
                                <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-3">
                                    {selectedOrder.status === 'PENDING' && (
                                        <button 
                                            onClick={() => updateStatus(selectedOrder.id, 'PAID')}
                                            disabled={isStatusUpdating === selectedOrder.id}
                                            className="flex-1 h-10 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20 disabled:opacity-50"
                                        >
                                            Confirm Order
                                        </button>
                                    )}
                                    {selectedOrder.status === 'PAID' && (
                                        <button 
                                            onClick={() => updateStatus(selectedOrder.id, 'SHIPPED')}
                                            disabled={isStatusUpdating === selectedOrder.id}
                                            className="flex-1 h-10 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
                                        >
                                            Mark Shipped
                                        </button>
                                    )}
                                    {selectedOrder.status === 'SHIPPED' && (
                                        <button 
                                            onClick={() => updateStatus(selectedOrder.id, 'DELIVERED')}
                                            disabled={isStatusUpdating === selectedOrder.id}
                                            className="flex-1 h-10 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
                                        >
                                            Confirm Delivery
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => updateStatus(selectedOrder.id, 'CANCELLED')}
                                        disabled={isStatusUpdating === selectedOrder.id}
                                        className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteOrder(selectedOrder.id)}
                                        className="h-10 px-4 bg-white border border-red-200 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-all"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                                    <Package size={32} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900">No order selected</h4>
                                    <p className="text-[11px] text-slate-400 font-medium mt-1">Select an order from the list to view full details and manage settlement.</p>
                                </div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

            </div>

            {/* Bulk Action Bar */}
            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
                    >
                        <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 border border-white/10 backdrop-blur-xl">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected</span>
                                <span className="text-sm font-bold">{selectedIds.size} Orders</span>
                            </div>
                            <div className="h-8 w-px bg-white/10"></div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => handleBulkStatusUpdate('PAID')}
                                    disabled={isBulkLoading}
                                    className="h-10 px-5 bg-teal-500 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-teal-600 transition-all flex items-center gap-2"
                                >
                                    <CheckCircle size={16} /> Approve All
                                </button>
                                <button 
                                    onClick={() => handleBulkStatusUpdate('CANCELLED')}
                                    disabled={isBulkLoading}
                                    className="h-10 px-5 bg-white/10 border border-white/10 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2"
                                >
                                    <XCircle size={16} /> Cancel All
                                </button>
                                <button 
                                    onClick={handleBulkDelete}
                                    disabled={isBulkLoading}
                                    className="h-10 px-5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                                >
                                    <Trash2 size={16} /> Delete All
                                </button>
                                <button 
                                    onClick={() => setSelectedIds(new Set())}
                                    className="p-2 text-slate-400 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
