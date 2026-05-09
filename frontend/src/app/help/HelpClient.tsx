'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, HelpCircle, ChevronDown, Search, Users, CreditCard, Package, ShieldCheck, MessageSquare } from 'lucide-react';

// Help Center is a public, customer-facing page. We intentionally do NOT
// expose a "Supplier FAQ" category, "Become a supplier" CTAs, or any
// language that implies third-party sellers — Atlantis is the seller of
// record. Supplier onboarding is invite-only and handled privately.
const CATEGORIES = [
    { icon: Users, label: 'Buyer FAQs', color: 'text-blue-500 bg-blue-500/10' },
    { icon: CreditCard, label: 'Payments & Escrow', color: 'text-emerald-500 bg-emerald-500/10' },
    { icon: Package, label: 'Orders & Shipping', color: 'text-orange-500 bg-orange-500/10' },
    { icon: ShieldCheck, label: 'Security & KYC', color: 'text-primary bg-primary/10' },
];

const FAQS: { category: string; q: string; a: string }[] = [
    // Buyer FAQs
    { category: 'Buyer FAQs', q: 'How do I register as a buyer?', a: 'Click "Register" on the homepage and select the Buyer/Customer account type. Fill in your company details, email, and password. Your account will be reviewed and activated by our team within 24 hours. You\'ll receive a confirmation email once approved.' },
    { category: 'Buyer FAQs', q: 'What is the minimum order quantity (MOQ)?', a: 'Each product has its own MOQ shown on the product page. You must meet the minimum order quantity to add the product to your cart — this lets us ship efficiently at wholesale prices.' },
    { category: 'Buyer FAQs', q: 'Can I request a custom quote?', a: 'For large volume orders or bulk inquiries outside standard pricing tiers, contact us at Info@atlantisfmcg.com and our sales team will send you a tailored Atlantis quote.' },
    { category: 'Buyer FAQs', q: 'How do I track my order?', a: 'Go to Dashboard → My Orders to see the real-time status of all your orders. Status updates (Processing, Shipped, Delivered) appear there in real-time, along with the carrier tracking number once dispatched. You\'ll also receive email notifications at each stage.' },
    { category: 'Buyer FAQs', q: 'What happens if goods arrive damaged?', a: 'Do not confirm delivery. Instead, open a dispute within 7 days from the expected delivery date. Go to your order and click "Open Dispute". Provide photos and a description. Our team will review within 48-72 hours and either issue a refund or arrange a replacement.' },

    // Payments & Escrow
    { category: 'Payments & Escrow', q: 'What is escrow and why is it used?', a: 'Escrow means Atlantis holds your payment securely after checkout. The funds are not captured until the order is confirmed delivered. This protects you from non-delivery and gives you full transparency on every order.' },
    { category: 'Payments & Escrow', q: 'What payment methods are accepted?', a: 'We accept all major credit and debit cards (Visa, Mastercard, Amex), as well as Apple Pay and Google Pay — all processed securely by Stripe. We do not accept bank transfers, cash, or cryptocurrency at this time.' },
    { category: 'Payments & Escrow', q: 'How do refunds work?', a: 'If a dispute is resolved in your favor, the escrowed funds are returned to your original payment method. Refunds typically appear within 5-10 business days depending on your bank. Stripe processing fees are non-refundable in some cases.' },

    // Orders & Shipping
    { category: 'Orders & Shipping', q: 'Does Atlantis handle shipping?', a: 'Yes. Atlantis arranges shipping for every order through our negotiated network of European carriers (DB Schenker, LKW Walter, Raben, DHL and others). Transport cost is calculated per order and confirmed with you before payment is captured.' },
    { category: 'Orders & Shipping', q: 'Can I cancel an order?', a: 'You can request a cancellation before the order moves to "Processing". Once the order is in "Processing" or "Shipped", cancellation is handled through the dispute process. Contact us at Info@atlantisfmcg.com immediately for urgent cancellation requests.' },
    { category: 'Orders & Shipping', q: 'Are invoices generated automatically?', a: 'Yes. An invoice is generated automatically once your order is confirmed as delivered. You can download it from your Order History in the dashboard.' },

    // Security & KYC
    { category: 'Security & KYC', q: 'How is my financial data protected?', a: 'All sensitive financial data (IBAN, SWIFT codes, 2FA secrets) is encrypted using AES-256 encryption before being stored in our database. We never store card numbers — all card data is handled exclusively by Stripe (PCI DSS Level 1 certified). Your account uses JWT authentication with short-lived tokens and optional two-factor authentication.' },
    { category: 'Security & KYC', q: 'What is 2FA and should I enable it?', a: 'Two-Factor Authentication (2FA) adds an extra layer of security to your account. After entering your password, you\'ll also need to enter a code from an authenticator app (like Google Authenticator). We strongly recommend enabling 2FA on every business account.' },
    { category: 'Security & KYC', q: 'What should I do if I suspect my account is compromised?', a: 'Contact us immediately at Info@atlantisfmcg.com or change your password immediately from Account Security settings. We monitor all login attempts and will flag suspicious activity. Accounts are automatically locked after repeated failed login attempts.' },
];

function FAQ({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-border/50 rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between gap-4 p-5 text-left bg-card hover:bg-muted/50 transition-colors"
            >
                <span className="text-sm font-bold">{q}</span>
                <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 pt-2 border-t border-border/50 bg-card">
                            <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function HelpPage() {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('Buyer FAQs');

    const filtered = FAQS.filter((f) => {
        const matchCategory = f.category === activeCategory;
        const matchSearch = !search || f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase());
        return search ? matchSearch : matchCategory;
    });

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-4xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <HelpCircle size={22} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Support</p>
                            <h1 className="text-3xl font-black">Help Center</h1>
                        </div>
                    </div>
                    <p className="text-muted-foreground mb-10">Find answers to common questions about buying, selling, and payments on Atlantis.</p>

                    {/* Search */}
                    <div className="relative mb-8">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search help articles..."
                            className="w-full h-12 pl-11 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                    </div>

                    {/* Categories */}
                    {!search && (
                        <div className="flex flex-wrap gap-2 mb-8">
                            {CATEGORIES.map((cat) => {
                                const Icon = cat.icon;
                                return (
                                    <button
                                        key={cat.label}
                                        onClick={() => setActiveCategory(cat.label)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-colors border ${activeCategory === cat.label ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/50'}`}
                                    >
                                        <Icon size={13} />
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* FAQs */}
                    <div className="space-y-3 mb-16">
                        {filtered.length > 0 ? filtered.map((faq) => (
                            <FAQ key={faq.q} q={faq.q} a={faq.a} />
                        )) : (
                            <div className="text-center py-12 text-muted-foreground">
                                <p className="font-bold mb-2">No results found</p>
                                <p className="text-sm">Try a different search term or browse by category</p>
                            </div>
                        )}
                    </div>

                    {/* Still need help */}
                    <div className="bg-card border border-border/50 rounded-2xl p-8 text-center space-y-4">
                        <MessageSquare size={32} className="text-primary mx-auto" />
                        <h2 className="text-xl font-black">Still need help?</h2>
                        <p className="text-sm text-muted-foreground">Our support team typically responds within 24 business hours.</p>
                        <Link href="/contact" className="inline-flex items-center gap-2 h-11 px-8 bg-primary text-primary-foreground text-sm font-black rounded-xl hover:bg-primary/90 transition-colors">
                            Contact Support
                        </Link>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
