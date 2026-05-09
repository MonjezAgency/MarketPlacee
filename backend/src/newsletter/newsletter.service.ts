import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import * as XLSX from 'xlsx';

@Injectable()
export class NewsletterService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService
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
            audience?: 'PLATFORM' | 'NEWSLETTER';
            sentBy?: string;
        } = {},
    ) {
        if (!subject || !subject.trim()) {
            throw new BadRequestException('Subject is required');
        }
        if ((!opts.html || !opts.html.trim()) && (!content || !content.trim())) {
            throw new BadRequestException('Email body (html or content) is required');
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

        const fallbackShell = (body: string) => `
            <div style="font-family: sans-serif; padding: 40px; color: #333; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #eee;">
                <h1 style="color: #0F172A; font-size: 24px; font-weight: 900; margin-bottom: 24px;">Atlantis Marketplace</h1>
                <div style="font-size: 16px; line-height: 1.6; color: #555;">
                    ${body.replace(/\n/g, '<br/>')}
                </div>
                <hr style="margin: 40px 0; border: 0; border-top: 1px solid #eee;" />
                <p style="font-size: 12px; color: #999; text-align: center;">
                    You received this because you subscribed to Atlantis Marketplace updates.<br/>
                    © ${new Date().getFullYear()} Atlantis Marketplace. All rights reserved.
                </p>
            </div>
        `;
        const finalHtml = (opts.html && opts.html.trim()) ? opts.html : fallbackShell(content || '');

        let successCount = 0;
        for (const r of recipients) {
            try {
                const ok = await this.emailService.sendMail(r.email, subject, finalHtml);
                if (ok) successCount++;
            } catch {
                // continue — we still persist the campaign with the partial count
            }
        }

        // Persist to history so the admin can re-open / re-send it later.
        const campaign = await this.prisma.campaign.create({
            data: {
                subject,
                html: finalHtml,
                audience,
                sentCount: successCount,
                totalCount: recipients.length,
                status: successCount === 0 ? 'FAILED' : 'SENT',
                sentBy: opts.sentBy ?? null,
            },
        });

        return {
            id: campaign.id,
            total: recipients.length,
            successCount,
            audience,
        };
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
