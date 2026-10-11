import type { Product } from '@/lib/types';

export type Markups = { piece: number; pallet: number; container: number };
export type DefaultUnit = 'truck' | 'pallet' | 'carton';

export const DEFAULT_MARKUPS: Markups = { piece: 1.10, pallet: 1.05, container: 1.02 };

const apiBase = () => process.env.NEXT_PUBLIC_API_URL || '/api';

// ── Module-level singletons: fetch admin config once across all card instances ─
let _defaultUnit: DefaultUnit | null = null;
let _defaultUnitPromise: Promise<DefaultUnit> | null = null;

export function getAdminDefaultUnit(): Promise<DefaultUnit> {
    if (_defaultUnit) return Promise.resolve(_defaultUnit);
    if (!_defaultUnitPromise) {
        _defaultUnitPromise = fetch(`${apiBase()}/config/default-unit`)
            .then(r => r.json())
            .then(d => {
                const u = d?.unit;
                _defaultUnit = (['truck', 'pallet', 'carton'].includes(u) ? u : 'truck') as DefaultUnit;
                return _defaultUnit;
            })
            .catch(() => { _defaultUnit = 'truck'; return _defaultUnit; });
    }
    return _defaultUnitPromise;
}

let _markups: Markups | null = null;
let _markupsPromise: Promise<Markups> | null = null;

export function getAdminMarkups(): Promise<Markups> {
    if (_markups) return Promise.resolve(_markups);
    if (!_markupsPromise) {
        _markupsPromise = fetch(`${apiBase()}/config/markup`)
            .then(r => r.json())
            .then(d => {
                _markups = {
                    piece: Number(d?.piece) || DEFAULT_MARKUPS.piece,
                    pallet: Number(d?.pallet) || DEFAULT_MARKUPS.pallet,
                    container: Number(d?.container) || DEFAULT_MARKUPS.container,
                };
                return _markups;
            })
            .catch(() => { _markups = { ...DEFAULT_MARKUPS }; return _markups; });
    }
    return _markupsPromise;
}

/**
 * Listing-card price: always PER CASE, at the cheapest reachable tier
 * markup (Truck → Pallet → Case), so buyers see "from this price per case".
 *
 * `basePrice` is ALWAYS per-case on this platform (supplier form stores
 * pricePerPiece × unitsPerCase). Per-piece is derived by dividing by
 * `unitsPerCase` only — the `unit` field is display-only. (Earlier code
 * divided by pallet × truck sizes and rendered €8.64/case as €0.01.)
 * Suppliers viewing their own listing see the raw base price, no markup.
 */
export function computeCardPrice(product: Product, markups: Markups, isOwnProduct: boolean): number {
    const displayPrice = isOwnProduct && product.basePrice ? product.basePrice : product.price;

    const piecesPerCase = product.unitsPerCase || 0;
    const casesPerPallet = product.casesPerPallet || 0;
    const piecesPerPallet = product.unitsPerPallet || (piecesPerCase * casesPerPallet) || 0;
    const palletsPerTruck = product.palletsPerShipment || 0;

    const rawBase = isOwnProduct
        ? displayPrice
        : (product.basePrice != null ? product.basePrice : displayPrice / markups.piece);
    const basePerPiece = piecesPerCase > 0 ? rawBase / piecesPerCase : rawBase;

    const mPiece = isOwnProduct ? 1 : markups.piece;
    const mPallet = isOwnProduct ? 1 : markups.pallet;
    const mContainer = isOwnProduct ? 1 : markups.container;

    const basePerCase = piecesPerCase > 0 ? basePerPiece * piecesPerCase : basePerPiece;
    const truckTierAvailable = piecesPerCase > 0 && piecesPerPallet > 0 && palletsPerTruck > 0;
    const palletTierAvailable = piecesPerCase > 0 && piecesPerPallet > 0;
    const caseTierAvailable = piecesPerCase > 0;

    if (truckTierAvailable) return basePerCase * mContainer;
    if (palletTierAvailable) return basePerCase * mPallet;
    if (caseTierAvailable) return basePerCase * mPiece;
    return displayPrice;
}
