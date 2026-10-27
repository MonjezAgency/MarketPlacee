'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star, ThumbsUp, Trash2, Camera, X, BadgeCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';

interface Review {
    id: string;
    rating: number;
    verifiedPurchase?: boolean;
    comment?: string;
    images?: string[];
    createdAt: string;
    user: { id: string; name: string; companyName?: string; avatar?: string };
}

import { apiFetch } from '@/lib/api';

function StarRating({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
    const [hovered, setHovered] = useState(0);
    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange?.(star)}
                    onMouseEnter={() => onChange && setHovered(star)}
                    onMouseLeave={() => onChange && setHovered(0)}
                    className={onChange ? 'cursor-pointer' : 'cursor-default'}
                    disabled={!onChange}
                >
                    <Star
                        size={size}
                        className={star <= (hovered || value) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
                    />
                </button>
            ))}
        </div>
    );
}

export default function ReviewSection({ productId, onReviewSubmitted }: { productId: string; onReviewSubmitted?: (newRating: number, newCount: number) => void }) {
    const { user, isLoggedIn } = useAuth();
    const { t, locale } = useLanguage();
    const isAr = locale === 'ar';
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [myRating, setMyRating] = useState(0);
    const [myComment, setMyComment] = useState('');
    const [selectedImages, setSelectedImages] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(`/products/${productId}/reviews`);
            // Only accept a list — any other payload must not crash the product page.
            if (res.ok) { const data = await res.json().catch(() => null); setReviews(Array.isArray(data) ? data : []); }
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => { load(); }, [load]);

    // Pre-fill if user already reviewed
    useEffect(() => {
        if (!user) return;
        const mine = reviews.find(r => r.user.id === user.id);
        if (mine) { setMyRating(mine.rating); setMyComment(mine.comment || ''); }
    }, [reviews, user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setSelectedImages(prev => [...prev, ...files]);
            
            const newPreviews = files.map(file => URL.createObjectURL(file));
            setPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeImage = (index: number) => {
        setSelectedImages(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!myRating) {
            setError(t('reviews', 'ratingRequired')); 
            return; 
        }
        
        setError('');
        setSubmitting(true);
        
        try {
            const formData = new FormData();
            formData.append('rating', myRating.toString());
            formData.append('comment', myComment);
            selectedImages.forEach(file => {
                formData.append('images', file);
            });

            // Route through Next.js proxy so the httpOnly cookie is forwarded to backend
            const res = await fetch(`/api/reviews/${productId}`, {
                method: 'POST',
                body: formData,
            });

            if (res.status === 401) {
                setError('Your session has expired. Please log in again.');
                setTimeout(() => {
                    window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname);
                }, 2000);
                return;
            }

            if (res.status === 403 || res.status === 404) {
                const d = await res.json().catch(() => ({}));
                setError(typeof d?.message === 'string' ? d.message : 'You can’t review this product.');
                return;
            }

            if (!res.ok) { 
                if (res.status === 409) {
                    setError(t('reviews', 'duplicateReview') || 'You have already reviewed this product.');
                    return;
                }
                let msg = t('reviews', 'submitFailed');
                try {
                    const errorData = await res.json();
                    msg = errorData.message || msg;
                } catch (e) {}
                setError(msg); 
                return; 
            }

            // Successful submission: Clear state
            setSelectedImages([]);
            setPreviews([]);
            await load();
            
            // Refresh parent summary
            const updatedRes = await apiFetch(`/products/${productId}/reviews`);
            if (updatedRes.ok) {
                const latestReviews = await updatedRes.json();
                const avg = latestReviews.length > 0 
                    ? latestReviews.reduce((s: any, r: any) => s + r.rating, 0) / latestReviews.length 
                    : 0;
                onReviewSubmitted?.(avg, latestReviews.length);
            }
            
        } catch (err) {
            console.error('Review submission error:', err);
            setError(t('reviews', 'connectionError'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (reviewId: string) => {
        await apiFetch(`/products/${productId}/reviews/${reviewId}`, {
            method: 'DELETE',
        });
        await load();
    };

    const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    const dist = [5, 4, 3, 2, 1].map(s => ({ star: s, count: reviews.filter(r => r.rating === s).length }));

    const [visible, setVisible] = useState(1);
    const [showForm, setShowForm] = useState(false);
    const mine = reviews.find(r => r.user.id === user?.id);

    return (
        <section aria-labelledby="reviews-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="reviews-title" className="text-[18px] font-bold text-heading">{t('reviews', 'title')}</h2>
                    {reviews.length > 0 ? (
                        <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-3">
                            <StarRating value={Math.round(avgRating)} size={14} />
                            <span className="font-semibold text-ink tabular-nums">{avgRating.toFixed(1)}</span>
                            <span>· {reviews.length} {reviews.length === 1 ? t('reviews', 'review') : t('reviews', 'reviews')}</span>
                        </div>
                    ) : !loading && <p className="mt-1 text-[13px] text-ink-3">No reviews yet — reviews come from signed-in Atlantis business accounts.</p>}
                </div>
                {isLoggedIn ? (
                    <button type="button" onClick={() => setShowForm(v => !v)} className="h-9 px-4 rounded-lg ring-1 ring-line-strong hover:ring-ink text-[13px] font-semibold text-ink">
                        {showForm ? 'Cancel' : mine ? t('reviews', 'editReview') : t('reviews', 'writeReview')}
                    </button>
                ) : (
                    <button type="button" onClick={() => window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname)} className="h-9 px-4 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink">
                        Sign in to review
                    </button>
                )}
            </div>

            {isLoggedIn && showForm && (
                <form onSubmit={handleSubmit} className="mt-4 rounded-xl ring-1 ring-line bg-surface-2 p-4 space-y-4">
                    {error && <p className="text-[#DC2626] text-[13px]">{error}</p>}
                    <div>
                        <label className="block text-[12px] font-medium text-ink-3 mb-1">{t('reviews', 'yourRating')}</label>
                        <StarRating value={myRating} onChange={setMyRating} size={24} />
                    </div>
                    <div>
                        <label htmlFor="review-comment" className="block text-[12px] font-medium text-ink-3 mb-1">{t('reviews', 'yourOpinion')}</label>
                        <textarea id="review-comment" value={myComment} onChange={e => setMyComment(e.target.value)} placeholder={t('reviews', 'commentPlaceholder')} rows={3}
                            className="w-full rounded-lg ring-1 ring-line bg-surface p-3 text-[14px] text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6] resize-none" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {previews.map((preview, i) => (
                            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden ring-1 ring-line group">
                                <img src={preview} alt="" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => removeImage(i)} aria-label="Remove photo" className="absolute top-1 end-1 bg-[#DC2626] text-white rounded-full p-0.5"><X size={11} /></button>
                            </div>
                        ))}
                        <button type="button" onClick={() => document.getElementById('review-images')?.click()} className="w-16 h-16 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-line-strong text-ink-3 hover:text-teal hover:border-[#2EC4B6]">
                            <Camera size={16} /><span className="text-[10px]">{t('reviews', 'uploadPhoto')}</span>
                        </button>
                        <input id="review-images" type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={submitting} className="h-10 px-5 rounded-lg bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold disabled:opacity-50">
                            {submitting ? t('reviews', 'submitting') : t('reviews', 'submitReview')}
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="mt-4 h-24 rounded-xl bg-surface-3 animate-pulse" />
            ) : reviews.length > 0 && (
                <>
                    <ul className="mt-4 divide-y divide-line ring-1 ring-line rounded-xl">
                        {reviews.slice(0, visible).map(review => (
                            <li key={review.id} className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center text-[13px] font-semibold text-ink-2 shrink-0">{review.user.name?.[0]?.toUpperCase() || '?'}</span>
                                        <div className="min-w-0">
                                            <p className="text-[13.5px] font-semibold text-ink truncate">{review.user.companyName || review.user.name}</p>
                                            <div className="flex items-center gap-2">
                                                <StarRating value={review.rating} size={12} />
                                                {review.verifiedPurchase && <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#047857]"><BadgeCheck size={12} /> Verified purchase</span>}
                                                <span className="text-[12px] text-ink-4">{new Date(review.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {user?.id === review.user.id && (
                                        <button onClick={() => handleDelete(review.id)} aria-label="Delete your review" className="text-ink-4 hover:text-[#DC2626] shrink-0"><Trash2 size={15} /></button>
                                    )}
                                </div>
                                {review.comment && <p className="mt-2.5 text-[14px] text-ink-2 leading-relaxed">{review.comment}</p>}
                                {review.images && review.images.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2.5">
                                        {review.images.map((img, i) => (
                                            <a key={i} href={img} target="_blank" rel="noreferrer" className="w-14 h-14 rounded-lg overflow-hidden ring-1 ring-line">
                                                <img src={img} alt="Review photo" className="w-full h-full object-cover" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                    {reviews.length > visible ? (
                        <button type="button" onClick={() => setVisible(v => v + 5)} className="mt-3 text-[13px] font-semibold text-teal hover:underline">
                            Show more reviews ({reviews.length - visible} more)
                        </button>
                    ) : visible > 1 && (
                        <button type="button" onClick={() => setVisible(1)} className="mt-3 text-[13px] font-semibold text-ink-3 hover:text-ink">Show fewer</button>
                    )}
                </>
            )}
        </section>
    );
}
