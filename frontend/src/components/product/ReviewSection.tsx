'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star, ThumbsUp, Trash2, Camera, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface Review {
    id: string;
    rating: number;
    comment?: string;
    images?: string[];
    createdAt: string;
    user: { id: string; name: string; companyName?: string; avatar?: string };
}

const API_URL = '/api';
// Direct backend URL for multipart uploads (middleware rewrite drops FormData body)
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-dfc2.up.railway.app';

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
            const res = await fetch(`${API_URL}/products/${productId}/reviews`);
            if (res.ok) setReviews(await res.json());
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
            setError('يرجى اختيار تقييم بالنجوم لإرسال مراجعتك'); 
            return; 
        }
        
        setError('');
        setSubmitting(true);
        
        try {
            const token = localStorage.getItem('bev-token');
            if (!token) {
                setError('يجب تسجيل الدخول لإضافة تقييم');
                return;
            }

            const formData = new FormData();
            formData.append('rating', myRating.toString());
            formData.append('comment', myComment);
            selectedImages.forEach(file => {
                formData.append('images', file);
            });

            // Use direct backend URL for multipart uploads — Next.js middleware
            // rewrite drops the FormData body, causing the POST to fail.
            const postUrl = `${BACKEND_URL}/products/${productId}/reviews`;

            const res = await fetch(postUrl, {
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${token}` 
                    // Note: Browser automatically sets Content-Type to multipart/form-data with boundary
                },
                body: formData,
            });

            if (!res.ok) { 
                let msg = 'فشل إرسال التقييم';
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
            
            const updatedRes = await fetch(`${API_URL}/products/${productId}/reviews`);
            if (updatedRes.ok) {
                const latestReviews = await updatedRes.json();
                const avg = latestReviews.length > 0 
                    ? latestReviews.reduce((s: any, r: any) => s + r.rating, 0) / latestReviews.length 
                    : 0;
                onReviewSubmitted?.(avg, latestReviews.length);
            }
            
        } catch (err) {
            console.error('Review submission error:', err);
            setError('حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (reviewId: string) => {
        const token = localStorage.getItem('bev-token');
        await fetch(`${API_URL}/products/${productId}/reviews/${reviewId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        await load();
    };

    const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    const dist = [5, 4, 3, 2, 1].map(s => ({ star: s, count: reviews.filter(r => r.rating === s).length }));

    return (
        <div className="mt-12 border-t border-slate-100 pt-10">
            <h2 className="text-2xl font-black text-[#0A1A2F] mb-8">التقييمات والمراجعات</h2>

            {/* Summary */}
            {reviews.length > 0 && (
                <div className="flex gap-10 mb-10 p-6 bg-slate-50 rounded-2xl">
                    <div className="text-center">
                        <div className="text-5xl font-black text-[#0A1A2F]">{avgRating.toFixed(1)}</div>
                        <StarRating value={Math.round(avgRating)} size={16} />
                        <div className="text-xs text-slate-400 mt-1">{reviews.length} تقييم</div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                        {dist.map(({ star, count }) => (
                            <div key={star} className="flex items-center gap-2 text-xs">
                                <span className="w-4 text-slate-500">{star}</span>
                                <Star size={12} className="fill-amber-400 text-amber-400" />
                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-amber-400 rounded-full transition-all"
                                        style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%' }}
                                    />
                                </div>
                                <span className="w-4 text-slate-400">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Write Review */}
            {isLoggedIn ? (
                <form onSubmit={handleSubmit} className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl p-6 mb-8 shadow-sm">
                    <h3 className="font-black text-[#0A1A2F] dark:text-white mb-4">
                        {reviews.find(r => r.user.id === user?.id) ? 'تعديل تقييمك' : 'اكتب تقييمك'}
                    </h3>
                    {error && <p className="text-red-500 text-sm mb-4 font-bold">{error}</p>}
                    
                    <div className="flex flex-col md:flex-row gap-6 mb-6">
                        <div className="shrink-0">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block text-center">تقييمك</label>
                            <StarRating value={myRating} onChange={setMyRating} size={32} />
                        </div>
                        
                        <div className="flex-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block">رأيك الشخصي</label>
                            <textarea
                                value={myComment}
                                onChange={e => setMyComment(e.target.value)}
                                placeholder="شاركنا رأيك في هذا المنتج... (اختياري)"
                                rows={2}
                                className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-sm text-[#0A1A2F] dark:text-white outline-none focus:border-[#FF8A00]/40 transition resize-none"
                            />
                        </div>
                    </div>

                    {/* Image Upload UI */}
                    <div className="mb-6">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block">أضف صور للمنتج (اختياري)</label>
                        <div className="flex flex-wrap gap-3">
                            {previews.map((preview, i) => (
                                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 group">
                                    <img src={preview} alt="preview" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(i)}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => document.getElementById('review-images')?.click()}
                                className="w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 text-slate-400 hover:text-[#FF8A00] hover:border-[#FF8A00] transition-all"
                            >
                                <Camera size={20} />
                                <span className="text-[9px] font-black uppercase tracking-tighter">رفع صورة</span>
                            </button>
                            <input
                                id="review-images"
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-10 py-3.5 bg-[#0A1A2F] dark:bg-[#1BC7C9] text-white dark:text-[#0A1A2F] rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg shadow-[#0A1A2F]/10 dark:shadow-none"
                        >
                            {submitting ? 'جاري الإرسال...' : 'إرسال التقييم'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 mb-8 text-center">
                    <p className="text-slate-600 font-bold mb-4">يرجى تسجيل الدخول لتتمكن من إضافة تقييم لهذا المنتج</p>
                    <button
                        onClick={() => window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)}
                        className="px-6 py-2 bg-[#0A1A2F] text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#FF8A00] transition-all"
                    >
                        تسجيل الدخول
                    </button>
                </div>
            )}

            {/* Reviews List */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
                </div>
            ) : reviews.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <ThumbsUp size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-bold">لا توجد تقييمات بعد — كن أول من يقيّم!</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {reviews.map(review => (
                        <div key={review.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#0A1A2F]/10 flex items-center justify-center font-black text-[#0A1A2F] text-sm shrink-0">
                                        {review.user.name?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <p className="font-black text-[#0A1A2F] text-sm">{review.user.companyName || review.user.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <StarRating value={review.rating} size={13} />
                                            <span className="text-xs text-slate-400">
                                                {new Date(review.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {user?.id === review.user.id && (
                                    <button onClick={() => handleDelete(review.id)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                            {review.comment && (
                                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed ps-13">{review.comment}</p>
                            )}
                            {review.images && review.images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3 ps-13">
                                    {review.images.map((img, i) => (
                                        <a key={i} href={img} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-slate-100 dark:border-white/5">
                                            <img src={img} alt="review" className="w-full h-full object-cover hover:scale-110 transition-transform" />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
