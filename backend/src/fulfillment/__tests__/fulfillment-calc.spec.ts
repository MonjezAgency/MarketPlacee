import { dispatchCountryOf, methodFor, priceOption, shippingUnits, validateRate, type Hub, type Rate } from '../fulfillment-calc';
import { resolveCountry } from '../../shipping/delivery-policy';

const hub: Hub = { id: 'hub-nl', name: 'Venlo hub', city: 'Venlo', country: 'NL', services: ['INSPECTION'], verified: true, active: true };
const rates: Rate[] = [
    { method: 'ATLANTIS_COLLECTION', originCountry: 'RO', destinationCountry: 'DE', unit: 'PALLET', amountEur: 120, minTransitDays: 3, maxTransitDays: 5 },
    { method: 'ATLANTIS_COLLECTION', originCountry: 'RO', destinationCountry: 'DE', unit: 'TRUCK', amountEur: 2400, minTransitDays: 3, maxTransitDays: 5 },
    { method: 'HUB_TO_BUYER', originCountry: 'NL', destinationCountry: 'DE', hubId: 'hub-nl', unit: 'PALLET', amountEur: 60, minTransitDays: 1, maxTransitDays: 2 },
];
const spec = { tier: 'pallet' as const, quantity: 2, casesPerPallet: 80, palletsPerShipment: 33 };
const base = { dispatchCountry: 'RO', destination: 'DE', destinationSupported: true, spec, rates, hubs: [hub], supplier: null };

describe('fulfilment calculation', () => {
    it('works out pallet spaces only from real packaging data', () => {
        expect(shippingUnits({ tier: 'pallet', quantity: 2, casesPerPallet: 80 })).toEqual({ cases: 160, pallets: 2, trucks: null });
        expect(shippingUnits({ tier: 'truck', quantity: 1, casesPerPallet: 80, palletsPerShipment: 33 })).toEqual({ cases: 2640, pallets: 33, trucks: 1 });
        expect(shippingUnits({ tier: 'carton', quantity: 90, casesPerPallet: 80 })).toEqual({ cases: 90, pallets: 2, trucks: null });
        expect(shippingUnits({ tier: 'carton', quantity: 90 })).toEqual({ cases: 90, pallets: null, trucks: null });
    });
    it('prices Atlantis collection from the configured rate, with its basis and source', () => {
        const o = priceOption({ ...base, method: 'ATLANTIS_COLLECTION' });
        expect(o.status).toBe('priced');
        expect(o.total).toBe(240);
        expect(o.charges[0]).toMatchObject({ basis: '2 pallets × €120.00', paidTo: 'Atlantis', source: expect.stringContaining('RO → DE') });
        expect(o.transitDays).toEqual({ min: 3, max: 5 });
        // a full truck uses the truck rate, not 33 pallet rates
        expect(priceOption({ ...base, method: 'ATLANTIS_COLLECTION', spec: { ...spec, tier: 'truck', quantity: 1 } }).total).toBe(2400);
    });
    it('never invents a price: a missing route, unknown dispatch country or no destination is “quote required”', () => {
        expect(priceOption({ ...base, method: 'ATLANTIS_COLLECTION', destination: 'FR' })).toMatchObject({ status: 'quote_required', total: null, charges: [] });
        expect(priceOption({ ...base, method: 'ATLANTIS_COLLECTION', dispatchCountry: null }).reasons[0]).toMatch(/EXW location/);
        expect(priceOption({ ...base, method: 'ATLANTIS_COLLECTION', destination: null }).reasons[0]).toMatch(/delivery country/);
        expect(priceOption({ ...base, method: 'ATLANTIS_COLLECTION', destination: 'EG', destinationSupported: false }).status).toBe('unavailable');
    });
    it('case orders: a case rate if configured, otherwise pallet spaces — and quote required if neither works', () => {
        const caseSpec = { tier: 'carton' as const, quantity: 90, casesPerPallet: 80 };
        const o = priceOption({ ...base, method: 'ATLANTIS_COLLECTION', spec: caseSpec });
        expect(o.total).toBe(240);
        expect(o.charges[0].basis).toMatch(/90 cases fill 2 pallet spaces/);
        expect(priceOption({ ...base, method: 'ATLANTIS_COLLECTION', spec: { tier: 'carton', quantity: 90 } }).status).toBe('quote_required');
    });
    it('two active rates for the same route and unit are a conflict, not a choice', () => {
        const o = priceOption({ ...base, method: 'ATLANTIS_COLLECTION', rates: [...rates, { ...rates[0], amountEur: 90 }] });
        expect(o.status).toBe('quote_required');
        expect(o.reasons[0]).toMatch(/Two different rates/);
    });
    it('hub delivery needs a verified hub, the supplier’s declared freight and a hub-to-buyer rate; the supplier freight is passed through', () => {
        expect(priceOption({ ...base, method: 'SUPPLIER_TO_HUB', hubs: [] }).reasons[0]).toMatch(/no verified hub/);
        expect(priceOption({ ...base, method: 'SUPPLIER_TO_HUB', hubs: [{ ...hub, verified: false }], supplier: { defaultMethod: 'SUPPLIER_TO_HUB', hubId: 'hub-nl', hubFreightPerPallet: 40 } }).status).toBe('unavailable');
        expect(priceOption({ ...base, method: 'SUPPLIER_TO_HUB', supplier: { defaultMethod: 'SUPPLIER_TO_HUB', hubId: 'hub-nl', hubFreightPerPallet: null } }).reasons).toContain('Add what you charge to bring one pallet to the hub.');
        const o = priceOption({ ...base, method: 'SUPPLIER_TO_HUB', supplier: { defaultMethod: 'SUPPLIER_TO_HUB', hubId: 'hub-nl', hubFreightPerPallet: 40 } });
        expect(o.status).toBe('priced');
        expect(o.charges.map((c) => [c.paidTo, c.amount])).toEqual([['Supplier (passed through)', 80], ['Atlantis', 120]]);
        expect(o.total).toBe(200);
        expect(o.hub).toMatchObject({ city: 'Venlo' });
    });
    it('direct shipment is honestly not offered', () => {
        expect(priceOption({ ...base, method: 'SUPPLIER_DIRECT' })).toMatchObject({ status: 'unavailable' });
    });
    it('a mixed truckload is one truck', () => {
        expect(priceOption({ ...base, method: 'ATLANTIS_COLLECTION', spec: { tier: 'truck', quantity: 1, casesPerPallet: 80, palletsPerShipment: 33, mixed: true } }).total).toBe(2400);
    });
    it('reads the dispatch country from the EXW location and picks the method in order: product, supplier, default', () => {
        expect(dispatchCountryOf('Constanța, Romania', resolveCountry)).toBe('RO');
        expect(dispatchCountryOf('Warehouse 4', resolveCountry)).toBeNull();
        expect(methodFor({ fulfillmentMethod: 'SUPPLIER_TO_HUB' }, { defaultMethod: 'ATLANTIS_COLLECTION' })).toBe('SUPPLIER_TO_HUB');
        expect(methodFor({}, { defaultMethod: 'SUPPLIER_TO_HUB' })).toBe('SUPPLIER_TO_HUB');
        expect(methodFor({}, null)).toBe('ATLANTIS_COLLECTION');
    });
    it('validates admin rates', () => {
        expect(validateRate({ method: 'ATLANTIS_COLLECTION', originCountry: 'RO', destinationCountry: 'DE', unit: 'pallet', amountEur: '85.5', minTransitDays: 2, maxTransitDays: 4 })).toMatchObject({ ok: true, rate: { unit: 'PALLET', amountEur: 85.5 } });
        expect(validateRate({ method: 'X' })).toMatchObject({ ok: false });
        expect(validateRate({ method: 'ATLANTIS_COLLECTION', unit: 'PALLET', amountEur: -1 })).toMatchObject({ ok: false });
        expect(validateRate({ method: 'ATLANTIS_COLLECTION', unit: 'PALLET', amountEur: 1, minTransitDays: 5, maxTransitDays: 2 })).toMatchObject({ ok: false });
        expect(validateRate({ method: 'HUB_TO_BUYER', unit: 'PALLET', amountEur: 1 })).toMatchObject({ ok: false, error: expect.stringMatching(/hub/) });
    });
});

describe('hub regions', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { hubRegion } = require('../fulfillment.service');
    it('places hubs on the Europe or Americas map, and nowhere else', () => {
        expect(hubRegion(51.37, 6.17)).toBe('europe');        // Venlo
        expect(hubRegion(40.71, -74.0)).toBe('americas');     // New York
        expect(hubRegion(-23.55, -46.63)).toBe('americas');   // São Paulo
        expect(hubRegion(30.04, 31.24)).toBeNull();           // Cairo
        expect(hubRegion(25.2, 55.27)).toBeNull();            // Dubai
    });
});
