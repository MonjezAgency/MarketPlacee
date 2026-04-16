'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, CheckCircle2, XCircle, Clock, AlertCircle, MessageSquare } from 'lucide-react';

const ELIGIBLE = [
    'Goods that are significantly not as described in the listing',
    'Damaged goods on arrival (with photographic evidence)',
    'Missing items from the order (partial delivery)',
    'Incorrect products shipped (wrong SKU, size, or variant)',
    'Expired goods delivered (FMCG products)',
];

const NOT_ELIGIBLE = [
    'Change of mind after delivery is confirmed',
    'Goods that match the product description but were not what the buyer expected',
    'Damage caused after delivery by the buyer',
    'Orders for which delivery has been confirmed in the platform without raising an issue',
    'Disputes raised more than 7 days after delivery confirmation',
];

export default function ReturnsPage() {
    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-4xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                            <RotateCcw size={22} className="text-purple-500" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Policies</p>
                            <h1 className="text-3xl font-black">Returns & Refunds</h1>
                        </div>
                    </div>
                    <p className="text-muted-foreground mb-12">Last updated: April 2026</p>

                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-6 mb-12">
                        <p className="text-sm leading-relaxed">
                            Atlantis uses an escrow payment system — your payment is held securely and only released to the supplier once you confirm delivery. This gives you strong protection. If there is a problem with your order, do not confirm delivery and open a dispute.
                        </p>
                    </div>

                    <div className="space-y-10">
                        <section className="border-b border-border/50 pb-10">
                            <h2 className="text-lg font-black mb-5">How Returns Work on Atlantis</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                                Because Atlantis is a B2B marketplace, returns are handled through our dispute resolution process rather than a traditional return flow. The escrow system protects you throughout:
                            </p>
                            <div className="space-y-4">
                                {[
                                    { step: '1', title: 'Do not confirm delivery', desc: 'If goods are wrong, damaged, or missing — do not press "Confirm Delivery". The escrow funds remain held.' },
                                    { step: '2', title: 'Open a dispute', desc: 'Go to Dashboard → My Orders → Select the order → "Open Dispute". You have 7 days from the expected delivery date.' },
                                    { step: '3', title: 'Provide evidence', desc: 'Upload photos, describe the issue clearly, and submit the dispute. The supplier will also be contacted.' },
                                    { step: '4', title: 'Resolution', desc: 'Our team reviews within 48-72 hours. If resolved in your favor, a full or partial refund is issued. If the dispute is rejected, escrow is released to the supplier.' },
                                ].map((item) => (
                                    <div key={item.step} className="flex gap-4 p-5 bg-card border border-border/50 rounded-xl">
                                        <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-black flex items-center justify-center shrink-0">{item.step}</span>
                                        <div>
                                            <p className="font-bold text-sm mb-1">{item.title}</p>
                                            <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="border-b border-border/50 pb-10">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <CheckCircle2 size={18} className="text-emerald-500" />
                                        <h2 className="font-black">Eligible for Dispute / Refund</h2>
                                    </div>
                                    <ul className="space-y-3">
                                        {ELIGIBLE.map((item) => (
                                            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <XCircle size={18} className="text-red-500" />
                                        <h2 className="font-black">Not Eligible</h2>
                                    </div>
                                    <ul className="space-y-3">
                                        {NOT_ELIGIBLE.map((item) => (
                                            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section className="border-b border-border/50 pb-10">
                            <div className="flex items-center gap-3 mb-5">
                                <Clock size={18} className="text-primary" />
                                <h2 className="text-lg font-black">Refund Timelines</h2>
                            </div>
                            <div className="space-y-4 text-sm text-muted-foreground">
                                <p><strong>Dispute decision:</strong> 48-72 business hours after submission</p>
                                <p><strong>Refund processing:</strong> 1-3 business days after decision</p>
                                <p><strong>Funds in your account:</strong> 5-10 business days depending on your bank</p>
                                <p className="text-xs mt-4">Stripe processing fees (typically 1.4%-2.9% + €0.25) may be non-refundable for orders that were partially fulfilled or where the dispute is partially upheld. Fully cancelled orders before processing are refunded in full.</p>
                            </div>
                        </section>

                        <section className="border-b border-border/50 pb-10">
                            <div className="flex items-center gap-3 mb-5">
                                <AlertCircle size={18} className="text-amber-500" />
                                <h2 className="text-lg font-black">Physical Returns</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                In some cases, the dispute resolution process may require you to return goods to the supplier. If a physical return is required, Atlantis will coordinate with both parties. Return shipping costs are typically borne by the party at fault as determined by the dispute outcome. Do not return goods without written confirmation from Atlantis that a return has been authorized.
                            </p>
                        </section>

                        <section>
                            <div className="flex items-center gap-3 mb-5">
                                <MessageSquare size={18} className="text-primary" />
                                <h2 className="text-lg font-black">Need Help?</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                For questions about a specific order, open a dispute in your dashboard or contact us at <a href="mailto:Info@atlantisfmcg.com" className="text-primary hover:underline font-bold">Info@atlantisfmcg.com</a>. Include your order number and a description of the issue for the fastest response.
                            </p>
                        </section>
                    </div>

                    <div className="mt-16 p-8 bg-card border border-border/50 rounded-2xl text-center space-y-4">
                        <p className="text-sm font-bold">Have an order issue right now?</p>
                        <div className="flex items-center justify-center gap-4 flex-wrap">
                            <Link href="/dashboard" className="inline-flex items-center gap-2 h-11 px-8 bg-primary text-primary-foreground text-sm font-black rounded-xl hover:bg-primary/90 transition-colors">
                                Go to My Orders
                            </Link>
                            <Link href="/contact" className="inline-flex items-center h-11 px-8 border border-border bg-card text-sm font-black rounded-xl hover:bg-muted transition-colors">
                                Contact Support
                            </Link>
                        </div>
                        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
                            <Link href="/shipping" className="hover:text-foreground transition-colors">Shipping Policy</Link>
                            <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
