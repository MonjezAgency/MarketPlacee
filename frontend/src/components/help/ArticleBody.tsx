import * as React from 'react';
import Link from 'next/link';
import { Info, AlertTriangle, Lightbulb } from 'lucide-react';
import type { Block } from '@/content/help/types';
import { headingId } from '@/content/help';

/** **bold**, `code`, [label](/internal) — nothing else is interpreted. */
export function Inline({ text }: { text: string }) {
    const out: React.ReactNode[] = [];
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
    let last = 0, m: RegExpExecArray | null, k = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index));
        if (m[1]) out.push(<strong key={k++} className="font-semibold text-heading">{m[1]}</strong>);
        else if (m[2]) out.push(<code key={k++} className="px-1.5 py-0.5 rounded-md bg-surface-2 ring-1 ring-line text-[0.9em] font-mono text-ink">{m[2]}</code>);
        else out.push(<Link key={k++} href={m[4]} className="font-medium text-teal underline underline-offset-2 decoration-teal/40 hover:decoration-teal">{m[3]}</Link>);
        last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return <>{out}</>;
}

const NOTE = {
    info: { Icon: Info, cls: 'bg-[#EFF6FF] ring-[#BFDBFE] text-[#1E3A8A] dark:bg-blue-500/10 dark:text-blue-100', label: 'Good to know' },
    tip: { Icon: Lightbulb, cls: 'bg-teal-soft ring-teal/20 text-ink', label: 'Tip' },
    warning: { Icon: AlertTriangle, cls: 'bg-[#FFFBEB] ring-[#FDE68A] text-[#78350F] dark:bg-amber-500/10 dark:text-amber-100', label: 'Important' },
} as const;

export default function ArticleBody({ blocks }: { blocks: Block[] }) {
    return (
        <div className="text-[15.5px] leading-[1.7] text-ink-2">
            {blocks.map((b, i) => {
                if ('h2' in b) return <h2 key={i} id={headingId(b.h2)} className="scroll-mt-28 mt-10 mb-3 text-[21px] font-bold tracking-tight text-heading">{b.h2}</h2>;
                if ('h3' in b) return <h3 key={i} id={headingId(b.h3)} className="scroll-mt-28 mt-7 mb-2 text-[17px] font-semibold text-heading">{b.h3}</h3>;
                if ('p' in b) return <p key={i} className="my-3.5"><Inline text={b.p} /></p>;
                if ('steps' in b) return (
                    <ol key={i} className="my-4 space-y-3">
                        {b.steps.map((s, j) => (
                            <li key={j} className="flex gap-3.5">
                                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-heading text-white text-[12.5px] font-semibold flex items-center justify-center tabular-nums">{j + 1}</span>
                                <span className="flex-1"><Inline text={s} /></span>
                            </li>
                        ))}
                    </ol>
                );
                if ('list' in b) return <ul key={i} className="my-3.5 ps-5 list-disc space-y-1.5 marker:text-ink-4">{b.list.map((s, j) => <li key={j}><Inline text={s} /></li>)}</ul>;
                if ('table' in b) return (
                    <div key={i} className="my-5 overflow-x-auto rounded-xl ring-1 ring-line">
                        <table className="w-full text-[14px] leading-normal">
                            <thead className="bg-surface-2 text-ink">
                                <tr>{b.table.head.map((h) => <th key={h} scope="col" className="text-start font-semibold px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {b.table.rows.map((r, j) => <tr key={j} className="border-t border-line align-top">{r.map((c, k) => <td key={k} className="px-4 py-2.5"><Inline text={c} /></td>)}</tr>)}
                            </tbody>
                        </table>
                    </div>
                );
                if ('note' in b) {
                    const n = NOTE[b.tone || 'info'];
                    return (
                        <div key={i} className={`my-5 flex gap-3 rounded-xl ring-1 px-4 py-3 text-[14.5px] ${n.cls}`}>
                            <n.Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
                            <p><span className="font-semibold">{n.label}: </span><Inline text={b.note} /></p>
                        </div>
                    );
                }
                if ('example' in b) return (
                    <div key={i} className="my-5 rounded-xl ring-1 ring-line bg-surface-2/60 px-5 py-4">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">Example · {b.example.title}</p>
                        {b.example.body.map((t, j) => <p key={j} className="mt-2 text-[14.5px]"><Inline text={t} /></p>)}
                    </div>
                );
                if ('faq' in b) return (
                    <div key={i} className="my-4 divide-y divide-line rounded-xl ring-1 ring-line">
                        {b.faq.map((f, j) => (
                            <details key={j} className="group px-4 py-3">
                                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-medium text-heading">{f.q}<span className="text-ink-4 group-open:rotate-45 transition-transform text-[18px] leading-none">+</span></summary>
                                <p className="mt-2 text-[14.5px]"><Inline text={f.a} /></p>
                            </details>
                        ))}
                    </div>
                );
                return null;
            })}
        </div>
    );
}
