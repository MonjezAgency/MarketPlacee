'use client';

import * as React from 'react';
import Link from 'next/link';
import { Facebook, Twitter, Instagram, Linkedin, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiFetch } from '@/lib/api';

function cn(...classes: string[]) {
    return classes.filter(Boolean).join(' ');
}

export default function Footer() {
    const [email, setEmail] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [success, setSuccess] = React.useState(false);

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        
        setLoading(true);
        try {
            // Call the real newsletter API
            await apiFetch('/newsletter/subscribe', { 
                method: 'POST', 
                body: JSON.stringify({ 
                    email,
                    source: 'Homepage Footer'
                }) 
            });
            
            setSuccess(true);
            toast.success('Successfully subscribed to newsletter!', {
                icon: '🚀',
                style: { borderRadius: '12px', background: '#0F172A', color: '#fff', fontSize: '14px', fontWeight: 'bold' }
            });
            setEmail('');
        } catch (error) {
            toast.error('Subscription failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <footer className="bg-[#0F172A] text-[#CBD5F5] pt-16 pb-8">
            <div className="max-w-[1440px] mx-auto px-6">
                {/* 1. CHIC NEWSLETTER SECTION (Above Links) */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-16 pb-12 border-b border-white/10">
                    <div className="space-y-2 text-center md:text-left">
                        <h4 className="text-white text-[22px] font-black tracking-tight flex items-center gap-2 justify-center md:justify-start">
                            Join the <span className="text-[#2EC4B6]">Future</span> of B2B
                        </h4>
                        <p className="text-[14px] opacity-70 font-medium">Subscribe for global trade insights and exclusive wholesale deals.</p>
                    </div>
                    <form onSubmit={handleSubscribe} className="flex w-full max-w-lg bg-white/5 rounded-[16px] p-1.5 border border-white/10 focus-within:border-[#2EC4B6] focus-within:bg-white/10 transition-all shadow-2xl">
                        <input 
                            type="email" 
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your business email"
                            className="flex-1 bg-transparent border-none outline-none px-5 py-3 text-[14px] text-white placeholder:text-white/30"
                        />
                        <button 
                            disabled={loading || success}
                            className={cn(
                                "px-8 py-3 rounded-[12px] text-[14px] font-bold transition-all flex items-center gap-2 active:scale-95 shadow-xl",
                                success 
                                    ? "bg-[#10B981] text-white" 
                                    : "bg-[#2EC4B6] hover:brightness-110 text-white shadow-[#2EC4B6]/20"
                            )}
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : success ? (
                                <>Subscribed <CheckCircle2 size={18} /></>
                            ) : (
                                <>Subscribe <Send size={16} /></>
                            )}
                        </button>
                    </form>
                </div>

                {/* 2. MAIN LINKS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
                    {/* Brand Column */}
                    <div className="col-span-1 space-y-6">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#2EC4B6] flex items-center justify-center shadow-lg shadow-[#2EC4B6]/20">
                                <img src="/icon.png" alt="Atlantis" className="w-6 h-6 object-contain" />
                            </div>
                            <span className="text-[22px] font-black tracking-tighter uppercase">
                                <span className="text-white">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
                            </span>
                        </Link>
                        <p className="text-[13px] leading-relaxed max-w-xs opacity-70">
                            Connecting businesses worldwide with quality products, reliable suppliers, and seamless wholesale solutions.
                        </p>
                        <div className="flex gap-4">
                            {[Linkedin, Facebook, Twitter, Instagram].map((Icon, i) => (
                                <a key={i} href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#2EC4B6] hover:text-white transition-all border border-white/10 hover:border-[#2EC4B6]">
                                    <Icon size={18} />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Links Columns */}
                    <div className="col-span-1">
                        <h4 className="text-white text-[14px] font-bold mb-6">Platform</h4>
                        <ul className="space-y-4 text-[13px] opacity-70">
                            <li><Link href="/how-it-works" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">How it Works</Link></li>
                            <li><Link href="/categories" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">For Buyers</Link></li>
                            <li><Link href="/auth/register" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">For Suppliers</Link></li>
                            <li><Link href="/deals" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Bulk Orders</Link></li>
                            <li><Link href="/contact" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Request a Quote</Link></li>
                        </ul>
                    </div>

                    <div className="col-span-1">
                        <h4 className="text-white text-[14px] font-bold mb-6">Resources</h4>
                        <ul className="space-y-4 text-[13px] opacity-70">
                            <li><Link href="/help" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Help Center</Link></li>
                            <li><Link href="/shipping" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Shipping Info</Link></li>
                            <li><Link href="/returns" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Returns & Refunds</Link></li>
                            <li><Link href="/trade-assurance" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Trade Assurance</Link></li>
                            <li><Link href="/api-docs" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">API & Integrations</Link></li>
                        </ul>
                    </div>

                    <div className="col-span-1">
                        <h4 className="text-white text-[14px] font-bold mb-6">Company</h4>
                        <ul className="space-y-4 text-[13px] opacity-70">
                            <li><Link href="/about" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">About Us</Link></li>
                            <li><Link href="/careers" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Careers</Link></li>
                            <li><Link href="/news" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">News & Blog</Link></li>
                            <li><Link href="/contact" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Contact Us</Link></li>
                        </ul>
                    </div>

                    <div className="col-span-1">
                        <h4 className="text-white text-[14px] font-bold mb-6">Legal</h4>
                        <ul className="space-y-4 text-[13px] opacity-70">
                            <li><Link href="/terms" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Terms of Service</Link></li>
                            <li><Link href="/privacy" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Privacy Policy</Link></li>
                            <li><Link href="/cookies" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Cookie Policy</Link></li>
                            <li><Link href="/compliance" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Compliance</Link></li>
                        </ul>
                    </div>
                </div>

                {/* 3. BOTTOM BAR */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/10 pt-8">
                    <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-[12px] opacity-60">
                        <p>© 2024 Atlantis Marketplace. All rights reserved.</p>
                        <span className="hidden md:block text-white/10">|</span>
                        <p className="flex items-center gap-1">
                            Created with ❤️ by <span className="text-[#2EC4B6] font-black tracking-tighter">MONJEZ</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-6 text-[12px] opacity-60">
                        <button className="hover:text-white transition-colors">English (EN)</button>
                        <button className="hover:text-white transition-colors">USD ($)</button>
                    </div>
                </div>
            </div>
        </footer>
    );
}
