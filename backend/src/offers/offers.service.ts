import {
    Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
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

        return this.prisma.offer.create({
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
            include: { product: true },
        });
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
                supplier: { select: { id: true, name: true, email: true, companyName: true } },
            },
        });
    }

    async findById(id: string) {
        const o = await this.prisma.offer.findUnique({
            where: { id },
            include: {
                product: true,
                supplier: { select: { id: true, name: true, email: true, companyName: true } },
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
                const ok = await this.emailService.sendMail(r.email, subject, html);
                if (ok) successCount++;
            } catch (err) {
                this.logger.warn(`Failed to email ${r.email}: ${(err as any)?.message}`);
            }
        }

        this.logger.log(`Blasted offer ${offerId}: ${successCount}/${recipients.length} delivered`);
        return { total: recipients.length, successCount };
    }

    private renderOfferEmail(offer: any, product: any, supplier: any): string {
        const escape = (s: string) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        // Per-offer batch values (filled by the supplier on the New
        // Offer form) take priority over the product catalog values.
        const img        = offer.offerImageUrl || (product.images && product.images[0]) || '';
        const offerName  = offer.productNameSnap || product.name;
        const ean        = offer.eanCode      || product.ean       || '';
        const exw        = offer.exwLocation  || product.exwLocation || '';
        const origin     = offer.origin       || product.origin    || '';
        const bbd        = offer.bbd          || product.shelfLife || '';
        const upc        = offer.unitsPerCase   || product.unitsPerCase;
        const cpp        = offer.casesPerPallet || product.casesPerPallet;
        const leadTime   = offer.leadTime || '';
        const supplierLabel = supplier?.companyName || supplier?.name || 'Atlantis';
        const valid = offer.validUntil
            ? `Valid until ${new Date(offer.validUntil).toLocaleDateString()}`
            : 'Subject to availability';
        const tierLabel = offer.unit === 'truck' ? 'Truck' : offer.unit === 'pallet' ? 'Pallet' : 'Case';

        return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;background:#F8FAFC;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.06);">
    <tr><td style="background:linear-gradient(135deg,#0B1F3A 0%,#0F172A 100%);padding:32px 40px;color:#fff;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:12px;">
                <img src="${(process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '')}/icon.png" alt="Atlantis" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:10px;background:#ffffff;padding:3px;box-sizing:border-box;" />
            </td>
            <td style="vertical-align:middle;">
                <div style="font-weight:900;font-size:22px;letter-spacing:0.02em;line-height:1;">ATLANTIS <span style="color:#2EC4B6;">FMCG</span></div>
                <div style="margin-top:6px;font-size:11px;letter-spacing:0.4em;color:#2EC4B6;text-transform:uppercase;font-weight:700;">New Offer</div>
            </td>
        </tr></table>
    </td></tr>
    <tr><td style="padding:36px 40px 8px;">
        <h1 style="color:#0F172A;font-size:26px;font-weight:900;margin:0 0 8px;">New Atlantis offer available</h1>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
            ${escape(supplierLabel)} just published a new wholesale offer on <strong>${escape(offerName)}</strong>. Reply to this email or contact our team to lock the price.
        </p>
        <div style="border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;margin:0 0 20px;">
            <div style="background:#0F172A;padding:14px 20px;color:#fff;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">📦 &nbsp; Offer Details</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="padding:20px;width:60%;vertical-align:top;">
                        <h3 style="color:#0F172A;font-size:18px;font-weight:900;margin:0 0 12px;">${escape(offerName)}</h3>
                        <table role="presentation" width="100%">
                            <tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">Tier</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#2EC4B6;font-weight:800;">${tierLabel}</td></tr>
                            <tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">Price / ${tierLabel.toLowerCase()}</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#2EC4B6;font-weight:800;">€ ${Number(offer.pricePerUnit).toFixed(2)}</td></tr>
                            <tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">Available</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#0F172A;font-weight:800;">${offer.quantity} ${tierLabel.toLowerCase()}${offer.quantity === 1 ? '' : 's'}</td></tr>
                            ${bbd ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">BBD</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#0F172A;font-weight:800;">${escape(bbd)}</td></tr>` : ''}
                            ${upc ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">Pcs / case</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#0F172A;font-weight:800;">${upc}</td></tr>` : ''}
                            ${cpp ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">Cases / pallet</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#0F172A;font-weight:800;">${cpp}</td></tr>` : ''}
                            ${exw ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">EXW</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#0F172A;font-weight:800;">${escape(exw)}</td></tr>` : ''}
                            ${origin ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">Origin</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#0F172A;font-weight:800;">${escape(origin)}</td></tr>` : ''}
                            ${leadTime ? `<tr><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:700;">Lead time</td><td style="padding:10px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#0F172A;font-weight:800;">${escape(leadTime)}</td></tr>` : ''}
                            ${ean ? `<tr><td style="padding:10px 0;font-size:13px;color:#0F172A;font-weight:700;">EAN</td><td style="padding:10px 0;text-align:right;color:#475569;font-weight:700;font-family:monospace;">${escape(ean)}</td></tr>` : ''}
                        </table>
                    </td>
                    <td style="padding:20px;width:40%;text-align:center;vertical-align:top;">
                        ${img ? `<img src="${escape(img)}" alt="${escape(offerName)}" style="max-width:100%;max-height:180px;display:inline-block;" />` : '<div style="background:#F1F5F9;border-radius:10px;padding:50px;color:#94A3B8;font-size:11px;">No image</div>'}
                    </td>
                </tr>
            </table>
        </div>
        ${offer.notes ? `<div style="background:#F0FDFA;border-left:4px solid #2EC4B6;padding:12px 18px;margin:0 0 20px;color:#0F172A;font-size:13px;border-radius:0 8px 8px 0;font-style:italic;">${escape(offer.notes)}</div>` : ''}
        <p style="color:#94A3B8;font-size:11px;margin:0 0 12px;font-style:italic;">${valid}</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#0F172A;border-radius:14px;">
            <a href="https://www.atlantisfmcg.com/contact" style="display:inline-block;padding:14px 32px;color:#fff;font-weight:800;font-size:14px;text-decoration:none;letter-spacing:0.02em;">Contact Atlantis</a>
        </td></tr></table>
    </td></tr>
    <tr><td style="background:#0F172A;padding:24px 40px;color:#94A3B8;font-size:12px;text-align:center;">
        <div style="margin-bottom:6px;color:#fff;font-weight:900;">Bridging Markets. <span style="color:#2EC4B6;">Building Opportunities.</span></div>
        <div style="opacity:0.6;">© ${new Date().getFullYear()} Atlantis FMCG · Offer ref ${escape(offer.id.slice(0, 8))}</div>
    </td></tr>
</table>
</td></tr></table>
</body></html>`;
    }
}
