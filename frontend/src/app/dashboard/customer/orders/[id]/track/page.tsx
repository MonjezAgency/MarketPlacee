'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { 
    Package, Truck, MapPin, CheckCircle2, 
    Calendar, Building2, Download, MessageSquare, 
    ChevronRight, Clock, Box, ShieldCheck,
    Search, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useParams } from 'next/navigation';

export default function OrderTrackingPage() {
    const router = useRouter();
    const params = useParams();
    const orderId = params.id || 'ORD-88294-XP';

    const steps = [
        { title: 'Order Confirmed', status: 'completed' },
        { title: 'Processing', status: 'completed' },
        { title: 'Shipped', status: 'current' },
        { title: 'In Transit', status: 'pending' },
        { title: 'Delivered', status: 'pending' }
    ];

    const timeline = [
        {
            title: 'Arrived at Cairo Distribution Hub',
            desc: 'The delivery has reached the regional sorting facility.',
            time: 'Today, 10:45 AM',
            icon: Building2,
            type: 'current'
        },
        {
            title: 'Departed Warehouse',
            desc: 'Picked up by Atlantic Logistics from Alexandria Port.',
            time: 'Yesterday, 02:15 PM',
            icon: Truck,
            type: 'completed'
        },
        {
            title: 'Package Processed',
            desc: 'Order has been packed and labeled for shipping.',
            time: '24 Apr, 09:00 AM',
            icon: Box,
            type: 'completed'
        },
        {
            title: 'Order Confirmed',
            desc: 'We have received your order and payment.',
            time: '23 Apr, 11:30 PM',
            icon: CheckCircle2,
            type: 'completed'
        }
    ];

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-12 px-6 lg:px-20">
            <div className="max-w-[1280px] mx-auto space-y-8">
                
                {/* Top Nav / Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <button 
                            onClick={() => router.back()}
                            className="flex items-center gap-2 text-[#6B7280] hover:text-[#0F172A] transition-colors mb-4 text-sm font-medium"
                        >
                            <ArrowLeft size={16} /> Back to Orders
                        </button>
                        <h1 className="text-3xl font-black text-[#0F172A] tracking-tight">Order Tracking</h1>
                        <p className="text-[#6B7280] text-sm">Track your shipment in real-time across regional hubs.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order ID</p>
                            <p className="text-sm font-black text-[#0F172A]">{orderId}</p>
                        </div>
                        <div className="px-4 py-2 bg-[#00BFA6]/10 text-[#00BFA6] rounded-full text-xs font-black uppercase tracking-widest border border-[#00BFA6]/20">
                            In Transit
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* Left Column (70%) */}
                    <div className="lg:col-span-8 space-y-8">
                        
                        {/* Status Card */}
                        <div className="bg-white border border-[#E6EAF0] rounded-[24px] p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-10">
                                <div>
                                    <h2 className="text-xl font-bold text-[#0F172A]">Current Status</h2>
                                    <p className="text-sm text-slate-500">Your delivery is on its way to the delivery hub.</p>
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-[#00BFA6]">
                                    <Truck size={24} />
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="relative pt-2">
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: '60%' }}
                                        transition={{ duration: 1.5, ease: "easeOut" }}
                                        className="h-full bg-[#00BFA6]"
                                    />
                                </div>
                                <div className="flex justify-between mt-6">
                                    {steps.map((step, i) => (
                                        <div key={i} className="flex flex-col items-center gap-2 group">
                                            <div className={cn(
                                                "w-4 h-4 rounded-full border-4 transition-all duration-500",
                                                step.status === 'completed' ? "bg-[#00BFA6] border-teal-50 scale-125" :
                                                step.status === 'current' ? "bg-white border-[#00BFA6] scale-150 shadow-lg shadow-teal-500/20" :
                                                "bg-white border-slate-200"
                                            )} />
                                            <span className={cn(
                                                "text-[10px] font-bold uppercase tracking-widest text-center max-w-[80px]",
                                                step.status === 'pending' ? "text-slate-300" : "text-[#0F172A]"
                                            )}>
                                                {step.title}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Timeline Section */}
                        <div className="bg-white border border-[#E6EAF0] rounded-[24px] p-8 shadow-sm space-y-8">
                            <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                                <Clock size={20} className="text-slate-400" />
                                Delivery Timeline
                            </h2>
                            <div className="space-y-0 relative">
                                {/* Vertical line */}
                                <div className="absolute left-6 top-8 bottom-8 w-[2px] bg-slate-100" />
                                
                                {timeline.map((item, i) => (
                                    <motion.div 
                                        initial={{ opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        key={i} 
                                        className="flex gap-6 pb-10 last:pb-0 relative"
                                    >
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 z-10 shadow-sm",
                                            item.type === 'current' ? "bg-[#0F172A] text-white ring-8 ring-slate-50" : "bg-white border border-slate-100 text-slate-400"
                                        )}>
                                            <item.icon size={20} />
                                        </div>
                                        <div className="space-y-1 pt-1">
                                            <div className="flex items-center gap-3">
                                                <h4 className="text-sm font-bold text-[#0F172A]">{item.title}</h4>
                                                <span className="text-[11px] font-medium text-slate-400">{item.time}</span>
                                            </div>
                                            <p className="text-sm text-slate-500 leading-relaxed max-w-xl">{item.desc}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Map Section */}
                        <div className="bg-white border border-[#E6EAF0] rounded-[24px] overflow-hidden shadow-sm">
                            <div className="h-[240px] bg-slate-100 relative group cursor-crosshair">
                                {/* Simulated Map Grid */}
                                <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                                
                                {/* Current Location Marker */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                                    <motion.div 
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ repeat: Infinity, duration: 2 }}
                                        className="w-12 h-12 rounded-full bg-[#00BFA6]/20 flex items-center justify-center"
                                    >
                                        <div className="w-4 h-4 bg-[#00BFA6] rounded-full border-2 border-white shadow-lg" />
                                    </motion.div>
                                    <div className="mt-2 bg-white px-3 py-1 rounded-lg shadow-xl border border-slate-100 text-[10px] font-bold text-[#0F172A] uppercase tracking-wider">
                                        Cairo Distribution Hub
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column (30%) */}
                    <div className="lg:col-span-4 space-y-6">
                        
                        {/* Order Summary Card */}
                        <div className="bg-[#0F172A] text-white rounded-[24px] p-8 shadow-xl space-y-8 sticky top-8">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold">Order Summary</h2>
                                <p className="text-slate-400 text-sm">Delivery breakdown and details</p>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-white/10">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
                                        <Package size={24} className="text-[#00BFA6]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold">Steel Reinforcement Bars</p>
                                        <p className="text-xs text-slate-400">Qty: 250 Units • 12.5 Tons</p>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-xs text-slate-400 font-medium">Total Price</span>
                                    <span className="text-lg font-black text-[#00BFA6]">$14,500.00</span>
                                </div>
                            </div>

                            <div className="space-y-6 pt-6 border-t border-white/10">
                                <div className="flex items-start gap-3">
                                    <Calendar size={18} className="text-slate-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Delivery ETA</p>
                                        <p className="text-sm font-bold">28 April 2024 (by 5:00 PM)</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Truck size={18} className="text-slate-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shipping Method</p>
                                        <p className="text-sm font-bold">Priority Sea-Freight + Trucking</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Building2 size={18} className="text-slate-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Warehouse Location</p>
                                        <p className="text-sm font-bold">Sector 4, Alexandria Port Free Zone</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 pt-6">
                                <button className="w-full h-14 rounded-2xl bg-[#00BFA6] text-white font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2">
                                    <MessageSquare size={18} />
                                    Contact Logistics Support
                                </button>
                                <button className="w-full h-14 rounded-2xl bg-white/10 text-white border border-white/10 font-bold text-sm hover:bg-white/20 transition-all flex items-center justify-center gap-2">
                                    <Download size={18} />
                                    Download Commercial Invoice
                                </button>
                            </div>

                            <div className="flex items-center justify-center gap-2 pt-2 opacity-50">
                                <ShieldCheck size={14} className="text-[#00BFA6]" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Verified by Monjez Logistics</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
