'use client';

import * as React from 'react';
import { AlertCircle, ArrowDown, Boxes, CircleUserRound, Eye, Package, ReceiptText, ShoppingCart, Tags, Truck, UserRound, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { toServerItem } from '@/lib/wholesale';
import { cn } from '@/lib/utils';
import { AtlantisMark, DayDivider, IncomingMessage, OutgoingMessage, TypingIndicator, dayLabel } from './messages';
import { Composer, Kbd, useSpeech } from './Composer';

type From = 'user' | 'assistant' | 'team';
interface Turn { id: string; from: From; text: string; imageUrl: string | null; createdAt: string; state?: 'sending' | 'failed-send' | 'failed-answer'; error?: string }
export interface AssistantSession { firstName: string | null; role: 'supplier' | 'buyer' | 'staff'; assistant: { available: boolean; vision: boolean }; mode: 'assistant' | 'team'; escalated?: boolean; suggestions: string[]; messages: Turn[] }
interface Attachment { file: File; preview: string; progress: number; url?: string; error?: string }

const MAX_IMAGE = 6 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Starting points, grouped by what people actually need. Each one sends a real question. */
const TOPICS: Record<'supplier' | 'buyer', { icon: React.ElementType; title: string; questions: string[] }[]> = {
    supplier: [
        { icon: Eye, title: 'Listings & visibility', questions: ['Why isn’t my product appearing in the marketplace?', 'Which of my products need changes before they go live?'] },
        { icon: Boxes, title: 'Inventory & stock', questions: ['Help me update my inventory.', 'Which of my products are low on stock?'] },
        { icon: Tags, title: 'Pricing', questions: ['Why is my product price incorrect?', 'How are my prices converted to EUR?'] },
        { icon: Package, title: 'Orders', questions: ['Help me understand my orders.', 'Which orders are waiting for my confirmation?'] },
        { icon: CircleUserRound, title: 'Account', questions: ['How do I get my company verified?', 'How do I change which emails I receive?'] },
    ],
    buyer: [
        { icon: Truck, title: 'Orders & delivery', questions: ['Where is my order?', 'When is the delivery charge confirmed?'] },
        { icon: ShoppingCart, title: 'Cart & checkout', questions: ['Why can’t I complete checkout?', 'Why does my cart say a line is below the minimum?'] },
        { icon: ReceiptText, title: 'Products & prices', questions: ['Help me compare supplier offers.', 'Why are prices shown without VAT?'] },
        { icon: CircleUserRound, title: 'Account', questions: ['How long does account approval take?', 'I have a problem with a product.'] },
    ],
};

export function AssistantPanel({ onSession }: { onSession?: (s: AssistantSession | null, failed: boolean) => void }) {
    const { items: cartItems } = useCart();
    const [session, setSession] = React.useState<AssistantSession | null>(null);
    const [loadError, setLoadError] = React.useState(false);
    const [turns, setTurns] = React.useState<Turn[]>([]);
    const [mode, setMode] = React.useState<'assistant' | 'team'>('assistant');
    const [draft, setDraft] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [attachment, setAttachment] = React.useState<Attachment | null>(null);
    const [notice, setNotice] = React.useState<{ tone: 'error' | 'info'; text: string } | null>(null);
    const [escalated, setEscalated] = React.useState(false);
    const [escalating, setEscalating] = React.useState(false);
    const [dragging, setDragging] = React.useState(false);
    const [atBottom, setAtBottom] = React.useState(true);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLTextAreaElement>(null);
    const fileRef = React.useRef<HTMLInputElement>(null);
    const dictBase = React.useRef('');
    const speech = useSpeech((t, final) => { const v = `${dictBase.current}${dictBase.current && !dictBase.current.endsWith(' ') ? ' ' : ''}${t}`; setDraft(v); if (final) dictBase.current = v; });

    const load = React.useCallback(async () => {
        try {
            const res = await apiFetch('/support-assistant/session', { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const s: AssistantSession = await res.json();
            setSession(s); setMode(s.mode); if (s.escalated) setEscalated(true);
            setTurns((cur) => { const pending = cur.filter((t) => t.state); const ids = new Set(s.messages.map((m) => m.id)); return [...s.messages, ...pending.filter((p) => !ids.has(p.id))]; });
            setLoadError(false); onSession?.(s, false);
        } catch { setLoadError(true); onSession?.(null, true); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { load(); }, [load]);
    // A person may reply from the support console: refresh while the team is involved.
    React.useEffect(() => {
        if (mode !== 'team' && !escalated) return;
        const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
        return () => clearInterval(t);
    }, [mode, escalated, load]);

    // Scroll: jump to the end on first load; follow new messages only if the reader is at the bottom.
    const scrollToEnd = (smooth = true) => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
    const firstScroll = React.useRef(true);
    React.useEffect(() => {
        if (!session) return;
        if (firstScroll.current) { firstScroll.current = false; requestAnimationFrame(() => { scrollToEnd(false); setAtBottom(true); }); return; }
        if (atBottom) scrollToEnd(true);
    }, [session, turns.length, busy]); // eslint-disable-line react-hooks/exhaustive-deps
    const onScroll = () => { const el = scrollRef.current; if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); };

    /* Attachments (private upload, then sent with the message) */
    const pick = (file: File | undefined | null) => {
        if (!file) return;
        if (!TYPES.includes(file.type)) { setNotice({ tone: 'error', text: 'Attach a JPEG, PNG or WebP image.' }); return; }
        if (file.size > MAX_IMAGE) { setNotice({ tone: 'error', text: 'Images can be up to 6 MB.' }); return; }
        setNotice(null);
        const a: Attachment = { file, preview: URL.createObjectURL(file), progress: 0 };
        setAttachment(a); upload(a);
    };
    const upload = (a: Attachment) => {
        const xhr = new XMLHttpRequest();
        const fd = new FormData(); fd.append('file', a.file);
        xhr.open('POST', '/api/proxy/support-assistant/attachments');
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setAttachment((c) => (c && c.file === a.file ? { ...c, progress: Math.round((e.loaded / e.total) * 100) } : c)); };
        xhr.onload = () => {
            let body: any = null; try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
            setAttachment((c) => (c && c.file === a.file ? (xhr.status < 300 && body?.url ? { ...c, progress: 100, url: body.url, error: undefined } : { ...c, error: typeof body?.message === 'string' ? body.message : 'Upload failed. Try again.' }) : c));
        };
        xhr.onerror = () => setAttachment((c) => (c && c.file === a.file ? { ...c, error: 'Upload failed — check your connection.' } : c));
        xhr.send(fd);
    };
    const removeAttachment = () => { if (attachment) URL.revokeObjectURL(attachment.preview); setAttachment(null); };

    /* Sending */
    const cart = () => (session?.role === 'buyer' ? cartItems.filter((i) => !i.mixedLoadId).slice(0, 50).map(toServerItem) : undefined);
    const handleResult = (res: Response, body: any, tempId: string) => {
        if (res.ok) {
            setTurns((cur) => [...cur.filter((t) => t.id !== tempId), body.userMessage, ...(body.assistantMessage ? [body.assistantMessage] : [])]);
            if (body.mode) setMode(body.mode);
            return;
        }
        const saved = body?.userMessage;
        const msg = typeof body?.message === 'string' ? body.message : res.status === 429 ? 'You’re sending messages too fast — wait a moment.' : 'Something went wrong. Try again.';
        if (saved) {
            if (body?.code === 'AI_NOT_CONFIGURED') {
                // No assistant to retry: the message is simply saved for the team (explained once, above the composer).
                setTurns((cur) => [...cur.filter((t) => t.id !== tempId), saved]);
                setNotice({ tone: 'info', text: msg });
            } else setTurns((cur) => [...cur.filter((t) => t.id !== tempId), { ...saved, state: 'failed-answer', error: msg }]);
        } else setTurns((cur) => cur.map((t) => (t.id === tempId ? { ...t, state: 'failed-send', error: msg } : t)));
    };
    const send = async (textIn?: string) => {
        const text = (textIn ?? draft).trim();
        if (busy || (!text && !attachment?.url)) return;
        if (attachment && !attachment.url) { setNotice({ tone: 'error', text: attachment.error ? 'Remove or re-attach the image that failed.' : 'Wait for the image to finish uploading.' }); return; }
        if (speech.listening) speech.stop();
        const tempId = `tmp-${Date.now()}`;
        const imageUrl = attachment?.url || null;
        setTurns((cur) => [...cur, { id: tempId, from: 'user', text, imageUrl, createdAt: new Date().toISOString(), state: 'sending' }]);
        setDraft(''); dictBase.current = ''; setAttachment(null); setNotice(null); setBusy(true); setAtBottom(true);
        try {
            const res = await apiFetch('/support-assistant/message', { method: 'POST', body: JSON.stringify({ content: text, imageUrl: imageUrl || undefined, cart: cart() }) });
            handleResult(res, await res.json().catch(() => null), tempId);
        } catch {
            setTurns((cur) => cur.map((t) => (t.id === tempId ? { ...t, state: 'failed-send', error: 'Couldn’t reach Atlantis — check your connection.' } : t)));
        } finally { setBusy(false); inputRef.current?.focus(); }
    };
    const retry = async (t: Turn) => {
        if (busy) return;
        if (t.state === 'failed-send') { setTurns((cur) => cur.filter((x) => x.id !== t.id)); return send(t.text); }
        setBusy(true);
        setTurns((cur) => cur.map((x) => (x.id === t.id ? { ...x, state: 'sending', error: undefined } : x)));
        try {
            const res = await apiFetch(`/support-assistant/message/${t.id}/retry`, { method: 'POST', body: JSON.stringify({ cart: cart() }) });
            handleResult(res, await res.json().catch(() => null), t.id);
        } catch { setTurns((cur) => cur.map((x) => (x.id === t.id ? { ...x, state: 'failed-answer', error: 'Couldn’t reach Atlantis — check your connection.' } : x))); }
        finally { setBusy(false); }
    };
    const escalate = async () => {
        setEscalating(true);
        try {
            const res = await apiFetch('/support-assistant/escalate', { method: 'POST', body: JSON.stringify({}) });
            const b = await res.json().catch(() => null);
            if (!res.ok) throw new Error(typeof b?.message === 'string' ? b.message : 'Couldn’t contact the team. Try again.');
            setEscalated(true);
            setNotice({ tone: 'info', text: 'The Atlantis team has been asked to join. A person will reply in this conversation, and you’ll get a notification.' });
        } catch (e: any) { setNotice({ tone: 'error', text: e.message }); }
        finally { setEscalating(false); }
    };

    const role: 'supplier' | 'buyer' = session?.role === 'supplier' ? 'supplier' : 'buyer';
    const topics = TOPICS[role];
    const started = turns.some((t) => t.from === 'user');
    const canSend = !busy && (!!draft.trim() || !!attachment?.url) && !(attachment && !attachment.url);
    const aiOn = !!session?.assistant.available;

    // Messages grouped by day.
    const rows: React.ReactNode[] = [];
    let lastDay = '';
    for (const t of turns) {
        const d = dayLabel(t.createdAt);
        if (d !== lastDay) { rows.push(<DayDivider key={`d-${t.id}`} label={d} />); lastDay = d; }
        rows.push(t.from === 'user'
            ? <OutgoingMessage key={t.id} text={t.text} imageUrl={t.imageUrl} at={t.createdAt} state={t.state} error={t.error} onRetry={() => retry(t)} />
            : <IncomingMessage key={t.id} from={t.from} text={t.text} at={t.createdAt} imageUrl={t.imageUrl} />);
    }

    const Topics = ({ compact }: { compact?: boolean }) => (
        <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
            {topics.map((g) => (
                <div key={g.title} className="rounded-xl ring-1 ring-line bg-surface p-3">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-heading"><span className="w-7 h-7 rounded-lg bg-teal-soft text-teal flex items-center justify-center" aria-hidden><g.icon size={15} /></span>{g.title}</p>
                    <ul className="mt-2 space-y-0.5">
                        {g.questions.map((q) => (
                            <li key={q}><button type="button" disabled={busy || !session} onClick={() => send(q)}
                                className="w-full text-start rounded-md px-2 py-1.5 text-[13px] leading-snug text-ink-2 hover:bg-surface-2 hover:text-heading transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] disabled:opacity-50">{q}</button></li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );

    return (
        <div className="flex-1 min-w-0 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem]">
            {/* Conversation column */}
            <div className="relative min-w-0 min-h-0 flex flex-col"
                onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}>
                {dragging && <div className="absolute inset-0 z-20 m-3 rounded-xl border-2 border-dashed border-[#2EC4B6] bg-teal-soft/80 flex items-center justify-center text-[14px] font-semibold text-heading pointer-events-none">Drop a screenshot to attach it</div>}

                <div className="relative flex-1 min-h-0 flex flex-col">
                <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-label="Support conversation">
                    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-5">
                        {loadError && !session ? (
                            <div className="rounded-xl ring-1 ring-[#FECACA] bg-[#FEF2F2] p-4 text-[14px] text-[#991B1B] flex flex-wrap items-center gap-3">
                                <AlertCircle size={17} aria-hidden /> Support couldn’t be loaded.
                                <button type="button" onClick={load} className="font-semibold underline underline-offset-2">Try again</button>
                            </div>
                        ) : !session ? (
                            <div className="space-y-4" aria-label="Loading conversation">{[64, 40, 56].map((w, i) => <div key={i} className="h-12 rounded-xl bg-surface-2 animate-pulse motion-reduce:animate-none" style={{ width: `${w}%`, marginInlineStart: i === 1 ? 'auto' : undefined }} />)}</div>
                        ) : (
                            <>
                                {!started && (
                                    <section aria-label="Getting started" className="rounded-2xl ring-1 ring-line bg-surface-2/60 p-4 sm:p-5">
                                        <div className="flex items-start gap-3">
                                            <AtlantisMark size={36} />
                                            <div className="min-w-0">
                                                <h2 className="font-sans text-[16px] font-semibold text-heading">Hi{session.firstName ? ` ${session.firstName}` : ''} — how can we help?</h2>
                                                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
                                                    {aiOn
                                                        ? `Ask about your ${role === 'supplier' ? 'listings, stock, prices or orders' : 'orders, cart or account'}. The assistant answers from your own account data; if it can’t solve it, the Atlantis team can take over here.`
                                                        : 'The AI assistant isn’t switched on right now. Write your question and ask the Atlantis team — a person will reply here.'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-4 xl:hidden"><Topics /></div>
                                        <p className="mt-4 hidden xl:block text-[13px] text-ink-3">Pick a topic on the right, or describe the problem below.</p>
                                    </section>
                                )}
                                {rows}
                                {busy && <TypingIndicator label={mode === 'team' ? 'Sending to the Atlantis team…' : 'Checking your account…'} />}
                            </>
                        )}
                    </div>
                </div>

                {!atBottom && (
                    <button type="button" onClick={() => { scrollToEnd(); setAtBottom(true); }} className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 h-8 px-3 rounded-full bg-heading text-white text-[12.5px] font-medium shadow-float inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]"><ArrowDown size={13} aria-hidden /> Latest</button>
                )}
                </div>

                {/* Composer — anchored to the bottom of the panel */}
                <div className="shrink-0 border-t border-line bg-surface px-3 sm:px-5 py-3">
                    <div className="mx-auto w-full max-w-3xl">
                        {(notice || speech.error) && (
                            <p className={cn('mb-2 flex items-start gap-1.5 text-[13px]', notice?.tone === 'error' || speech.error ? 'text-[#B91C1C]' : 'text-ink-2')} role="status">
                                <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden /> <span className="flex-1">{notice?.text || speech.error}</span>
                                {notice && <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="text-ink-4 hover:text-ink"><X size={14} /></button>}
                            </p>
                        )}
                        {/* Hand-off below xl, where the rail is hidden */}
                        {session && mode !== 'team' && (
                            <div className="xl:hidden mb-2 flex items-center justify-between gap-3 text-[13px]">
                                <span className="text-ink-3">{escalated ? 'The Atlantis team has been asked to join.' : 'Need a person?'}</span>
                                {!escalated && <button type="button" onClick={escalate} disabled={!started || escalating} className="font-semibold text-teal hover:underline disabled:opacity-50 disabled:no-underline">{escalating ? 'Asking…' : 'Ask the Atlantis team'}</button>}
                            </div>
                        )}
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
                        <Composer id="support-input" ref={inputRef} value={draft}
                            onChange={(v) => { setDraft(v); dictBase.current = v; }}
                            onSend={() => send()} canSend={canSend} busy={busy} disabled={!session}
                            placeholder={speech.listening ? 'Listening… speak now' : mode === 'team' ? 'Write to the Atlantis team…' : 'Describe the problem…'}
                            onAttach={() => fileRef.current?.click()} attachDisabled={busy || !!attachment}
                            onPasteImage={(f) => { if (!attachment) pick(f); }}
                            speech={{ supported: speech.supported, listening: speech.listening, start: () => { dictBase.current = draft; speech.start(); }, stop: speech.stop }}
                            attachmentSlot={attachment && (
                                <div className="flex items-center gap-3 px-3 pt-3">
                                    <span className="relative w-12 h-12 rounded-lg overflow-hidden ring-1 ring-line bg-surface-2 shrink-0">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={attachment.preview} alt="Attachment preview" className="w-full h-full object-cover" />
                                    </span>
                                    <div className="min-w-0 flex-1 text-[13px]">
                                        <p className="truncate text-ink">{attachment.file.name}</p>
                                        {attachment.error ? <p className="text-[#B91C1C]">{attachment.error}</p>
                                            : attachment.url ? <p className="text-ink-3">Ready to send{session?.assistant.vision ? ' — the assistant will look at it' : ''}</p>
                                                : <div className="mt-1.5 h-1 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={attachment.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><div className="h-full bg-[#2EC4B6] transition-all" style={{ width: `${attachment.progress}%` }} /></div>}
                                    </div>
                                    {attachment.error && <button type="button" onClick={() => { setAttachment({ ...attachment, error: undefined, progress: 0 }); upload(attachment); }} className="text-[13px] font-semibold text-teal">Retry</button>}
                                    <button type="button" aria-label="Remove attachment" onClick={removeAttachment} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-2 hover:text-ink"><X size={15} /></button>
                                </div>
                            )}
                            hint={<>Mention the product or order if you can · <Kbd>Enter</Kbd> send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line</>}
                        />
                    </div>
                </div>
            </div>

            {/* Right rail (desktop): topics and the human hand-off */}
            <aside aria-label="Help topics" className="hidden xl:flex min-h-0 flex-col border-s border-line bg-surface-2/40">
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                    <div>
                        <p className="text-eyebrow uppercase text-ink-3 mb-2">Ask about</p>
                        <Topics compact />
                    </div>
                </div>
                <div className="shrink-0 border-t border-line p-4">
                    <p className="flex items-center gap-2 text-[13.5px] font-semibold text-heading"><UserRound size={15} className="text-teal" aria-hidden /> Talk to a person</p>
                    {mode === 'team' ? (
                        <p className="mt-1 text-[13px] text-ink-2">The Atlantis team is in this conversation. Replies appear here.</p>
                    ) : escalated ? (
                        <p className="mt-1 text-[13px] text-ink-2">The team has been asked to join. You’ll get a notification when they reply.</p>
                    ) : (
                        <>
                            <p className="mt-1 text-[13px] text-ink-2">{started ? 'Hand this conversation to the Atlantis team.' : 'Describe the problem first, then hand it to the team.'}</p>
                            <button type="button" onClick={escalate} disabled={!started || escalating}
                                className="mt-3 w-full h-10 rounded-lg ring-1 ring-line-strong bg-surface text-[13.5px] font-semibold text-heading hover:ring-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] disabled:opacity-50 disabled:hover:ring-line-strong">
                                {escalating ? 'Asking the team…' : 'Ask the Atlantis team'}
                            </button>
                        </>
                    )}
                </div>
            </aside>
        </div>
    );
}
