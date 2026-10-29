'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Package, TrendingUp, Users, ShoppingBag } from 'lucide-react';

const stats = [
    { icon: <Users className="w-5 h-5" />, value: '500+', label: 'Active Suppliers' },
    { icon: <Package className="w-5 h-5" />, value: '10K+', label: 'Products Listed' },
    { icon: <ShoppingBag className="w-5 h-5" />, value: '50K+', label: 'Orders Completed' },
    { icon: <TrendingUp className="w-5 h-5" />, value: '99.5%', label: 'Satisfaction Rate' },
];

export default function Hero() {
    return (
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0D0D1A] via-[#1A1A2E] to-[#16213E] py-20 md:py-28 lg:py-32">
            {/* Animated Background Orbs */}
            <div className="absolute top-[-100px] right-[-100px] w-[600px] h-[600px] bg-[#FF6B00] opacity-[0.07] blur-[150px] rounded-full animate-pulse-glow"></div>
            <div className="absolute bottom-[-100px] left-[-50px] w-[400px] h-[400px] bg-[#E94560] opacity-[0.05] blur-[120px] rounded-full"></div>
            <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[#3498DB] opacity-[0.03] blur-[100px] rounded-full"></div>

            {/* Floating Particles */}
            {[...Array(6)].map((_, i) => (
                <div
                    key={i}
                    className="absolute rounded-full bg-[#FF6B00] opacity-20"
                    style={{
                        width: `${4 + i * 2}px`,
                        height: `${4 + i * 2}px`,
                        top: `${15 + i * 14}%`,
                        left: `${10 + i * 15}%`,
                        animation: `float ${5 + i}s ease-in-out infinite`,
                        animationDelay: `${i * 0.5}s`,
                    }}
                />
            ))}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                    {/* Left Content */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                    >
                        <motion.span
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="inline-flex items-center gap-2 bg-gradient-to-r from-[#FF6B00] to-[#FF8C33] text-white text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-full mb-6 shadow-lg shadow-[#FF6B00]/20"
                        >
                            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                            Wholesale B2B Ali FMCG
                        </motion.span>

                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-6">
                            <motion.span
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3, duration: 0.6 }}
                                className="block"
                            >
                                Sourcing Beverages
                            </motion.span>
                            <motion.span
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5, duration: 0.6 }}
                                className="block bg-gradient-to-r from-gray-400 to-gray-500 bg-clip-text text-transparent"
                            >
                                Made Simple & Fast
                            </motion.span>
                        </h1>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7, duration: 0.6 }}
                            className="text-[#B0B0C8] text-lg mb-8 leading-relaxed max-w-lg"
                        >
                            Connect directly with top beverage suppliers. Get bulk pricing, automated logistics, and net-terms financing for your business.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.9, duration: 0.5 }}
                            className="flex flex-wrap gap-4 mb-10"
                        >
                            <Link href="/categories" className="btn-primary text-base px-8 py-4 inline-flex items-center gap-2 rounded-xl group">
                                Browse Categories
                                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                            </Link>
                            <Link href="/auth/register" className="btn-secondary text-base px-8 py-4 inline-flex items-center gap-2 rounded-xl">
                                Register Business
                            </Link>
                        </motion.div>

                        {/* Stats Row */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1.1, duration: 0.6 }}
                            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
                        >
                            {stats.map((stat, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 1.2 + i * 0.1, duration: 0.4 }}
                                    className="text-center"
                                >
                                    <div className="text-[#FF6B00] flex justify-center mb-1">{stat.icon}</div>
                                    <div className="text-xl font-extrabold text-white">{stat.value}</div>
                                    <div className="text-xs text-[#6B6B8D]">{stat.label}</div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </motion.div>

                    {/* Right — Animated Dashboard Card */}
                    <motion.div
                        initial={{ opacity: 0, x: 60, rotateY: -10 }}
                        animate={{ opacity: 1, x: 0, rotateY: 0 }}
                        transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
                        className="hidden lg:block relative"
                    >
                        <div className="animate-float">
                            <div className="glass-card-strong p-8 relative">
                                {/* Card Header */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gradient-to-br from-[#FF6B00] to-[#FF8C33] rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                            AT
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white">Dashboard</div>
                                            <div className="text-xs text-[#6B6B8D]">Real-time analytics</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-[#E94560]"></div>
                                        <div className="w-3 h-3 rounded-full bg-[#F39C12]"></div>
                                        <div className="w-3 h-3 rounded-full bg-[#27AE60]"></div>
                                    </div>
                                </div>

                                {/* Mini KPI Cards */}
                                <div className="grid grid-cols-3 gap-3 mb-6">
                                    {[
                                        { label: 'Revenue', value: '$48.2K', change: '+12.5%', color: '#27AE60' },
                                        { label: 'Orders', value: '1,247', change: '+8.3%', color: '#3498DB' },
                                        { label: 'Growth', value: '23.5%', change: '+4.2%', color: '#FF6B00' },
                                    ].map((kpi, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.8 + i * 0.15, duration: 0.4 }}
                                            className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]"
                                        >
                                            <div className="text-[10px] text-[#6B6B8D] mb-1">{kpi.label}</div>
                                            <div className="text-lg font-extrabold text-white">{kpi.value}</div>
                                            <div className="text-[10px] font-semibold" style={{ color: kpi.color }}>{kpi.change}</div>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Chart Placeholder */}
                                <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.05] mb-5">
                                    <div className="flex items-end gap-2 h-24">
                                        {[40, 65, 45, 80, 55, 90, 70, 95, 60, 85, 75, 100].map((h, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ height: 0 }}
                                                animate={{ height: `${h}%` }}
                                                transition={{ delay: 1.2 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                                                className="flex-1 rounded-t-sm"
                                                style={{
                                                    background: i >= 10
                                                        ? 'linear-gradient(to top, #FF6B00, #FF8C33)'
                                                        : 'rgba(255, 255, 255, 0.08)',
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Action Row */}
                                <div className="flex gap-3">
                                    <div className="h-9 bg-white/[0.06] rounded-lg flex-1 animate-shimmer"></div>
                                    <div className="h-9 bg-gradient-to-r from-[#FF6B00] to-[#FF8C33] rounded-lg w-28 flex items-center justify-center text-xs font-bold text-white">
                                        View Report
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Floating badge */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 1.5, duration: 0.5, type: 'spring' }}
                            className="absolute -bottom-4 -start-4 glass-card px-4 py-3 flex items-center gap-3 animate-float-slow"
                            style={{ animationDelay: '1s' }}
                        >
                            <div className="w-8 h-8 bg-[#27AE60] rounded-full flex items-center justify-center">
                                <TrendingUp className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-white">Sales Up</div>
                                <div className="text-[10px] text-[#27AE60] font-semibold">+23.5% this month</div>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
