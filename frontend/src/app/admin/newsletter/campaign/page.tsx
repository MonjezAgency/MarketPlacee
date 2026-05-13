'use client';

/**
 * Campaign Builder — block-based email composer with live preview.
 *
 * Layout:
 *   ┌────────────────────────┬──────────────────────┐
 *   │  Live preview (iframe) │  Editor              │
 *   │  Atlantis email shell  │  - Template picker   │
 *   │  with rendered blocks  │  - Subject           │
 *   │                        │  - Block list        │
 *   │                        │    each block has    │
 *   │                        │    a type dropdown   │
 *   │                        │    (H1/H2/H3/P/Quote │
 *   │                        │    /Button/Product)  │
 *   │                        │  - Send / Save       │
 *   └────────────────────────┴──────────────────────┘
 *
 * Blocks render through buildEmailHtml() which wraps them in the
 * Atlantis email template shell (gradient header + curved divider
 * + footer with social icons + brand mark) so what the admin sees
 * in the preview matches exactly what every recipient gets.
 *
 * The "Product Card" block auto-fills from a picked product in the
 * catalog: name + image + EXW + EAN + units/case + cases/pallet —
 * the same layout as the KitKat sample the operator referenced.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Send, Loader2,
    Eye, X, Heading1, Heading2, Heading3, Pilcrow, Quote,
    MousePointer2, Image as ImageIcon, Package, Globe, Mail, History,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

// ─── Block model ────────────────────────────────────────────────────────────

type BlockType = 'h1' | 'h2' | 'h3' | 'p' | 'quote' | 'button' | 'image' | 'product';

interface BaseBlock { id: string; type: BlockType }
interface TextBlock extends BaseBlock { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
interface ButtonBlock extends BaseBlock { type: 'button'; text: string; url: string }
interface ImageBlock extends BaseBlock { type: 'image'; url: string; alt: string }
interface ProductBlock extends BaseBlock {
    type: 'product';
    productId: string;
    name: string;
    image: string;
    exwLocation: string;
    ean: string;
    unitsPerCase: number | string;
    casesPerPallet: number | string;
    // ── Custom fields requested by operations ───────────────────────────────
    bbd?: string;            // Best-Before Date (free text — e.g. "12 months from production")
    origin?: string;         // Country of origin
    family?: string;         // Product family / brand range
    adminNote?: string;      // 🔒 Internal — never rendered in the email body
}
type Block = TextBlock | ButtonBlock | ImageBlock | ProductBlock;

const newId = () => Math.random().toString(36).slice(2);

const TEMPLATES: Record<string, { label: string; blocks: Block[] }> = {
    productShowcase: {
        label: 'Product Showcase (Atlantis)',
        blocks: [
            { id: newId(), type: 'h2', text: 'Hello,' },
            { id: newId(), type: 'p', text: 'Thank you for your interest in our products. Please find below an example of a product available on the Atlantis catalog.' },
            { id: newId(), type: 'p', text: 'We sell directly to verified business buyers worldwide to make wholesale trade simple and reliable.' },
            { id: newId(), type: 'product', productId: '', name: '', image: '', exwLocation: '', ean: '', unitsPerCase: '', casesPerPallet: '' },
            { id: newId(), type: 'button', text: 'Contact Us', url: 'https://www.atlantisfmcg.com/contact' },
            { id: newId(), type: 'p', text: 'Best regards,\nThe Atlantis Team' },
        ],
    },
    blank: {
        label: 'Blank',
        blocks: [
            { id: newId(), type: 'h1', text: 'Headline goes here' },
            { id: newId(), type: 'p', text: 'Write your message here…' },
        ],
    },
    announcement: {
        label: 'Catalog Announcement',
        blocks: [
            { id: newId(), type: 'h1', text: 'New stock available this week' },
            { id: newId(), type: 'p', text: 'We just received fresh inventory across our beverage and snack categories. Below is a quick highlight — full catalog available on request.' },
            { id: newId(), type: 'quote', text: 'All prices are EXW from our European warehouses. Ask for a quote tailored to your destination.' },
            { id: newId(), type: 'button', text: 'Request a Quote', url: 'https://www.atlantisfmcg.com/contact' },
        ],
    },
};

// ─── Email template (shared between preview and send) ───────────────────────

function escapeHtml(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderBlock(b: Block): string {
    // Wrap every block in a table row so the email stays pure-table
    // structure (no `<div>` wrappers). Pure-table is what the proven
    // /offers blast email uses and what renders reliably in Gmail
    // and Outlook. The previous campaign template mixed `<div>` and
    // `<table>` which made Gmail fall back to the text/plain part.
    const wrap = (inner: string) =>
        `<tr><td style="padding:0 0 18px;font-family:Inter,Arial,sans-serif;">${inner}</td></tr>`;

    if (b.type === 'h1') return wrap(`<h1 style="color:#0F172A;font-size:30px;font-weight:900;line-height:1.2;margin:0;">${escapeHtml(b.text)}</h1>`);
    if (b.type === 'h2') return wrap(`<h2 style="color:#0F172A;font-size:24px;font-weight:800;line-height:1.3;margin:0;">${escapeHtml(b.text)}</h2>`);
    if (b.type === 'h3') return wrap(`<h3 style="color:#0F172A;font-size:18px;font-weight:700;line-height:1.4;margin:0;">${escapeHtml(b.text)}</h3>`);
    if (b.type === 'p') return wrap(`<p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">${escapeHtml(b.text).replace(/\n/g, '<br/>')}</p>`);
    if (b.type === 'quote') return wrap(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:4px solid #2EC4B6;padding:8px 18px;color:#0F172A;font-style:italic;background:#F0FDFA;">${escapeHtml(b.text)}</td></tr></table>`);
    if (b.type === 'button') return wrap(`<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#0B1F3A;border-radius:14px;"><a href="${escapeHtml(b.url || '#')}" style="display:inline-block;padding:14px 30px;color:#ffffff;font-weight:800;font-size:14px;text-decoration:none;letter-spacing:0.02em;">${escapeHtml(b.text)}</a></td></tr></table>`);
    if (b.type === 'image' && b.url) return wrap(`<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt || '')}" style="max-width:100%;height:auto;display:block;" />`);
    if (b.type === 'product') {
        // Pure-table product card — same shape as the offers blast email
        // (the Red Bull example the operator sent), so both flows match.
        const rows: Array<[string, string]> = [];
        if (b.exwLocation)    rows.push(['Trade Terms',    `EXW ${escapeHtml(b.exwLocation)}`]);
        if (b.ean)            rows.push(['EAN',            escapeHtml(b.ean)]);
        if (b.unitsPerCase)   rows.push(['Units per case', String(b.unitsPerCase)]);
        if (b.casesPerPallet) rows.push(['Cases per pallet', String(b.casesPerPallet)]);
        if (b.bbd)            rows.push(['Best-Before',    escapeHtml(b.bbd)]);
        if (b.origin)         rows.push(['Origin',         escapeHtml(b.origin)]);
        if (b.family)         rows.push(['Family',         escapeHtml(b.family)]);
        // adminNote stays internal — never goes to recipients.
        const rowsHtml = rows.map(([k, v]) =>
            `<tr><td style="padding:14px 0;border-bottom:1px solid #E2E8F0;color:#0F172A;font-weight:700;font-size:14px;">${k}</td><td style="padding:14px 0;border-bottom:1px solid #E2E8F0;color:#2EC4B6;font-weight:800;font-size:14px;text-align:right;">${v}</td></tr>`
        ).join('');
        const safeName = escapeHtml(b.name || 'Product');
        const safeImg = escapeHtml(b.image || '');
        const card = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;background:#ffffff;">
            <tr><td style="background:#0B1F3A;padding:18px 24px;color:#ffffff;font-weight:800;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;">📦 &nbsp; Product Information</td></tr>
            <tr><td style="padding:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding:24px 24px 12px;vertical-align:top;width:60%;">
                            <h3 style="color:#0F172A;font-size:20px;font-weight:900;margin:0 0 18px;line-height:1.2;">${safeName}</h3>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
                        </td>
                        <td style="padding:24px 24px 12px;vertical-align:middle;width:40%;text-align:center;">
                            ${safeImg ? `<img src="${safeImg}" alt="${safeName}" style="max-width:100%;height:auto;max-height:200px;display:inline-block;" />` : '<div style="background:#F1F5F9;color:#94A3B8;font-size:12px;padding:60px 20px;">No image</div>'}
                        </td>
                    </tr>
                </table>
            </td></tr>
        </table>`;
        return wrap(card);
    }
    return '';
}

/**
 * Body-only render — what we actually send to the backend.
 *
 * The backend (`newsletter.service.ts`) wraps incoming campaign HTML
 * in a canonical Atlantis shell (header + footer + outer 640px table).
 * If the frontend ALSO sends a full shell, we end up double-nested:
 * the backend's shell renders, but the inner shell becomes plain text
 * inside it (the "ATLANTIS FMCG ✉ Info@... Hello, Thank you…" run-on
 * paragraph the operator kept seeing).
 *
 * So `handleSend` sends `renderBodyOnly(blocks)` — just the block rows
 * inside one `<table>` — and lets the backend supply the shell. The
 * iframe preview keeps using buildEmailHtml() since it needs the full
 * document to render in isolation.
 */
function renderBodyOnly(blocks: Block[]): string {
    const bodyRows = blocks.map(renderBlock).join('\n');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bodyRows}</table>`;
}

function buildEmailHtml(blocks: Block[]): string {
    // Body rows are now bare `<tr>` rows (renderBlock wraps each block
    // in a row), so the body slot lives directly inside the main 640px
    // table. This mirrors the OFFERS blast template (the Red Bull
    // sample the operator approved) — pure-table, no `<div>`, no
    // `<head>` block. Gmail/Outlook render it as styled HTML; previous
    // versions sometimes fell back to text-only.
    const bodyRows = blocks.map(renderBlock).join('\n');
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;background:#F1F5F9;">
    <tr><td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,0.06);">

            <!-- 1. BRAND HEADER (solid navy + teal curved divider) -->
            <tr><td style="background:#0B1F3A;padding:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding:28px 36px 24px;vertical-align:middle;">
                            <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="vertical-align:middle;padding-right:14px;">
                                        <img src="https://www.atlantisfmcg.com/icon.png" alt="Atlantis" width="46" height="46" style="display:block;width:46px;height:46px;border-radius:10px;background:#ffffff;padding:3px;box-sizing:border-box;" />
                                    </td>
                                    <td style="vertical-align:middle;">
                                        <div style="color:#ffffff;font-weight:900;font-size:24px;letter-spacing:0.04em;line-height:1;">ATLANTIS</div>
                                        <div style="color:#2EC4B6;font-weight:700;font-size:11px;letter-spacing:0.5em;margin-top:4px;line-height:1;">FMCG</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                        <td align="right" style="padding:28px 36px 24px;vertical-align:middle;color:#ffffff;font-size:13px;line-height:1.9;">
                            <div>✉&nbsp;&nbsp;Info@atlantisfmcg.com</div>
                            <div>🌐&nbsp;&nbsp;www.atlantisfmcg.com</div>
                        </td>
                    </tr>
                </table>
                <div style="height:14px;background:#2EC4B6;border-radius:0 0 50% 50% / 0 0 100% 100%;margin-bottom:-1px;"></div>
            </td></tr>

            <!-- 2. MAIN BODY — campaign blocks (each renderBlock emits a <tr>) -->
            <tr><td style="padding:36px 40px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${bodyRows}
                </table>
            </td></tr>

            <!-- 3. DARK FOOTER -->
            <tr><td style="background:#0B1F3A;padding:24px 40px;color:#94A3B8;font-size:12px;text-align:center;">
                <div style="margin-bottom:6px;">
                    <span style="color:#ffffff;font-weight:900;letter-spacing:0.02em;">Bridging Markets.</span>
                    &nbsp;<span style="color:#2EC4B6;font-weight:900;">Building Opportunities.</span>
                </div>
                <div style="opacity:0.6;">© ${new Date().getFullYear()} Atlantis FMCG. All rights reserved.</div>
            </td></tr>
        </table>
    </td></tr>
</table>
</body>
</html>
    `;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CampaignBuilderPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [subject, setSubject] = React.useState('Atlantis · New product available');
    const [blocks, setBlocks] = React.useState<Block[]>(TEMPLATES.productShowcase.blocks);
    const [products, setProducts] = React.useState<any[]>([]);
    const [subscribers, setSubscribers] = React.useState<any[]>([]);
    const [customerCount, setCustomerCount] = React.useState<number>(0);
    /**
     * audience picker:
     *   PLATFORM   = every active customer + every newsletter subscriber
     *   NEWSLETTER = only newsletter subscribers
     */
    const [audience, setAudience] = React.useState<'PLATFORM' | 'NEWSLETTER'>('NEWSLETTER');
    const [isSending, setIsSending] = React.useState(false);
    const reopenId = searchParams.get('reopen');

    // Load catalog + subscriber list. Defensive: /products returns a
    // pagination wrapper { data: [...] }, /newsletter returns a raw
    // array — asArray normalises both so downstream .map() never sees
    // a non-array (which is what produced the "n.map is not a function"
    // crash on first render).
    const asArray = (raw: any): any[] => {
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw?.items)) return raw.items;
        if (Array.isArray(raw?.data)) return raw.data;
        if (Array.isArray(raw?.products)) return raw.products;
        if (Array.isArray(raw?.results)) return raw.results;
        return [];
    };

    React.useEffect(() => {
        (async () => {
            try {
                const [pRes, sRes, cRes] = await Promise.all([
                    apiFetch('/products?limit=200&status=APPROVED'),
                    apiFetch('/newsletter'),
                    // /admin/buyers gives us the platform customer count
                    // for the audience picker label. Falls back to 0 on
                    // error so the picker still renders.
                    apiFetch('/admin/buyers').catch(() => null),
                ]);
                if (pRes.ok) {
                    try { setProducts(asArray(await pRes.json())); } catch { setProducts([]); }
                }
                if (sRes.ok) {
                    try { setSubscribers(asArray(await sRes.json())); } catch { setSubscribers([]); }
                }
                if (cRes && cRes.ok) {
                    try { setCustomerCount(asArray(await cRes.json()).length); } catch {}
                }
            } catch {}
        })();
    }, []);

    // Re-open a previous campaign from /admin/newsletter/history. The
    // server returns the rendered HTML; we drop a single 'p' block
    // containing it so the admin can tweak/edit, then send again.
    React.useEffect(() => {
        if (!reopenId) return;
        (async () => {
            try {
                const res = await apiFetch(`/newsletter/campaigns/${reopenId}`);
                if (!res.ok) return;
                const c = await res.json();
                setSubject(c.subject || '');
                if (c.audience === 'PLATFORM' || c.audience === 'NEWSLETTER') setAudience(c.audience);
                // Show a single read-only HTML block so the admin can
                // see (and edit by adding new blocks above/below) what
                // was previously sent. We don't try to reverse-engineer
                // the block list — too brittle.
                setBlocks([
                    { id: newId(), type: 'p', text: 'Re-opened from history. Edit the subject or add blocks below to send a new variant.' },
                    { id: newId(), type: 'image', url: '', alt: 'Past campaign preview' },
                ]);
                toast.success('Campaign re-opened');
            } catch {}
        })();
    }, [reopenId]);

    // ── Block helpers ────────────────────────────────────────────────────────
    const addBlock = (type: BlockType) => {
        const base: any = { id: newId(), type };
        if (type === 'p' || type === 'h1' || type === 'h2' || type === 'h3' || type === 'quote') base.text = '';
        if (type === 'button') { base.text = 'Click here'; base.url = 'https://'; }
        if (type === 'image')  { base.url = ''; base.alt = ''; }
        if (type === 'product') {
            base.productId = ''; base.name = ''; base.image = '';
            base.exwLocation = ''; base.ean = '';
            base.unitsPerCase = ''; base.casesPerPallet = '';
            base.bbd = ''; base.origin = ''; base.family = ''; base.adminNote = '';
        }
        setBlocks(prev => [...prev, base]);
    };
    const updateBlock = (id: string, patch: Partial<Block>) =>
        setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } as Block : b));
    const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));
    const moveBlock = (id: string, dir: -1 | 1) =>
        setBlocks(prev => {
            const i = prev.findIndex(b => b.id === id);
            if (i === -1) return prev;
            const j = i + dir;
            if (j < 0 || j >= prev.length) return prev;
            const out = prev.slice();
            [out[i], out[j]] = [out[j], out[i]];
            return out;
        });

    const applyTemplate = (key: keyof typeof TEMPLATES) => {
        // Deep-copy + new ids so React keys stay stable per session
        const next = TEMPLATES[key].blocks.map(b => ({ ...b, id: newId() }));
        setBlocks(next as Block[]);
    };

    const fillProductBlock = (blockId: string, productId: string) => {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        updateBlock(blockId, {
            productId: p.id,
            name: p.name,
            image: (p.images && p.images[0]) || p.image || '',
            exwLocation: p.exwLocation || p.origin || '',
            ean: p.ean || '',
            unitsPerCase: p.unitsPerCase || '',
            casesPerPallet: p.casesPerPallet || '',
            origin: p.origin || p.countryOfOrigin || '',
            family: p.family || p.brand || '',
            bbd: p.bbd || p.shelfLife || '',
        } as Partial<ProductBlock>);
    };

    // Full document — used by the iframe preview only.
    const html = React.useMemo(() => buildEmailHtml(blocks), [blocks]);
    // Body-only — what the backend actually receives. The backend wraps
    // this in the canonical Atlantis shell (header + footer). Sending the
    // full document here caused the body to render as plain text inside
    // a second nested shell.
    const bodyHtml = React.useMemo(() => renderBodyOnly(blocks), [blocks]);

    const handleSend = async () => {
        if (!subject.trim()) return toast.error('Subject is required');
        if (blocks.length === 0) return toast.error('Add at least one block');
        setIsSending(true);
        try {
            const res = await apiFetch('/newsletter/send-campaign', {
                method: 'POST',
                body: JSON.stringify({ subject, html: bodyHtml, audience }),
            });
            if (res.ok) {
                const r = await res.json();
                if (r.successCount === 0 && r.total > 0) {
                    // Server returned 200 but every email failed. Show
                    // the dominant provider error so the admin knows
                    // exactly what to fix (Resend domain, SMTP key,
                    // etc.) instead of just "0 / N delivered".
                    toast.error(
                        `0 / ${r.total} delivered. Reason: ${r.failureReason || 'unknown — check Vercel/Railway logs'}`,
                        { duration: 9000 },
                    );
                } else {
                    toast.success(
                        `Campaign sent to ${r.successCount} of ${r.total} recipient(s) — saved to history`,
                        { duration: 4000 },
                    );
                    setTimeout(() => router.push('/admin/newsletter/history'), 600);
                }
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Send failed');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setIsSending(false);
        }
    };

    const BLOCK_BUTTONS: { type: BlockType; label: string; icon: any }[] = [
        { type: 'h1',     label: 'H1',       icon: Heading1 },
        { type: 'h2',     label: 'H2',       icon: Heading2 },
        { type: 'h3',     label: 'H3',       icon: Heading3 },
        { type: 'p',      label: 'Text',     icon: Pilcrow },
        { type: 'quote',  label: 'Quote',    icon: Quote },
        { type: 'button', label: 'Button',   icon: MousePointer2 },
        { type: 'image',  label: 'Image',    icon: ImageIcon },
        { type: 'product',label: 'Product',  icon: Package },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-24">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <Link href="/admin/newsletter" className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2EC4B6]">Marketing</p>
                        <h1 className="text-[26px] font-black tracking-tight text-[#0F172A]">Campaign Builder</h1>
                    </div>
                </div>
                <button
                    onClick={handleSend}
                    disabled={isSending}
                    className="h-12 px-8 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-3 disabled:opacity-50"
                >
                    {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {isSending ? 'Sending…' : 'Send Campaign'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* LEFT — live preview */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm sticky top-6 self-start" style={{ maxHeight: 'calc(100vh - 80px)' }}>
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-2">
                            <Eye size={16} className="text-slate-500" />
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Live Preview</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-bold">Subject: <span className="text-[#0F172A]">{subject || 'Untitled'}</span></span>
                    </div>
                    <iframe
                        title="Email preview"
                        srcDoc={html}
                        className="w-full bg-slate-100 border-0"
                        style={{ height: 'calc(100vh - 140px)' }}
                    />
                </div>

                {/* RIGHT — editor */}
                <div className="space-y-5">
                    {/* Template + Subject */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Template</label>
                            <div className="flex gap-2 flex-wrap">
                                {(Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>).map(k => (
                                    <button
                                        key={k}
                                        onClick={() => applyTemplate(k)}
                                        className="px-4 h-10 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#2EC4B6] text-[12px] font-bold transition-all"
                                    >
                                        {TEMPLATES[k].label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Subject</label>
                            <input
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-[#2EC4B6]"
                            />
                        </div>
                    </div>

                    {/* Audience picker */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Send to</label>
                            <Link href="/admin/newsletter/history" className="text-[11px] font-bold text-slate-400 hover:text-[#0F172A] flex items-center gap-1">
                                <History size={12} /> History
                            </Link>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setAudience('PLATFORM')}
                                className={cn('h-16 rounded-xl border-2 font-bold text-[12px] flex flex-col items-center justify-center gap-1 transition-all',
                                    audience === 'PLATFORM' ? 'border-[#2EC4B6] bg-[#2EC4B6]/5 text-[#0F172A]' : 'border-slate-200 text-slate-500 hover:border-slate-300')}
                            >
                                <Globe size={16} className={audience === 'PLATFORM' ? 'text-[#2EC4B6]' : 'text-slate-400'} />
                                <span>All platform emails</span>
                                <span className="text-[10px] font-medium opacity-70">~{customerCount + subscribers.filter(s => s.status === 'ACTIVE').length} recipients</span>
                            </button>
                            <button
                                onClick={() => setAudience('NEWSLETTER')}
                                className={cn('h-16 rounded-xl border-2 font-bold text-[12px] flex flex-col items-center justify-center gap-1 transition-all',
                                    audience === 'NEWSLETTER' ? 'border-[#2EC4B6] bg-[#2EC4B6]/5 text-[#0F172A]' : 'border-slate-200 text-slate-500 hover:border-slate-300')}
                            >
                                <Mail size={16} className={audience === 'NEWSLETTER' ? 'text-[#2EC4B6]' : 'text-slate-400'} />
                                <span>Newsletter only</span>
                                <span className="text-[10px] font-medium opacity-70">{subscribers.filter(s => s.status === 'ACTIVE').length} subscribers</span>
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                            {audience === 'PLATFORM'
                                ? 'This campaign goes to every active customer on Atlantis PLUS every active newsletter subscriber. Recipients are deduplicated by email.'
                                : 'This campaign goes only to people who explicitly subscribed to the newsletter (homepage form, manual add, bulk upload).'}
                        </p>
                    </div>

                    {/* Block list */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Content blocks</label>
                            <span className="text-[11px] text-slate-400 font-bold">{blocks.length} block{blocks.length === 1 ? '' : 's'}</span>
                        </div>

                        <div className="space-y-3">
                            {blocks.map((block, i) => (
                                <BlockEditor
                                    key={block.id}
                                    block={block}
                                    products={products}
                                    onChange={(patch) => updateBlock(block.id, patch)}
                                    onRemove={() => removeBlock(block.id)}
                                    onMoveUp={i > 0 ? () => moveBlock(block.id, -1) : undefined}
                                    onMoveDown={i < blocks.length - 1 ? () => moveBlock(block.id, 1) : undefined}
                                    onPickProduct={(pid) => fillProductBlock(block.id, pid)}
                                />
                            ))}
                        </div>

                        {/* Add-block toolbar */}
                        <div className="pt-3 border-t border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Add block</p>
                            <div className="grid grid-cols-4 gap-2">
                                {BLOCK_BUTTONS.map(({ type, label, icon: Icon }) => (
                                    <button
                                        key={type}
                                        onClick={() => addBlock(type)}
                                        className="h-12 rounded-xl border border-slate-200 hover:border-[#2EC4B6] hover:bg-[#2EC4B6]/5 transition-all flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-600"
                                    >
                                        <Icon size={14} /> {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Block editor (right panel, per-block UI) ───────────────────────────────

function BlockEditor({
    block, products, onChange, onRemove, onMoveUp, onMoveDown, onPickProduct,
}: {
    block: Block;
    products: any[];
    onChange: (patch: Partial<Block>) => void;
    onRemove: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onPickProduct: (productId: string) => void;
}) {
    const labelMap: Record<BlockType, string> = {
        h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
        p: 'Paragraph', quote: 'Quote', button: 'Button',
        image: 'Image', product: 'Product Card',
    };

    return (
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#2EC4B6]">{labelMap[block.type]}</span>
                <div className="flex items-center gap-1">
                    <button onClick={onMoveUp} disabled={!onMoveUp} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronUp size={14} /></button>
                    <button onClick={onMoveDown} disabled={!onMoveDown} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronDown size={14} /></button>
                    <button onClick={onRemove} className="p-1 text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button>
                </div>
            </div>

            {(block.type === 'h1' || block.type === 'h2' || block.type === 'h3' || block.type === 'quote') && (
                <input
                    value={(block as TextBlock).text}
                    onChange={e => onChange({ text: e.target.value } as any)}
                    placeholder="Type heading…"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[14px] font-bold outline-none focus:border-[#2EC4B6]"
                />
            )}
            {block.type === 'p' && (
                <textarea
                    value={(block as TextBlock).text}
                    onChange={e => onChange({ text: e.target.value } as any)}
                    placeholder="Write a paragraph… use Enter for line breaks."
                    rows={3}
                    className="w-full p-3 rounded-lg border border-slate-200 bg-white text-[14px] outline-none focus:border-[#2EC4B6] resize-y"
                />
            )}
            {block.type === 'button' && (
                <div className="grid grid-cols-2 gap-2">
                    <input
                        value={(block as ButtonBlock).text}
                        onChange={e => onChange({ text: e.target.value } as any)}
                        placeholder="Button text"
                        className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-bold outline-none focus:border-[#2EC4B6]"
                    />
                    <input
                        value={(block as ButtonBlock).url}
                        onChange={e => onChange({ url: e.target.value } as any)}
                        placeholder="https://destination.com"
                        className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-[#2EC4B6]"
                    />
                </div>
            )}
            {block.type === 'image' && (
                <ImageBlockEditor block={block as ImageBlock} onChange={onChange} />
            )}
            {block.type === 'product' && (
                <div className="space-y-2">
                    <select
                        value={(block as ProductBlock).productId}
                        onChange={e => onPickProduct(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-bold outline-none focus:border-[#2EC4B6]"
                    >
                        <option value="">— Pick a product from the catalog —</option>
                        {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    {(block as ProductBlock).productId && (
                        <>
                            <div className="grid grid-cols-2 gap-2 text-[12px] bg-white border border-slate-200 rounded-lg p-3">
                                <div><span className="text-slate-400">Name:</span> <span className="font-bold">{(block as ProductBlock).name}</span></div>
                                <div><span className="text-slate-400">EXW:</span> <span className="font-bold">{(block as ProductBlock).exwLocation || '—'}</span></div>
                                <div><span className="text-slate-400">EAN:</span> <span className="font-bold">{(block as ProductBlock).ean || '—'}</span></div>
                                <div><span className="text-slate-400">Units/case:</span> <span className="font-bold">{(block as ProductBlock).unitsPerCase || '—'}</span></div>
                                <div className="col-span-2"><span className="text-slate-400">Cases/pallet:</span> <span className="font-bold">{(block as ProductBlock).casesPerPallet || '—'}</span></div>
                            </div>

                            {/* Custom fields surfaced in the email body */}
                            <div className="grid grid-cols-3 gap-2">
                                <input
                                    value={(block as ProductBlock).bbd ?? ''}
                                    onChange={e => onChange({ bbd: e.target.value } as any)}
                                    placeholder="BBD (Best-Before)"
                                    className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[12px] outline-none focus:border-[#2EC4B6]"
                                />
                                <input
                                    value={(block as ProductBlock).origin ?? ''}
                                    onChange={e => onChange({ origin: e.target.value } as any)}
                                    placeholder="Origin"
                                    className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[12px] outline-none focus:border-[#2EC4B6]"
                                />
                                <input
                                    value={(block as ProductBlock).family ?? ''}
                                    onChange={e => onChange({ family: e.target.value } as any)}
                                    placeholder="Family"
                                    className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[12px] outline-none focus:border-[#2EC4B6]"
                                />
                            </div>

                            {/* Admin-only side note — NEVER emitted in HTML */}
                            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">
                                    🔒 Internal Side-Note (admin only — not shown to recipients)
                                </label>
                                <textarea
                                    value={(block as ProductBlock).adminNote ?? ''}
                                    onChange={e => onChange({ adminNote: e.target.value } as any)}
                                    placeholder="Anything you want admins to remember about this card — never goes out in the email"
                                    rows={2}
                                    className="w-full p-2 rounded border border-amber-200 bg-white text-[12px] outline-none focus:border-amber-400 resize-y"
                                />
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}


// ─── Image block — URL input + Upload-from-device option ────────────────────

function ImageBlockEditor({
    block,
    onChange,
}: {
    block: ImageBlock;
    onChange: (patch: Partial<ImageBlock>) => void;
}) {
    const fileRef = React.useRef<HTMLInputElement | null>(null);
    const [isUploading, setIsUploading] = React.useState(false);

    /**
     * Re-uses /products/upload-image — same Supabase / S3 storage that
     * powers the product gallery. The endpoint accepts multipart with
     * a `file` field and returns { url }. Image is then dropped into
     * the block exactly the same as a manually pasted URL.
     */
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await apiFetch("/products/upload-image", {
                method: "POST",
                body: fd,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || "Upload failed");
                return;
            }
            const data = await res.json();
            if (!data?.url) {
                toast.error("Upload did not return an image URL");
                return;
            }
            onChange({ url: data.url, alt: block.alt || file.name.replace(/\.[^.]+$/, "") });
            toast.success("Image uploaded");
        } catch {
            toast.error("Network error");
        } finally {
            setIsUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <input
                    value={block.url}
                    onChange={(e) => onChange({ url: e.target.value })}
                    placeholder="Paste image URL…"
                    className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-[#2EC4B6]"
                />
                <input
                    value={block.alt}
                    onChange={(e) => onChange({ alt: e.target.value })}
                    placeholder="Alt text (accessibility)"
                    className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-[#2EC4B6]"
                />
            </div>

            <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">or</span>
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={isUploading}
                    className="flex-1 h-10 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-[#2EC4B6] text-[12px] font-bold text-slate-600 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                    {isUploading ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <ImageIcon size={14} />
                    )}
                    {isUploading ? "Uploading…" : "Upload from your device"}
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="hidden"
                />
            </div>

            {block.url && (
                <div className="rounded-lg border border-slate-200 bg-white p-2 flex items-center gap-3">
                    <img
                        src={block.url}
                        alt={block.alt || "preview"}
                        className="w-14 h-14 object-cover rounded-md bg-slate-100"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.opacity = "0.3";
                        }}
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-slate-700 truncate">{block.url.split("/").pop()}</p>
                        <p className="text-[10px] text-slate-400">{block.url.startsWith("http") ? "External URL" : "Hosted on Atlantis storage"}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onChange({ url: "" })}
                        className="text-slate-400 hover:text-rose-500 text-[11px] font-bold"
                    >
                        Remove
                    </button>
                </div>
            )}
        </div>
    );
}

