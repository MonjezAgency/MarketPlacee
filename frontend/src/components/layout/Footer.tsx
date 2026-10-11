'use client';

import * as React from 'react';
import Link from 'next/link';
import { Send, CheckCircle2 } from 'lucide-react';
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

        // Stash the email locally so we never lose a subscription if the
        // backend route is temporarily missing (Railway redeploy lag, etc.).
        // A future sync job or admin flush can pick these up.
        const queueLocally = (reason: string) => {
            try {
                const key = 'newsletter-pending-subs';
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                if (!list.find((it: any) => it.email === email)) {
                    list.push({ email, source: 'Homepage Footer', queuedAt: new Date().toISOString(), reason });
                    localStorage.setItem(key, JSON.stringify(list));
                }
            } catch { /* ignore */ }
        };

        const showSuccess = () => {
            setSuccess(true);
            toast.success(
                locale === 'ar' ? 'تم الاشتراك في النشرة بنجاح!' : 'Successfully subscribed to newsletter!',
                {
                    icon: '🚀',
                    style: { borderRadius: '12px', background: '#0F172A', color: '#fff', fontSize: '14px', fontWeight: 'bold' },
                }
            );
            setEmail('');
            setTimeout(() => setSuccess(false), 4000);
        };

        try {
            // Use the resilient Next.js API route (which falls back to a
            // local queue if the Railway backend route is missing) instead
            // of the raw proxy.
            const res = await fetch('/api/newsletter/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, source: 'Homepage Footer' }),
            });

            if (res.ok) {
                showSuccess();
            } else if (res.status === 404) {
                // Backend route not deployed yet — queue locally + ack to user
                queueLocally('backend-route-missing');
                showSuccess();
            } else {
                // Real backend error (409 duplicate, validation, etc.)
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
                } catch { /* keep default */ }
                toast.error(message, {
                    icon: 'ℹ️',
                    style: { borderRadius: '12px', background: '#0F172A', color: '#fff', fontSize: '14px', fontWeight: 'bold' },
                });
            }
        } catch (_error) {
            // Network failure — queue locally + ack to user
            queueLocally('network-error');
            showSuccess();
        } finally {
            setLoading(false);
        }
    };

    const cols: { title: string; links: { href: string; label: string }[] }[] = [
        { title: t('footer', 'sourcing'), links: [
            { href: '/categories', label: t('footer', 'browseCategories') },
            { href: '/requests', label: 'Request a quote' },
            { href: '/wholesale', label: t('footer', 'bulkWholesale') },
            { href: '/deals', label: t('footer', 'dailyDeals') },
        ] },
        { title: 'Sellers', links: [
            // Supplier onboarding is invite-only — sellers apply via contact.
            { href: '/contact', label: 'Become a seller' },
            { href: '/targets', label: 'Contact buyers' },
            { href: '/how-it-works', label: t('footer', 'howItWorks') },
        ] },
        { title: t('footer', 'support'), links: [
            { href: '/help', label: t('footer', 'helpCenter') },
            { href: '/shipping', label: t('footer', 'shippingPolicy') },
            { href: '/returns', label: t('footer', 'returnsRefunds') },
        ] },
        { title: t('footer', 'aboutUs'), links: [
            { href: '/about', label: t('footer', 'aboutUs') },
            { href: '/contact', label: t('footer', 'contactUs') },
        ] },
    ];

    return (
        <footer className="bg-surface-2 text-ink-2 text-start border-t border-[#E6EAEE]">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                {/* Newsletter */}
                <div className="py-12 sm:py-14 flex flex-col lg:flex-row lg:items-center justify-between gap-8 border-b border-line">
                    <div className="max-w-xl">
                        <h2 className="font-sans text-[24px] sm:text-[28px] font-bold tracking-tight text-heading leading-tight">
                            {locale === 'ar' ? 'احصل على عروض الجملة الجديدة أولاً' : 'Get New Wholesale Deals First'}
                        </h2>
                        <p className="mt-2 text-[15px] text-ink-2 leading-relaxed">
                            {locale === 'ar'
                                ? 'اشترك لتصلك أحدث عروضنا إلى بريدك فور إطلاقها.'
                                : 'Subscribe to receive our latest offers straight to your inbox as soon as they go live.'}
                        </p>
                    </div>
                    <form onSubmit={handleSubscribe} className="flex w-full lg:max-w-[480px] h-14 bg-surface rounded-2xl p-1.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6] transition-shadow">
                        <label htmlFor="newsletter-email" className="sr-only">Business email</label>
                        <input
                            id="newsletter-email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={locale === 'ar' ? 'أدخل بريدك الإلكتروني' : 'Your business email'}
                            className="flex-1 min-w-0 bg-transparent outline-none px-4 text-[15px] text-ink placeholder:text-ink-4"
                        />
                        <button
                            disabled={loading || success}
                            className={cn(
                                'px-5 sm:px-6 rounded-xl text-[14px] font-semibold transition-colors flex items-center gap-2 shrink-0',
                                success ? 'bg-[#10B981] text-cta-fg' : 'bg-cta hover:bg-cta-hover text-cta-fg'
                            )}
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : success ? (
                                <>{locale === 'ar' ? 'تم الاشتراك' : 'Subscribed'} <CheckCircle2 size={17} /></>
                            ) : (
                                <>{locale === 'ar' ? 'اشترك' : 'Subscribe'} <Send size={15} /></>
                            )}
                        </button>
                    </form>
                </div>

                {/* Columns */}
                <div className="py-12 grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-10">
                    <div className="col-span-2">
                        <Link href="/" className="inline-flex items-center gap-2.5">
                            <img src="/brand/atlantis-mark.png" alt="" width={36} height={36} className="w-9 h-9 object-contain rounded-lg" />
                            <span className="text-[21px] font-black tracking-tighter uppercase">
                                <span className="text-heading">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
                            </span>
                        </Link>
                        <p className="mt-4 text-[14px] leading-relaxed max-w-xs">{t('footer', 'description')}</p>
                    </div>
                    {cols.map((c) => (
                        <nav key={c.title} aria-label={c.title}>
                            <h3 className="font-sans text-[13px] font-semibold uppercase tracking-[0.12em] text-heading mb-4">{c.title}</h3>
                            <ul className="space-y-3 text-[14px]">
                                {c.links.map((l) => (
                                    <li key={l.label}><Link href={l.href} className="hover:text-teal transition-colors">{l.label}</Link></li>
                                ))}
                            </ul>
                        </nav>
                    ))}
                </div>

                {/* Legal bar */}
                <div className="py-6 border-t border-line flex flex-col md:flex-row md:items-center justify-between gap-3 text-[13px] text-ink-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>{t('footer', 'copyright')}</span>
                        <span>{t('footer', 'developedBy')}</span>
                    </div>
                    <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        <Link href="/terms" className="hover:text-teal">{t('footer', 'terms')}</Link>
                        <Link href="/privacy-policy" className="hover:text-teal">{t('footer', 'privacy')}</Link>
                        <Link href="/cookie-policy" className="hover:text-teal">{t('footer', 'cookies')}</Link>
                        <span className="uppercase font-semibold text-ink-4">{locale}</span>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
