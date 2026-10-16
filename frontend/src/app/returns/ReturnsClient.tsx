'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ShieldCheck, Landmark, AlertOctagon, PackageX, MessageSquareWarning, Camera, Scale, CheckCircle2, XCircle, Clock3, Banknote, Wallet, AlertTriangle, ArrowRight, Mail, Truck, ClipboardCheck } from 'lucide-react';
import { ButtonLink, Container, CtaBand, Eyebrow, Reveal, Section, SectionHeader } from '@/components/ds';
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

/**
 * Returns & Refunds policy. The wording keeps the policy's meaning (steps,
 * eligibility, timelines, fees); the only factual change is where problems
 * are reported — buyers report through Support → Order conversations, the
 * order-level channel that exists today.
 */
const SUPPORT_ORDERS = '/dashboard/customer/support?tab=orders';

const FACTS = [
    { icon: ShieldCheck, t: 'factConfirmedTitle', d: 'factConfirmedBody' },
    { icon: Landmark, t: 'factEscrowTitle', d: 'factEscrowBody' },
    { icon: AlertOctagon, t: 'factReportTitle', d: 'factReportBody' },
];
const STEPS = [
    { icon: PackageX, t: 'step1Title', d: 'step1Body' },
    { icon: MessageSquareWarning, t: 'step2Title', d: 'step2Body' },
    { icon: Camera, t: 'step3Title', d: 'step3Body' },
    { icon: Scale, t: 'step4Title', d: 'step4Body' },
];
const TIMES = [
    { icon: Clock3, t: 'time1Title', v: 'time1Value', d: 'time1Body' },
    { icon: Banknote, t: 'time2Title', v: 'time2Value', d: 'time2Body' },
    { icon: Wallet, t: 'time3Title', v: 'time3Value', d: 'time3Body' },
];

const inlineLink = (href: string) => (c: React.ReactNode) => <Link href={href} className="font-medium text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal">{c}</Link>;

/** The four steps on a rail that fills as the reader scrolls through them. */
function StepRail() {
    const { t } = useLanguage();
    const reduce = useReducedMotion();
    const ref = React.useRef<HTMLOListElement>(null);
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
    const fill = useTransform(scrollYProgress, [0, 1], [0, 1]);
    return (
        <ol ref={ref} className="relative mt-12 space-y-4">
            <span aria-hidden className="absolute top-6 bottom-6 start-[27px] w-px bg-line hidden sm:block" />
            {!reduce && <motion.span aria-hidden style={{ scaleY: fill }} className="absolute top-6 bottom-6 start-[27px] w-px bg-[#2EC4B6] origin-top hidden sm:block" />}
            {STEPS.map((s, i) => (
                <Reveal as="li" key={s.t} delay={i * 0.06} className="relative grid grid-cols-[56px_minmax(0,1fr)] gap-4 sm:gap-6">
                    <span className="relative z-10 w-14 h-14 rounded-2xl bg-surface ring-1 ring-line flex items-center justify-center text-teal shadow-card">
                        <s.icon size={22} aria-hidden />
                    </span>
                    <div className="rounded-2xl ring-1 ring-line bg-surface p-5 sm:p-6">
                        <p className="text-small font-semibold text-teal">{t('returns', 'stepLabel', { n: i + 1 })}</p>
                        <h3 className="mt-1 font-sans text-subtitle text-heading">{t('returns', s.t)}</h3>
                        <p className="mt-2 text-body text-ink-2">
                            <Trans text={t('returns', s.d)} tags={{ link: inlineLink(SUPPORT_ORDERS) }} />
                        </p>
                    </div>
                </Reveal>
            ))}
        </ol>
    );
}

export default function ReturnsClient() {
    const { t } = useLanguage();
    const eligible = [1, 2, 3, 4, 5].map((n) => t('returns', `eligible${n}`));
    const notEligible = [1, 2, 3, 4, 5].map((n) => t('returns', `notEligible${n}`));

    return (
        <main data-no-translate className="min-h-screen bg-surface text-start">
            {/* Hero */}
            <Section size="md" className="border-b border-line">
                <Container size="content">
                    <Reveal hero className="max-w-2xl">
                        <Eyebrow pill>{t('returns', 'eyebrow')}</Eyebrow>
                        <h1 className="mt-5 font-sans text-display-sm sm:text-display text-heading">{t('returns', 'title')}</h1>
                        <p className="mt-5 text-body sm:text-lead text-ink-2">{t('returns', 'lead')}</p>
                    </Reveal>
                    <ul className="mt-12 grid gap-4 md:grid-cols-3">
                        {FACTS.map((f, i) => (
                            <Reveal hero as="li" key={f.t} delay={0.1 + i * 0.06} className="rounded-2xl ring-1 ring-line p-5 sm:p-6">
                                <span className="w-10 h-10 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><f.icon size={18} aria-hidden /></span>
                                <h2 className="font-sans mt-4 text-[16px] leading-snug font-semibold text-heading">{t('returns', f.t)}</h2>
                                <p className="mt-1.5 text-body text-ink-2">{t('returns', f.d)}</p>
                            </Reveal>
                        ))}
                    </ul>
                </Container>
            </Section>

            {/* How it works */}
            <Section labelledBy="how-title">
                <Container size="content">
                    <SectionHeader id="how-title" eyebrow={t('returns', 'howEyebrow')} title={t('returns', 'howTitle')} lead={t('returns', 'howLead')} />
                    <StepRail />
                </Container>
            </Section>

            {/* Eligibility */}
            <Section tone="muted" labelledBy="eligible-title">
                <Container size="content">
                    <SectionHeader id="eligible-title" eyebrow={t('returns', 'eligibleEyebrow')} title={t('returns', 'eligibleTitle')} lead={t('returns', 'eligibleLead')} />
                    <div className="mt-10 grid gap-4 md:grid-cols-2">
                        {[
                            { heading: t('returns', 'eligibleHeading'), items: eligible, ok: true },
                            { heading: t('returns', 'notEligibleHeading'), items: notEligible, ok: false },
                        ].map((col, ci) => (
                            <Reveal key={col.heading} delay={ci * 0.08} className="rounded-2xl bg-surface ring-1 ring-line p-6 sm:p-7">
                                <h3 className="font-sans flex items-center gap-2.5 text-subtitle text-heading">
                                    <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center', col.ok ? 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-[#FEF2F2] text-[#B91C1C] dark:bg-red-500/15 dark:text-red-300')}>
                                        {col.ok ? <CheckCircle2 size={17} aria-hidden /> : <XCircle size={17} aria-hidden />}
                                    </span>
                                    {col.heading}
                                </h3>
                                <ul className="mt-5 divide-y divide-line">
                                    {col.items.map((item) => (
                                        <li key={item} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 text-body text-ink-2">
                                            {col.ok
                                                ? <CheckCircle2 size={16} className="mt-1 shrink-0 text-[#059669]" aria-hidden />
                                                : <XCircle size={16} className="mt-1 shrink-0 text-[#DC2626]" aria-hidden />}
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Reveal>
                        ))}
                    </div>
                </Container>
            </Section>

            {/* Timelines */}
            <Section labelledBy="time-title">
                <Container size="content">
                    <SectionHeader id="time-title" eyebrow={t('returns', 'timelineEyebrow')} title={t('returns', 'timelineTitle')} lead={t('returns', 'timelineLead')} />
                    <ol className="mt-10 grid gap-4 md:grid-cols-3">
                        {TIMES.map((x, i) => (
                            <Reveal as="li" key={x.t} delay={i * 0.08} className="relative rounded-2xl ring-1 ring-line p-6">
                                <div className="flex items-center justify-between">
                                    <span className="w-10 h-10 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><x.icon size={18} aria-hidden /></span>
                                    <span className="text-small font-semibold text-ink-4 tabular-nums">{i + 1}/3</span>
                                </div>
                                <p className="mt-5 text-small text-ink-3">{t('returns', x.t)}</p>
                                <p className="mt-1 font-sans text-[22px] sm:text-[24px] leading-tight font-semibold text-heading">{t('returns', x.v)}</p>
                                <p className="mt-1 text-body text-ink-2">{t('returns', x.d)}</p>
                                {i < TIMES.length - 1 && <ArrowRight size={18} aria-hidden className="hidden md:block absolute top-1/2 -end-[19px] -translate-y-1/2 z-10 text-ink-4 bg-surface rtl:rotate-180" />}
                            </Reveal>
                        ))}
                    </ol>
                    <Reveal className="mt-6 rounded-2xl bg-surface-2 p-5 text-small text-ink-3 leading-relaxed">
                        {t('returns', 'feesNote')}
                    </Reveal>
                </Container>
            </Section>

            {/* Physical returns + help */}
            <Section tone="muted">
                <Container size="content" className="grid gap-4 lg:grid-cols-2">
                    <Reveal className="rounded-2xl bg-surface ring-1 ring-line p-6 sm:p-7">
                        <Eyebrow>{t('returns', 'physicalEyebrow')}</Eyebrow>
                        <h2 className="mt-3 font-sans text-title-sm text-heading">{t('returns', 'physicalTitle')}</h2>
                        <p className="mt-3 text-body text-ink-2">{t('returns', 'physicalBody')}</p>
                        <p className="mt-5 flex gap-3 rounded-xl ring-1 ring-[#FDE68A] bg-[#FFFBEB] dark:bg-amber-500/10 dark:ring-amber-500/30 p-4 text-body text-[#78350F] dark:text-amber-200">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#B45309] dark:text-amber-300" aria-hidden />
                            <span className="font-medium">{t('returns', 'physicalWarning')}</span>
                        </p>
                    </Reveal>
                    <Reveal delay={0.08} className="rounded-2xl bg-surface ring-1 ring-line p-6 sm:p-7">
                        <Eyebrow>{t('returns', 'helpEyebrow')}</Eyebrow>
                        <h2 className="mt-3 font-sans text-title-sm text-heading">{t('returns', 'helpTitle')}</h2>
                        <p className="mt-3 text-body text-ink-2">
                            <Trans text={t('returns', 'helpBody')} tags={{
                                link: inlineLink(SUPPORT_ORDERS),
                                email: (c) => <a href="mailto:Info@atlantisfmcg.com" className="inline-flex items-center gap-1 font-semibold text-heading hover:text-teal"><Mail size={14} aria-hidden /><bdi dir="ltr">{c}</bdi></a>,
                            }} />
                        </p>
                    </Reveal>
                </Container>
            </Section>

            {/* Related policies */}
            <Section size="sm">
                <Container size="content">
                    <h2 className="font-sans text-subtitle text-heading">{t('returns', 'relatedTitle')}</h2>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        {[
                            { href: '/shipping', icon: Truck, title: t('returns', 'relatedShipping'), desc: t('returns', 'relatedShippingDesc') },
                            { href: '/goods-inspection', icon: ClipboardCheck, title: t('returns', 'relatedInspection'), desc: t('returns', 'relatedInspectionDesc') },
                        ].map((r) => (
                            <Link key={r.href} href={r.href} className="group flex gap-4 rounded-2xl ring-1 ring-line p-5 transition-shadow duration-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                                <span className="w-10 h-10 shrink-0 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><r.icon size={18} aria-hidden /></span>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2 text-[16px] font-semibold text-heading">{r.title} <ArrowRight size={15} className="text-teal transition-transform duration-200 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden /></span>
                                    <span className="mt-1 block text-body text-ink-3">{r.desc}</span>
                                </span>
                            </Link>
                        ))}
                    </div>
                </Container>
            </Section>

            <CtaBand title={t('returns', 'ctaTitle')} lead={t('returns', 'ctaLead')}>
                <ButtonLink href="/dashboard/customer/orders">{t('returns', 'ctaOrders')}</ButtonLink>
                <ButtonLink href="/contact" variant="secondary">{t('returns', 'ctaSupport')}</ButtonLink>
            </CtaBand>
        </main>
    );
}
