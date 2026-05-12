import {
    Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailTrackingService } from '../email-tracking/email-tracking.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as XLSX from 'xlsx';

interface OfferInput {
    productId?: string;
    productName?: string;   // used when bulk-uploading by name
    pricePerUnit: number;
    unit: string;           // truck | pallet | carton
    quantity: number;
    validUntil?: string;
    notes?: string;

    // Per-offer batch details (operator requirement). All required at
    // form-submit time except notes/validUntil. Pre-filled from the
    // picked product on the supplier UI but editable per offer.
    productNameSnap?: string;
    bbd?: string;
    eanCode?: string;
    unitsPerCase?: number;
    casesPerPallet?: number;
    exwLocation?: string;
    leadTime?: string;
    origin?: string;
    offerImageUrl?: string;
}

@Injectable()
export class OffersService {
    private readonly logger = new Logger(OffersService.name);

    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
        private emailTracking: EmailTrackingService,
        private notifications: NotificationsService,
    ) {}

    /**
     * Match an incoming product reference to an existing platform Product.
     *
     * IMPORTANT — supplier scoping:
     * When `restrictToSupplierId` is set (it always is when called via the
     * supplier-facing create / bulk-upload endpoints), we ONLY match
     * against products that supplier owns AND that are APPROVED. A
     * supplier cannot post an offer on another supplier's product —
     * that would let supplier A undercut supplier B's listing.
     * Admins / Owners pass null to lift the restriction.
     *
     * Order of resolution:
     *   1. Direct productId hit (exact uuid) — must still satisfy the
     *      supplier scope check.
     *   2. Case-insensitive exact name match (APPROVED + scoped).
     *   3. Case-insensitive `contains` match (APPROVED + scoped).
     */
    async resolveProduct(
        productId?: string,
        productName?: string,
        restrictToSupplierId?: string | null,
    ) {
        const baseScope: any = { status: 'APPROVED' };
        if (restrictToSupplierId) baseScope.supplierId = restrictToSupplierId;

        if (productId) {
            const p = await this.prisma.product.findUnique({ where: { id: productId } });
            if (!p) return null;
            if (restrictToSupplierId && p.supplierId !== restrictToSupplierId) return null;
            if (p.status !== 'APPROVED') return null;
            return p;
        }
        if (!productName || !productName.trim()) return null;
        const trimmed = productName.trim();
        const exact = await this.prisma.product.findFirst({
            where: { ...baseScope, name: { equals: trimmed, mode: 'insensitive' } },
        });
        if (exact) return exact;
        const fuzzy = await this.prisma.product.findFirst({
            where: { ...baseScope, name: { contains: trimmed, mode: 'insensitive' } },
        });
        return fuzzy;
    }

    private validateUnit(u: string): 'truck' | 'pallet' | 'carton' {
        const s = (u || '').toLowerCase();
        if (s === 'truck' || s === 'pallet' || s === 'carton') return s;
        if (s.includes('truck') || s.includes('container')) return 'truck';
        if (s.includes('pallet')) return 'pallet';
        return 'carton';
    }

    async create(supplierId: string, input: OfferInput, isAdmin = false) {
        // Suppliers are scoped to their own approved products. Admin /
        // Owner callers (e.g. backfilling on behalf of a supplier) can
        // pass any approved product.
        const restrict = isAdmin ? null : supplierId;
        const product = await this.resolveProduct(input.productId, input.productName, restrict);
        if (!product) {
            throw new BadRequestException(
                `No matching product found in YOUR catalog for "${input.productName || input.productId}". You can only post offers on products you have already uploaded AND that have been approved by Atlantis. Check /supplier/products to see your approved listings.`,
            );
        }
        if (!input.pricePerUnit || input.pricePerUnit <= 0) {
            throw new BadRequestException('pricePerUnit must be a positive number');
        }
        if (!input.quantity || input.quantity <= 0) {
            throw new BadRequestException('quantity must be a positive integer');
        }

        // Per-offer batch detail enforcement. Operator requirement:
        // every New Offer must carry these fields. We pre-fill from
        // the linked product wherever possible so the supplier sees
        // a populated form, but they can override any value before
        // submitting. Bulk-upload rows (which don't carry these
        // fields yet) inherit the product's values automatically.
        const required = (label: string, val: any) => {
            if (val === undefined || val === null || String(val).trim() === '') {
                throw new BadRequestException(`${label} is required for every offer.`);
            }
        };

        const productNameSnap = input.productNameSnap?.trim() || product.name;
        const bbd            = input.bbd?.trim()         || product.shelfLife || '';
        const eanCode        = input.eanCode?.trim()     || product.ean || '';
        const unitsPerCase   = input.unitsPerCase        || product.unitsPerCase || 0;
        const casesPerPallet = input.casesPerPallet      || product.casesPerPallet || 0;
        const exwLocation    = input.exwLocation?.trim() || (product as any).exwLocation || '';
        const leadTime       = input.leadTime?.trim()    || '';
        const origin         = input.origin?.trim()      || product.origin || '';
        const offerImageUrl  = input.offerImageUrl?.trim() || product.images?.[0] || '';

        // Skip strict enforcement when the call originated from the
        // bulk-upload sheet (only price/qty/unit/name available there).
        // Bulk rows use the product's defaults — supplier can edit
        // each row from /supplier/wholesale-offers afterwards.
        const isBulkSubmission = !input.productNameSnap && !input.bbd
            && !input.eanCode && !input.exwLocation && !input.leadTime;

        if (!isBulkSubmission) {
            required('Product name',       productNameSnap);
            required('BBD',                bbd);
            required('EAN code',           eanCode);
            required('Pcs per case',       unitsPerCase);
            required('Cases per pallet',   casesPerPallet);
            required('EXW location',       exwLocation);
            required('Lead time',          leadTime);
            required('Origin country',     origin);
            required('Product picture',    offerImageUrl);
        }

        const created = await this.prisma.offer.create({
            data: {
                supplierId,
                productId: product.id,
                pricePerUnit: Number(input.pricePerUnit),
                unit: this.validateUnit(input.unit),
                quantity: Math.max(1, parseInt(String(input.quantity), 10)),
                validUntil: input.validUntil ? new Date(input.validUntil) : null,
                notes: input.notes || null,
                productNameSnap,
                bbd:            bbd || null,
                eanCode:        eanCode || null,
                unitsPerCase:   unitsPerCase || null,
                casesPerPallet: casesPerPallet || null,
                exwLocation:    exwLocation || null,
                leadTime:       leadTime || null,
                origin:         origin || null,
                offerImageUrl:  offerImageUrl || null,
                status: 'PENDING',
            },
            include: { product: true, supplier: { select: { name: true, companyName: true, email: true } } },
        });

        // Tell the admins a new offer is waiting for review. Without
        // this they only see it on the next time they refresh
        // /admin/wholesale-offers — which the operator complained about
        // ("the offer goes in but nothing notifies us"). Best-effort:
        // we swallow notification errors so a flaky notification
        // service never fails the actual create.
        try {
            const supplierLabel =
                (created as any).supplier?.companyName ||
                (created as any).supplier?.name ||
                'A supplier';
            await this.notifications.notifyAdmins(
                'New wholesale offer waiting for review',
                `${supplierLabel} just submitted "${productNameSnap}" — ${input.quantity} × ${input.unit} at €${Number(input.pricePerUnit).toFixed(2)}. Open Admin → Wholesale Offers to approve or reject.`,
                'INFO' as any,
                { offerId: created.id, productId: product.id },
            );
        } catch (e) {
            this.logger.warn(`notifyAdmins failed for offer ${created.id}: ${(e as any)?.message}`);
        }

        return created;
    }

    /**
     * Bulk-upload offers from a sheet. Required columns:
     *   - Product / Name / Item — used to match an existing platform product
     *   - Price / PricePerUnit
     *   - Quantity / Qty
     * Optional columns: Unit (truck/pallet/carton), ValidUntil, Notes.
     * Returns a per-row report (created / unmatched / errors) the supplier
     * UI shows so they can fix the missing rows and re-upload.
     */
    async bulkUpload(supplierId: string, buffer: Buffer, isAdmin = false) {
        if (!buffer || buffer.length === 0) {
            throw new BadRequestException('Upload is empty');
        }
        let rows: any[];
        try {
            const wb = XLSX.read(buffer, { type: 'buffer' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        } catch (err: any) {
            throw new BadRequestException(`Failed to parse file: ${err?.message || 'unknown'}`);
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

        const created: any[] = [];
        const errors: { row: number; reason: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const name = findValue(r, ['product', 'productname', 'name', 'item', 'itemname', 'اسمالمنتج']);
            const priceStr = findValue(r, ['price', 'priceperunit', 'unitprice', 'cost', 'سعر']);
            const qtyStr = findValue(r, ['quantity', 'qty', 'count', 'الكمية']);
            const unit = findValue(r, ['unit', 'tier', 'الوحدة']) || 'carton';
            const valid = findValue(r, ['validuntil', 'expirydate', 'expiry', 'تاريخالانتهاء']);
            const notes = findValue(r, ['notes', 'note', 'description', 'ملاحظات']);

            if (!name) { errors.push({ row: i + 2, reason: 'missing product name' }); continue; }
            const price = parseFloat(priceStr);
            const qty = parseInt(qtyStr, 10);
            if (!price || price <= 0) { errors.push({ row: i + 2, reason: `invalid price "${priceStr}" for "${name}"` }); continue; }
            if (!qty  || qty   <= 0) { errors.push({ row: i + 2, reason: `invalid quantity "${qtyStr}" for "${name}"` }); continue; }

            try {
                const offer = await this.create(supplierId, {
                    productName: name,
                    pricePerUnit: price,
                    quantity: qty,
                    unit,
                    validUntil: valid || undefined,
                    notes: notes || undefined,
                }, isAdmin);
                created.push(offer);
            } catch (err: any) {
                errors.push({ row: i + 2, reason: err?.message || 'create failed' });
            }
        }

        return { totalRows: rows.length, created: created.length, errors };
    }

    async listMine(supplierId: string) {
        return this.prisma.offer.findMany({
            where: { supplierId },
            orderBy: { createdAt: 'desc' },
            include: { product: { select: { id: true, name: true, brand: true, images: true, ean: true, exwLocation: true } } },
        });
    }

    async listAll(status?: string) {
        const where: any = {};
        if (status) where.status = status;
        return this.prisma.offer.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                product:  { select: { id: true, name: true, brand: true, images: true, ean: true, exwLocation: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true } },
                supplier: { select: { id: true, name: true, email: true, companyName: true, role: true } },
            },
        });
    }

    async findById(id: string) {
        const o = await this.prisma.offer.findUnique({
            where: { id },
            include: {
                product: true,
                supplier: { select: { id: true, name: true, email: true, companyName: true, role: true } },
            },
        });
        if (!o) throw new NotFoundException('Offer not found');
        return o;
    }

    /**
     * Approve an offer and blast a campaign email to every ACTIVE
     * newsletter subscriber AND every CUSTOMER on the platform. Email
     * carries the offer details + supplier identity so buyers know
     * exactly what they're getting and from whom.
     */
    async approve(id: string, adminId: string) {
        const offer = await this.findById(id);
        if (offer.status === 'APPROVED') {
            throw new BadRequestException('Offer is already approved');
        }
        await this.prisma.offer.update({
            where: { id },
            data: { status: 'APPROVED', approvedAt: new Date(), approvedBy: adminId },
        });
        await this.blastApprovedOffer(id);
        return this.findById(id);
    }

    async reject(id: string, adminId: string, reason?: string) {
        await this.findById(id);
        return this.prisma.offer.update({
            where: { id },
            data: {
                status: 'REJECTED',
                adminNotes: reason || 'Rejected by admin',
                approvedAt: new Date(),
                approvedBy: adminId,
            },
        });
    }

    async deleteOne(id: string, requesterId: string, requesterRole: string) {
        const offer = await this.findById(id);
        const isAdmin = ['ADMIN', 'OWNER'].includes((requesterRole || '').toUpperCase());
        if (!isAdmin && offer.supplierId !== requesterId) {
            throw new ForbiddenException('You can only delete your own offers');
        }
        await this.prisma.offer.delete({ where: { id } });
        return { ok: true };
    }

    /**
     * Email blast: ACTIVE newsletter subscribers + every CUSTOMER on the
     * platform receive a styled offer email. De-duplicates by lowercase
     * email so a customer who is also a newsletter subscriber doesn't
     * receive two copies.
     */
    private async blastApprovedOffer(offerId: string) {
        const offer = await this.findById(offerId);
        const product = (offer as any).product;
        const supplier = (offer as any).supplier;

        const [subs, customers] = await Promise.all([
            this.prisma.newsletterSubscriber.findMany({
                where: { status: 'ACTIVE' },
                select: { email: true, name: true },
            }),
            this.prisma.user.findMany({
                where: { role: 'CUSTOMER', status: 'ACTIVE' },
                select: { email: true, name: true },
            }),
        ]);

        const seen = new Set<string>();
        const recipients: { email: string; name: string | null }[] = [];
        for (const r of [...subs, ...customers]) {
            const e = (r.email || '').toLowerCase().trim();
            if (!e || seen.has(e)) continue;
            seen.add(e);
            recipients.push({ email: r.email, name: r.name ?? null });
        }

        const subject = `New Atlantis offer: ${product.name}`;
        const html = this.renderOfferEmail(offer, product, supplier);

        let successCount = 0;
        for (const r of recipients) {
            try {
                // Per-recipient tracking. Pixel + click rewrites are
                // injected into the offer email exactly the same way
                // the campaign sender does it.
                const trackingId = await this.emailTracking.registerSentEmail({
                    recipient: r.email,
                    subject,
                    offerId,
                });
                const wrappedHtml = this.emailTracking.wrapLinks(html, trackingId);
                const trackedHtml = wrappedHtml.replace(
                    /<\/body>/i,
                    `${this.emailTracking.trackingPixelHtml(trackingId)}</body>`,
                );
                const ok = await this.emailService.sendMail(r.email, subject, trackedHtml);
                if (ok) successCount++;
            } catch (err) {
                this.logger.warn(`Failed to email ${r.email}: ${(err as any)?.message}`);
            }
        }

        this.logger.log(`Blasted offer ${offerId}: ${successCount}/${recipients.length} delivered`);
        return { total: recipients.length, successCount };
    }

    /**
     * Admin diagnostic — send the offer email to a single address
     * for QA. Walks the same render + track + send path the real
     * blast uses, so a successful test confirms:
     *   • SMTP / Resend credentials are wired
     *   • Tracking-pixel registration writes a row
     *   • Click-rewrites point at our domain
     *   • The template renders cleanly in the target inbox
     * Returns { ok, trackingId } so the caller can verify the row
     * landed in EmailEvent.
     */
    async sendTestEmail(to: string, offerId?: string): Promise<{ ok: boolean; trackingId?: string; error?: string }> {
        const target = (to || '').trim();
        if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
            throw new BadRequestException('Provide a valid recipient email.');
        }

        // Resolve the offer — caller's id wins; otherwise grab the
        // most recently approved offer; failing both, build a
        // synthetic Lavazza fixture so the operator can fire the
        // test even on a fresh DB.
        let offer: any = null;
        let product: any = null;
        let supplier: any = null;
        if (offerId) {
            offer = await this.prisma.offer.findUnique({
                where: { id: offerId },
                include: { product: true, supplier: true },
            });
        }
        if (!offer) {
            offer = await this.prisma.offer.findFirst({
                where: { status: 'APPROVED' },
                orderBy: { approvedAt: 'desc' },
                include: { product: true, supplier: true },
            });
        }
        if (offer) {
            product = (offer as any).product;
            supplier = (offer as any).supplier;
        } else {
            // Fixture — render a synthetic Lavazza offer so the test
            // works on a fresh DB.
            offer = {
                id: 'fixture-test',
                pricePerUnit: 26.5,
                unit: 'pallet',
                quantity: 12,
                validUntil: new Date(Date.now() + 30 * 86400 * 1000),
                productNameSnap: 'Lavazza Crema e Gusto Espresso 250g',
                bbd: '2027-03-31',
                eanCode: '8000070016185',
                unitsPerCase: 20,
                casesPerPallet: 20,
                exwLocation: 'Netherlands',
                leadTime: '10 working days',
                origin: 'Italy',
                offerImageUrl: '',
            };
            product = {
                name: offer.productNameSnap,
                images: [],
                ean: offer.eanCode,
                unitsPerCase: offer.unitsPerCase,
                casesPerPallet: offer.casesPerPallet,
                origin: offer.origin,
                exwLocation: offer.exwLocation,
                shelfLife: offer.bbd,
            };
            supplier = { name: 'Atlantis FMCG', companyName: 'Atlantis FMCG SRL', email: 'info@atlantisfmcg.com' };
        }

        const subject = `[TEST] Atlantis offer: ${product.name}`;
        const html = this.renderOfferEmail(offer, product, supplier);

        try {
            const trackingId = await this.emailTracking.registerSentEmail({
                recipient: target,
                subject,
                offerId: offer.id?.startsWith('fixture-') ? undefined : offer.id,
            });
            const wrappedHtml = this.emailTracking.wrapLinks(html, trackingId);
            const trackedHtml = wrappedHtml.replace(
                /<\/body>/i,
                `${this.emailTracking.trackingPixelHtml(trackingId)}</body>`,
            );
            const ok = await this.emailService.sendMail(target, subject, trackedHtml);
            this.logger.log(`[TEST_EMAIL] to=${target} trackingId=${trackingId} ok=${ok}`);
            return { ok, trackingId };
        } catch (err: any) {
            this.logger.error(`[TEST_EMAIL_FAIL] to=${target} err=${err?.message}`);
            return { ok: false, error: err?.message || 'Send failed' };
        }
    }

    /**
     * Atlantis offer email — pixel-faithful reproduction of the
     * KitKat sample the operator referenced. One email per offer
     * (even rows from a 20-product bulk sheet upload). Image,
     * product name, EXW, EAN, units-per-case and cases-per-pallet
     * are pulled straight from the offer; falls back to the
     * underlying product when the supplier didn't override.
     *
     * Layout (top→bottom, matches screenshot):
     *   1. Brand header (navy gradient + curved divider, logo on
     *      left, Info@ / www. on right).
     *   2. Two-column intro: "Hello, …" copy on the left,
     *      product photo on the right.
     *   3. "Best regards, The Atlantis Team".
     *   4. PRODUCT INFORMATION dark navy bar.
     *   5. Card: bold product name + 4 icon-rows (Trade Terms,
     *      EAN, Units per case, Cases per pallet) on the left,
     *      "Verified Suppliers / Global Marketplace / Secure
     *      Transactions" feature panel on the right.
     *   6. "Interested in this product?" CTA strip with a dark
     *      Contact Us button.
     *   7. Dark footer: "Bridging Markets. Building Opportunities."
     *      + social icon row.
     */
    private renderOfferEmail(offer: any, product: any, supplier: any): string {
        const escape = (s: string) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        // offer.* takes priority — supplier may override per-batch.
        const img       = offer.offerImageUrl || (product.images && product.images[0]) || '';
        const offerName = offer.productNameSnap || product.name;
        const ean       = offer.eanCode      || product.ean       || '';
        const exw       = offer.exwLocation  || product.exwLocation || '';
        const upc       = offer.unitsPerCase   || product.unitsPerCase;
        const cpp       = offer.casesPerPallet || product.casesPerPallet;
        const lead      = offer.leadTime       || '';
        const originVal = offer.origin         || product.origin || '';
        // validUntil — when set, surface as a small "Offer valid until <date>"
        // strip near the CTA so the customer knows the offer expires. We
        // store it as a Date; render YYYY-MM-DD only.
        const validUntil = offer.validUntil
            ? (offer.validUntil instanceof Date
                ? offer.validUntil.toISOString().slice(0, 10)
                : String(offer.validUntil).slice(0, 10))
            : '';

        const tierLabel = offer.unit === 'truck' ? 'Truck' : offer.unit === 'pallet' ? 'Pallet' : 'Case';
        const baseUrl = (process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');
        const logoUrl = `${baseUrl}/icon.png`;

        const tradeTermsValue = exw ? `EXW ${exw}` : (offer.origin || product.origin || '—');

        // Spec rows in the product card. Each row is icon (left
        // teal pill) + label + value, exactly as the screenshot.
        const specRow = (icon: string, label: string, value: string) => `
            <tr>
                <td style="padding:14px 0;border-bottom:1px solid #E2E8F0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                            <td width="44" style="vertical-align:middle;">
                                <div style="width:36px;height:36px;border-radius:50%;background:#2EC4B6;color:#ffffff;text-align:center;line-height:36px;font-size:16px;">${icon}</div>
                            </td>
                            <td style="vertical-align:middle;padding-left:14px;color:#0F172A;font-weight:800;font-size:14px;font-family:Inter,Arial,sans-serif;">${escape(label)}</td>
                            <td style="vertical-align:middle;text-align:right;color:#2EC4B6;font-weight:800;font-size:14px;font-family:Inter,Arial,sans-serif;">${escape(value)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        `;

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>New offer · ${escape(offerName)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;background:#F1F5F9;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,0.06);">

    <!-- 1. BRAND HEADER (gradient navy + curved divider) -->
    <tr><td style="background:#0B1F3A;padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
                <td style="padding:28px 36px 24px;vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="vertical-align:middle;padding-right:14px;">
                                <img src="${logoUrl}" alt="Atlantis" width="46" height="46" style="display:block;width:46px;height:46px;border-radius:10px;background:#ffffff;padding:3px;box-sizing:border-box;" />
                            </td>
                            <td style="vertical-align:middle;">
                                <div style="color:#ffffff;font-weight:900;font-size:26px;letter-spacing:0.04em;line-height:1;">ATLANTIS</div>
                                <div style="color:#2EC4B6;font-weight:700;font-size:11px;letter-spacing:0.55em;margin-top:4px;line-height:1;">FMCG</div>
                            </td>
                        </tr>
                    </table>
                </td>
                <td align="right" style="padding:28px 36px 24px;vertical-align:middle;color:#ffffff;font-size:13px;font-family:Inter,Arial,sans-serif;line-height:1.9;">
                    <div>✉&nbsp;&nbsp;Info@atlantisfmcg.com</div>
                    <div>🌐&nbsp;&nbsp;www.atlantisfmcg.com</div>
                </td>
            </tr>
        </table>
        <!-- Curved divider — teal swoosh under the navy header -->
        <div style="height:18px;background:#2EC4B6;border-radius:0 0 50% 50% / 0 0 100% 100%;margin-bottom:-1px;"></div>
    </td></tr>

    <!-- 2. INTRO + product photo (two columns) -->
    <tr><td style="padding:36px 40px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
                <td style="vertical-align:top;width:60%;padding-right:20px;">
                    <h1 style="color:#0F172A;font-size:30px;font-weight:900;margin:0 0 18px;">Hello,</h1>
                    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 14px;">
                        Thank you for your interest in our products. Below is one of the items currently available from the <span style="color:#2EC4B6;font-weight:800;">Atlantis</span> catalog.
                    </p>
                    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 18px;">
                        We source quality FMCG products and ship them worldwide to make trade simple and reliable.
                    </p>
                    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">
                        Best regards,<br/>
                        The <span style="color:#2EC4B6;font-weight:800;">Atlantis</span> Team
                    </p>
                </td>
                <td style="vertical-align:middle;width:40%;text-align:center;">
                    ${img
                        ? `<img src="${escape(img)}" alt="${escape(offerName)}" style="max-width:100%;max-height:220px;display:inline-block;" />`
                        : '<div style="background:#F1F5F9;border-radius:14px;padding:60px 20px;color:#94A3B8;font-size:12px;">Product image</div>'}
                </td>
            </tr>
        </table>
    </td></tr>

    <!-- 3. PRODUCT INFORMATION card -->
    <tr><td style="padding:28px 40px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:24px;overflow:hidden;border:1px solid #E2E8F0;">
            <!-- Dark navy bar with title + Atlantis micro-logo -->
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
            <!-- Card body — two columns: spec table + feature panel -->
            <tr><td style="background:#ffffff;padding:24px 24px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="vertical-align:top;width:60%;padding-right:18px;">
                            <h2 style="color:#0F172A;font-size:22px;font-weight:900;margin:0 0 16px;">${escape(offerName)}</h2>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                ${specRow('📍', 'Trade Terms',     tradeTermsValue)}
                                ${originVal && originVal !== exw ? specRow('🏭', 'Country of Origin', originVal) : ''}
                                ${ean ? specRow('▏▏▎', 'EAN',       ean) : ''}
                                ${upc ? specRow('📦', 'Units per case',  String(upc)) : ''}
                                ${cpp ? specRow('🏗', 'Cases per pallet', String(cpp)) : ''}
                                ${lead ? specRow('⏱', 'Lead time',   lead) : ''}
                                ${tierLabel ? specRow('🎯', 'Tier',  tierLabel) : ''}
                            </table>
                        </td>
                        <td style="vertical-align:top;width:40%;padding-left:18px;border-left:1px solid #F1F5F9;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:18px;">
                                <tr><td style="padding:18px;">
                                    <p style="color:#0F172A;font-size:13px;font-weight:900;margin:0 0 6px;">🛡 Quality Guaranteed</p>
                                    <p style="color:#64748B;font-size:11px;line-height:1.5;margin:0 0 14px;">Every product in our catalog is sourced and quality-checked by the Atlantis team.</p>
                                    <p style="color:#0F172A;font-size:13px;font-weight:900;margin:0 0 6px;">🌐 Global Distribution</p>
                                    <p style="color:#64748B;font-size:11px;line-height:1.5;margin:0 0 14px;">We ship FMCG products to buyers across Europe and beyond.</p>
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

    <!-- 4. CTA strip -->
    <tr><td style="padding:0 40px 32px;">
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
                                ${validUntil ? `<p style="color:#0B1F3A;font-size:11px;font-weight:800;margin:6px 0 0;">⏳ Offer valid until ${escape(validUntil)}</p>` : ''}
                            </td>
                        </tr>
                    </table>
                </td>
                <td align="right" style="padding:18px 22px;vertical-align:middle;">
                    <a href="${baseUrl}/contact" style="display:inline-block;padding:14px 30px;background:#0B1F3A;color:#ffffff;text-decoration:none;border-radius:14px;font-weight:800;font-size:13px;letter-spacing:0.02em;">Contact Us</a>
                </td>
            </tr>
        </table>
    </td></tr>

    <!-- 5. DARK FOOTER -->
    <tr><td style="background:#0B1F3A;padding:24px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
                <td style="vertical-align:middle;color:#ffffff;font-size:14px;font-weight:900;line-height:1.5;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="vertical-align:middle;padding-right:12px;">
                                <img src="${logoUrl}" alt="A" width="34" height="34" style="display:block;width:34px;height:34px;border-radius:8px;background:#ffffff;padding:2px;box-sizing:border-box;" />
                            </td>
                            <td style="vertical-align:middle;">
                                <div>Bridging Markets.</div>
                                <div>Building <span style="color:#2EC4B6;">Opportunities.</span></div>
                            </td>
                        </tr>
                    </table>
                </td>
                <td align="right" style="vertical-align:middle;">
                    <a href="https://www.linkedin.com/company/atlantis-fmcg" style="display:inline-block;width:30px;height:30px;background:#2EC4B6;color:#0B1F3A;text-align:center;line-height:30px;border-radius:50%;text-decoration:none;font-weight:900;font-size:14px;margin-left:6px;">in</a>
                    <a href="https://www.facebook.com/atlantisfmcg" style="display:inline-block;width:30px;height:30px;background:#2EC4B6;color:#0B1F3A;text-align:center;line-height:30px;border-radius:50%;text-decoration:none;font-weight:900;font-size:14px;margin-left:6px;">f</a>
                    <a href="https://www.instagram.com/atlantisfmcg" style="display:inline-block;width:30px;height:30px;background:#2EC4B6;color:#0B1F3A;text-align:center;line-height:30px;border-radius:50%;text-decoration:none;font-weight:900;font-size:14px;margin-left:6px;">◎</a>
                </td>
            </tr>
        </table>
    </td></tr>

    <!-- 6. Caption -->
    <tr><td style="background:#0B1F3A;padding:0 40px 22px;text-align:center;color:#94A3B8;font-size:11px;">
        <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
            This email is an example of a product listing on the Atlantis marketplace.<br/>
            © ${new Date().getFullYear()} Atlantis FMCG. All rights reserved · Offer ref ${escape(String(offer.id).slice(0, 8))}
        </div>
    </td></tr>
</table>
</td></tr></table>
</body></html>`;
    }
}
