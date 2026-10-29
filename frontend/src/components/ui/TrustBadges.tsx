'use client';

import { motion } from 'framer-motion';
import { Truck, ShieldCheck, DollarSign, Headphones } from 'lucide-react';

const badges = [
    {
        icon: <Truck className="w-8 h-8" />,
        title: 'Fast Delivery',
        description: 'Same-day dispatch on orders placed before 2 PM. Nationwide coverage.',
        color: '#3498DB',
    },
    {
        icon: <ShieldCheck className="w-8 h-8" />,
        title: 'Secure Payments',
        description: 'Bank-grade encryption on every transaction. PCI-DSS certified.',
        color: '#27AE60',
    },
    {
        icon: <DollarSign className="w-8 h-8" />,
        title: 'Bulk Pricing',
        description: 'Save up to 40% with wholesale pricing tiers. The more you buy, the more you save.',
        color: '#0E7C74',
    },
    {
        icon: <Headphones className="w-8 h-8" />,
        title: '24/7 Support',
        description: 'Dedicated account managers for your business. Chat, call, or email anytime.',
        color: '#E94560',
    },
];

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.15, delayChildren: 0.2 }
    }
};

const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } }
};

export default function TrustBadges() {
    return (
        <section className="py-20 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A0A15] to-transparent"></div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                >
                    <h2 className="section-title">Why Choose <span className="text-teal">Ali FMCG</span>?</h2>
                    <p className="section-subtitle">
                        Trusted by over 500+ businesses worldwide. We make B2B procurement simple, secure, and scalable.
                    </p>
                </motion.div>

                <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                    variants={container}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true }}
                >
                    {badges.map((badge, i) => (
                        <motion.div key={i} variants={item} className="trust-card group">
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-transform duration-300 group-hover:scale-110"
                                style={{ background: `${badge.color}15`, color: badge.color }}
                            >
                                {badge.icon}
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{badge.title}</h3>
                            <p className="text-sm text-[#B0B0C8] leading-relaxed">{badge.description}</p>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
