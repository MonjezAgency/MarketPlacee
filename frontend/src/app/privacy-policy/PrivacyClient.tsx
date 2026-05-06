'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

const SECTIONS = [
    {
        title: '1. Who We Are',
        content: `Atlantis FMCG ("Atlantis", "we", "our", "us") operates a B2B wholesale marketplace platform available at marketpl7ce.vercel.app. Our registered address is in Romania, and we serve businesses across Europe and the Gulf region.

For privacy-related questions, contact us at: Info@atlantisfmcg.com`,
    },
    {
        title: '2. What Data We Collect',
        content: `We collect information you provide directly:

• Account information: full name, email address, company name, VAT number, phone number
• Identity verification (KYC): national ID, passport copy, selfie/liveness check, business registration documents
• Financial information: IBAN and SWIFT/BIC codes (stored encrypted using AES-256), Stripe Connect account data
• Order and transaction data: purchases, payments, shipping addresses, order history
• Communication data: support messages, dispute submissions, product reviews

We also collect data automatically:
• Usage data: pages visited, features used, session duration
• Technical data: IP address, browser type, device identifiers
• Security data: login attempts, suspicious activity flags`,
    },
    {
        title: '3. How We Use Your Data',
        content: `We use your personal data for the following purposes:

• To create and manage your account (Legal basis: Contract performance)
• To verify your identity and business (KYC) as required by law (Legal basis: Legal obligation)
• To process orders, payments and escrow transactions (Legal basis: Contract performance)
• To communicate about orders, disputes and platform updates (Legal basis: Contract performance / Legitimate interest)
• To detect fraud and ensure platform security (Legal basis: Legitimate interest)
• To comply with EU financial regulations and VAT reporting (Legal basis: Legal obligation)
• To send marketing communications, only with your consent (Legal basis: Consent — you may withdraw at any time)`,
    },
    {
        title: '4. Data Sharing',
        content: `We share your data only in the following circumstances:

• Stripe, Inc. — payment processing and supplier payouts (Stripe's Privacy Policy applies)
• Supabase — secure file storage for KYC documents
• Hostinger — email delivery via SMTP
• Railway — cloud infrastructure (your data is processed within the EU where possible)
• Vercel — frontend hosting
• Other platform users: your company name, product listings, and ratings are visible to other registered users
• Law enforcement: we will disclose information when required by applicable law or court order

We do not sell your personal data to third parties.`,
    },
    {
        title: '5. Data Retention',
        content: `We retain your data for as long as your account is active or as needed to provide services.

• Account data: retained for 7 years after account closure (EU financial regulation requirements)
• KYC documents: retained for 5 years per AML/KYC regulations
• Financial audit logs: retained permanently (append-only records required by regulation)
• Marketing preferences: until you withdraw consent
• Login security logs: 90 days

You may request deletion of your data at any time (subject to legal retention requirements — see Section 7).`,
    },
    {
        title: '6. Your Rights Under GDPR',
        content: `As a resident of the European Economic Area, you have the following rights:

• Right of Access: Request a copy of all data we hold about you
• Right to Rectification: Correct inaccurate or incomplete data
• Right to Erasure ("Right to be Forgotten"): Request deletion of your data (subject to legal retention obligations)
• Right to Data Portability: Receive your data in a structured, machine-readable format
• Right to Restriction: Ask us to limit how we process your data
• Right to Object: Object to processing based on legitimate interests or for direct marketing
• Rights related to automated decision-making: We do not make solely automated decisions with legal effects

To exercise any of these rights, email us at: Info@atlantisfmcg.com

You also have the right to lodge a complaint with your local data protection authority.`,
    },
    {
        title: '7. Security',
        content: `We implement industry-standard security measures including:

• AES-256 encryption for all sensitive financial data (IBAN, SWIFT, 2FA secrets)
• JWT-based authentication with short-lived access tokens (15 minutes) and rotating refresh tokens
• HTTPS/TLS for all data in transit
• Two-factor authentication (2FA) available for all accounts
• Account lockout after repeated failed login attempts
• Continuous threat detection and security monitoring
• PCI DSS-compliant payment processing via Stripe (we never store card data)

Despite these measures, no system is 100% secure. If you believe your account has been compromised, contact us immediately.`,
    },
    {
        title: '8. Cookies',
        content: `We use cookies and similar tracking technologies. For full details, please read our Cookie Policy at /cookie-policy.

Essential cookies are required for the platform to function. You may decline non-essential cookies via the cookie consent banner.`,
    },
    {
        title: '9. International Transfers',
        content: `Your data may be transferred to and processed in countries outside the EEA (for example, Stripe's servers in the United States). Where such transfers occur, we ensure appropriate safeguards are in place, including Standard Contractual Clauses approved by the European Commission.`,
    },
    {
        title: '10. Changes to This Policy',
        content: `We may update this Privacy Policy from time to time. We will notify registered users of material changes by email or via an in-platform notification. The date of the most recent revision is shown below.

Last updated: April 2026`,
    },
    {
        title: '11. Contact Us',
        content: `For any privacy-related questions, requests, or complaints:

Email: Info@atlantisfmcg.com
Platform: marketpl7ce.vercel.app
Data Controller: Atlantis FMCG`,
    },
];

export default function PrivacyPolicyPage() {
    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-4xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Shield size={22} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Legal</p>
                            <h1 className="text-3xl font-black">Privacy Policy</h1>
                        </div>
                    </div>
                    <p className="text-muted-foreground mb-12">
                        Last updated: April 2026 &nbsp;·&nbsp; Effective date: April 2026
                    </p>

                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-12">
                        <p className="text-sm leading-relaxed">
                            This Privacy Policy explains how Atlantis FMCG collects, uses, and protects your personal data when you use our B2B marketplace platform. We are committed to protecting your privacy and complying with the General Data Protection Regulation (GDPR) and applicable European data protection law.
                        </p>
                    </div>

                    <div className="space-y-10">
                        {SECTIONS.map((section) => (
                            <section key={section.title} className="border-b border-border/50 pb-10 last:border-0">
                                <h2 className="text-lg font-black mb-4">{section.title}</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{section.content}</p>
                            </section>
                        ))}
                    </div>

                    <div className="mt-16 p-8 bg-card border border-border/50 rounded-2xl text-center space-y-4">
                        <p className="text-sm font-bold">Questions about this policy?</p>
                        <p className="text-sm text-muted-foreground">Contact our team at <a href="mailto:Info@atlantisfmcg.com" className="text-primary hover:underline font-bold">Info@atlantisfmcg.com</a></p>
                        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
                            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
                            <Link href="/cookie-policy" className="hover:text-foreground transition-colors">Cookie Policy</Link>
                            <Link href="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
