import { call } from '@/lib/wholesale';

/**
 * Fulfilment — how goods get from the supplier to the buyer. Every figure
 * here comes from the server's one calculation; the browser only displays it.
 */
export type FulfillmentMethod = 'ATLANTIS_COLLECTION' | 'SUPPLIER_TO_HUB' | 'SUPPLIER_DIRECT';

export interface Charge { key: string; label: string; basis: string; amount: number; paidTo: 'Atlantis' | 'Supplier (passed through)' | string; source: string }
export interface FulfillmentOption {
    method: FulfillmentMethod; label: string; status: 'priced' | 'quote_required' | 'unavailable'; reasons: string[];
    charges: Charge[]; total: number | null; transitDays: { min: number; max: number } | null;
    hub: { id: string; name: string; city: string; country: string } | null; steps: Step[]; handover: string;
}
export interface Step { who: string; what: string }
export interface MethodInfo { key: FulfillmentMethod; label: string; summary: string; steps: Step[]; handover: string }
export interface HubOption { id: string; name: string; city: string; country: string; countryName: string; services: string[] }
export interface SupplierSettings { supplierId: string; defaultMethod: FulfillmentMethod; hubFreightPerPallet: number | null; hubId: string | null }

export const getSupplierFulfillment = () =>
    call<{ settings: SupplierSettings; methods: MethodInfo[]; hubs: HubOption[] }>('/fulfillment/supplier/settings');
export const saveSupplierFulfillment = (body: { defaultMethod: FulfillmentMethod; hubId: string | null; hubFreightPerPallet: number | null }) =>
    call<SupplierSettings>('/fulfillment/supplier/settings', { method: 'PUT', body: JSON.stringify(body) });
export const setProductFulfillment = (productId: string, method: FulfillmentMethod | null) =>
    call<{ id: string; fulfillmentMethod: FulfillmentMethod | null }>(`/fulfillment/supplier/products/${productId}/method`, { method: 'PATCH', body: JSON.stringify({ method }) });

export interface SupplierPreview {
    product: { id: string; name: string; exwLocation: string | null; dispatchCountry: string | null; dispatchCountryName: string | null; casesPerPallet: number | null; palletsPerShipment: number | null; fulfillmentMethod: FulfillmentMethod | null };
    tier: 'carton' | 'pallet' | 'truck'; quantity: number; destination: string | null; destinationName: string | null;
    net: { currency: string; perCase: number; perUnit: number; total: number; casesPerUnit: number } | null;
    activeMethod: FulfillmentMethod; options: FulfillmentOption[]; notes: string[];
}
export const previewSupplierFulfillment = (q: { productId: string; tier: string; quantity: number; destination?: string; draft?: Partial<SupplierSettings> }) =>
    call<SupplierPreview>('/fulfillment/supplier/preview', { method: 'POST', body: JSON.stringify(q) });

export interface PublicHub { id: string; name: string; city: string; country: string; countryName: string; address: string | null; latitude: number; longitude: number; region: 'europe' | 'americas' | null; services: string[]; verifiedAt: string | null }
export const getPublicHubs = () => call<{ hubs: PublicHub[]; deliveryCountries: { code: string; name: string }[] }>('/fulfillment/hubs');

export interface AdminHub extends Omit<PublicHub, 'countryName' | 'region'> { verified: boolean; active: boolean; notes: string | null; createdAt: string }
export interface AdminRate { id: string; method: 'ATLANTIS_COLLECTION' | 'HUB_TO_BUYER'; originCountry: string; destinationCountry: string; hubId: string | null; unit: 'CASE' | 'PALLET' | 'TRUCK'; amountEur: number; minTransitDays: number | null; maxTransitDays: number | null; active: boolean; note: string | null }
export const getFulfillmentAdmin = () => call<{ hubs: AdminHub[]; rates: AdminRate[]; services: string[] }>('/fulfillment/admin');
export const saveHub = (body: any, id?: string) => call<AdminHub>(id ? `/fulfillment/admin/hubs/${id}` : '/fulfillment/admin/hubs', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
export const saveRate = (body: any, id?: string) => call<AdminRate>(id ? `/fulfillment/admin/rates/${id}` : '/fulfillment/admin/rates', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });

export const HUB_SERVICE_LABEL: Record<string, string> = {
    INSPECTION: 'Goods inspection', CONSOLIDATION: 'Consolidation', STORAGE: 'Storage', CROSS_DOCK: 'Cross-docking', COLLECTION: 'Collection point',
};

export const eur = (n: number | null | undefined) =>
    n == null ? '—' : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
