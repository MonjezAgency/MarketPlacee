'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    ShieldCheck, PackageSearch, CreditCard, Truck,
    Users, BarChart3, CheckCircle2, ArrowRight, Star,
    Building2, Zap, Lock, Globe,
} from 'lucide-react';

const BUYER_STEPS = [
    { icon: Users, title: 'Create Your Account', desc: 'Register as a buyer. Our team reviews and activates your account within 24 hours.', color: 'text-blue-500 bg-blue-500/10' },
    { icon: PackageSearch, title: 'Browse & Search', desc: 'Explore thousands of verified products from suppliers across Europe and the Gulf. Filter by category, MOQ, price, and brand.', color: 'text-purple-500 bg-purple-500/10' },
    { icon: ShieldCheck, title: 'Verify Suppliers', desc: 'Every supplier is KYC-verified before listing. View company details, certifications, and ratings.', color: 'text-emerald-500 bg-emerald-500/10' },
    { icon: CreditCard, title: 'Pay Securely', desc: 'Checkout with Stripe — card, Apple Pay, Google Pay. Your payment is held in escrow until delivery is confirmed.', color: 'text-primary bg-primary/10' },
    { icon: Truck, title: 'Track Your Order', desc: 'Real-time status updates from placement to delivery. Download your invoice automatically once delivered.', color: 'text-orange-500 bg-orange-500/10' },
    { icon: Star, title: 'Review & Repeat', desc: 'Rate your supplier and products. Build long-term B2B relationships with trusted partners.', color: 'text-yellow-500 bg-yellow-500/10' },
];

const SUPPLIER_STEPS = [
    { icon: Building2, title: 'Register & Verify', desc: 'Create your supplier account and complete KYC verification with ID and business documents.', color: 'text-blue-500 bg-blue-500/10' },
    { icon: PackageSearch, title: 'List Your Products', desc: 'Add products with EAN lookup, bulk pricing tiers, MOQ, and warehouse details. Admin reviews within 48 hours.', color: 'text-purple-500 bg-purple-500/10' },
    { icon: Zap, title: 'Connect Stripe', desc: 'Link your Stripe account for automatic payouts. Funds are released after the buyer confirms delivery.', color: 'text-[#635BFF] bg-[#635BFF]/10' },
    { icon: BarChart3, title: 'Manage Orders', desc: 'Accept, process, and ship orders from your supplier dashboard. Track earnings and performance analytics.', color: 'text-emerald-500 bg-emerald-500/10' },
    { icon: Globe, title: 'Grow Your Reach', desc: 'Access buyers across Europe and the Gulf. Boost visibility with sponsored placements and promotions.', color: 'text-orange-500 bg-orange-500/10' },
];

const FEATURES = [
    { icon: Lock, title: 'Bank-Grade Security', desc: 'AES-256 encryption for all financial data. PCI DSS compliant payments via Stripe.' },
    { icon: ShieldCheck, title: 'KYC Verification', desc: 'Every supplier is identity-verified before listing products on the platform.' },
    { icon: CreditCard, title: 'Escrow Payments', desc: 'Your payment is held securely until delivery is confirmed — zero risk for buyers.' },
    { icon: Truck, title: 'Logistics Partners', desc: 'Integrated shipping rates from leading European and Gulf carriers.' },
    { icon: Star, title: 'Verified Reviews', desc: 'Only buyers who purchased can leave reviews — trustworthy ratings guaranteed.' },
    { icon: BarChart3, title: 'Business Analytics', desc: 'Real-time dashboards for suppliers and buyers to track performance and spending.' },
];

export default function HowItWorksPage() {
    return (
        <main className="min-h-screen bg-muted/20 pt-20 pb-24">
            <div className="container mx-auto px-6 max-w-5xl">
                {/* Hero */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center space-y-6">
                    <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 px-4 py-1.5 rounded-full text-primary text-xs font-black uppercase tracking-widest">
                        <CheckCircle2 size={12} /> Built for B2B
                    </div>
                    <h1 className="text-5xl font-heading font-black tracking-tight">
                        How <span className="text-primary">Atlantis</span> Works
                    </h1>
                    <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
                        A secure B2B marketplace connecting verified suppliers with professional buyers across Europe and the Gulf region.
                    </p>
                    <div className="flex items-center justify-center gap-4 flex-wrap pt-2">
                        <Link href="/auth/register?role=CUSTOMER"
                            className="h-12 px-8 bg-primary text-primary-foreground font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm">
                            Start Buying <ArrowRight size={16} />
                        </Link>
                        <Link href="/auth/register?role=SUPPLIER"
                            className="h-12 px-8 border border-border bg-card font-black rounded-2xl hover:bg-muted transition-colors text-sm">
                            Become a Supplier
                        </Link>
                    </div>
                </motion.div>

                {/* For Buyers */}
                <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-20">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Users size={20} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">For Buyers</p>
                            <h2 className="text-2xl font-black">How to Purchase</h2>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {BUYER_STEPS.map((step, i) => {
                            const Icon = step.icon;
                            return (
                                <motion.div key={step.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 + i * 0.07 }}
                                    className="bg-card border border-border/50 rounded-2xl p-6 space-y-4 hover:border-primary/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${step.color}`}>
                                            <Icon size={18} />
                                        </div>
                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Step {i + 1}</span>
                                    </div>
                                    <div>
                                        <h3 className="font-black mb-1">{step.title}</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.section>

                {/* For Suppliers */}
                <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-20">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-10 h-10 rounded-2xl bg-[#635BFF]/10 flex items-center justify-center">
                            <Building2 size={20} className="text-[#635BFF]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">For Suppliers</p>
                            <h2 className="text-2xl font-black">How to Start Selling</h2>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {SUPPLIER_STEPS.map((step, i) => {
                            const Icon = step.icon;
                            return (
                                <motion.div key={step.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 + i * 0.07 }}
                                    className="bg-card border border-border/50 rounded-2xl p-6 space-y-4 hover:border-primary/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${step.color}`}>
                                            <Icon size={18} />
                                        </div>
                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Step {i + 1}</span>
                                    </div>
                                    <div>
                                        <h3 className="font-black mb-1">{step.title}</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.section>

                {/* Platform Features */}
                <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mb-20">
                    <h2 className="text-2xl font-black mb-10 text-center">Why Atlantis?</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {FEATURES.map((f, i) => {
                            const Icon = f.icon;
                            return (
                                <div key={f.title} className="flex gap-4 p-5 bg-card border border-border/50 rounded-2xl">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                        <Icon size={18} className="text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-sm mb-1">{f.title}</h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.section>

                {/* CTA */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="bg-card border border-border/50 rounded-3xl p-12 text-center space-y-6">
                    <h2 className="text-3xl font-black">Ready to get started?</h2>
                    <p className="text-muted-foreground max-w-md mx-auto">Join thousands of businesses sourcing smarter with Atlantis.</p>
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                        <Link href="/auth/register"
                            className="h-12 px-10 bg-primary text-primary-foreground font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm">
                            Create Free Account <ArrowRight size={16} />
                        </Link>
                        <Link href="/categories"
                            className="h-12 px-10 border border-border bg-card font-black rounded-2xl hover:bg-muted transition-colors text-sm">
                            Browse Products
                        </Link>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
