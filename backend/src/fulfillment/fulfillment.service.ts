import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { checkDestination, countryName, loadDeliveryCountries, resolveCountry } from '../shipping/delivery-policy';
import {
    FULFILLMENT_METHODS, METHOD_INFO, dispatchCountryOf, methodFor, priceOption, validateRate,
    type FulfillmentMethod, type FulfillmentOption, type Hub, type LoadSpec, type Rate, type SupplierFulfillmentSettings, type Tier,
} from './fulfillment-calc';

const HUB_SERVICES = ['INSPECTION', 'CONSOLIDATION', 'STORAGE', 'CROSS_DOCK', 'COLLECTION'];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Which map a hub belongs on (null = outside the regions Atlantis shows). */
export function hubRegion(lat: number, lng: number): 'europe' | 'americas' | null {
    if (lat >= 34 && lat <= 72 && lng >= -25 && lng <= 45) return 'europe';
    if (lat >= -56 && lat <= 72 && lng >= -170 && lng <= -30) return 'americas';
    return null;
}

/** A cart / order line as priceCart produces it. */
export interface QuoteLine { productId: string | null; mixedLoadId?: string | null; supplierId?: string | null; tier: string; quantity: number; name: string; mixComposition?: any[] }

/**
 * Loads rates, hubs and supplier settings and runs fulfillment-calc for
 * every screen: supplier settings preview, product page, cart and checkout.
 */
@Injectable()
export class FulfillmentService {
    constructor(private readonly prisma: PrismaService) {}

    private async inputs(supplierIds: string[]) {
        const [rates, hubs, settings] = await Promise.all([
            this.prisma.freightRate.findMany({ where: { active: true } }),
            this.prisma.atlantisHub.findMany({ where: { active: true } }),
            supplierIds.length ? this.prisma.supplierFulfillment.findMany({ where: { supplierId: { in: [...new Set(supplierIds)] } } }) : Promise.resolve([]),
        ]);
        return { rates: rates as unknown as Rate[], hubs: hubs as unknown as Hub[], settings: new Map((settings as any[]).map((s) => [s.supplierId, s as SupplierFulfillmentSettings])) };
    }

    private async destination(dest: string | null | undefined) {
        if (!dest) return { code: null as string | null, supported: undefined as boolean | undefined };
        const { countries } = await loadDeliveryCountries(this.prisma);
        const c = checkDestination(dest, countries);
        return { code: c.code, supported: c.code ? c.supported : undefined };
    }

    // ─── Cart / checkout ─────────────────────────────────────────────

    /**
     * Delivery for a priced cart, grouped by supplier. Each line uses its
     * product's method. The freight total is a number only when every group
     * is priced; otherwise the delivery is quoted after the order.
     */
    async forQuote(lines: QuoteLine[], products: Map<string, any>, destinationInput: string | null | undefined) {
        const supplierIds = lines.map((l) => l.supplierId || (l.productId ? products.get(l.productId)?.supplierId : null)).filter(Boolean) as string[];
        const [{ rates, hubs, settings }, dest] = await Promise.all([this.inputs(supplierIds), this.destination(destinationInput)]);
        const groups = new Map<string, any>();
        for (const l of lines) {
            const p = l.productId ? products.get(l.productId) : products.get(l.mixComposition?.[0]?.productId);
            const supplierId = l.supplierId || p?.supplierId || 'unknown';
            const s = settings.get(supplierId) || null;
            const method = methodFor(p || {}, s);
            const spec: LoadSpec = { tier: (l.tier as Tier) || 'carton', quantity: l.quantity, casesPerPallet: p?.casesPerPallet, palletsPerShipment: p?.palletsPerShipment, mixed: !!l.mixedLoadId };
            const opt = priceOption({ method, dispatchCountry: dispatchCountryOf(p?.exwLocation, resolveCountry), destination: dest.code, destinationSupported: dest.supported, spec, rates, hubs, supplier: s, countryName });
            const key = `${supplierId}|${method}`;
            const g = groups.get(key) || { supplierId, method, label: opt.label, handover: opt.handover, steps: opt.steps, hub: opt.hub, status: 'priced', reasons: [] as string[], charges: [] as any[], transitDays: null as any, lines: [] as string[] };
            g.lines.push(l.mixedLoadId || l.productId);
            if (opt.status === 'priced') g.charges.push(...opt.charges.map((c) => ({ ...c, line: l.name })));
            else {
                g.status = opt.status === 'unavailable' || g.status === 'unavailable' ? 'unavailable' : 'quote_required';
                for (const r of opt.reasons) if (!g.reasons.includes(r)) g.reasons.push(r);
            }
            if (opt.transitDays) g.transitDays = g.transitDays ? { min: Math.max(g.transitDays.min, opt.transitDays.min), max: Math.max(g.transitDays.max, opt.transitDays.max) } : opt.transitDays;
            groups.set(key, g);
        }
        const list = [...groups.values()].map((g) => ({ ...g, total: g.status === 'priced' ? round2(g.charges.reduce((s: number, c: any) => s + c.amount, 0)) : null }));
        const allPriced = list.length > 0 && list.every((g) => g.status === 'priced');
        return {
            destination: dest.code,
            status: allPriced ? 'priced' : list.some((g) => g.status === 'unavailable') ? 'unavailable' : 'quote_required',
            freightTotal: allPriced ? round2(list.reduce((s, g) => s + g.total, 0)) : null,
            groups: list,
        };
    }

    /** Buyer-facing copy of forQuote: suppliers are numbered, never named. */
    static forBuyer(f: Awaited<ReturnType<FulfillmentService['forQuote']>>) {
        const ids = [...new Set(f.groups.map((g: any) => g.supplierId))];
        return { ...f, groups: f.groups.map((g: any) => { const { supplierId, ...rest } = g; return { ...rest, supplier: `Supplier ${ids.indexOf(supplierId) + 1}` }; }) };
    }

    // ─── Supplier settings ───────────────────────────────────────────

    async supplierSettings(supplierId: string) {
        const [s, hubs] = await Promise.all([
            this.prisma.supplierFulfillment.findUnique({ where: { supplierId } }),
            this.prisma.atlantisHub.findMany({ where: { verified: true, active: true }, orderBy: { name: 'asc' } }),
        ]);
        return {
            settings: s || { supplierId, defaultMethod: 'ATLANTIS_COLLECTION', hubFreightPerPallet: null, hubId: null },
            methods: FULFILLMENT_METHODS.map((m) => ({ key: m, label: METHOD_INFO[m].label, summary: METHOD_INFO[m].summary, steps: METHOD_INFO[m].steps, handover: METHOD_INFO[m].handover })),
            hubs: hubs.map((h) => ({ id: h.id, name: h.name, city: h.city, country: h.country, countryName: countryName(h.country), services: h.services })),
        };
    }

    async updateSupplierSettings(supplierId: string, body: any) {
        const defaultMethod = String(body?.defaultMethod || 'ATLANTIS_COLLECTION') as FulfillmentMethod;
        if (!FULFILLMENT_METHODS.includes(defaultMethod)) throw new BadRequestException('Unknown fulfilment method.');
        if (defaultMethod === 'SUPPLIER_DIRECT') throw new BadRequestException('Direct shipment by suppliers isn’t offered on Atlantis yet.');
        let hubId: string | null = body?.hubId ? String(body.hubId) : null;
        const fp = body?.hubFreightPerPallet === '' || body?.hubFreightPerPallet == null ? null : Number(body.hubFreightPerPallet);
        if (fp != null && (!Number.isFinite(fp) || fp < 0 || fp > 10000)) throw new BadRequestException('Freight per pallet must be between 0 and 10,000 EUR.');
        if (defaultMethod === 'SUPPLIER_TO_HUB') {
            if (!hubId) throw new BadRequestException('Choose the Atlantis hub you deliver to.');
            const hub = await this.prisma.atlantisHub.findFirst({ where: { id: hubId, verified: true, active: true } });
            if (!hub) throw new BadRequestException('That hub isn’t a verified, active Atlantis hub.');
            if (fp == null) throw new BadRequestException('Add what you charge to bring one pallet to the hub.');
        } else if (hubId) {
            const hub = await this.prisma.atlantisHub.findFirst({ where: { id: hubId, verified: true, active: true } });
            if (!hub) hubId = null;
        }
        return this.prisma.supplierFulfillment.upsert({
            where: { supplierId },
            create: { supplierId, defaultMethod, hubId, hubFreightPerPallet: fp == null ? null : round2(fp) },
            update: { defaultMethod, hubId, hubFreightPerPallet: fp == null ? null : round2(fp) },
        });
    }

    /** Per-product override (null = use the default). Only the product's own supplier. */
    async setProductMethod(supplierId: string, productId: string, method: string | null) {
        const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { supplierId: true } });
        if (!p) throw new NotFoundException('Product not found');
        if (p.supplierId !== supplierId) throw new ForbiddenException('You can only change your own products.');
        if (method && !FULFILLMENT_METHODS.includes(method as FulfillmentMethod)) throw new BadRequestException('Unknown fulfilment method.');
        if (method === 'SUPPLIER_DIRECT') throw new BadRequestException('Direct shipment by suppliers isn’t offered on Atlantis yet.');
        return this.prisma.product.update({ where: { id: productId }, data: { fulfillmentMethod: method || null }, select: { id: true, fulfillmentMethod: true } });
    }

    /**
     * Side-by-side comparison for one of the supplier's products. Shows the
     * supplier's own net price (unchanged by any method) and the logistics
     * charges each method adds. The buyer price includes the Atlantis margin,
     * which suppliers don't see, so it is not part of this view.
     */
    async supplierPreview(supplierId: string, q: { productId: string; tier?: string; quantity?: number; destination?: string; draft?: Partial<SupplierFulfillmentSettings> }) {
        const p: any = await this.prisma.product.findUnique({ where: { id: String(q.productId || '') } });
        if (!p) throw new NotFoundException('Product not found');
        if (p.supplierId !== supplierId) throw new ForbiddenException('You can only preview your own products.');
        const tier = (['carton', 'pallet', 'truck'].includes(String(q.tier)) ? q.tier : 'pallet') as Tier;
        const quantity = Math.max(1, Math.min(1000, Math.floor(Number(q.quantity) || 1)));
        const [{ rates, hubs, settings }, dest] = await Promise.all([this.inputs([supplierId]), this.destination(q.destination)]);
        const saved = settings.get(supplierId) || null;
        const s: SupplierFulfillmentSettings | null = q.draft ? { defaultMethod: (q.draft.defaultMethod || saved?.defaultMethod || 'ATLANTIS_COLLECTION') as FulfillmentMethod, hubId: q.draft.hubId ?? saved?.hubId ?? null, hubFreightPerPallet: q.draft.hubFreightPerPallet ?? saved?.hubFreightPerPallet ?? null } : saved;
        const spec: LoadSpec = { tier, quantity, casesPerPallet: p.casesPerPallet, palletsPerShipment: p.palletsPerShipment };
        const casesPerUnit = tier === 'carton' ? 1 : tier === 'pallet' ? (p.casesPerPallet || null) : (p.casesPerPallet && p.palletsPerShipment ? p.casesPerPallet * p.palletsPerShipment : null);
        const netCase = p.supplierPrice ?? p.basePrice ?? null;
        const net = netCase != null && casesPerUnit ? { currency: p.supplierCurrency || 'EUR', perCase: netCase, perUnit: round2(netCase * casesPerUnit), total: round2(netCase * casesPerUnit * quantity), casesPerUnit } : null;
        const dispatch = dispatchCountryOf(p.exwLocation, resolveCountry);
        const options: FulfillmentOption[] = FULFILLMENT_METHODS.map((m) => priceOption({ method: m, dispatchCountry: dispatch, destination: dest.code, destinationSupported: dest.supported, spec, rates, hubs, supplier: s, countryName }));
        return {
            product: { id: p.id, name: p.name, exwLocation: p.exwLocation, dispatchCountry: dispatch, dispatchCountryName: dispatch ? countryName(dispatch) : null, casesPerPallet: p.casesPerPallet, palletsPerShipment: p.palletsPerShipment, fulfillmentMethod: p.fulfillmentMethod },
            tier, quantity, destination: dest.code, destinationName: dest.code ? countryName(dest.code) : null,
            net,
            activeMethod: methodFor(p, s),
            options,
            notes: [
                'Your net price is what you receive for the goods. It is the same for every method.',
                'Charges marked “passed through” are paid to you on top of your net price; Atlantis charges are paid by the buyer.',
                'The buyer’s price includes the Atlantis margin, which isn’t shown to suppliers. VAT is added on the invoice.',
            ],
        };
    }

    // ─── Hubs & rates (public read, staff write) ─────────────────────

    async publicHubs() {
        const [hubs, { countries }] = await Promise.all([
            this.prisma.atlantisHub.findMany({ where: { verified: true, active: true }, orderBy: [{ country: 'asc' }, { city: 'asc' }] }),
            loadDeliveryCountries(this.prisma),
        ]);
        return {
            hubs: hubs.map((h) => ({ id: h.id, name: h.name, city: h.city, country: h.country, countryName: countryName(h.country), address: h.address, latitude: h.latitude, longitude: h.longitude, region: hubRegion(h.latitude, h.longitude), services: h.services, verifiedAt: h.verifiedAt })),
            deliveryCountries: countries.map((c) => ({ code: c, name: countryName(c) })),
        };
    }

    async adminList() {
        const [hubs, rates] = await Promise.all([
            this.prisma.atlantisHub.findMany({ orderBy: { createdAt: 'desc' } }),
            this.prisma.freightRate.findMany({ orderBy: [{ method: 'asc' }, { originCountry: 'asc' }, { destinationCountry: 'asc' }] }),
        ]);
        return { hubs, rates, services: HUB_SERVICES };
    }

    async saveHub(actorId: string, body: any, id?: string) {
        const name = String(body?.name || '').trim(), city = String(body?.city || '').trim();
        const country = resolveCountry(body?.country);
        const lat = Number(body?.latitude), lng = Number(body?.longitude);
        if (name.length < 2 || city.length < 2) throw new BadRequestException('Give the hub a name and city.');
        if (!country) throw new BadRequestException('Choose a valid country.');
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !hubRegion(lat, lng)) throw new BadRequestException('Coordinates must be in Europe (latitude 34–72, longitude −25–45) or the Americas (latitude −56–72, longitude −170 to −30).');
        const services = (Array.isArray(body?.services) ? body.services : []).map((s: any) => String(s).toUpperCase()).filter((s: string) => HUB_SERVICES.includes(s));
        const verified = body?.verified === true;
        const data: any = { name, city, country, address: body?.address ? String(body.address).slice(0, 300) : null, latitude: lat, longitude: lng, services, active: body?.active !== false, notes: body?.notes ? String(body.notes).slice(0, 1000) : null };
        if (id) {
            const prev = await this.prisma.atlantisHub.findUnique({ where: { id } });
            if (!prev) throw new NotFoundException('Hub not found');
            data.verified = verified;
            if (verified && !prev.verified) { data.verifiedAt = new Date(); data.verifiedById = actorId; }
            if (!verified) { data.verifiedAt = null; data.verifiedById = null; }
            return this.prisma.atlantisHub.update({ where: { id }, data });
        }
        return this.prisma.atlantisHub.create({ data: { ...data, verified, verifiedAt: verified ? new Date() : null, verifiedById: verified ? actorId : null } });
    }

    async saveRate(actorId: string, body: any, id?: string) {
        const origin = resolveCountry(body?.originCountry), dest = resolveCountry(body?.destinationCountry);
        if (!origin || !dest) throw new BadRequestException('Choose valid origin and destination countries.');
        const v = validateRate({ ...body, originCountry: origin, destinationCountry: dest });
        if ('error' in v) throw new BadRequestException(v.error);
        if (v.rate.hubId) {
            const hub = await this.prisma.atlantisHub.findUnique({ where: { id: v.rate.hubId } });
            if (!hub) throw new BadRequestException('Unknown hub.');
            if (v.rate.method === 'HUB_TO_BUYER' && hub.country !== origin) throw new BadRequestException('A hub-to-buyer rate starts in the hub’s country.');
        }
        const data = { ...v.rate, active: body?.active !== false, note: body?.note ? String(body.note).slice(0, 300) : null };
        // One active rate per route and unit: a second one would make prices ambiguous.
        const clash = await this.prisma.freightRate.findFirst({ where: { method: data.method, originCountry: data.originCountry, destinationCountry: data.destinationCountry, unit: data.unit, hubId: data.hubId ?? null, active: true, ...(id ? { NOT: { id } } : {}) } });
        if (clash && data.active) throw new BadRequestException('An active rate already exists for this route and unit. Edit or deactivate it first.');
        return id ? this.prisma.freightRate.update({ where: { id }, data }) : this.prisma.freightRate.create({ data: { ...data, createdById: actorId } });
    }
}
