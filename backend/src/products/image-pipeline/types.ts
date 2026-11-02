import type { Gs1Country } from './gs1-prefixes';
import type { Gtin } from './gtin';
import type { CleanName } from './name';

export type ImageStatus = 'pending' | 'searching' | 'approved' | 'needs_review' | 'not_found' | 'invalid_ean' | 'low_res' | 'failed';
export type Licence = 'supplier' | 'manufacturer' | 'cc_by_sa' | 'unknown' | 'editorial' | 'stock_licensed';
export type DomainClass = 'brand' | 'retailer' | 'ean_database' | 'unknown';
export type SourceId = 'openfoodfacts' | 'ean-search' | 'ean-db' | 'upcitemdb' | 'go-upc' | 'barcode-spider' | 'serper' | 'brave' | 'shutterstock' | 'supplier';

export interface PipelineRow {
    ean: string;
    name?: string | null;
    brand?: string | null;
    weight?: string | null;
    category?: string | null;
    /** Pictures the supplier gave for this row: URL column, or bytes from the sheet or inbox. */
    supplierImages?: { url?: string; bytes?: Buffer; label?: string }[];
}

/** What one source says a barcode is. */
export interface IdentityRecord { source: SourceId; code: string; name: string | null; brand: string | null; quantity: string | null; imageUrls: string[] }

export interface Identity {
    ean: string;
    brand: string;
    name: string;
    english: string;
    variant: string[];
    size: string;
    packLanguage: string;
    gs1?: Gs1Country;
    /** Photos a database links to this barcode, used only to compare. */
    references: string[];
    /** Where sources disagree. The vision gate weighs these; a brand conflict blocks auto-approval. */
    conflicts: string[];
    /** Which code a record answered to. */
    matchedBy: 'ean' | 'case' | 'inner' | 'none';
    records: { source: SourceId; code: string; name: string | null; brand: string | null; quantity: string | null }[];
}

export interface Candidate {
    url: string;
    source: SourceId;
    /** The page it came from. */
    pageUrl?: string;
    title?: string;
    width?: number;
    height?: number;
    isEditorial?: boolean;
    /** A licence the source itself states; otherwise licensing.ts works it out. */
    licence?: Licence;
    licenceLabel?: string;
    attribution?: string;
    /** Supplier pictures come as bytes. */
    bytes?: Buffer;
    /** The code this was found under. */
    foundBy?: string;
    /** Which search query, for Tier B. */
    query?: string;
}

export interface ScoreParts { white: number; resolution: number; identityText: number; visual: number; domain: number; framing: number; barcode: number }
export interface Scored extends Candidate {
    score: number;
    parts: ScoreParts;
    domainClass: DomainClass;
    licence: Licence;
    decodedBarcode: string | null;
    bytes: Buffer;
    pixelWidth: number;
    pixelHeight: number;
    whiteBackground: boolean;
}

export interface VisionAnswer {
    best_index: number;
    same_product: boolean; same_variant: boolean; same_size_or_count: boolean; front_face: boolean; single_product: boolean; studio_quality: boolean;
    hand_shelf_or_lifestyle: boolean; watermark_or_overlay: boolean; matches_reference_style: boolean;
    confidence: number; reason: string; read_text?: string;
}
export interface VisionVerdict {
    model: string;
    passed: boolean;
    /** Which rule failed. Empty when it passed. */
    failed: string[];
    index: number;
    confidence: number;
    reason: string;
    answer: VisionAnswer | null;
    cost: number;
    cached: boolean;
}

export interface SourceCall { source: SourceId | 'vision' | 'photoroom' | 'download'; ean?: string; what: string; status: number | 'timeout' | 'error' | 'cached' | 'skipped'; ms: number; candidates?: number; cost?: number; note?: string }
export interface Trace {
    version: string;
    row: { ean: string; name: string | null; brand: string | null };
    gtin?: Pick<Gtin, 'canonical' | 'caseCode' | 'inner' | 'searchCodes' | 'problem'>;
    name?: CleanName;
    identity?: Identity;
    calls: SourceCall[];
    candidates: { found: number; bySource: Record<string, number>; downloaded: number };
    rejects: { url: string; source: string; reason: string }[];
    scored: { url: string; source: string; score: number; parts: ScoreParts; licence: Licence; decoded: string | null }[];
    barcode: { attempted: number; decoded: number; matched: number };
    vision: VisionVerdict[];
    compose?: { engine: 'sharp' | 'photoroom'; checks: Record<string, unknown> };
    cost: { total: number; bySource: Record<string, number> };
}

export interface PipelineResult {
    status: ImageStatus;
    /** Exact reason shown to admins. Never just "no image". */
    reason: string;
    trace: Trace;
    /** Up to five, best first, for one-click review. */
    top: Scored[];
    chosen?: Scored;
    /** Would this be published under each licence setting. */
    publishable: { A: boolean; B: boolean };
    output?: { jpeg: Buffer; webp: Buffer };
}
