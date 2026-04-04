'use client';

import * as React from 'react';
import { ShipmentTimeline } from '@/components/shipping/ShipmentTimeline';
import { Search, Package, Truck, Calendar, MapPin, DollarSign } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function TrackOrderPage() {
    const [trackingNumber, setTrackingNumber] = React.useState('');
    const [shipment, setShipment] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    const handleTrack = async (num?: string) => {
        const searchNum = num || trackingNumber;
        if (!searchNum) return;

        setLoading(true);
        setError('');
        try {
            const res = await axios.get(`/api/shipments/track?number=${searchNum}`);
            setShipment(res.data);
        } catch (err) {
            setError('Shipment not found. Please check your tracking number.');
            setShipment(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto px-6 py-24">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter font-heading">Track Your Shipment</h1>
                    <p className="text-muted-foreground max-w-xl mx-auto">
                        Enter your tracking number below to see real-time updates on your B2B order delivery status.
                    </p>
                </div>

                {/* Search Bar */}
                <div className="relative max-w-2xl mx-auto mb-16">
                    <input 
                        type="text" 
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleTrack()}
                        placeholder="Enter Tracking Number (e.g., ATL-XXXXX)"
                        className="w-full bg-card border-2 border-border rounded-2xl px-6 py-4 text-lg font-bold outline-none focus:border-secondary transition-all shadow-lg"
                    />
                    <button 
                        onClick={() => handleTrack()}
                        disabled={loading}
                        className="absolute end-2 top-2 bottom-2 bg-secondary text-secondary-foreground px-8 rounded-xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
                    >
                        {loading ? 'Searching...' : 'Track'}
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-center font-bold mb-8"
                        >
                            {error}
                        </motion.div>
                    )}

                    {shipment && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="space-y-8"
                        >
                            {/* Summary Card */}
                            <div className="bg-card border border-border rounded-3xl p-8 shadow-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Status</p>
                                    <div className="flex items-center gap-2">
                                        <Truck size={16} className="text-secondary" />
                                        <span className="font-black text-sm uppercase">{shipment.status.replace(/_/g, ' ')}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Carrier</p>
                                    <div className="flex items-center gap-2">
                                        <Package size={16} className="text-primary" />
                                        <span className="font-black text-sm uppercase">{shipment.carrier || 'Standard Logistics'}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Expected Delivery</p>
                                    <div className="flex items-center gap-2">
                                        <Calendar size={16} className="text-blue-500" />
                                        <span className="font-black text-sm">{shipment.expectedDelivery ? new Date(shipment.expectedDelivery).toLocaleDateString() : 'TBD'}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Order Total</p>
                                    <div className="flex items-center gap-2">
                                        <DollarSign size={16} className="text-emerald-500" />
                                        <span className="font-black text-sm">${shipment.order.totalAmount}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Timeline */}
                            <div className="bg-card/50 border border-border/50 rounded-3xl p-8">
                                <h2 className="text-xl font-black mb-8 uppercase tracking-widest">Delivery Progress</h2>
                                <ShipmentTimeline shipment={shipment} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
