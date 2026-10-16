'use client';

import * as React from 'react';
import { ArrowUp, ImagePlus, Loader2, Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Browser dictation — offered only where the browser actually supports it. */
export function useSpeech(onText: (t: string, final: boolean) => void) {
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

/**
 * The one message composer: auto-growing textarea, Enter to send,
 * Shift+Enter for a new line. Attachment and dictation appear only when the
 * caller wires them up (i.e. when they work for this conversation).
 */
export const Composer = React.forwardRef<HTMLTextAreaElement, {
    id: string; value: string; onChange: (v: string) => void; onSend: () => void;
    canSend: boolean; busy: boolean; placeholder: string; hint?: React.ReactNode;
    onAttach?: () => void; attachDisabled?: boolean; attachmentSlot?: React.ReactNode;
    onPasteImage?: (f: File) => void;
    speech?: { supported: boolean; listening: boolean; start: () => void; stop: () => void };
    disabled?: boolean;
}>(function Composer({ id, value, onChange, onSend, canSend, busy, placeholder, hint, onAttach, attachDisabled, attachmentSlot, onPasteImage, speech, disabled }, ref) {
    const inner = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
    React.useEffect(() => { const el = inner.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 144)}px`; }, [value]);
    const iconBtn = 'w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] disabled:opacity-40 disabled:hover:bg-transparent';
    return (
        <div>
            <div className={cn('rounded-xl ring-1 ring-line-strong bg-surface transition-shadow duration-150 focus-within:ring-2 focus-within:ring-[#2EC4B6]', disabled && 'opacity-60')}>
                {attachmentSlot}
                <div className="flex items-end gap-1 p-1.5">
                    {onAttach && <button type="button" aria-label="Attach a screenshot" title="Attach a screenshot (JPEG, PNG or WebP, up to 6 MB)" disabled={attachDisabled || disabled} onClick={onAttach} className={iconBtn}><ImagePlus size={18} /></button>}
                    <label htmlFor={id} className="sr-only">Message</label>
                    <textarea id={id} ref={inner} rows={1} value={value} disabled={disabled}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSend) onSend(); } }}
                        onPaste={(e) => { if (!onPasteImage) return; const f = Array.from(e.clipboardData.files || [])[0]; if (f && f.type.startsWith('image/')) { e.preventDefault(); onPasteImage(f); } }}
                        placeholder={placeholder}
                        className="flex-1 min-w-0 resize-none bg-transparent px-2 py-2.5 text-[14.5px] leading-[1.45] text-ink placeholder:text-ink-4 outline-none max-h-36" />
                    {speech?.supported && (
                        <button type="button" aria-label={speech.listening ? 'Stop dictation' : 'Dictate your message'} title={speech.listening ? 'Stop dictation' : 'Dictate (you can edit before sending)'} disabled={busy || disabled}
                            onClick={() => (speech.listening ? speech.stop() : speech.start())}
                            className={cn(iconBtn, speech.listening && 'bg-[#FEF2F2] text-[#B91C1C] ring-1 ring-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]')}>
                            {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>
                    )}
                    <button type="button" aria-label="Send message" disabled={!canSend} onClick={onSend}
                        className="w-10 h-10 shrink-0 rounded-lg bg-cta hover:bg-cta-hover text-cta-fg flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2 disabled:bg-surface-3 disabled:text-ink-4">
                        {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
                    </button>
                </div>
            </div>
            {hint && <p className="mt-1.5 hidden sm:block text-[12px] text-ink-4">{hint}</p>}
        </div>
    );
});

export function Kbd({ children }: { children: React.ReactNode }) {
    return <kbd className="inline-flex items-center h-[18px] px-1.5 rounded border border-line bg-surface-2 font-sans text-[11px] text-ink-3">{children}</kbd>;
}
