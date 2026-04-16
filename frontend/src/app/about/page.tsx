'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Shield, Globe, Zap, Users, BarChart3, ShieldCheck, Lock, PackageSearch } from 'lucide-react';

const STATS = [
    { value: 'EUR', label: 'Primary Currency', desc: 'Built for the European market' },
    { value: 'B2B', label: 'Exclusive Focus', desc: 'Business-to-business only' },
    { value: 'KYC', label: 'Verified Suppliers', desc: 'Every supplier identity-checked' },
    { value: 'Escrow', label: 'Secure Payments', desc: 'Funds held until delivery confirmed' },
];

const VALUES = [
    {
        icon: Shield,
        title: 'Security First',
        desc: 'Every feature is designed with security as the foundation — AES-256 encryption, 2FA, PCI DSS payments, and continuous threat monitoring.',
        color: 'text-primary bg-primary/10',
    },
    {
        icon: ShieldCheck,
        title: 'Verified Trust',
        desc: 'We verify every supplier before they list a single product. KYC with liveness detection ensures you always know who you are buying from.',
        color: 'text-emerald-500 bg-emerald-500/10',
    },
    {
        icon: Globe,
        title: 'European Standards',
        desc: 'Built for the EU market with GDPR compliance, EUR currency support, and VAT handling — meeting the regulatory requirements of every EU buyer.',
        color: 'text-blue-500 bg-blue-500/10',
    },
    {
        icon: Zap,
        title: 'Simplicity at Scale',
        desc: 'Managing thousands of SKUs, multiple suppliers, and cross-border shipping should not require a PhD. We make B2B commerce as simple as B2C.',
        color: 'text-orange-500 bg-orange-500/10',
    },
    {
        icon: BarChart3,
        title: 'Transparency',
        desc: 'Clear commission structure, real-time escrow status, and complete financial audit trails. No hidden fees, no surprises.',
        color: 'text-purple-500 bg-purple-500/10',
    },
    {
        icon: Users,
        title: 'Long-term Relationships',
        desc: 'We are not a one-click marketplace. We facilitate lasting B2B relationships built on verified identities, consistent quality, and fair dispute resolution.',
        color: 'text-amber-500 bg-amber-500/10',
    },
];

export default function AboutPage() {
    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-5xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    {/* Hero */}
                    <div className="mb-20">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                <PackageSearch size={22} className="text-primary" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">About Atlantis</p>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
                            The B2B Marketplace<br />
                            <span className="text-primary">Built for Trust</span>
                        </h1>
                        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                            Atlantis is a B2B wholesale platform connecting verified suppliers with business buyers across Europe and the Gulf. We were founded with a simple belief: business commerce should be as secure and transparent as enterprise banking, and as simple as consumer shopping.
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-20">
                        {STATS.map((stat) => (
                            <div key={stat.label} className="bg-card border border-border/50 rounded-2xl p-6 text-center">
                                <div className="text-2xl font-black text-primary mb-1">{stat.value}</div>
                                <div className="text-sm font-bold mb-1">{stat.label}</div>
                                <div className="text-xs text-muted-foreground">{stat.desc}</div>
                            </div>
                        ))}
                    </div>

                    {/* Story */}
                    <section className="mb-20">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Our Story</p>
                                <h2 className="text-3xl font-black mb-6">Why We Built Atlantis</h2>
                                <div className="space-y-4 text-muted-foreground text-sm leading-relaxed">
                                    <p>
                                        Traditional B2B sourcing involves endless email chains, PDF catalogs, wire transfers with no protection, and supplier relationships built on nothing more than hope.
                                    </p>
                                    <p>
                                        We built Atlantis to change that. Our platform brings together KYC-verified suppliers and buyers in a secure, escrow-protected marketplace where every transaction is tracked, every supplier is verified, and every payment is protected until delivery is confirmed.
                                    </p>
                                    <p>
                                        Headquartered with a focus on Romania and the broader European market, we understand the regulatory requirements, currency considerations, and trust dynamics that make EU B2B commerce unique.
                                    </p>
                                </div>
                            </div>
                            <div className="bg-card border border-border/50 rounded-3xl p-8 space-y-5">
                                <div className="flex items-center gap-3 pb-5 border-b border-border/50">
                                    <Lock size={18} className="text-primary" />
                                    <span className="font-black text-sm">How we protect your money</span>
                                </div>
                                {[
                                    'Customer pays → funds held in Stripe Escrow',
                                    'Supplier ships → customer gets tracking',
                                    'Customer confirms delivery → escrow releases',
                                    'Atlantis takes 5% commission → supplier gets the rest',
                                    'Dispute? Our team reviews and resolves fairly',
                                ].map((step, i) => (
                                    <div key={i} className="flex items-start gap-3">
                                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                        <p className="text-sm text-muted-foreground">{step}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Values */}
                    <section className="mb-20">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Our Values</p>
                        <h2 className="text-3xl font-black mb-10">What We Stand For</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {VALUES.map((v) => {
                                const Icon = v.icon;
                                return (
                                    <div key={v.title} className="p-6 bg-card border border-border/50 rounded-2xl hover:border-primary/30 transition-colors">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${v.color}`}>
                                            <Icon size={18} />
                                        </div>
                                        <h3 className="font-black mb-2">{v.title}</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* CTA */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-card border border-border/50 rounded-3xl p-12 text-center space-y-6"
                    >
                        <h2 className="text-3xl font-black">Ready to source smarter?</h2>
                        <p className="text-muted-foreground max-w-md mx-auto">Join verified businesses sourcing FMCG, beverages, and wholesale products on Atlantis.</p>
                        <div className="flex items-center justify-center gap-4 flex-wrap">
                            <Link href="/auth/register" className="h-12 px-10 bg-primary text-primary-foreground font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm">
                                Create Free Account <ArrowRight size={16} />
                            </Link>
                            <Link href="/contact" className="h-12 px-10 border border-border bg-card font-black rounded-2xl hover:bg-muted transition-colors text-sm">
                                Contact Us
                            </Link>
                        </div>
                    </motion.div>
                </motion.div>
            </div>
        </main>
    );
}
