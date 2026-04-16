'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Package, BarChart3, ShieldCheck, Zap, Globe, Tag, CheckCircle2 } from 'lucide-react';

const BENEFITS = [
    { icon: Package, title: 'Tiered Bulk Pricing', desc: 'Every product on Atlantis offers quantity-based pricing tiers. The more you order, the lower your unit cost — automatically applied at checkout.', color: 'text-primary bg-primary/10' },
    { icon: ShieldCheck, title: 'Verified Suppliers Only', desc: 'Every supplier on our platform has completed full KYC identity and business verification. Buy in bulk with confidence.', color: 'text-emerald-500 bg-emerald-500/10' },
    { icon: Globe, title: 'Europe & Gulf Sourcing', desc: 'Source FMCG, beverages, personal care, and more from suppliers across Europe and the Gulf — all in one platform.', color: 'text-blue-500 bg-blue-500/10' },
    { icon: ShieldCheck, title: 'Escrow Payment Protection', desc: 'Your wholesale payment is held in escrow until goods are confirmed delivered. No wire transfer risk, no trust required.', color: 'text-purple-500 bg-purple-500/10' },
    { icon: BarChart3, title: 'Financial Reporting', desc: 'Download invoices automatically for every order. Full purchase history with exportable records for your accounting team.', color: 'text-orange-500 bg-orange-500/10' },
    { icon: Zap, title: 'Fast Reordering', desc: 'Repeat your most common orders with a single click from your order history. Build supplier relationships and negotiate directly.', color: 'text-amber-500 bg-amber-500/10' },
];

const CATEGORIES = [
    'FMCG & Consumer Goods',
    'Beverages & Soft Drinks',
    'Personal Care & Beauty',
    'Health & Nutrition',
    'Household Products',
    'Food & Grocery',
];

export default function WholesalePage() {
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
                                <Tag size={18} className="text-primary" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Bulk & Wholesale</p>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black leading-tight mb-6">
                            Source Wholesale at<br />
                            <span className="text-primary">B2B Prices</span>
                        </h1>
                        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-8">
                            Atlantis is purpose-built for B2B wholesale sourcing. Browse thousands of FMCG and consumer goods products with quantity-based pricing, minimum order quantities, and secure escrow payment — all from KYC-verified suppliers.
                        </p>
                        <div className="flex items-center gap-4 flex-wrap">
                            <Link href="/auth/register" className="h-12 px-10 bg-primary text-primary-foreground font-black rounded-2xl hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm">
                                Create Free Buyer Account <ArrowRight size={16} />
                            </Link>
                            <Link href="/categories" className="h-12 px-10 border border-border bg-card font-black rounded-2xl hover:bg-muted transition-colors text-sm">
                                Browse Products
                            </Link>
                        </div>
                    </div>

                    {/* Categories */}
                    <section className="mb-20">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Product Categories</p>
                        <h2 className="text-3xl font-black mb-8">What You Can Source</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {CATEGORIES.map((cat) => (
                                <Link key={cat} href="/categories" className="flex items-center gap-3 p-4 bg-card border border-border/50 rounded-xl hover:border-primary/50 transition-colors">
                                    <CheckCircle2 size={16} className="text-primary shrink-0" />
                                    <span className="text-sm font-bold">{cat}</span>
                                </Link>
                            ))}
                        </div>
                    </section>

                    {/* Benefits */}
                    <section className="mb-20">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Why Atlantis for Wholesale</p>
                        <h2 className="text-3xl font-black mb-10">Built for Bulk Buyers</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {BENEFITS.map((b) => {
                                const Icon = b.icon;
                                return (
                                    <div key={b.title} className="p-6 bg-card border border-border/50 rounded-2xl hover:border-primary/30 transition-colors">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${b.color}`}>
                                            <Icon size={18} />
                                        </div>
                                        <h3 className="font-black mb-2 text-sm">{b.title}</h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* How Tiered Pricing Works */}
                    <section className="mb-20 bg-card border border-border/50 rounded-3xl p-10">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Example</p>
                        <h2 className="text-2xl font-black mb-8">How Bulk Pricing Tiers Work</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/50">
                                        <th className="text-left py-3 pr-6 font-bold text-foreground/80">Order Quantity</th>
                                        <th className="text-left py-3 pr-6 font-bold text-foreground/80">Unit Price</th>
                                        <th className="text-left py-3 font-bold text-foreground/80">You Save</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { qty: '10 – 49 units (MOQ)', price: '€12.50 / unit', save: 'Standard price' },
                                        { qty: '50 – 199 units', price: '€10.80 / unit', save: '14% off' },
                                        { qty: '200 – 499 units', price: '€9.20 / unit', save: '26% off' },
                                        { qty: '500+ units', price: '€7.50 / unit', save: '40% off' },
                                    ].map((row) => (
                                        <tr key={row.qty} className="border-b border-border/30 last:border-0">
                                            <td className="py-3 pr-6 font-bold">{row.qty}</td>
                                            <td className="py-3 pr-6 text-muted-foreground">{row.price}</td>
                                            <td className="py-3 text-emerald-500 font-bold text-xs">{row.save}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-muted-foreground mt-6">Pricing tiers are set individually by each supplier. The applicable tier is automatically calculated at checkout based on your order quantity.</p>
                    </section>

                    {/* CTA */}
                    <div className="bg-primary/5 border border-primary/20 rounded-3xl p-12 text-center space-y-6">
                        <h2 className="text-3xl font-black">Start sourcing wholesale today</h2>
                        <p className="text-muted-foreground max-w-md mx-auto">Create a free buyer account. No subscription fees — Atlantis is free to use for buyers.</p>
                        <Link href="/auth/register" className="inline-flex items-center gap-2 h-12 px-10 bg-primary text-primary-foreground font-black rounded-2xl hover:bg-primary/90 transition-colors text-sm">
                            Create Free Account <ArrowRight size={16} />
                        </Link>
                        <p className="text-xs text-muted-foreground">Are you a supplier? <Link href="/auth/register" className="text-primary hover:underline font-bold">Register as a supplier →</Link></p>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
