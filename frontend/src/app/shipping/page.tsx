'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Truck, Clock, Globe, Package, AlertCircle, CheckCircle2 } from 'lucide-react';

const SHIPPING_ZONES = [
    { zone: 'Romania & EU', time: '3-7 business days', note: 'Standard EU intra-market shipping' },
    { zone: 'UK', time: '5-10 business days', note: 'Post-Brexit customs may apply' },
    { zone: 'Gulf (UAE, KSA, Kuwait, Qatar)', time: '7-14 business days', note: 'Import duties may apply at destination' },
    { zone: 'Other Europe (non-EU)', time: '7-12 business days', note: 'Norway, Switzerland, etc.' },
    { zone: 'Other International', time: '14-21 business days', note: 'Contact supplier for confirmation' },
];

export default function ShippingPage() {
    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-4xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                            <Truck size={22} className="text-orange-500" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Policies</p>
                            <h1 className="text-3xl font-black">Shipping Policy</h1>
                        </div>
                    </div>
                    <p className="text-muted-foreground mb-12">Last updated: April 2026</p>

                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-6 mb-12">
                        <p className="text-sm leading-relaxed">
                            <strong>Important:</strong> Atlantis is a B2B marketplace platform. Shipping is arranged and fulfilled by individual suppliers. The shipping terms below represent platform-wide guidelines — actual shipping times, costs, and carriers are determined by each supplier and displayed on their product listings.
                        </p>
                    </div>

                    <div className="space-y-10">
                        <section className="border-b border-border/50 pb-10">
                            <div className="flex items-center gap-3 mb-5">
                                <Globe size={18} className="text-primary" />
                                <h2 className="text-lg font-black">Shipping Zones & Estimated Times</h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border/50">
                                            <th className="text-left py-3 pr-4 font-bold text-foreground/80">Destination</th>
                                            <th className="text-left py-3 pr-4 font-bold text-foreground/80">Estimated Time</th>
                                            <th className="text-left py-3 font-bold text-foreground/80">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {SHIPPING_ZONES.map((z) => (
                                            <tr key={z.zone} className="border-b border-border/30 last:border-0">
                                                <td className="py-3 pr-4 font-bold">{z.zone}</td>
                                                <td className="py-3 pr-4 text-muted-foreground">{z.time}</td>
                                                <td className="py-3 text-muted-foreground text-xs">{z.note}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-muted-foreground mt-4">All times are estimates from the date of shipment, not order placement. Customs delays are outside the supplier's or Atlantis's control.</p>
                        </section>

                        <section className="border-b border-border/50 pb-10">
                            <div className="flex items-center gap-3 mb-5">
                                <Package size={18} className="text-primary" />
                                <h2 className="text-lg font-black">Shipping Costs</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                Shipping costs are set by each supplier and displayed during checkout before you confirm your order. Costs vary based on:
                            </p>
                            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
                                <li>Order weight and volume</li>
                                <li>Destination country and shipping zone</li>
                                <li>Shipping speed selected</li>
                                <li>Supplier's preferred carrier</li>
                            </ul>
                            <p className="text-sm text-muted-foreground mt-4">Some suppliers offer free shipping above a minimum order value — this is displayed on their product pages.</p>
                        </section>

                        <section className="border-b border-border/50 pb-10">
                            <div className="flex items-center gap-3 mb-5">
                                <Clock size={18} className="text-primary" />
                                <h2 className="text-lg font-black">Order Processing Time</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                After payment is confirmed, the supplier has up to 48 business hours to accept and begin processing your order. Processing time (picking, packing, dispatch) is separate from shipping transit time. Suppliers communicate their processing time on their product pages.
                            </p>
                        </section>

                        <section className="border-b border-border/50 pb-10">
                            <div className="flex items-center gap-3 mb-5">
                                <CheckCircle2 size={18} className="text-emerald-500" />
                                <h2 className="text-lg font-black">Tracking Your Shipment</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                When the supplier marks an order as shipped, the order status updates to "Shipped" in your dashboard. Where a tracking number is provided, it will appear in your Order Details page. You can also check your email for shipping notifications.
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Go to: <strong>Dashboard → My Orders → Select Order → Order Details</strong>
                            </p>
                        </section>

                        <section className="border-b border-border/50 pb-10">
                            <div className="flex items-center gap-3 mb-5">
                                <AlertCircle size={18} className="text-amber-500" />
                                <h2 className="text-lg font-black">Customs & Import Duties</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                For orders shipped outside the EU or to countries with import restrictions, customs duties, taxes, or import fees may be charged by the destination country's customs authority. These charges are the responsibility of the buyer and are not included in the product or shipping price on Atlantis. We recommend checking your local import regulations before placing large orders.
                            </p>
                        </section>

                        <section>
                            <div className="flex items-center gap-3 mb-5">
                                <AlertCircle size={18} className="text-red-500" />
                                <h2 className="text-lg font-black">Shipping Issues</h2>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                If your order has not shipped within the supplier's stated processing window, or if goods arrive damaged, lost, or significantly different from the listing:
                            </p>
                            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
                                <li>Do not confirm delivery if goods are damaged or missing</li>
                                <li>Open a dispute within 7 days via your Order Details page</li>
                                <li>Provide photographic evidence of damage or discrepancy</li>
                                <li>Contact us at <a href="mailto:Info@atlantisfmcg.com" className="text-primary hover:underline">Info@atlantisfmcg.com</a> for urgent matters</li>
                            </ul>
                        </section>
                    </div>

                    <div className="mt-16 p-8 bg-card border border-border/50 rounded-2xl text-center space-y-4">
                        <p className="text-sm font-bold">Shipping question not answered here?</p>
                        <Link href="/contact" className="inline-flex items-center gap-2 h-11 px-8 bg-primary text-primary-foreground text-sm font-black rounded-xl hover:bg-primary/90 transition-colors">
                            Contact Support
                        </Link>
                        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
                            <Link href="/returns" className="hover:text-foreground transition-colors">Returns & Refunds</Link>
                            <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
