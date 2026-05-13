import { Injectable, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailTrackingService } from '../email-tracking/email-tracking.service';
import * as XLSX from 'xlsx';

@Injectable()
export class NewsletterService {
    private readonly logger = new Logger(NewsletterService.name);
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
        private emailTracking: EmailTrackingService,
    ) {}

    async subscribe(email: string, source?: string, region?: string, name?: string) {
        // Validate email format
        const trimmed = (email || '').trim().toLowerCase();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            throw new ConflictException('Invalid email address');
        }

        const existing = await this.prisma.newsletterSubscriber.findUnique({
            where: { email: trimmed }
        });

        if (existing) {
            if (existing.status === 'ACTIVE') {
                throw new ConflictException('This email is already subscribed to our newsletter');
            }
            // Re-activate previously unsubscribed accounts
            return this.prisma.newsletterSubscriber.update({
                where: { email: trimmed },
                data: {
                    status: 'ACTIVE',
                    source: source || existing.source,
                    name: name || existing.name,
                },
            });
        }

        return this.prisma.newsletterSubscriber.create({
            data: { email: trimmed, source, region, name }
        });
    }

    /**
     * Default `findAll` excludes HIDDEN entries — admins click a tab to see
     * those. BLOCKED entries are returned but flagged in the response so
     * the UI can render them differently.
     */
    async findAll(includeHidden = false) {
        const where = includeHidden ? {} : { NOT: { status: 'HIDDEN' } };
        const subscribers = await this.prisma.newsletterSubscriber.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        const emails = subscribers.map(s => s.email);
        const users = await this.prisma.user.findMany({
            where: { email: { in: emails } },
            select: { email: true, id: true, name: true, avatar: true, role: true }
        });

        const userMap = new Map(users.map(u => [u.email, u]));

        return subscribers.map(sub => ({
            ...sub,
            user: userMap.get(sub.email) || null
        }));
    }

    async remove(id: string) {
        return this.prisma.newsletterSubscriber.delete({
            where: { id }
        });
    }

    /**
     * Bulk action endpoint — admins select multiple subscribers in the
     * Newsletter UI and apply a single action to all of them at once.
     * `delete` is permanent; `hide` and `block` are reversible (status
     * change only).
     */
    async bulkAction(ids: string[], action: 'delete' | 'hide' | 'block' | 'unhide' | 'unblock') {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new BadRequestException('Provide at least one subscriber id.');
        }
        const valid = ids.filter(id => typeof id === 'string' && id.length > 0);
        if (action === 'delete') {
            const r = await this.prisma.newsletterSubscriber.deleteMany({
                where: { id: { in: valid } },
            });
            return { action, affected: r.count };
        }
        const statusMap: Record<string, string> = {
            hide: 'HIDDEN',
            block: 'BLOCKED',
            unhide: 'ACTIVE',
            unblock: 'ACTIVE',
        };
        const status = statusMap[action];
        if (!status) throw new BadRequestException('Unknown bulk action');
        const r = await this.prisma.newsletterSubscriber.updateMany({
            where: { id: { in: valid } },
            data: { status },
        });
        return { action, affected: r.count, newStatus: status };
    }

    /**
     * Parse a CSV / XLS / XLSX uploaded by the admin and bulk-create
     * subscribers. Tolerant about column names: accepts "Email" / "E-mail"
     * / "البريد", "Name" / "Full Name" / "Company" / "الاسم", and the
     * optional "Region" / "Country". Rows without a valid email are
     * counted as failed but don't abort the run.
     */
    async bulkUpload(buffer: Buffer, source?: string) {
        if (!buffer || buffer.length === 0) {
            throw new BadRequestException('Upload is empty');
        }
        let rows: any[];
        try {
            const wb = XLSX.read(buffer, { type: 'buffer' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        } catch (err: any) {
            throw new BadRequestException(`Failed to parse file: ${err?.message || 'unknown error'}`);
        }
        if (!rows.length) {
            return { totalRows: 0, created: 0, updated: 0, skipped: 0, errors: [] };
        }

        const norm = (s: string) =>
            String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '').trim();
        const findValue = (row: any, keys: string[]): string => {
            for (const k of Object.keys(row)) {
                const nk = norm(k);
                for (const want of keys) {
                    if (nk === want || nk.includes(want)) return String(row[k] ?? '').trim();
                }
            }
            return '';
        };

        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: { row: number; reason: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const email = findValue(row, ['email', 'mail', 'البريد', 'الايميل']).toLowerCase();
            const name = findValue(row, ['name', 'fullname', 'company', 'companyname', 'client', 'الاسم', 'الشركة']);
            const region = findValue(row, ['region', 'country', 'البلد', 'المنطقة']);

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                skipped++;
                errors.push({ row: i + 2, reason: 'invalid or missing email' });
                continue;
            }

            try {
                const existing = await this.prisma.newsletterSubscriber.findUnique({
                    where: { email },
                });
                if (existing) {
                    await this.prisma.newsletterSubscriber.update({
                        where: { email },
                        data: {
                            name: name || existing.name,
                            region: region || existing.region,
                            // If the row had been hidden/blocked, leave it that way
                            // — the importer doesn't silently un-block clients.
                            status: existing.status === 'UNSUBSCRIBED' ? 'ACTIVE' : existing.status,
                            source: source || existing.source,
                        },
                    });
                    updated++;
                } else {
                    await this.prisma.newsletterSubscriber.create({
                        data: {
                            email,
                            name: name || undefined,
                            region: region || undefined,
                            source: source || 'Bulk Upload',
                            status: 'ACTIVE',
                        },
                    });
                    created++;
                }
            } catch (err: any) {
                skipped++;
                errors.push({ row: i + 2, reason: err?.message || 'database error' });
            }
        }

        return { totalRows: rows.length, created, updated, skipped, errors };
    }

    /**
     * Send a campaign and persist it to the Campaign history table.
     *
     * Audience modes:
     *   PLATFORM   — every ACTIVE customer on the platform PLUS every
     *                ACTIVE newsletter subscriber, deduped by lowercase
     *                email. This is the broad blast.
     *   NEWSLETTER — only ACTIVE newsletter subscribers (the people
     *                who explicitly signed up via the homepage etc).
     *
     * Body is the fully-rendered HTML produced by the campaign builder.
     * The legacy plain-text `content` field is still supported as a
     * fallback for the older simple modal.
     *
     * After sending, the campaign is written to the Campaign table so
     * the admin can re-open / re-send it from /admin/newsletter/history.
     */
    async sendCampaign(
        subject: string,
        content: string | undefined,
        opts: {
            html?: string;
            blocks?: any[];
            audience?: 'PLATFORM' | 'NEWSLETTER';
            sentBy?: string;
        } = {},
    ) {
        if (!subject || !subject.trim()) {
            throw new BadRequestException('Subject is required');
        }
        const hasBlocks = Array.isArray(opts.blocks) && opts.blocks.length > 0;
        if (!hasBlocks && (!opts.html || !opts.html.trim()) && (!content || !content.trim())) {
            throw new BadRequestException('Email body (blocks, html or content) is required');
        }
        const audience: 'PLATFORM' | 'NEWSLETTER' =
            opts.audience === 'PLATFORM' ? 'PLATFORM' : 'NEWSLETTER';

        // Build the recipient list per audience mode, dedup by email.
        const seen = new Set<string>();
        const recipients: { email: string }[] = [];
        const subs = await this.prisma.newsletterSubscriber.findMany({
            where: { status: 'ACTIVE' },
            select: { email: true },
        });
        for (const s of subs) {
            const e = (s.email || '').toLowerCase().trim();
            if (e && !seen.has(e)) { seen.add(e); recipients.push({ email: s.email }); }
        }
        if (audience === 'PLATFORM') {
            const customers = await this.prisma.user.findMany({
                where: { role: 'CUSTOMER', status: 'ACTIVE' },
                select: { email: true },
            });
            for (const c of customers) {
                const e = (c.email || '').toLowerCase().trim();
                if (e && !seen.has(e)) { seen.add(e); recipients.push({ email: c.email }); }
            }
        }

        // ─── Canonical Atlantis email shell ─────────────────────────────────
        // ALL campaigns get wrapped in this shell on the backend, regardless
        // of what HTML the frontend sends. This is the exact same shell the
        // /offers blast email uses (the Red Bull screenshot the operator
        // approved as the "good" template). Doing the wrap server-side
        // means:
        //   1. Cached Vercel deploys can never deliver a broken old shell
        //   2. Every email — campaign, offer, transactional — looks the same
        //   3. The frontend builder is now PREVIEW-ONLY; the canonical HTML
        //      is generated here.
        // The frontend sends inner body HTML (block markup) OR a full HTML
        // document; we strip everything outside `<body>` so we only keep
        // the content blocks and reattach our shell around them.
        const extractBody = (raw: string): string => {
            const m = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (m) return m[1];
            // If they sent fragments without <body>, also strip any leading
            // <!DOCTYPE>/<html>/<head> so we don't double-up.
            return raw
                .replace(/<!DOCTYPE[\s\S]*?>/i, '')
                .replace(/<\/?(html|head)[^>]*>/gi, '')
                .replace(/<title[\s\S]*?<\/title>/gi, '')
                .replace(/<meta[^>]*>/gi, '');
        };

        const renderShell = (bodyContent: string, subj: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;background:#F1F5F9;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,0.06);">

    <!-- BRAND HEADER (navy + teal curved divider) -->
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

    <!-- MAIN BODY -->
    <tr><td style="padding:36px 40px 20px;">
        ${bodyContent}
    </td></tr>

    <!-- DARK FOOTER -->
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
</html>`;

        // ─── Offers-style render from blocks (the operator's preferred look)
        //
        // When the frontend sends a `blocks` array (the new path), we render
        // the email in the exact same style as the /offers approved blast:
        //   - Navy header + teal curved divider + ATLANTIS logo
        //   - Two-column intro: heading/paragraphs on the left, product
        //     image on the right
        //   - "PRODUCT INFORMATION" card with spec rows + Quality/Global/
        //     Secure features panel on the right
        //   - "Interested in this product?" CTA strip with Contact Us button
        //   - Dark footer with Bridging Markets / Building Opportunities
        //
        // This matches the KitKat-Chunky screenshot the operator confirmed
        // as the gold-standard template. The simpler `extractBody` path
        // stays as the fallback for legacy/manual HTML sends.
        const esc = (s: any) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        const renderFromBlocks = (blocks: any[]): string => {
            const productBlock = blocks.find((b: any) => b?.type === 'product');
            // Intro: collect every text-ish block BEFORE the product card.
            const headIdx = productBlock ? blocks.indexOf(productBlock) : blocks.length;
            const introBlocks = blocks.slice(0, headIdx);
            // Tail: anything AFTER the product card (signature, extra
            // paragraphs, custom button text) gets rendered inline at the
            // bottom of the body section.
            const tailBlocks = productBlock ? blocks.slice(headIdx + 1) : [];

            const introHtml = introBlocks.map((b: any) => {
                if (b.type === 'h1') return `<h1 style="color:#0F172A;font-size:30px;font-weight:900;margin:0 0 14px;">${esc(b.text)}</h1>`;
                if (b.type === 'h2') return `<h1 style="color:#0F172A;font-size:30px;font-weight:900;margin:0 0 14px;">${esc(b.text)}</h1>`;
                if (b.type === 'h3') return `<h3 style="color:#0F172A;font-size:18px;font-weight:800;margin:0 0 10px;">${esc(b.text)}</h3>`;
                if (b.type === 'p')  return `<p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 14px;">${esc(b.text).replace(/\n/g, '<br/>')}</p>`;
                if (b.type === 'quote') return `<p style="color:#0F172A;font-size:15px;line-height:1.7;margin:0 0 14px;font-style:italic;border-left:4px solid #2EC4B6;padding:6px 16px;background:#F0FDFA;">${esc(b.text)}</p>`;
                return '';
            }).join('\n');

            // Tail body — any blocks after the product card.
            const tailHtml = tailBlocks.map((b: any) => {
                if (b.type === 'h1' || b.type === 'h2') return `<h2 style="color:#0F172A;font-size:22px;font-weight:800;margin:18px 0 12px;">${esc(b.text)}</h2>`;
                if (b.type === 'h3') return `<h3 style="color:#0F172A;font-size:16px;font-weight:700;margin:14px 0 8px;">${esc(b.text)}</h3>`;
                if (b.type === 'p')  return `<p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 12px;">${esc(b.text).replace(/\n/g, '<br/>')}</p>`;
                if (b.type === 'button') return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 14px;"><tr><td style="background:#0B1F3A;border-radius:14px;"><a href="${esc(b.url || '#')}" style="display:inline-block;padding:12px 26px;color:#ffffff;font-weight:800;font-size:13px;text-decoration:none;">${esc(b.text)}</a></td></tr></table>`;
                if (b.type === 'quote') return `<p style="color:#0F172A;font-size:14px;line-height:1.7;margin:0 0 12px;font-style:italic;border-left:4px solid #2EC4B6;padding:6px 16px;background:#F0FDFA;">${esc(b.text)}</p>`;
                if (b.type === 'image' && b.url) return `<img src="${esc(b.url)}" alt="${esc(b.alt || '')}" style="max-width:100%;height:auto;display:block;margin:0 0 12px;" />`;
                return '';
            }).join('\n');

            // Product card (offers-style spec rows). Each row is a teal
            // pill icon + label + value, exactly like the offers blast.
            const baseUrl = (process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');
            const logoUrl = `${baseUrl}/icon.png`;

            const specRow = (icon: string, label: string, value: string) => `
                <tr><td style="padding:14px 0;border-bottom:1px solid #E2E8F0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                            <td width="44" style="vertical-align:middle;">
                                <div style="width:36px;height:36px;border-radius:50%;background:#2EC4B6;color:#ffffff;text-align:center;line-height:36px;font-size:16px;">${icon}</div>
                            </td>
                            <td style="vertical-align:middle;padding-left:14px;color:#0F172A;font-weight:800;font-size:14px;">${esc(label)}</td>
                            <td style="vertical-align:middle;text-align:right;color:#2EC4B6;font-weight:800;font-size:14px;">${esc(value)}</td>
                        </tr>
                    </table>
                </td></tr>`;

            let productCardHtml = '';
            let heroImg = '';
            if (productBlock) {
                const pName = productBlock.name || 'Product';
                heroImg = productBlock.image || '';
                const exw = productBlock.exwLocation || '';
                const tradeTerms = exw ? `EXW ${exw}` : (productBlock.origin || '—');
                const rows: string[] = [];
                rows.push(specRow('📍', 'Trade Terms', tradeTerms));
                if (productBlock.origin && productBlock.origin !== exw)
                    rows.push(specRow('🏭', 'Country of Origin', productBlock.origin));
                if (productBlock.ean)            rows.push(specRow('▏▏▎', 'EAN', String(productBlock.ean)));
                if (productBlock.unitsPerCase)   rows.push(specRow('📦', 'Units per case', String(productBlock.unitsPerCase)));
                if (productBlock.casesPerPallet) rows.push(specRow('🏗', 'Cases per pallet', String(productBlock.casesPerPallet)));
                if (productBlock.bbd)            rows.push(specRow('⏳', 'Best-Before', String(productBlock.bbd)));
                if (productBlock.family)         rows.push(specRow('🏷', 'Family', String(productBlock.family)));

                productCardHtml = `
                <tr><td style="padding:8px 0 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:18px;overflow:hidden;border:1px solid #E2E8F0;">
                        <tr><td style="background:#0B1F3A;padding:18px 24px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="vertical-align:middle;color:#ffffff;font-size:13px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">
                                        <span style="display:inline-block;width:26px;height:26px;border-radius:7px;background:#2EC4B6;color:#0B1F3A;text-align:center;line-height:26px;margin-right:10px;font-size:14px;vertical-align:middle;">📦</span>
                                        <span style="vertical-align:middle;">Product Information</span>
                                    </td>
                                    <td align="right" style="vertical-align:middle;color:#ffffff;font-size:11px;font-weight:900;letter-spacing:0.04em;border-left:1px solid rgba(255,255,255,0.15);padding-left:14px;">
                                        ATLANTIS <span style="color:#2EC4B6;font-size:9px;letter-spacing:0.4em;">FMCG</span>
                                    </td>
                                </tr>
                            </table>
                        </td></tr>
                        <tr><td style="background:#ffffff;padding:24px 24px 28px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="vertical-align:top;width:60%;padding-right:18px;">
                                        <h2 style="color:#0F172A;font-size:22px;font-weight:900;margin:0 0 16px;">${esc(pName)}</h2>
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
                                    </td>
                                    <td style="vertical-align:top;width:40%;padding-left:18px;border-left:1px solid #F1F5F9;">
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;">
                                            <tr><td style="padding:16px;">
                                                <p style="color:#0F172A;font-size:13px;font-weight:900;margin:0 0 6px;">🛡 Verified Suppliers</p>
                                                <p style="color:#64748B;font-size:11px;line-height:1.5;margin:0 0 12px;">All our sellers are verified for your peace of mind.</p>
                                                <p style="color:#0F172A;font-size:13px;font-weight:900;margin:0 0 6px;">🌐 Global Marketplace</p>
                                                <p style="color:#64748B;font-size:11px;line-height:1.5;margin:0 0 12px;">Access a wide range of FMCG products from trusted sellers.</p>
                                                <p style="color:#0F172A;font-size:13px;font-weight:900;margin:0 0 6px;">🤝 Secure Transactions</p>
                                                <p style="color:#64748B;font-size:11px;line-height:1.5;margin:0;">Safe and transparent trading experience from inquiry to delivery.</p>
                                            </td></tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td></tr>
                    </table>
                </td></tr>

                <!-- CTA strip -->
                <tr><td style="padding:0 0 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:16px;">
                        <tr>
                            <td style="padding:18px 22px;vertical-align:middle;">
                                <table role="presentation" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="vertical-align:middle;padding-right:14px;">
                                            <div style="width:40px;height:40px;border-radius:50%;background:#2EC4B6;color:#ffffff;text-align:center;line-height:40px;font-size:18px;">✉</div>
                                        </td>
                                        <td style="vertical-align:middle;">
                                            <p style="color:#0F172A;font-size:14px;font-weight:900;margin:0 0 2px;">Interested in this product?</p>
                                            <p style="color:#64748B;font-size:11px;margin:0;">Contact us today for price, availability, and more information.</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                            <td align="right" style="padding:18px 22px;vertical-align:middle;">
                                <a href="${baseUrl}/contact" style="display:inline-block;padding:14px 30px;background:#0B1F3A;color:#ffffff;text-decoration:none;border-radius:14px;font-weight:800;font-size:13px;letter-spacing:0.02em;">Contact Us</a>
                            </td>
                        </tr>
                    </table>
                </td></tr>`;
            }

            // ── Two-column intro: text on left, product image on right ──
            const introSection = `
            <tr><td style="padding:0 0 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="vertical-align:top;width:${heroImg ? '60%' : '100%'};${heroImg ? 'padding-right:20px;' : ''}">
                            ${introHtml || '<p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">Hello,</p>'}
                        </td>
                        ${heroImg ? `<td style="vertical-align:middle;width:40%;text-align:center;">
                            <img src="${esc(heroImg)}" alt="${esc(productBlock?.name || '')}" style="max-width:100%;max-height:220px;display:inline-block;" />
                        </td>` : ''}
                    </tr>
                </table>
            </td></tr>`;

            const tailSection = tailHtml ? `<tr><td style="padding:0 0 8px;">${tailHtml}</td></tr>` : '';

            // Wrap everything in a single root table the canonical shell
            // will inject into its main <td>.
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${introSection}
                ${productCardHtml}
                ${tailSection}
            </table>`;
        };

        // Decide what content to wrap:
        //   - opts.blocks → render in offers-style (preferred path)
        //   - opts.html   → take its body content (or whole string if no body)
        //   - content     → plain-text-ish; wrap in a <p> so the shell renders it
        let innerBody: string;
        if (hasBlocks) {
            innerBody = renderFromBlocks(opts.blocks!);
        } else if (opts.html && opts.html.trim()) {
            innerBody = extractBody(opts.html);
        } else {
            innerBody = `<p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">${(content || '').replace(/\n/g, '<br/>')}</p>`;
        }
        const finalHtml = renderShell(innerBody, subject);

        // Track per-recipient outcomes so we can show the admin the
        // ACTUAL reason emails failed instead of "successCount: 0" with
        // no explanation. The most common failure is Resend in testing
        // mode (only sends to the account owner) before the operator
        // verifies their sending domain.
        let successCount = 0;
        const errors: Record<string, number> = {};
        // We persist the campaign FIRST (in a placeholder pass below)
        // so we have a campaignId to attach to each EmailEvent. The
        // actual Campaign row is created after the loop too — to
        // keep that working without a circular dependency we generate
        // the id up front.
        const placeholderCampaignId = (require('crypto') as typeof import('crypto')).randomUUID();
        for (const r of recipients) {
            try {
                // Per-recipient tracking id + open pixel + click rewrites.
                const trackingId = await this.emailTracking.registerSentEmail({
                    recipient: r.email,
                    subject,
                    campaignId: placeholderCampaignId,
                });
                const wrappedHtml = this.emailTracking.wrapLinks(finalHtml, trackingId);
                const trackedHtml = wrappedHtml.replace(
                    /<\/body>/i,
                    `${this.emailTracking.trackingPixelHtml(trackingId)}</body>`,
                );
                const result = await this.emailService.sendMailDetailed(r.email, subject, trackedHtml);
                if (result.success) {
                    successCount++;
                } else if (result.error) {
                    errors[result.error] = (errors[result.error] || 0) + 1;
                }
            } catch (err: any) {
                const msg = err?.message || 'unknown send error';
                errors[msg] = (errors[msg] || 0) + 1;
            }
        }

        // Pick the dominant error to surface as the campaign-level
        // reason. Stored on the Campaign row + returned in the API
        // response so the admin toast can show it directly.
        const sortedErrors = Object.entries(errors).sort((a, b) => b[1] - a[1]);
        const dominantError = sortedErrors.length > 0 ? sortedErrors[0][0] : null;

        const campaign = await this.prisma.campaign.create({
            data: {
                id: placeholderCampaignId,
                subject,
                html: finalHtml,
                audience,
                sentCount: successCount,
                totalCount: recipients.length,
                status: successCount === 0 ? 'FAILED' : 'SENT',
                sentBy: opts.sentBy ?? null,
            },
        });

        if (dominantError) {
            this.logger.error(
                `[CAMPAIGN ${campaign.id}] ${successCount}/${recipients.length} delivered. ` +
                `Top failure (${sortedErrors[0][1]} recipients): ${dominantError}`,
            );
        }

        return {
            id: campaign.id,
            total: recipients.length,
            successCount,
            audience,
            // When the entire send failed, hand the operator a
            // ready-to-paste explanation in the toast.
            failureReason: successCount === 0 ? dominantError : null,
        };
    }

    /**
     * Diagnostic — sends a single test email to a target address using
     * the same email pipeline campaigns use. Returns the provider's
     * actual response so the admin can paste it into a support ticket
     * or fix the configuration. No campaign record is written.
     */
    async sendTestEmail(to: string) {
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            throw new BadRequestException('A valid recipient email is required');
        }
        const html = `
<div style="font-family:Arial,sans-serif;padding:24px;max-width:520px;margin:auto;">
  <h2 style="color:#0F172A;">Atlantis test email</h2>
  <p style="color:#475569;">If you can read this, the Atlantis email pipeline reached your inbox successfully.</p>
  <p style="color:#94A3B8;font-size:12px;">Sent from /api/newsletter/test-email at ${new Date().toISOString()}</p>
</div>`;
        const result = await this.emailService.sendMailDetailed(
            to,
            'Atlantis · Email Pipeline Test',
            html,
        );
        return result;
    }

    async listCampaigns() {
        return this.prisma.campaign.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, subject: true, audience: true,
                sentCount: true, totalCount: true, status: true,
                createdAt: true, sentBy: true,
            },
        });
    }

    async getCampaign(id: string) {
        const c = await this.prisma.campaign.findUnique({ where: { id } });
        if (!c) throw new BadRequestException('Campaign not found');
        return c;
    }

    async deleteCampaign(id: string) {
        await this.prisma.campaign.delete({ where: { id } });
        return { ok: true };
    }
}
