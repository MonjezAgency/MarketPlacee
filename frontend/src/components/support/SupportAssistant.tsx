'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Mic, MicOff, RotateCcw, Users, X, AlertCircle, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { toServerItem } from '@/lib/wholesale';
import { cn } from '@/lib/utils';

/* ── Types ─────────────────────────────────────────────────────────── */
type From = 'user' | 'assistant' | 'team';
interface Turn { id: string; from: From; text: string; imageUrl: string | null; createdAt: string; state?: 'sending' | 'failed-send' | 'failed-answer'; error?: string }
interface Session { firstName: string | null; role: 'supplier' | 'buyer' | 'staff'; assistant: { available: boolean; vision: boolean }; mode: 'assistant' | 'team'; suggestions: string[]; messages: Turn[] }
interface Attachment { file: File; preview: string; progress: number; url?: string; error?: string }

const MAX_IMAGE = 6 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const time = (s: string) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/* ── Minimal, safe rich text: paragraphs, lists, **bold**, internal links ─ */
function inline(text: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
    let last = 0, m: RegExpExecArray | null, k = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index));
        if (m[1]) out.push(<strong key={k++} className="font-semibold text-heading">{m[1]}</strong>);
        else out.push(<Link key={k++} href={m[3]} className="font-medium text-teal underline underline-offset-2">{m[2]}</Link>);
        last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}
function RichText({ text }: { text: string }) {
    const blocks: React.ReactNode[] = [];
    const lines = text.replace(/\r/g, '').split('\n');
    let list: { ordered: boolean; items: string[] } | null = null;
    const flush = () => { if (list) { const L = list.ordered ? 'ol' : 'ul'; blocks.push(<L key={blocks.length} className={cn('my-1.5 space-y-1 ps-5', list.ordered ? 'list-decimal' : 'list-disc')}>{list.items.map((it, i) => <li key={i} className="ps-0.5">{inline(it)}</li>)}</L>); list = null; } };
    let para: string[] = [];
    const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length} className="my-1.5 first:mt-0 last:mb-0">{inline(para.join(' '))}</p>); para = []; } };
    for (const raw of lines) {
        const l = raw.trim();
        const ol = l.match(/^(\d+)[.)]\s+(.*)$/), ul = l.match(/^[-*•]\s+(.*)$/);
        if (ol || ul) { flushPara(); const ordered = !!ol; if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; } list.items.push((ol ? ol[2] : ul![1])); continue; }
        flush();
        if (!l) { flushPara(); continue; }
        para.push(l);
    }
    flushPara(); flush();
    return <>{blocks}</>;
}
/** Answers end with "→ [label](/path)" lines: shown as link chips, not text. */
function splitLinks(text: string) {
    const links: { label: string; href: string }[] = [];
    const body = text.replace(/\n*→ \[([^\]]+)\]\((\/[^)\s]*)\)/g, (_, label, href) => { links.push({ label, href }); return ''; }).trim();
    return { body, links };
}

/* ── Voice input (browser speech recognition; shown only where supported) ─ */
function useSpeech(onText: (t: string, final: boolean) => void) {
    const recRef = React.useRef<any>(null);
    const [supported, setSupported] = React.useState(false);
    const [listening, setListening] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    React.useEffect(() => { setSupported(typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)); }, []);
    const start = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        setError(null);
        const rec = new SR();
        rec.lang = document.documentElement.lang === 'ar' ? 'ar-EG' : navigator.language || 'en-US';
        rec.interimResults = true; rec.continuous = false;
        rec.onresult = (e: any) => { let t = ''; let fin = false; for (let i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; fin = fin || e.results[i].isFinal; } onText(t, fin); };
        rec.onerror = (e: any) => setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked — allow it in your browser to dictate.' : e.error === 'no-speech' ? 'No speech heard. Try again.' : 'Voice input stopped. You can type instead.');
        rec.onend = () => setListening(false);
        recRef.current = rec; rec.start(); setListening(true);
    };
    const stop = () => recRef.current?.stop();
    return { supported, listening, error, start, stop };
}

/* ── Component ─────────────────────────────────────────────────────── */
export default function SupportAssistant() {
    const { items: cartItems } = useCart();
    const [session, setSession] = React.useState<Session | null>(null);
    const [loadError, setLoadError] = React.useState(false);
    const [turns, setTurns] = React.useState<Turn[]>([]);
    const [mode, setMode] = React.useState<'assistant' | 'team'>('assistant');
    const [draft, setDraft] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [attachment, setAttachment] = React.useState<Attachment | null>(null);
    const [notice, setNotice] = React.useState<{ tone: 'error' | 'info'; text: string } | null>(null);
    const [escalated, setEscalated] = React.useState(false);
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
            const s: Session = await res.json();
            setSession(s); setMode(s.mode);
            setTurns((cur) => { const pending = cur.filter((t) => t.state); const ids = new Set(s.messages.map((m) => m.id)); return [...s.messages, ...pending.filter((p) => !ids.has(p.id))]; });
            setLoadError(false);
        } catch { setLoadError(true); }
    }, []);
    React.useEffect(() => { load(); }, [load]);
    // A person may reply from the support console: check for new messages while the team is involved.
    React.useEffect(() => {
        if (mode !== 'team' && !escalated) return;
        const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
        return () => clearInterval(t);
    }, [mode, escalated, load]);

    // Keep the latest message in view unless the reader scrolled up.
    const scrollToEnd = (smooth = true) => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
    // First load jumps straight to the end; later messages scroll smoothly (only if the reader is at the bottom).
    const firstScroll = React.useRef(true);
    React.useEffect(() => {
        if (!session) return;
        if (firstScroll.current) { firstScroll.current = false; requestAnimationFrame(() => { scrollToEnd(false); setAtBottom(true); }); return; }
        if (atBottom) scrollToEnd(true);
    }, [session, turns.length, busy]); // eslint-disable-line react-hooks/exhaustive-deps
    const onScroll = () => { const el = scrollRef.current; if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); };

    // Auto-grow composer (1–6 lines).
    React.useEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }, [draft]);

    /* Attachments */
    const pick = (file: File | undefined | null) => {
        if (!file) return;
        if (!TYPES.includes(file.type)) { setNotice({ tone: 'error', text: 'Attach a JPEG, PNG or WebP image.' }); return; }
        if (file.size > MAX_IMAGE) { setNotice({ tone: 'error', text: 'Images can be up to 6 MB.' }); return; }
        setNotice(null);
        const a: Attachment = { file, preview: URL.createObjectURL(file), progress: 0 };
        setAttachment(a);
        upload(a);
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
            // The message is stored; only the answer failed → retry asks again without duplicating it.
            setTurns((cur) => [...cur.filter((t) => t.id !== tempId), { ...saved, state: 'failed-answer', error: msg }]);
            if (body?.code === 'AI_NOT_CONFIGURED') setNotice({ tone: 'info', text: msg });
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
        try {
            const res = await apiFetch('/support-assistant/escalate', { method: 'POST', body: JSON.stringify({}) });
            const b = await res.json().catch(() => null);
            if (!res.ok) throw new Error(typeof b?.message === 'string' ? b.message : 'Couldn’t contact the team. Try again.');
            setEscalated(true);
            setNotice({ tone: 'info', text: 'The Atlantis team has been notified. A person will reply in this conversation — you’ll also get a notification.' });
        } catch (e: any) { setNotice({ tone: 'error', text: e.message }); }
    };

    const started = turns.some((t) => t.from === 'user');
    const name = session?.firstName;
    const greeting = `Hi${name ? ` ${name}` : ''}! I’m your Atlantis assistant. Tell me what’s wrong, and I’ll help you figure it out.`;
    const canSend = !busy && (!!draft.trim() || !!attachment?.url) && !(attachment && !attachment.url);

    return (
        <div className="flex flex-col h-[calc(100dvh-160px)] min-h-[520px] text-start">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
                <div className="min-w-0">
                    <h1 className="text-[22px] font-bold tracking-tight text-heading">Support Assistant</h1>
                    <p className="mt-0.5 text-[13.5px] text-ink-3 max-w-xl">Chat with our assistant to resolve inventory, orders, products, pricing, and account issues.</p>
                </div>
                <div className="flex items-center gap-2">
                    {session && (mode === 'team' ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2"><Users size={14} className="text-teal" /> You’re talking with the Atlantis team</span>
                    ) : session.assistant.available ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Assistant available</span>
                    ) : null)}
                    {started && mode !== 'team' && !escalated && (
                        <button type="button" onClick={escalate} className="h-8 px-3 rounded-lg ring-1 ring-line text-[12.5px] font-medium text-ink-2 hover:ring-line-strong hover:text-ink inline-flex items-center gap-1.5"><Users size={13} /> Contact the Atlantis team</button>
                    )}
                </div>
            </div>

            {/* Conversation */}
            <div className="relative flex-1 min-h-0 rounded-2xl ring-1 ring-line bg-surface flex flex-col overflow-hidden"
                onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}>
                {dragging && <div className="absolute inset-0 z-20 m-2 rounded-xl border-2 border-dashed border-teal bg-teal-soft/70 flex items-center justify-center text-[14px] font-medium text-heading pointer-events-none">Drop a screenshot to attach it</div>}
                <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Support conversation">
                    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                        {loadError && !session ? (
                            <div className="rounded-xl ring-1 ring-red-200 bg-red-50 dark:bg-red-500/10 p-4 text-[13.5px] text-red-800 dark:text-red-200 flex items-center gap-3">
                                <AlertCircle size={16} /> Support couldn’t be loaded. <button type="button" onClick={load} className="font-semibold underline">Try again</button>
                            </div>
                        ) : !session ? (
                            <div className="space-y-3" aria-hidden>{[0, 1].map((i) => <div key={i} className="h-14 w-2/3 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
                        ) : (
                            <>
                                <AssistantBubble text={greeting} />
                                {!started && (
                                    <div className="ps-11">
                                        <p className="text-[12.5px] text-ink-3 mb-2">Common questions</p>
                                        <div className="flex flex-wrap gap-2">
                                            {session.suggestions.map((s) => (
                                                <button key={s} type="button" disabled={busy} onClick={() => send(s)}
                                                    className="h-9 px-3.5 rounded-full ring-1 ring-line bg-surface text-[13px] text-ink-2 hover:ring-teal hover:text-heading transition-colors disabled:opacity-50">{s}</button>
                                            ))}
                                        </div>
                                        {!session.assistant.available && <p className="mt-3 text-[12.5px] text-ink-3">The assistant isn’t configured right now — messages you send are saved for the Atlantis team.</p>}
                                    </div>
                                )}
                                {turns.map((t) => (t.from === 'user' ? <UserBubble key={t.id} t={t} onRetry={() => retry(t)} /> : <AssistantBubble key={t.id} text={t.text} team={t.from === 'team'} at={t.createdAt} />))}
                                {busy && (
                                    <div className="flex items-center gap-3 ps-11 text-[13px] text-ink-3" role="status">
                                        <span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-ink-4 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}</span>
                                        {mode === 'team' ? 'Sending to the Atlantis team…' : 'Checking your account…'}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
                {!atBottom && (
                    <button type="button" onClick={() => { scrollToEnd(); setAtBottom(true); }} className="absolute bottom-[96px] left-1/2 -translate-x-1/2 h-8 px-3 rounded-full bg-heading text-white text-[12.5px] shadow-lg inline-flex items-center gap-1"><ArrowDown size={13} /> Latest</button>
                )}

                {/* Composer */}
                <div className="border-t border-line bg-surface px-3 sm:px-4 py-3">
                    <div className="max-w-3xl mx-auto">
                        {notice && (
                            <p className={cn('mb-2 text-[12.5px] flex items-start gap-1.5', notice.tone === 'error' ? 'text-red-700' : 'text-ink-2')}>
                                <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span className="flex-1">{notice.text}</span>
                                <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="text-ink-4 hover:text-ink"><X size={13} /></button>
                            </p>
                        )}
                        {speech.error && <p className="mb-2 text-[12.5px] text-red-700">{speech.error}</p>}
                        <div className="rounded-2xl ring-1 ring-line-strong bg-surface focus-within:ring-2 focus-within:ring-teal transition-shadow">
                            {attachment && (
                                <div className="flex items-center gap-3 px-3 pt-3">
                                    <span className="relative w-14 h-14 rounded-lg overflow-hidden ring-1 ring-line bg-surface-2 shrink-0">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={attachment.preview} alt="Attachment preview" className="w-full h-full object-cover" />
                                    </span>
                                    <div className="min-w-0 flex-1 text-[12.5px]">
                                        <p className="truncate text-ink">{attachment.file.name}</p>
                                        {attachment.error ? <p className="text-red-700">{attachment.error}</p>
                                            : attachment.url ? <p className="text-ink-3">Ready to send{session && !session.assistant.vision ? '' : ' — the assistant will look at it'}</p>
                                            : <div className="mt-1 h-1 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={attachment.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><div className="h-full bg-teal transition-all" style={{ width: `${attachment.progress}%` }} /></div>}
                                    </div>
                                    {attachment.error && <button type="button" onClick={() => { setAttachment({ ...attachment, error: undefined, progress: 0 }); upload(attachment); }} className="text-[12.5px] font-medium text-teal">Retry</button>}
                                    <button type="button" aria-label="Remove attachment" onClick={removeAttachment} className="w-7 h-7 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-2 hover:text-ink"><X size={14} /></button>
                                </div>
                            )}
                            <div className="flex items-end gap-1.5 p-2">
                                <button type="button" aria-label="Attach a screenshot" title="Attach a screenshot" disabled={busy || !!attachment} onClick={() => fileRef.current?.click()}
                                    className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40"><ImagePlus size={18} /></button>
                                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
                                <label htmlFor="support-input" className="sr-only">Message</label>
                                <textarea id="support-input" ref={inputRef} rows={1} value={draft}
                                    onChange={(e) => { setDraft(e.target.value); dictBase.current = e.target.value; }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                                    onPaste={(e) => { const f = Array.from(e.clipboardData.files || [])[0]; if (f && f.type.startsWith('image/')) { e.preventDefault(); if (!attachment) pick(f); } }}
                                    placeholder={speech.listening ? 'Listening… speak now' : 'Describe the problem…'}
                                    className="flex-1 resize-none bg-transparent px-1.5 py-2 text-[14.5px] leading-[1.45] text-ink placeholder:text-ink-4 outline-none max-h-40" />
                                {speech.supported && (
                                    <button type="button" aria-label={speech.listening ? 'Stop dictation' : 'Dictate your message'} title={speech.listening ? 'Stop dictation' : 'Dictate (you can edit before sending)'} disabled={busy}
                                        onClick={() => (speech.listening ? speech.stop() : (dictBase.current = draft, speech.start()))}
                                        className={cn('w-9 h-9 shrink-0 rounded-xl flex items-center justify-center', speech.listening ? 'bg-red-50 text-red-600 ring-1 ring-red-200' : 'text-ink-3 hover:bg-surface-2 hover:text-ink')}>
                                        {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
                                    </button>
                                )}
                                <button type="button" aria-label="Send message" disabled={!canSend} onClick={() => send()}
                                    className="w-9 h-9 shrink-0 rounded-xl bg-heading text-white flex items-center justify-center disabled:bg-surface-3 disabled:text-ink-4 transition-colors">
                                    {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} />}
                                </button>
                            </div>
                        </div>
                        <p className="mt-1.5 text-[11.5px] text-ink-4 hidden sm:block">Mention the product or order if you can · Enter to send · Shift+Enter for a new line · Paste or drop a screenshot</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Mark() {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/atlantis-mark.png" alt="" className="w-8 h-8 rounded-lg ring-1 ring-line bg-surface object-contain p-1 shrink-0" />;
}

function AssistantBubble({ text, team, at }: { text: string; team?: boolean; at?: string }) {
    const { body, links } = splitLinks(text);
    return (
        <div className="flex items-start gap-3">
            {team ? <span className="w-8 h-8 rounded-lg bg-teal-soft text-teal flex items-center justify-center shrink-0"><Users size={15} /></span> : <Mark />}
            <div className="min-w-0 max-w-[85%] sm:max-w-[78%]">
                <p className="mb-1 text-[12px] font-medium text-ink-3">{team ? 'Atlantis team' : 'Atlantis assistant'}{at ? <span className="ms-1.5 font-normal text-ink-4">{time(at)}</span> : null}</p>
                <div className="rounded-2xl rounded-tl-md bg-surface-2 px-4 py-2.5 text-[14.5px] leading-relaxed text-ink">
                    <RichText text={body} />
                </div>
                {links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {links.map((l) => <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 h-8 px-3 rounded-full ring-1 ring-line bg-surface text-[12.5px] font-medium text-heading hover:ring-teal">{l.label} <ArrowRight size={12} /></Link>)}
                    </div>
                )}
            </div>
        </div>
    );
}

function UserBubble({ t, onRetry }: { t: Turn; onRetry: () => void }) {
    return (
        <div className="flex flex-col items-end">
            <div className={cn('max-w-[85%] sm:max-w-[72%] rounded-2xl rounded-tr-md bg-heading text-white px-4 py-2.5 text-[14.5px] leading-relaxed', t.state === 'sending' && 'opacity-70')}>
                {t.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt="Attached screenshot" className="mb-2 max-h-56 rounded-lg bg-white/10" />
                )}
                {t.text && <p className="whitespace-pre-wrap break-words">{t.text}</p>}
            </div>
            <p className="mt-1 text-[11.5px] text-ink-4">
                {t.state === 'sending' ? 'Sending…' : t.state ? (
                    <span className="inline-flex items-center gap-1.5 text-red-700"><AlertCircle size={12} /> {t.error || (t.state === 'failed-send' ? 'Not sent' : 'No answer yet')}
                        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline"><RotateCcw size={11} /> Retry</button></span>
                ) : time(t.createdAt)}
            </p>
        </div>
    );
}
