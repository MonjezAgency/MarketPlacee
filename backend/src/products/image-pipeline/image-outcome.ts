import type { ImageStatus } from './types';

export type RowOutcome = 'published' | 'published_image_pending' | 'needs_attention';
export type RowImage = 'verified' | 'bg_pending' | 'pending_vision' | 'placeholder' | 'kept';
export type RowReason = 'invalid_ean' | 'no_image' | 'photo_too_small' | 'not_verified' | 'missing_fields';

export interface Decision {
    image: RowImage;
    /** The composed picture goes on the product. */
    attach: boolean;
    /** Publish if it is a draft with everything else in place. */
    publish: boolean;
    /** It may go live on the placeholder: its photo is only waiting for vision. */
    withoutPhoto: boolean;
    /** It went live on the placeholder and its photo then failed. */
    withdraw: boolean;
    /** Run this row again after the daily reset. */
    waiting: boolean;
    outcome: RowOutcome;
    reason: RowReason | null;
}

const WHY: Partial<Record<ImageStatus, RowReason>> = { invalid_ean: 'invalid_ean', low_res: 'photo_too_small', needs_review: 'not_verified', needs_better_image: 'not_verified', needs_bg_removal: 'not_verified' };

/**
 * What a pipeline result means for the product and for the supplier. The image is a
 * required field (catalog-rules.ts), so a row with no verified picture doesn't publish.
 * The exception is the owner's: a row only waiting for the vision quota goes live on the
 * placeholder and comes back to a draft if its photo then fails.
 */
export function decide(input: { status: ImageStatus; hasPhoto: boolean; missing: string[]; wentLiveWaiting: boolean }): Decision {
    const { status, hasPhoto, missing, wentLiveWaiting } = input;
    const incomplete = missing.length > 0;
    const base = { attach: false, publish: false, withoutPhoto: false, withdraw: false, waiting: false };
    if (status === 'invalid_ean') return { ...base, image: hasPhoto ? 'kept' : 'placeholder', outcome: 'needs_attention', reason: 'invalid_ean' };
    if (status === 'pending_vision') return { ...base, image: hasPhoto ? 'kept' : 'pending_vision', publish: !incomplete, withoutPhoto: !hasPhoto, waiting: !hasPhoto, outcome: incomplete ? 'needs_attention' : hasPhoto ? 'published' : 'published_image_pending', reason: incomplete ? 'missing_fields' : null };
    if (hasPhoto) return { ...base, image: 'kept', publish: !incomplete, outcome: incomplete ? 'needs_attention' : 'published', reason: incomplete ? 'missing_fields' : null };
    if (status === 'approved' || status === 'bg_pending') return { ...base, image: status === 'approved' ? 'verified' : 'bg_pending', attach: true, publish: !incomplete, outcome: incomplete ? 'needs_attention' : 'published', reason: incomplete ? 'missing_fields' : null };
    return { ...base, image: 'placeholder', withdraw: wentLiveWaiting, outcome: 'needs_attention', reason: WHY[status] ?? 'no_image' };
}
