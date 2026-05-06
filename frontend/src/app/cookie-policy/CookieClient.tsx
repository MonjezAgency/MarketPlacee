'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Cookie, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';

const COOKIE_TYPES = [
    {
        name: 'Strictly Necessary Cookies',
        required: true,
        description: 'These cookies are essential for the Platform to function correctly. They include authentication session cookies, security tokens, and CSRF protection. These cannot be disabled.',
        examples: [
            { name: 'token', purpose: 'Stores your authentication access token (HttpOnly, 15 min expiry)', duration: '15 minutes' },
            { name: 'refreshToken', purpose: 'Stores your secure refresh token for session renewal (HttpOnly)', duration: '7 days' },
            { name: '__Host-next-auth.*', purpose: 'Next.js session management', duration: 'Session' },
        ],
    },
    {
        name: 'Functional Cookies',
        required: false,
        description: 'These cookies enable enhanced functionality and personalization, such as remembering your language preference and cart contents.',
        examples: [
            { name: 'atlantis-locale', purpose: 'Stores your language preference (English/Arabic)', duration: '1 year' },
            { name: 'atlantis-cart', purpose: 'Stores your shopping cart contents across sessions', duration: '7 days' },
            { name: 'atlantis-cookie-consent', purpose: 'Remembers your cookie consent choice', duration: '1 year' },
        ],
    },
    {
        name: 'Analytics Cookies',
        required: false,
        description: 'These cookies help us understand how visitors interact with the Platform so we can improve it. Data is aggregated and anonymized.',
        examples: [
            { name: 'Platform analytics', purpose: 'Page views, session duration, feature usage (no third-party trackers)', duration: '90 days' },
        ],
    },
];

export default function CookiePolicyPage() {
    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-4xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-[#FF9900]/10 flex items-center justify-center">
                            <Cookie size={22} className="text-[#FF9900]" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Legal</p>
                            <h1 className="text-3xl font-black">Cookie Policy</h1>
                        </div>
                    </div>
                    <p className="text-muted-foreground mb-12">Last updated: April 2026</p>

                    <div className="space-y-6 mb-12 text-sm text-muted-foreground leading-relaxed">
                        <p>
                            This Cookie Policy explains how Atlantis FMCG uses cookies and similar tracking technologies on our B2B marketplace platform. By accepting cookies in the consent banner, you agree to our use of non-essential cookies as described here.
                        </p>
                        <p>
                            A cookie is a small text file placed on your device by a website. Cookies help websites remember your preferences, keep you logged in, and collect analytics data.
                        </p>
                    </div>

                    <div className="space-y-8 mb-16">
                        {COOKIE_TYPES.map((type) => (
                            <div key={type.name} className="border border-border/50 rounded-2xl overflow-hidden">
                                <div className="flex items-center justify-between p-6 bg-card">
                                    <div className="flex items-center gap-3">
                                        <h2 className="font-black">{type.name}</h2>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-bold">
                                        {type.required ? (
                                            <span className="flex items-center gap-1.5 text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                                                <CheckCircle2 size={13} /> Always Active
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                                                <XCircle size={13} /> Optional
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-6 pt-0 border-t border-border/50">
                                    <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{type.description}</p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-border/50">
                                                    <th className="text-left py-2 pr-4 font-bold text-foreground/80">Cookie Name</th>
                                                    <th className="text-left py-2 pr-4 font-bold text-foreground/80">Purpose</th>
                                                    <th className="text-left py-2 font-bold text-foreground/80">Duration</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {type.examples.map((ex) => (
                                                    <tr key={ex.name} className="border-b border-border/30 last:border-0">
                                                        <td className="py-3 pr-4 font-mono text-primary">{ex.name}</td>
                                                        <td className="py-3 pr-4 text-muted-foreground leading-relaxed">{ex.purpose}</td>
                                                        <td className="py-3 text-muted-foreground whitespace-nowrap">{ex.duration}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <section className="border-b border-border/50 pb-10 mb-10">
                        <h2 className="text-lg font-black mb-4">Managing Your Cookie Preferences</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                            You can change your cookie preferences at any time:
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
                            <li>Use the cookie consent banner when you first visit the Platform</li>
                            <li>Clear cookies in your browser settings — this will log you out of the Platform</li>
                            <li>Most browsers allow you to block or delete cookies in their privacy settings</li>
                        </ul>
                        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                            Note: disabling strictly necessary cookies will prevent you from logging in and using the Platform.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="text-lg font-black mb-4">Third-Party Cookies</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            The Atlantis Platform does not embed third-party advertising cookies or social media tracking pixels. Stripe may set cookies for payment security verification when you complete a checkout. These are governed by <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stripe's Privacy Policy</a>.
                        </p>
                    </section>

                    <div className="mt-12 p-8 bg-card border border-border/50 rounded-2xl text-center space-y-4">
                        <p className="text-sm font-bold">Cookie questions?</p>
                        <p className="text-sm text-muted-foreground">Email us at <a href="mailto:Info@atlantisfmcg.com" className="text-primary hover:underline font-bold">Info@atlantisfmcg.com</a></p>
                        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
                            <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
                            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
