'use client';

import * as React from 'react';
import axios from 'axios';
import { Truck, Search, Package, Calendar, Clock, X, TrendingUp, CheckCircle2, DollarSign, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ShipmentTimeline } from '@/components/shipping/ShipmentTimeline';

export default function AdminShipmentsPage() {
    const [shipments, setShipments] = React.useState<any[]>([]);
    const [selectedShipment, setSelectedShipment] = React.useState<any>(null);
    const [searchTerm, setSearchTerm] = React.useState('');

    const fetchShipments = async () => {
        try {
            const res = await axios.get(`/api/shipments/admin/all`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setShipments(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    React.useEffect(() => {
        fetchShipments();
    }, []);

    const activeShipments = shipments.filter(s => !['DELIVERED', 'CANCELLED'].includes(s.status));
    const deliveredShipments = shipments.filter(s => s.status === 'DELIVERED');
    const totalRevenue = deliveredShipments.reduce((sum, s) => sum + (s.order?.totalAmount || 0), 0);
    const cancelledLosses = shipments.filter(s => s.status === 'CANCELLED').reduce((sum, s) => sum + (s.order?.totalAmount || 0), 0);

    const stats = [
        {
            label: 'Active Deliveries',
            value: activeShipments.length,
            icon: Truck,
            color: 'text-blue-600',
            bg: 'bg-blue-50 dark:bg-blue-500/10',
            border: 'border-blue-200 dark:border-blue-500/20',
        },
        {
            label: 'Delivered',
            value: deliveredShipments.length,
            icon: CheckCircle2,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50 dark:bg-emerald-500/10',
            border: 'border-emerald-200 dark:border-emerald-500/20',
        },
        {
            label: 'Total Revenue',
            value: `$${totalRevenue.toLocaleString()}`,
            icon: DollarSign,
            color: 'text-primary',
            bg: 'bg-primary/5',
            border: 'border-primary/20',
        },
        {
            label: 'Cancelled Losses',
            value: `$${cancelledLosses.toLocaleString()}`,
            icon: AlertTriangle,
            color: 'text-red-600',
            bg: 'bg-red-50 dark:bg-red-500/10',
            border: 'border-red-200 dark:border-red-500/20',
        },
    ];

    const filtered = shipments.filter(s =>
        s.trackingNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.order?.buyer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container mx-auto px-6 py-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Logistics Management</h1>
                    <p className="text-muted-foreground text-sm">Monitor and update all active B2B shipments across the platform.</p>
                </div>
                <div className="relative">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <input
                        type="text"
                        placeholder="Tracking # or Buyer..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-card border border-border rounded-xl py-2 ps-10 pe-4 text-sm outline-none focus:ring-1 ring-primary/30 w-64"
                    />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <div key={stat.label} className={cn("rounded-2xl border p-5 flex items-center gap-4", stat.bg, stat.border)}>
                            <div className={cn("p-3 rounded-xl bg-white/60 dark:bg-black/20", stat.color)}>
                                <Icon size={22} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                                <p className={cn("text-2xl font-black", stat.color)}>{stat.value}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Shipments Table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-start">
                    <thead>
                        <tr className="bg-primary/5 border-b border-border">
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Shipment Name / ID</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Qty (Items)</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Shipped On</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Exp. Delivery</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-end">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {filtered.map((s) => (
                            <tr
                                key={s.id}
                                className="hover:bg-accent/5 transition-colors group cursor-pointer"
                                onClick={async () => {
                                    const res = await axios.get(`/api/shipments/track?number=${s.trackingNumber}`);
                                    setSelectedShipment(res.data);
                                }}
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-secondary/10 text-secondary rounded-lg">
                                            <Package size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black">{s.trackingNumber}</p>
                                            <p className="text-[10px] text-muted-foreground">{s.order?.buyer?.name}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-xs font-bold uppercase px-2 py-1 rounded-full bg-secondary/10 text-secondary">
                                        {s.carrier || 'Standard'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm font-black">{s.order?.items?.length ?? '—'}</p>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Clock size={14} />
                                        <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600">
                                        <Calendar size={14} />
                                        <span>{s.expectedDelivery ? new Date(s.expectedDelivery).toLocaleDateString() : 'TBD'}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-end">
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const res = await axios.get(`/api/shipments/track?number=${s.trackingNumber}`);
                                            setSelectedShipment(res.data);
                                        }}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:scale-105 transition-transform"
                                    >
                                        View Details
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Shipment Detail Modal */}
            <AnimatePresence>
                {selectedShipment && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedShipment(null)}
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-4xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                        >
                            <div className="p-6 border-b border-border flex items-center justify-between bg-primary/5">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                                        <Truck size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black uppercase tracking-tighter">Shipment Details</h2>
                                        <p className="text-xs text-muted-foreground tracking-widest">{selectedShipment.trackingNumber}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedShipment(null)}
                                    className="p-2 hover:bg-accent rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 no-scrollbar">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest mb-6 border-b border-border pb-2">Order Information</h3>
                                        <div className="space-y-4">
                                            <div className="flex justify-between">
                                                <span className="text-sm text-muted-foreground">Buyer</span>
                                                <span className="text-sm font-bold">{selectedShipment.order?.buyer?.name}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-sm text-muted-foreground">Total Paid</span>
                                                <span className="text-sm font-black text-emerald-600">${selectedShipment.order?.totalAmount}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-sm text-muted-foreground">Carrier</span>
                                                <span className="text-sm font-bold uppercase">{selectedShipment.carrier || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-sm text-muted-foreground">Expected Delivery</span>
                                                <span className="text-sm font-bold text-blue-600">
                                                    {selectedShipment.expectedDelivery ? new Date(selectedShipment.expectedDelivery).toLocaleDateString() : 'TBD'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-8 p-4 bg-accent/10 rounded-2xl border border-border">
                                            <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-muted-foreground">Admin Actions</p>
                                            <button className="w-full py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-bold hover:opacity-95 transition-opacity">
                                                Add Status Update
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest mb-6 border-b border-border pb-2">Tracking Timeline</h3>
                                        <ShipmentTimeline shipment={selectedShipment} />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
