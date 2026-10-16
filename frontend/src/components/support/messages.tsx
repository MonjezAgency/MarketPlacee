'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, RotateCcw, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared message pieces for the Support workspace (assistant and order threads). */

export const clock = (s: string | Date) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export function dayLabel(s: string | Date) {
    const d = new Date(s), now = new Date();
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (same(d, now)) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (same(d, y)) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
export const shortWhen = (s: string | Date) => {
    const d = new Date(s);
    return d.toDateString() === new Date().toDateString() ? clock(d) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
export const orderRef = (id: string) => `#${id.slice(-8).toUpperCase()}`;

/* Safe rich text: paragraphs, lists, **bold**, internal links, and order refs (#ABC12345). */
function inline(text: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)|(#[A-Z0-9]{8})\b/g;
    let last = 0, m: RegExpExecArray | null, k = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index));
        if (m[1]) out.push(<strong key={k++} className="font-semibold text-heading">{m[1]}</strong>);
        else if (m[2]) out.push(<Link key={k++} href={m[3]} className="font-medium text-teal underline underline-offset-2 decoration-teal/40 hover:decoration-teal">{m[2]}</Link>);
        else out.push(<span key={k++} className="font-mono text-[0.92em] px-1 py-px rounded bg-surface-3 text-heading">{m[4]}</span>);
        last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}
export function RichText({ text }: { text: string }) {
    const blocks: React.ReactNode[] = [];
    const lines = text.replace(/\r/g, '').split('\n');
    let list: { ordered: boolean; items: string[] } | null = null;
    let para: string[] = [];
    const flushList = () => { if (list) { const L = list.ordered ? 'ol' : 'ul'; const l = list; blocks.push(<L key={blocks.length} className={cn('my-2 space-y-1 ps-5 marker:text-ink-4', l.ordered ? 'list-decimal' : 'list-disc')}>{l.items.map((it, i) => <li key={i} className="ps-0.5">{inline(it)}</li>)}</L>); list = null; } };
    const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length} className="my-2 first:mt-0 last:mb-0">{inline(para.join(' '))}</p>); para = []; } };
    for (const raw of lines) {
        const l = raw.trim();
        const ol = l.match(/^(\d+)[.)]\s+(.*)$/), ul = l.match(/^[-*•]\s+(.*)$/);
        if (ol || ul) { flushPara(); const ordered = !!ol; if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; } list.items.push(ol ? ol[2] : ul![1]); continue; }
        flushList();
        if (!l) { flushPara(); continue; }
        para.push(l);
    }
    flushPara(); flushList();
    return <>{blocks}</>;
}

/** Answers end with "→ [label](/path)" lines: rendered as action links, not text. */
export function splitLinks(text: string) {
    const links: { label: string; href: string }[] = [];
    const body = text.replace(/\n*→ \[([^\]]+)\]\((\/[^)\s]*)\)/g, (_, label, href) => { links.push({ label, href }); return ''; }).trim();
    return { body, links };
}

export function AtlantisMark({ size = 32 }: { size?: number }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/atlantis-mark.png" alt="" width={size} height={size} className="rounded-lg ring-1 ring-line bg-surface object-contain p-1 shrink-0" style={{ width: size, height: size }} />;
}

export function DayDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 py-1" role="separator" aria-label={label}>
            <span className="h-px flex-1 bg-line" /><span className="text-[12px] font-medium text-ink-4">{label}</span><span className="h-px flex-1 bg-line" />
        </div>
    );
}

/** Atlantis side: the assistant (plain, with mark) or a person from the team (teal accent). */
export function IncomingMessage({ from, name, text, at, imageUrl }: { from: 'assistant' | 'team'; name?: string; text: string; at?: string; imageUrl?: string | null }) {
    const { body, links } = splitLinks(text);
    const team = from === 'team';
    return (
        <div className="flex items-start gap-3">
            {team ? <span className="w-8 h-8 rounded-lg bg-teal-soft text-teal flex items-center justify-center shrink-0" aria-hidden><UserRound size={16} /></span> : <AtlantisMark />}
            <div className="min-w-0 max-w-[min(100%,40rem)]">
                <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] leading-5">
                    <span className="font-semibold text-heading">{team ? (name || 'Atlantis team') : 'Atlantis assistant'}</span>
                    {team && <span className="text-[11px] font-semibold uppercase tracking-wide text-teal">Team</span>}
                    {at && <time dateTime={new Date(at).toISOString()} className="text-ink-4">{clock(at)}</time>}
                </p>
                <div className={cn('mt-1 text-[14.5px] leading-[1.6] text-ink', team ? 'rounded-xl rounded-tl-sm bg-surface ring-1 ring-line border-s-[3px] border-[#2EC4B6] px-4 py-2.5' : 'rounded-xl rounded-tl-sm bg-surface-2 px-4 py-2.5')}>
                    {imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="Attached image" className="mb-2 max-h-56 rounded-lg ring-1 ring-line" />
                    )}
                    <RichText text={body} />
                </div>
                {links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {links.map((l) => <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg ring-1 ring-line bg-surface text-[13px] font-medium text-heading hover:ring-[#2EC4B6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">{l.label} <ArrowRight size={13} aria-hidden /></Link>)}
                    </div>
                )}
            </div>
        </div>
    );
}

/** The signed-in user's own message (right-aligned). */
export function OutgoingMessage({ text, imageUrl, at, state, error, onRetry }: { text: string; imageUrl?: string | null; at?: string; state?: 'sending' | 'failed-send' | 'failed-answer'; error?: string; onRetry?: () => void }) {
    return (
        <div className="flex flex-col items-end">
            <div className={cn('max-w-[min(85%,34rem)] rounded-xl rounded-tr-sm bg-heading text-white px-4 py-2.5 text-[14.5px] leading-[1.6]', state === 'sending' && 'opacity-70')}>
                {imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="Attached image" className="mb-2 max-h-56 rounded-lg bg-white/10" />
                )}
                {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
            </div>
            <p className="mt-1 text-[12px] text-ink-4" aria-live="polite">
                {state === 'sending' ? 'Sending…' : state ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5 text-[#B91C1C]"><AlertCircle size={13} aria-hidden /> {error || (state === 'failed-send' ? 'Not sent' : 'No answer yet')}
                        {onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><RotateCcw size={12} aria-hidden /> Retry</button>}</span>
                ) : at ? <time dateTime={new Date(at).toISOString()}>{clock(at)}</time> : null}
            </p>
        </div>
    );
}

export function TypingIndicator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3" role="status">
            <AtlantisMark />
            <span className="inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-3">
                <span className="inline-flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-ink-4 animate-bounce motion-reduce:animate-none" style={{ animationDelay: `${i * 120}ms` }} />)}</span>
                {label}
            </span>
        </div>
    );
}
