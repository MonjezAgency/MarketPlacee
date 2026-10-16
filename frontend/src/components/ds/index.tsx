'use client';

/**
 * Atlantis design-system primitives (see docs/DESIGN_SYSTEM.md).
 * Marketing, trust and policy pages are built from these — not from
 * page-specific spacing, type sizes or button styles.
 */
import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Motion tokens. Durations in seconds (framer-motion). */
export const MOTION = {
    ease: [0.22, 1, 0.36, 1] as const,
    fast: 0.15,
    base: 0.25,
    enter: 0.6,
    stagger: 0.08,
};

/** Page-width container with the standard gutters. */
export function Container({ size = 'page', className, children }: { size?: 'page' | 'content' | 'prose'; className?: string; children: React.ReactNode }) {
    return <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', size === 'page' ? 'max-w-page' : size === 'content' ? 'max-w-content' : 'max-w-prose', className)}>{children}</div>;
}

/** Vertical rhythm for page sections. `tone="muted"` gives the alternate band. */
export function Section({ id, tone = 'plain', size = 'md', className, children, labelledBy }: { id?: string; tone?: 'plain' | 'muted' | 'ink'; size?: 'sm' | 'md' | 'lg'; className?: string; children: React.ReactNode; labelledBy?: string }) {
    return (
        <section id={id} aria-labelledby={labelledBy}
            className={cn(
                size === 'sm' ? 'py-12 sm:py-16' : size === 'lg' ? 'py-20 sm:py-28' : 'py-16 sm:py-24',
                tone === 'muted' && 'bg-surface-2',
                tone === 'ink' && 'bg-heading text-white',
                className,
            )}>
            {children}
        </section>
    );
}

export function Eyebrow({ children, className, pill = false }: { children: React.ReactNode; className?: string; pill?: boolean }) {
    if (pill) return <p className={cn('inline-flex items-center gap-2 h-7 px-3 rounded-full ring-1 ring-line bg-surface text-small font-medium text-ink-2', className)}><span className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6]" aria-hidden />{children}</p>;
    return <p className={cn('text-eyebrow uppercase text-teal', className)}>{children}</p>;
}

/** Section heading block: eyebrow, title (h2 by default) and lead. */
export function SectionHeader({ eyebrow, title, lead, align = 'start', id, as: H = 'h2', className }: { eyebrow?: React.ReactNode; title: React.ReactNode; lead?: React.ReactNode; align?: 'start' | 'center'; id?: string; as?: 'h1' | 'h2'; className?: string }) {
    return (
        <Reveal className={cn(align === 'center' ? 'text-center mx-auto' : 'text-start', 'max-w-2xl', className)}>
            {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
            <H id={id} className={cn('font-sans text-heading', H === 'h1' ? 'text-display-sm sm:text-display' : 'text-title-sm sm:text-title')}>{title}</H>
            {lead && <p className="mt-3 text-body sm:text-lead text-ink-2">{lead}</p>}
        </Reveal>
    );
}

/**
 * Fade-and-rise on first scroll into view. Static when the user prefers reduced motion.
 * `hero`: above-the-fold content — a CSS entrance that runs before hydration, so the
 * first screen is never blank while JavaScript loads.
 */
export function Reveal({ children, className, delay = 0, as = 'div', hero = false }: { children: React.ReactNode; className?: string; delay?: number; as?: 'div' | 'li'; hero?: boolean }) {
    const reduce = useReducedMotion();
    if (hero) {
        const Tag = as;
        return <Tag className={cn('animate-hero-copy', className)} style={delay ? { animationDelay: `${Math.round(delay * 1000)}ms` } : undefined}>{children}</Tag>;
    }
    const M = as === 'li' ? motion.li : motion.div;
    if (reduce) return as === 'li' ? <li className={className}>{children}</li> : <div className={className}>{children}</div>;
    return (
        <M className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: MOTION.enter, ease: MOTION.ease, delay }}>
            {children}
        </M>
    );
}

type BtnProps = { href: string; children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'inverse'; size?: 'md' | 'lg'; arrow?: boolean; className?: string };
/** The one link-button. Primary = navy CTA, secondary = outlined, ghost = text, inverse = on dark bands. */
export function ButtonLink({ href, children, variant = 'primary', size = 'lg', arrow, className }: BtnProps) {
    return (
        <Link href={href} className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2',
            size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-[14px]',
            variant === 'primary' && 'bg-cta hover:bg-cta-hover text-cta-fg',
            variant === 'secondary' && 'bg-surface ring-1 ring-line-strong hover:ring-ink text-heading',
            variant === 'ghost' && 'text-teal hover:underline px-0 h-auto',
            variant === 'inverse' && 'bg-white text-heading hover:bg-white/90',
            className,
        )}>
            {children}{(arrow ?? variant === 'primary') && <ArrowRight size={16} aria-hidden />}
        </Link>
    );
}

export function Pill({ children, tone = 'neutral', icon, className }: { children: React.ReactNode; tone?: 'neutral' | 'teal' | 'success' | 'warning' | 'danger'; icon?: React.ReactNode; className?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 min-h-7 max-w-full px-2.5 py-0.5 rounded-full text-small font-medium ring-1',
            tone === 'neutral' && 'bg-surface ring-line text-ink-2',
            tone === 'teal' && 'bg-teal-soft ring-transparent text-teal',
            tone === 'success' && 'bg-[#ECFDF5] ring-[#A7F3D0] text-[#047857]',
            tone === 'warning' && 'bg-[#FFFBEB] ring-[#FDE68A] text-[#B45309]',
            tone === 'danger' && 'bg-[#FEF2F2] ring-[#FECACA] text-[#B91C1C]',
            className)}>
            {icon}{children}
        </span>
    );
}

export function Faq({ items, className }: { items: { q: string; a: React.ReactNode }[]; className?: string }) {
    return (
        <div className={cn('mx-auto max-w-3xl divide-y divide-line border-y border-line', className)}>
            {items.map((f) => (
                <details key={f.q} className="group py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-subtitle text-heading [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] rounded-md">
                        {f.q}
                        <ChevronDown size={20} className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="mt-3 max-w-prose text-body text-ink-2">{f.a}</div>
                </details>
            ))}
        </div>
    );
}

/** Closing call-to-action band. */
export function CtaBand({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead: React.ReactNode; children: React.ReactNode }) {
    return (
        <Section size="lg">
            <Container size="prose" className="text-center">
                <Reveal>
                    {eyebrow && <Eyebrow pill className="mb-5">{eyebrow}</Eyebrow>}
                    <h2 className="font-sans text-title-sm sm:text-title text-heading">{title}</h2>
                    <p className="mt-3 text-body sm:text-lead text-ink-2">{lead}</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
                </Reveal>
            </Container>
        </Section>
    );
}

/** A soft framed panel for illustrations (the "specimen" look used on trust pages). */
export function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={cn('relative overflow-hidden rounded-3xl ring-1 ring-line bg-surface-2', className)}>{children}</div>;
}

/** Links between the three trust pages. */
export function TrustNav({ current }: { current: 'inspection' | 'payments' | 'warehouses' }) {
    const pages = [
        { key: 'payments', href: '/protected-payments', title: 'Protected Payments', desc: 'What has to happen before money moves.' },
        { key: 'inspection', href: '/goods-inspection', title: 'Goods Inspection', desc: 'What an inspection checks, and how issues are resolved.' },
        { key: 'warehouses', href: '/warehouses', title: 'Warehouses', desc: 'Verified Atlantis hubs in Europe and the Americas.' },
    ].filter((p) => p.key !== current);
    return (
        <Section tone="muted" size="sm">
            <Container size="content" className="grid gap-4 sm:grid-cols-2">
                {pages.map((p) => (
                    <Link key={p.key} href={p.href} className="group rounded-2xl bg-surface ring-1 ring-line p-6 transition-shadow duration-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                        <p className="text-subtitle text-heading inline-flex items-center gap-2">{p.title} <ArrowRight size={16} className="text-teal transition-transform duration-200 group-hover:translate-x-1" aria-hidden /></p>
                        <p className="mt-1 text-body text-ink-3">{p.desc}</p>
                    </Link>
                ))}
            </Container>
        </Section>
    );
}
