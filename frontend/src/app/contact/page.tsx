'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Mail, MapPin, Clock, Send, CheckCircle2, MessageSquare, Phone, Building2 } from 'lucide-react';

const CONTACT_INFO = [
    {
        icon: Mail,
        label: 'Email',
        value: 'Info@atlantisfmcg.com',
        href: 'mailto:Info@atlantisfmcg.com',
        color: 'text-primary bg-primary/10',
    },
    {
        icon: Building2,
        label: 'Company',
        value: 'Atlantis FMCG',
        href: null,
        color: 'text-purple-500 bg-purple-500/10',
    },
    {
        icon: MapPin,
        label: 'Region',
        value: 'Romania · Europe · Gulf',
        href: null,
        color: 'text-emerald-500 bg-emerald-500/10',
    },
    {
        icon: Clock,
        label: 'Response Time',
        value: 'Within 24 business hours',
        href: null,
        color: 'text-orange-500 bg-orange-500/10',
    },
];

const TOPICS = [
    'General Inquiry',
    'Supplier Registration',
    'Buyer Account',
    'Order Issue',
    'Payment / Billing',
    'KYC / Verification',
    'Technical Support',
    'Partnership',
    'Other',
];

export default function ContactPage() {
    const [form, setForm] = useState({ name: '', email: '', company: '', topic: '', message: '' });
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Simulate submission — in production, wire to email API or backend
        await new Promise((r) => setTimeout(r, 1200));
        setLoading(false);
        setSubmitted(true);
    };

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-5xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <MessageSquare size={22} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Get In Touch</p>
                            <h1 className="text-3xl font-black">Contact Us</h1>
                        </div>
                    </div>
                    <p className="text-muted-foreground mb-12 max-w-lg">
                        Have a question or need help? Our team is here to assist businesses across Europe and the Gulf.
                    </p>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                        {/* Contact Info */}
                        <div className="space-y-4">
                            {CONTACT_INFO.map((item) => {
                                const Icon = item.icon;
                                const content = (
                                    <div className="flex items-start gap-4 p-5 bg-card border border-border/50 rounded-2xl hover:border-primary/30 transition-colors">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                                            <Icon size={18} />
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">{item.label}</p>
                                            <p className="text-sm font-bold">{item.value}</p>
                                        </div>
                                    </div>
                                );
                                return item.href ? (
                                    <a key={item.label} href={item.href}>{content}</a>
                                ) : (
                                    <div key={item.label}>{content}</div>
                                );
                            })}

                            <div className="p-5 bg-primary/5 border border-primary/20 rounded-2xl">
                                <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">For Urgent Issues</p>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    For payment disputes or account security concerns, please include your order number or account email in your message for faster resolution.
                                </p>
                            </div>
                        </div>

                        {/* Contact Form */}
                        <div className="lg:col-span-2">
                            {submitted ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-10 bg-card border border-border/50 rounded-2xl"
                                >
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-5">
                                        <CheckCircle2 size={32} className="text-emerald-500" />
                                    </div>
                                    <h2 className="text-2xl font-black mb-3">Message Received!</h2>
                                    <p className="text-muted-foreground mb-8 max-w-sm">
                                        Thank you for reaching out. We'll get back to you at <strong>{form.email}</strong> within 24 business hours.
                                    </p>
                                    <Link href="/" className="h-11 px-8 bg-primary text-primary-foreground text-sm font-black rounded-xl hover:bg-primary/90 transition-colors inline-flex items-center">
                                        Back to Platform
                                    </Link>
                                </motion.div>
                            ) : (
                                <form onSubmit={handleSubmit} className="bg-card border border-border/50 rounded-2xl p-8 space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="text-xs font-black uppercase tracking-wider text-muted-foreground block mb-2">Full Name *</label>
                                            <input
                                                required
                                                value={form.name}
                                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                                placeholder="John Smith"
                                                className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-black uppercase tracking-wider text-muted-foreground block mb-2">Business Email *</label>
                                            <input
                                                required
                                                type="email"
                                                value={form.email}
                                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                                placeholder="john@company.com"
                                                className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-black uppercase tracking-wider text-muted-foreground block mb-2">Company Name</label>
                                        <input
                                            value={form.company}
                                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                                            placeholder="Your Company Ltd."
                                            className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black uppercase tracking-wider text-muted-foreground block mb-2">Topic *</label>
                                        <select
                                            required
                                            value={form.topic}
                                            onChange={(e) => setForm({ ...form, topic: e.target.value })}
                                            className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                                        >
                                            <option value="">Select a topic...</option>
                                            {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-black uppercase tracking-wider text-muted-foreground block mb-2">Message *</label>
                                        <textarea
                                            required
                                            rows={5}
                                            value={form.message}
                                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                                            placeholder="Describe your question or issue in detail..."
                                            className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full h-12 bg-primary text-primary-foreground font-black rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                                    >
                                        {loading ? (
                                            <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Sending...</span>
                                        ) : (
                                            <><Send size={15} /> Send Message</>
                                        )}
                                    </button>
                                    <p className="text-xs text-muted-foreground text-center">
                                        By submitting this form you agree to our{' '}
                                        <Link href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>.
                                    </p>
                                </form>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
