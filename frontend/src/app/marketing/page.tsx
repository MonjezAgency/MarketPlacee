'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Zap, BarChart3, Star, TrendingUp, Target, Eye, CheckCircle2 } from 'lucide-react';

const PLACEMENT_TYPES = [
    {
        name: 'Hero Banner',
        icon: Star,
        desc: 'Top-of-homepage full-width banner. Maximum visibility — seen by every visitor before they scroll.',
        color: 'text-amber-500 bg-amber-500/10',
        badge: 'Highest Visibility',
    },
    {
        name: 'Featured Products',
        icon: TrendingUp,
        desc: 'Your products shown in the "Featured" section on the homepage and category pages. High click-through rate.',
        color: 'text-primary bg-primary/10',
        badge: 'Best Value',
    },
    {
        name: 'Category Listing Boost',
        icon: Target,
        desc: 'Your products appear at the top of relevant category search results, above organic listings.',
        color: 'text-emerald-500 bg-emerald-500/10',
        badge: 'Targeted',
    },
    {
        name: 'Sponsored Highlights',
        icon: Eye,
        desc: 'Highlighted product cards across the platform with a "Sponsored" badge — visible in search and browse.',
        color: 'text-purple-500 bg-purple-500/10',
        badge: 'Broad Reach',
    },
];

const BENEFITS = [
    'Reach verified B2B buyers actively looking to purchase',
    'Pay only for confirmed placements — no click-based billing surprises',
    'Admin-reviewed and approved placements for brand safety',
    'Analytics dashboard to track placement performance',
    'Available to all KYC-verified suppliers',
    'Flexible duration — weekly or monthly placements',
];

export default function MarketingPage() {
    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-5xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    {/* Hero */}
                    <div className="mb-20">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Zap size={18} className="text-primary" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Supplier Marketing Tools</p>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
                            Grow Your Sales<br />
                            <span className="text-primary">on Atlantis</span>
                        </h1>
                        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-8">
                            As a verified Atlantis supplier, you have access to powerful placement tools to boost your product visibility and reach more B2B buyers across Europe and the Gulf.
                        </p>
                        <div className="flex items-center gap-4 flex-wrap">
                            <Link href="/supplier" className="h-12 px-10 bg-primary text-primary-foreground font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm">
                                Go to Supplier Dashboard <ArrowRight size={16} />
                            </Link>
                            <Link href="/auth/register" className="h-12 px-10 border border-border bg-card font-black rounded-2xl hover:bg-muted transition-colors text-sm">
                                Register as Supplier
                            </Link>
                        </div>
                    </div>

                    {/* Placement Types */}
                    <section className="mb-20">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Placement Options</p>
                        <h2 className="text-3xl font-black mb-10">Boost Your Visibility</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {PLACEMENT_TYPES.map((p) => {
                                const Icon = p.icon;
                                return (
                                    <div key={p.name} className="p-6 bg-card border border-border/50 rounded-2xl hover:border-primary/30 transition-colors">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.color}`}>
                                                <Icon size={18} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary px-2 py-1 rounded-full">{p.badge}</span>
                                        </div>
                                        <h3 className="font-black mb-2">{p.name}</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Benefits */}
                    <section className="mb-20">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Why Use Atlantis Placements</p>
                        <h2 className="text-3xl font-black mb-8">Built for B2B Results</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {BENEFITS.map((b) => (
                                <div key={b} className="flex items-start gap-3 p-4 bg-card border border-border/50 rounded-xl">
                                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <p className="text-sm">{b}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* How It Works */}
                    <section className="mb-20 bg-card border border-border/50 rounded-3xl p-10">
                        <div className="flex items-center gap-3 mb-8">
                            <BarChart3 size={20} className="text-primary" />
                            <h2 className="text-2xl font-black">How to Set Up a Placement</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { step: '1', title: 'Complete KYC & List Products', desc: 'Ensure your supplier account is verified and you have approved product listings.' },
                                { step: '2', title: 'Go to Placements Dashboard', desc: 'Navigate to Supplier Dashboard → Placements → Create New Placement.' },
                                { step: '3', title: 'Select Type, Duration & Product', desc: 'Choose placement type, set duration, select the product to promote. Admin reviews within 24h.' },
                            ].map((item) => (
                                <div key={item.step} className="text-center">
                                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary text-lg font-black flex items-center justify-center mx-auto mb-4">{item.step}</div>
                                    <h3 className="font-black mb-2 text-sm">{item.title}</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* CTA */}
                    <div className="bg-primary/5 border border-primary/20 rounded-3xl p-12 text-center space-y-6">
                        <h2 className="text-3xl font-black">Ready to grow your reach?</h2>
                        <p className="text-muted-foreground max-w-md mx-auto">Placements are available to all KYC-verified suppliers. Log in to your supplier dashboard to get started.</p>
                        <Link href="/supplier/placements" className="inline-flex items-center gap-2 h-12 px-10 bg-primary text-primary-foreground font-black rounded-2xl hover:bg-primary/90 transition-colors text-sm">
                            Manage Placements <ArrowRight size={16} />
                        </Link>
                        <p className="text-xs text-muted-foreground">Not a supplier yet? <Link href="/auth/register" className="text-primary hover:underline font-bold">Register here →</Link></p>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
