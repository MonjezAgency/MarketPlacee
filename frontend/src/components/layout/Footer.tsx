'use client';

import * as React from 'react';
import Link from 'next/link';
import { Facebook, Twitter, Instagram, Linkedin, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';

function cn(...classes: string[]) {
    return classes.filter(Boolean).join(' ');
}

export default function Footer() {
    const [email, setEmail] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [success, setSuccess] = React.useState(false);
    const { t, locale } = useLanguage();

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast.error(locale === 'ar' ? 'البريد الإلكتروني غير صالح' : 'Please enter a valid email address');
            return;
        }

        setLoading(true);
        try {
            const res = await apiFetch('/newsletter/subscribe', {
                method: 'POST',
                body: JSON.stringify({
                    email,
                    source: 'Homepage Footer'
                })
            });

            if (res.ok) {
                setSuccess(true);
                toast.success(
                    locale === 'ar' ? 'تم الاشتراك في النشرة بنجاح!' : 'Successfully subscribed to newsletter!',
                    {
                        icon: '🚀',
                        style: { borderRadius: '12px', background: '#0F172A', color: '#fff', fontSize: '14px', fontWeight: 'bold' }
                    }
                );
                setEmail('');
                // Reset success state after 4s so user can subscribe again later
                setTimeout(() => setSuccess(false), 4000);
            } else {
                // Parse error message from backend
                let message = locale === 'ar' ? 'فشل الاشتراك. يرجى المحاولة مرة أخرى.' : 'Subscription failed. Please try again.';
                try {
                    const data = await res.json();
                    const backendMsg = (data?.message || '').toString().toLowerCase();
                    if (res.status === 409 || backendMsg.includes('already subscribed')) {
                        message = locale === 'ar'
                            ? 'هذا البريد الإلكتروني مشترك بالفعل في النشرة.'
                            : 'This email is already subscribed to our newsletter.';
                    } else if (data?.message) {
                        message = data.message;
                    }
                } catch (_e) { /* keep default message */ }
                toast.error(message, {
                    icon: 'ℹ️',
                    style: { borderRadius: '12px', background: '#0F172A', color: '#fff', fontSize: '14px', fontWeight: 'bold' }
                });
            }
        } catch (error) {
            toast.error(locale === 'ar' ? 'خطأ في الاتصال. يرجى المحاولة مرة أخرى.' : 'Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <footer className="bg-[#0F172A] text-[#CBD5F5] pt-16 pb-8">
            <div className="max-w-[1440px] mx-auto px-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-16 pb-12 border-b border-white/10">
                    <div className="space-y-2 text-center md:text-left">
                        <h4 className="text-white text-[22px] font-black tracking-tight flex items-center gap-2 justify-center md:justify-start">
                            {locale === 'ar' ? 'انضم إلى مستقبل التجارة' : 'Join the Future of B2B'}
                        </h4>
                        <p className="text-[14px] opacity-70 font-medium">
                            {locale === 'ar' ? 'اشترك للحصول على رؤى التجارة العالمية وعروض الجملة الحصرية.' : 'Subscribe for global trade insights and exclusive wholesale deals.'}
                        </p>
                    </div>
                    <form onSubmit={handleSubscribe} className="flex w-full max-w-lg bg-white/5 rounded-[16px] p-1.5 border border-white/10 focus-within:border-[#2EC4B6] focus-within:bg-white/10 transition-all shadow-2xl">
                        <input 
                            type="email" 
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={locale === 'ar' ? 'أدخل بريدك الإلكتروني' : 'Enter your business email'}
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
                                <>{locale === 'ar' ? 'تم الاشتراك' : 'Subscribed'} <CheckCircle2 size={18} /></>
                            ) : (
                                <>{locale === 'ar' ? 'اشترك' : 'Subscribe'} <Send size={16} /></>
                            )}
                        </button>
                    </form>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
                    <div className="col-span-1 space-y-6">
                        <Link href="/" className="flex items-center gap-3">
                            <img src="/icon.png" alt="Atlantis" className="w-9 h-9 object-contain rounded-xl" />
                            <span className="text-[22px] font-black tracking-tighter uppercase">
                                <span className="text-white">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
                            </span>
                        </Link>
                        <p className="text-[13px] leading-relaxed max-w-xs opacity-70">
                            {t('footer', 'description')}
                        </p>
                        <div className="flex gap-4">
                            {[Linkedin, Facebook, Twitter, Instagram].map((Icon, i) => (
                                <a key={i} href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#2EC4B6] hover:text-white transition-all border border-white/10 hover:border-[#2EC4B6]">
                                    <Icon size={18} />
                                </a>
                            ))}
                        </div>
                    </div>

                    <div className="col-span-1">
                        <h4 className="text-white text-[14px] font-bold mb-6">{t('footer', 'sourcing')}</h4>
                        <ul className="space-y-4 text-[13px] opacity-70">
                            <li><Link href="/how-it-works" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'howItWorks')}</Link></li>
                            <li><Link href="/categories" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'browseCategories')}</Link></li>
                            <li><Link href="/auth/register" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'registerSupplier')}</Link></li>
                            <li><Link href="/deals" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'bulkWholesale')}</Link></li>
                        </ul>
                    </div>

                    <div className="col-span-1">
                        <h4 className="text-white text-[14px] font-bold mb-6">{t('footer', 'support')}</h4>
                        <ul className="space-y-4 text-[13px] opacity-70">
                            <li><Link href="/help" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'helpCenter')}</Link></li>
                            <li><Link href="/shipping" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'shippingPolicy')}</Link></li>
                            <li><Link href="/returns" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'returnsRefunds')}</Link></li>
                            <li><Link href="/trade-assurance" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">Trade Assurance</Link></li>
                        </ul>
                    </div>

                    <div className="col-span-1">
                        <h4 className="text-white text-[14px] font-bold mb-6">{t('footer', 'aboutUs')}</h4>
                        <ul className="space-y-4 text-[13px] opacity-70">
                            <li><Link href="/about" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'aboutUs')}</Link></li>
                            <li><Link href="/news" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'brandSpotlights')}</Link></li>
                            <li><Link href="/contact" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'contactUs')}</Link></li>
                        </ul>
                    </div>

                    <div className="col-span-1">
                        <h4 className="text-white text-[14px] font-bold mb-6">{t('footer', 'terms')}</h4>
                        <ul className="space-y-4 text-[13px] opacity-70">
                            <li><Link href="/terms" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'terms')}</Link></li>
                            <li><Link href="/privacy" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'privacy')}</Link></li>
                            <li><Link href="/cookies" className="hover:text-[#2EC4B6] hover:translate-x-1 transition-all inline-block">{t('footer', 'cookies')}</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/10 pt-8">
                    <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-[12px] opacity-60">
                        <p>{t('footer', 'copyright')}</p>
                        <span className="hidden md:block text-white/10">|</span>
                        <p className="flex items-center gap-1">
                            {t('footer', 'developedBy')}
                        </p>
                    </div>
                    <div className="flex items-center gap-6 text-[12px] opacity-60 uppercase font-black">
                        <span>{locale}</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
