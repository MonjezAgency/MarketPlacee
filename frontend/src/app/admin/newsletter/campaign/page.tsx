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
import {
    ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Send, Loader2,
    Eye, X, Heading1, Heading2, Heading3, Pilcrow, Quote,
    MousePointer2, Image as ImageIcon, Package, Save,
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
    if (b.type === 'h1') return `<h1 style="color:#0F172A;font-family:'Inter',Arial,sans-serif;font-size:32px;font-weight:900;line-height:1.2;margin:0 0 18px;">${escapeHtml(b.text)}</h1>`;
    if (b.type === 'h2') return `<h2 style="color:#0F172A;font-family:'Inter',Arial,sans-serif;font-size:24px;font-weight:800;line-height:1.3;margin:0 0 14px;">${escapeHtml(b.text)}</h2>`;
    if (b.type === 'h3') return `<h3 style="color:#0F172A;font-family:'Inter',Arial,sans-serif;font-size:18px;font-weight:700;line-height:1.4;margin:0 0 10px;">${escapeHtml(b.text)}</h3>`;
    if (b.type === 'p') return `<p style="color:#475569;font-family:'Inter',Arial,sans-serif;font-size:15px;line-height:1.7;margin:0 0 16px;">${escapeHtml(b.text).replace(/\n/g, '<br/>')}</p>`;
    if (b.type === 'quote') return `<blockquote style="border-left:4px solid #2EC4B6;padding:8px 18px;margin:0 0 16px;color:#0F172A;font-style:italic;background:#F0FDFA;border-radius:0 8px 8px 0;">${escapeHtml(b.text)}</blockquote>`;
    if (b.type === 'button') return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td style="background:#0F172A;border-radius:14px;"><a href="${escapeHtml(b.url || '#')}" style="display:inline-block;padding:14px 30px;color:#ffffff;font-family:'Inter',Arial,sans-serif;font-weight:800;font-size:14px;text-decoration:none;letter-spacing:0.02em;">${escapeHtml(b.text)}</a></td></tr></table>`;
    if (b.type === 'image' && b.url) return `<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt || '')}" style="max-width:100%;height:auto;border-radius:12px;display:block;margin:0 0 16px;" />`;
    if (b.type === 'product') {
        // Product card mirroring the KitKat sample — image on the right at
        // a fixed cell, product info on the left as a definition list.
        const rows: Array<[string, string]> = [];
        if (b.exwLocation) rows.push(['Trade Terms', `EXW ${escapeHtml(b.exwLocation)}`]);
        if (b.ean)         rows.push(['EAN', escapeHtml(b.ean)]);
        if (b.unitsPerCase) rows.push(['Units per case', String(b.unitsPerCase)]);
        if (b.casesPerPallet) rows.push(['Cases per pallet', String(b.casesPerPallet)]);
        const rowsHtml = rows.map(([k, v]) =>
            `<tr><td style="padding:14px 0;border-bottom:1px solid #E2E8F0;color:#0F172A;font-weight:700;font-size:14px;font-family:'Inter',Arial,sans-serif;">${k}</td><td style="padding:14px 0;border-bottom:1px solid #E2E8F0;color:#2EC4B6;font-weight:800;font-size:14px;text-align:right;font-family:'Inter',Arial,sans-serif;">${v}</td></tr>`
        ).join('');
        const safeName = escapeHtml(b.name || 'Product');
        const safeImg = escapeHtml(b.image || '');
        return `
            <div style="border-radius:24px;overflow:hidden;border:1px solid #E2E8F0;margin:0 0 24px;background:#ffffff;">
                <div style="background:#0F172A;padding:18px 24px;color:#ffffff;font-family:'Inter',Arial,sans-serif;font-weight:800;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;">📦 &nbsp; Product Information</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                    <tr>
                        <td style="padding:24px 24px 12px;vertical-align:top;width:60%;">
                            <h3 style="color:#0F172A;font-family:'Inter',Arial,sans-serif;font-size:20px;font-weight:900;margin:0 0 18px;line-height:1.2;">${safeName}</h3>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
                        </td>
                        <td style="padding:24px 24px 12px;vertical-align:top;width:40%;text-align:center;">
                            ${safeImg ? `<img src="${safeImg}" alt="${safeName}" style="max-width:100%;height:auto;max-height:200px;display:inline-block;" />` : '<div style="background:#F1F5F9;border-radius:12px;padding:60px 20px;color:#94A3B8;font-size:12px;">No image</div>'}
                        </td>
                    </tr>
                </table>
            </div>
        `;
    }
    return '';
}

function buildEmailHtml(blocks: Block[]): string {
    const body = blocks.map(renderBlock).join('\n');
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Atlantis Marketplace</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.06);">

                    <!-- Atlantis brand header (gradient + curved divider) -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#0B1F3A 0%,#0F172A 100%);padding:36px 40px 48px;position:relative;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <table role="presentation" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding-right:14px;">
                                                    <div style="width:44px;height:44px;border-radius:12px;background:#2EC4B6;color:#0F172A;font-family:'Inter',Arial,sans-serif;font-size:22px;font-weight:900;text-align:center;line-height:44px;">A</div>
                                                </td>
                                                <td>
                                                    <div style="color:#ffffff;font-family:'Inter',Arial,sans-serif;font-weight:900;font-size:24px;letter-spacing:0.02em;">ATLANTIS</div>
                                                    <div style="color:#2EC4B6;font-family:'Inter',Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:0.4em;margin-top:2px;">FMCG</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td align="right" style="color:#ffffff;font-family:'Inter',Arial,sans-serif;font-size:13px;line-height:1.7;">
                                        <div>✉ Info@atlantisfmcg.com</div>
                                        <div>🌐 www.atlantisfmcg.com</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Main content -->
                    <tr>
                        <td style="padding:48px 40px 8px;">
                            ${body}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background:#0F172A;padding:32px 40px;color:#94A3B8;font-family:'Inter',Arial,sans-serif;font-size:12px;text-align:center;">
                            <div style="margin-bottom:6px;">
                                <span style="color:#ffffff;font-weight:900;letter-spacing:0.02em;">Bridging Markets.</span>
                                &nbsp;<span style="color:#2EC4B6;font-weight:900;">Building Opportunities.</span>
                            </div>
                            <div style="opacity:0.6;">© ${new Date().getFullYear()} Atlantis FMCG. All rights reserved.</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CampaignBuilderPage() {
    const [subject, setSubject] = React.useState('Atlantis · New product available');
    const [blocks, setBlocks] = React.useState<Block[]>(TEMPLATES.productShowcase.blocks);
    const [products, setProducts] = React.useState<any[]>([]);
    const [subscribers, setSubscribers] = React.useState<any[]>([]);
    const [recipientMode, setRecipientMode] = React.useState<'all' | 'select'>('all');
    const [selectedRecipients, setSelectedRecipients] = React.useState<string[]>([]);
    const [isSending, setIsSending] = React.useState(false);

    // Load catalog + subscriber list once for the picker / recipient selector.
    // Defensive: the /products endpoint returns either a raw array OR a
    // pagination wrapper { items: [...] } depending on the route. We pluck
    // the array out before storing so downstream .map() never sees a
    // non-array (which is what produced the "n.map is not a function"
    // crash on the campaign builder).
    React.useEffect(() => {
        const asArray = (raw: any): any[] => {
            if (Array.isArray(raw)) return raw;
            if (Array.isArray(raw?.items)) return raw.items;
            if (Array.isArray(raw?.data)) return raw.data;
            if (Array.isArray(raw?.products)) return raw.products;
            if (Array.isArray(raw?.results)) return raw.results;
            return [];
        };
        (async () => {
            try {
                const [pRes, sRes] = await Promise.all([
                    apiFetch('/products'),
                    apiFetch('/newsletter'),
                ]);
                if (pRes.ok) {
                    try { setProducts(asArray(await pRes.json())); } catch { setProducts([]); }
                }
                if (sRes.ok) {
                    try { setSubscribers(asArray(await sRes.json())); } catch { setSubscribers([]); }
                }
            } catch {}
        })();
    }, []);

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
        } as Partial<ProductBlock>);
    };

    const html = React.useMemo(() => buildEmailHtml(blocks), [blocks]);

    const handleSend = async () => {
        if (!subject.trim()) return toast.error('Subject is required');
        if (blocks.length === 0) return toast.error('Add at least one block');
        if (recipientMode === 'select' && selectedRecipients.length === 0) {
            return toast.error('Pick at least one recipient or switch to "All active"');
        }
        setIsSending(true);
        try {
            const res = await apiFetch('/newsletter/send-campaign', {
                method: 'POST',
                body: JSON.stringify({
                    subject,
                    html,
                    recipientIds: recipientMode === 'select' ? selectedRecipients : undefined,
                }),
            });
            if (res.ok) {
                const r = await res.json();
                toast.success(`Sent to ${r.successCount} of ${r.total} recipient(s)`);
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

                    {/* Recipients */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Recipients</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setRecipientMode('all')}
                                className={cn('h-12 rounded-xl border-2 font-bold text-[12px]',
                                    recipientMode === 'all' ? 'border-[#2EC4B6] bg-[#2EC4B6]/5 text-[#0F172A]' : 'border-slate-200 text-slate-500')}
                            >
                                All active ({subscribers.filter(s => s.status === 'ACTIVE').length})
                            </button>
                            <button
                                onClick={() => setRecipientMode('select')}
                                className={cn('h-12 rounded-xl border-2 font-bold text-[12px]',
                                    recipientMode === 'select' ? 'border-[#2EC4B6] bg-[#2EC4B6]/5 text-[#0F172A]' : 'border-slate-200 text-slate-500')}
                            >
                                Pick specific ({selectedRecipients.length})
                            </button>
                        </div>
                        {recipientMode === 'select' && (
                            <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
                                {subscribers.filter(s => s.status === 'ACTIVE').map(s => (
                                    <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedRecipients.includes(s.id)}
                                            onChange={() => setSelectedRecipients(prev =>
                                                prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                                            className="accent-[#2EC4B6]"
                                        />
                                        <span className="text-[13px] font-bold text-[#0F172A]">{s.name || s.email}</span>
                                        {s.name && <span className="text-[11px] text-slate-400">{s.email}</span>}
                                    </label>
                                ))}
                                {subscribers.filter(s => s.status === 'ACTIVE').length === 0 && (
                                    <p className="text-[12px] text-slate-400 text-center py-4">No active subscribers. Upload a client list first.</p>
                                )}
                            </div>
                        )}
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
                <div className="grid grid-cols-2 gap-2">
                    <input
                        value={(block as ImageBlock).url}
                        onChange={e => onChange({ url: e.target.value } as any)}
                        placeholder="Image URL"
                        className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-[#2EC4B6]"
                    />
                    <input
                        value={(block as ImageBlock).alt}
                        onChange={e => onChange({ alt: e.target.value } as any)}
                        placeholder="Alt text (accessibility)"
                        className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-[#2EC4B6]"
                    />
                </div>
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
                        <div className="grid grid-cols-2 gap-2 text-[12px] bg-white border border-slate-200 rounded-lg p-3">
                            <div><span className="text-slate-400">Name:</span> <span className="font-bold">{(block as ProductBlock).name}</span></div>
                            <div><span className="text-slate-400">EXW:</span> <span className="font-bold">{(block as ProductBlock).exwLocation || '—'}</span></div>
                            <div><span className="text-slate-400">EAN:</span> <span className="font-bold">{(block as ProductBlock).ean || '—'}</span></div>
                            <div><span className="text-slate-400">Units/case:</span> <span className="font-bold">{(block as ProductBlock).unitsPerCase || '—'}</span></div>
                            <div className="col-span-2"><span className="text-slate-400">Cases/pallet:</span> <span className="font-bold">{(block as ProductBlock).casesPerPallet || '—'}</span></div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
