'use client';

import * as React from 'react';
import Link from 'next/link';
import { Boxes, ShieldCheck, Truck, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Atlantis wordmark exactly as the storefront header renders it. */
export function AtlantisMark({ className }: { className?: string }) {
    return (
        <Link href="/" aria-label="Atlantis home" className={cn('inline-flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60', className)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/atlantis-mark.png" alt="" width={32} height={32} className="w-8 h-8 object-contain rounded-lg" />
            <span className="text-[18px] font-black tracking-tighter uppercase"><span className="text-heading">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span></span>
        </Link>
    );
}

const POINTS = [
    { icon: Layers, title: 'Case, pallet and truckload pricing', text: 'Wholesale tiers built for volume buyers.' },
    { icon: Boxes, title: 'Mixed pallets and truckloads', text: 'Combine products that ship from the same site.' },
    { icon: Truck, title: 'Sold and shipped by Atlantis', text: 'One counterparty across Europe and the Gulf.' },
    { icon: ShieldCheck, title: 'Reviewed business accounts', text: 'Every new account is checked by our team before trading.' },
];

/**
 * Split layout for every auth screen: a quiet brand panel (lg+) and a
 * readable form column. Mobile shows just the form with the wordmark.
 */
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
    return (
        <div className="min-h-[100dvh] bg-surface-2 text-start lg:grid lg:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)] xl:grid-cols-[minmax(420px,0.75fr)_minmax(0,1.25fr)]">
            <aside className="hidden lg:flex flex-col justify-between bg-[#0B1F3A] text-white px-10 xl:px-14 py-10 sticky top-0 h-[100dvh]">
                <Link href="/" aria-label="Atlantis home" className="inline-flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/atlantis-mark.png" alt="" width={32} height={32} className="w-8 h-8 object-contain rounded-lg bg-white/95 p-0.5" />
                    <span className="text-[18px] font-black tracking-tighter uppercase">ATLAN<span className="text-[#2EC4B6]">TIS.</span></span>
                </Link>
                <div className="max-w-[420px]">
                    <p className="text-[13px] font-medium text-[#2EC4B6]">Wholesale FMCG · Europe &amp; Gulf</p>
                    <h2 className="mt-2 text-[28px] xl:text-[32px] leading-tight font-semibold">Bulk buying, without the back-and-forth.</h2>
                    <ul className="mt-8 space-y-5">
                        {POINTS.map(({ icon: Icon, title, text }) => (
                            <li key={title} className="flex gap-3">
                                <span className="w-9 h-9 shrink-0 rounded-xl bg-white/10 text-[#2EC4B6] flex items-center justify-center"><Icon size={17} /></span>
                                <span><span className="block text-[14.5px] font-semibold">{title}</span><span className="block text-[13px] text-white/65">{text}</span></span>
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="text-[12px] text-white/45">© {new Date().getFullYear()} Atlantis FMCG · <a href="mailto:Info@atlantisfmcg.com" className="hover:text-white">Info@atlantisfmcg.com</a></p>
            </aside>
            <main className="min-h-[100dvh] flex flex-col px-4 sm:px-8 py-6 sm:py-10">
                <div className="lg:hidden mb-6"><AtlantisMark /></div>
                <div className={cn('w-full mx-auto my-auto', wide ? 'max-w-[600px]' : 'max-w-[440px]')}>{children}</div>
            </main>
        </div>
    );
}

/** Shared form primitives so every auth screen looks identical. */
export const authInput = 'w-full h-11 px-3.5 rounded-xl ring-1 ring-line bg-surface text-[14.5px] text-ink outline-none transition-shadow focus:ring-2 focus:ring-[#2EC4B6] placeholder:text-ink-4 aria-[invalid=true]:ring-[#DC2626] disabled:bg-surface-2 disabled:text-ink-3';
export const authLabel = 'block text-[13px] font-medium text-ink-2 mb-1.5';
export const authPrimary = 'w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14.5px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
export const authSecondary = 'h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl ring-1 ring-line-strong text-[14.5px] font-semibold text-ink hover:bg-surface-2 transition-colors disabled:opacity-60';

export function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
    if (!children) return null;
    return <p id={id} className="mt-1.5 text-[12.5px] text-[#B91C1C]">{children}</p>;
}

export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'ok'; children: React.ReactNode }) {
    return (
        <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-xl px-3.5 py-3 text-[13.5px] ring-1',
            tone === 'error' ? 'bg-[#FEF2F2] ring-[#FECACA] text-[#991B1B] dark:bg-red-500/10 dark:ring-red-500/30 dark:text-red-300'
                : tone === 'ok' ? 'bg-teal-soft ring-[#2EC4B6]/40 text-ink'
                    : 'bg-surface-2 ring-line text-ink-2')}>
            {children}
        </div>
    );
}

/** Password checklist shared by sign-up and reset (mirrors the backend rule). */
export const PASSWORD_RULES = [
    { id: 'len', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
    { id: 'case', label: 'Upper- and lower-case letters', test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
    { id: 'num', label: 'A number', test: (p: string) => /\d/.test(p) },
    { id: 'sym', label: 'A symbol (!@#$%^&*)', test: (p: string) => /[!@#$%^&*]/.test(p) },
];
export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

export function PasswordChecklist({ value }: { value: string }) {
    return (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1" aria-label="Password requirements">
            {PASSWORD_RULES.map((r) => {
                const ok = r.test(value);
                return (
                    <li key={r.id} className={cn('flex items-center gap-1.5 text-[12px]', ok ? 'text-teal' : 'text-ink-3')}>
                        <span aria-hidden className={cn('w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold', ok ? 'bg-[#0E7C74] text-white' : 'ring-1 ring-line-strong')}>{ok ? '✓' : ''}</span>
                        {r.label}<span className="sr-only">{ok ? ' — met' : ' — not met'}</span>
                    </li>
                );
            })}
        </ul>
    );
}
