import type { Gs1Country } from './gs1-prefixes';
import type { Gtin } from './gtin';
import type { CleanName } from './name';

export type ImageStatus = 'pending' | 'searching' | 'approved' | 'needs_bg_removal' | 'needs_better_image' | 'needs_review' | 'not_found' | 'invalid_ean' | 'low_res' | 'failed';
export type Licence = 'supplier' | 'manufacturer' | 'cc_by_sa' | 'unknown' | 'editorial' | 'stock_licensed';
export type DomainClass = 'brand' | 'retailer' | 'ean_database' | 'unknown';
export type SourceId = 'openfoodfacts' | 'ean-db' | 'upcitemdb' | 'go-upc' | 'barcode-spider' | 'serper' | 'shutterstock' | 'supplier';

export interface PipelineRow {
    ean: string;
    name?: string | null;
    brand?: string | null;
    weight?: string | null;
    category?: string | null;
    /** The market or pack language the supplier sells, when the sheet says. */
    market?: string | null;
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
    /** The source itself says this shows the back: ingredients or nutrition. */
    role?: 'back';
}

export type Flaw = 'busy_background' | 'close_up' | 'small_in_frame' | 'blurry' | 'low_contrast' | 'back_of_pack' | 'multipack' | 'shows_barcode';
export interface ScoreParts { white: number; resolution: number; identityText: number; visual: number; domain: number; framing: number; barcode: number; penalty: number }
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
    flaws: Flaw[];
    /** Nothing in the pixels speaks against a studio packshot. Vision still has to agree. */
    studio: boolean;
    /** Large enough in its frame to be worth a cut-out, when that can be measured. */
    cutoutFits: boolean;
}

/** One line of the contact sheet: a photo and why it did or didn't win. */
export interface RankedPhoto { url: string; source: string; width: number; height: number; score: number; why: string; bytes: Buffer }

/** What a run would spend, worked out from free sources only. */
export interface RunPlan { finalists: number; route: 'white' | 'cutout' | 'none'; visionCalls: number; visionCallsAfterSearch: number; photoroomCalls: number; searches: number; searchesIfRejected: number }

export interface VisionAnswer {
    best_index: number;
    same_product: boolean; same_variant: boolean; same_size_or_count: boolean; front_face: boolean; single_product: boolean;
    watermark_or_overlay: boolean; confidence: number; reason: string; read_text?: string;
    /** On the raw photo, before a cut-out is paid for. */
    whole_pack_visible?: boolean; hand_over_pack?: boolean; sharp?: boolean; fills_frame?: boolean; straight_on?: boolean; stands_out_from_background?: boolean; pack_language?: string;
    /** On the final composed picture. */
    edges_clean?: boolean; no_leftover_background?: boolean; hand_fragments?: boolean; pack_not_cut?: boolean; text_readable?: boolean;
}
export type VisionStage = 'screen' | 'final';
export interface VisionVerdict {
    model: string;
    stage: VisionStage;
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
    /** Things a person reading the trace should know, such as a photo that came through a carton code. */
    notes: string[];
    cost: { total: number; bySource: Record<string, number> };
}

export interface PipelineResult {
    status: ImageStatus;
    /** Exact reason shown to admins. Never just "no image". */
    reason: string;
    trace: Trace;
    /** Up to six, best first, for one-click review. */
    top: Scored[];
    /** The same with what lost and why, for the contact sheet. */
    ranked?: RankedPhoto[];
    /** Set on a planning run: nothing was judged or searched. */
    plan?: RunPlan;
    chosen?: Scored;
    /** Would this be published under each licence setting. */
    publishable: { A: boolean; B: boolean };
    /** Would it be, once the background is gone. Set on `needs_bg_removal`. */
    wouldPublish?: { A: boolean; B: boolean };
    output?: { jpeg: Buffer; webp: Buffer };
    /** A sandbox cut-out to look at. Watermarked: never saved, never published. */
    preview?: { png: Buffer; label: 'SANDBOX PREVIEW' };
}
