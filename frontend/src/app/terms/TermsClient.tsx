'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { FileText, ArrowLeft } from 'lucide-react';

const SECTIONS = [
    {
        title: '1. Acceptance of Terms',
        content: `By registering for, accessing, or using the Atlantis platform (the "Platform"), you agree to be bound by these Terms of Service ("Terms"). If you are accepting these Terms on behalf of a company or other legal entity, you represent that you have authority to bind that entity.

If you do not agree to these Terms, you may not access or use the Platform.

These Terms were last updated in April 2026.`,
    },
    {
        title: '2. Platform Description',
        content: `Atlantis is a B2B wholesale marketplace that connects verified suppliers with business buyers. The Platform facilitates:

• Product discovery and sourcing
• Secure order placement and payment via Stripe escrow
• Supplier payouts after confirmed delivery
• KYC-verified business relationships

Atlantis acts as a technology intermediary. We are not a party to transactions between buyers and suppliers except to the extent of facilitating payment processing and dispute resolution.`,
    },
    {
        title: '3. Eligibility',
        content: `The Platform is available exclusively to business entities (B2B). By registering, you confirm that:

• You are registering on behalf of a legally registered business
• You are at least 18 years of age and have legal authority to enter into contracts
• Your business is not located in a sanctioned jurisdiction
• You will provide accurate, complete, and current information during registration and KYC

We reserve the right to refuse access to any entity at our sole discretion.`,
    },
    {
        title: '4. Account Registration and KYC',
        content: `4.1 All accounts require approval from the Atlantis team before activation.

4.2 Suppliers must complete full KYC verification (identity documents, business registration, liveness check) before listing products or receiving payments.

4.3 You are responsible for maintaining the security of your account credentials. You must notify us immediately at Info@atlantisfmcg.com if you suspect unauthorized access.

4.4 Atlantis reserves the right to suspend or terminate accounts that provide false information during KYC, violate these Terms, or pose a security or fraud risk.`,
    },
    {
        title: '5. Supplier Obligations',
        content: `By listing products on the Platform, Suppliers agree to:

• Provide accurate product descriptions, pricing, minimum order quantities (MOQ), and stock levels
• Honor all accepted orders at the listed price and terms
• Ship orders within the timeframe communicated to the buyer
• Maintain a connected Stripe account for receiving payments
• Comply with all applicable EU and national product safety, labeling, and customs regulations
• Not list counterfeit, prohibited, or restricted products
• Keep product listings up to date and remove out-of-stock items promptly

Atlantis reserves the right to remove listings or suspend suppliers that violate these obligations.`,
    },
    {
        title: '6. Buyer Obligations',
        content: `By placing orders on the Platform, Buyers agree to:

• Provide accurate shipping addresses and contact information
• Complete payment at the time of order placement
• Confirm delivery honestly — confirming delivery triggers the release of escrow funds to the Supplier
• Raise disputes within 7 days of delivery confirmation if goods are damaged, missing, or not as described
• Not attempt to reverse legitimate charges or abuse the dispute system`,
    },
    {
        title: '7. Payments, Escrow, and Fees',
        content: `7.1 All payments are processed via Stripe, Inc. and are subject to Stripe's Terms of Service.

7.2 When a buyer places an order, payment is held in escrow (Stripe manual capture) until the buyer confirms delivery.

7.3 Upon delivery confirmation, Atlantis releases payment to the Supplier minus the Platform Commission fee.

7.4 The Platform Commission rate is set by Atlantis and may change with 30 days' notice. The rate applicable at the time of order applies to that order.

7.5 Atlantis does not store card details. All card processing is handled exclusively by Stripe (PCI DSS compliant).

7.6 Refunds are subject to the outcome of the dispute resolution process (see Section 9).`,
    },
    {
        title: '8. Product Listings and Intellectual Property',
        content: `8.1 Suppliers retain ownership of their product content but grant Atlantis a worldwide, royalty-free license to display, reproduce, and promote that content on the Platform.

8.2 Atlantis retains all intellectual property rights in the Platform itself, including its design, software, and branding.

8.3 You may not copy, scrape, or reproduce Platform content without prior written consent.`,
    },
    {
        title: '9. Disputes',
        content: `9.1 Buyers may open a dispute within 7 days of delivery confirmation if goods are not as described, damaged, or missing.

9.2 Disputes are reviewed by the Atlantis support team. Both parties will be given the opportunity to provide evidence.

9.3 Atlantis will make a final determination within a reasonable timeframe. This determination may result in a full or partial refund, or release of escrow to the Supplier.

9.4 Atlantis's dispute resolution is a platform service and does not waive any legal rights either party may have.`,
    },
    {
        title: '10. Prohibited Activities',
        content: `You may not use the Platform to:

• Facilitate transactions for illegal goods or services
• Commit fraud, money laundering, or other financial crimes
• Circumvent the platform's payment system (e.g., arranging off-platform payment to avoid commission)
• Engage in deceptive or manipulative practices
• Reverse-engineer, scrape, or attack the Platform
• Violate any applicable law or regulation

Violation of these prohibitions may result in immediate account termination and may be reported to relevant authorities.`,
    },
    {
        title: '11. Limitation of Liability',
        content: `To the maximum extent permitted by applicable law, Atlantis shall not be liable for:

• Indirect, incidental, or consequential damages arising from use of the Platform
• Loss of profits, data, or business opportunity
• Disputes between buyers and suppliers regarding product quality, shipping, or delivery
• Platform downtime or service interruptions beyond our reasonable control

Our total liability to you shall not exceed the total fees paid by you to Atlantis in the 12 months preceding the claim.

Nothing in these Terms excludes liability for death or personal injury caused by negligence, fraud, or any other liability that cannot be excluded under applicable law.`,
    },
    {
        title: '12. Termination',
        content: `12.1 You may close your account at any time by contacting Info@atlantisfmcg.com.

12.2 Atlantis may suspend or terminate your account with notice if you violate these Terms, or immediately if we reasonably suspect fraud or illegal activity.

12.3 Upon termination, your access to the Platform ceases. Outstanding orders and escrow transactions will be handled per these Terms.

12.4 Sections 8, 11, 13, and 14 survive termination.`,
    },
    {
        title: '13. Governing Law',
        content: `These Terms are governed by the laws of Romania and applicable European Union law. Any disputes that cannot be resolved through our internal dispute process shall be subject to the exclusive jurisdiction of the courts of Romania.

EU consumers may also contact the European Online Dispute Resolution platform at ec.europa.eu/consumers/odr.`,
    },
    {
        title: '14. Changes to Terms',
        content: `We may update these Terms from time to time. We will notify registered users of material changes at least 30 days in advance via email or in-platform notification. Continued use of the Platform after the effective date constitutes acceptance of the revised Terms.`,
    },
    {
        title: '15. Contact',
        content: `Atlantis FMCG
Email: Info@atlantisfmcg.com
Platform: marketpl7ce.vercel.app`,
    },
];

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-16 max-w-4xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
                        <ArrowLeft size={16} /> Back to Home
                    </Link>

                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <FileText size={22} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Legal</p>
                            <h1 className="text-3xl font-black">Terms of Service</h1>
                        </div>
                    </div>
                    <p className="text-muted-foreground mb-12">
                        Last updated: April 2026 &nbsp;·&nbsp; Effective date: April 2026
                    </p>

                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 mb-12">
                        <p className="text-sm leading-relaxed">
                            Please read these Terms of Service carefully before using the Atlantis B2B marketplace. These Terms constitute a legally binding agreement between you and Atlantis FMCG governing your use of the Platform.
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
                        <p className="text-sm font-bold">Questions about these Terms?</p>
                        <p className="text-sm text-muted-foreground">Contact our team at <a href="mailto:Info@atlantisfmcg.com" className="text-primary hover:underline font-bold">Info@atlantisfmcg.com</a></p>
                        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
                            <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
                            <Link href="/cookie-policy" className="hover:text-foreground transition-colors">Cookie Policy</Link>
                            <Link href="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
