'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Star, Trash2, Search, Filter, Loader2, MessageSquare } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function StarRating({ rating }: { rating: number }) {
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} size={12}
                    className={s <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'} />
            ))}
        </div>
    );
}

export default function AdminReviewsPage() {
    const [reviews, setReviews] = React.useState<any[]>([]);
    const [total, setTotal] = React.useState(0);
    const [page, setPage] = React.useState(1);
    const [totalPages, setTotalPages] = React.useState(1);
    const [maxRating, setMaxRating] = React.useState<number | undefined>(undefined);
    const [isLoading, setIsLoading] = React.useState(true);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);

    const limit = 20;

    const fetchReviews = React.useCallback(async (p = 1, mr?: number) => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('bev-token');
            const params = new URLSearchParams({ page: String(p), limit: String(limit) });
            if (mr !== undefined) params.set('maxRating', String(mr));
            const res = await fetch(`${API_URL}/admin/reviews?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setReviews(data.data || []);
                setTotal(data.total || 0);
                setTotalPages(data.totalPages || 1);
            }
        } catch { /* ignore */ }
        finally { setIsLoading(false); }
    }, []);

    React.useEffect(() => { fetchReviews(page, maxRating); }, [fetchReviews, page, maxRating]);

    const handleDelete = async (reviewId: string) => {
        if (!confirm('Delete this review permanently?')) return;
        setDeletingId(reviewId);
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${API_URL}/admin/reviews/${reviewId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setReviews(prev => prev.filter(r => r.id !== reviewId));
                setTotal(prev => prev - 1);
            }
        } catch { /* ignore */ }
        finally { setDeletingId(null); }
    };

    const ratingFilters = [
        { label: 'All', value: undefined },
        { label: '1★ only', value: 1 },
        { label: '≤ 2★', value: 2 },
        { label: '≤ 3★', value: 3 },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black">Review Moderation</h1>
                    <p className="text-sm text-muted-foreground mt-1">{total} reviews total</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
                <Filter size={14} className="text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Filter by rating:</span>
                {ratingFilters.map(f => (
                    <button key={String(f.value)} onClick={() => { setMaxRating(f.value); setPage(1); }}
                        className={`h-7 px-3 rounded-full text-xs font-bold transition-colors ${maxRating === f.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : reviews.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    <MessageSquare size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="font-bold">No reviews found.</p>
                </div>
            ) : (
                <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/50 bg-muted/30">
                                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Reviewer</th>
                                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Product</th>
                                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Rating</th>
                                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Comment</th>
                                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Date</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {reviews.map((review, i) => (
                                <motion.tr key={review.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                                    <td className="px-5 py-3">
                                        <p className="font-bold text-sm">{review.user?.name || '—'}</p>
                                        <p className="text-xs text-muted-foreground">{review.user?.companyName || ''}</p>
                                    </td>
                                    <td className="px-5 py-3">
                                        <p className="font-bold text-sm line-clamp-1 max-w-[160px]">{review.product?.name || '—'}</p>
                                    </td>
                                    <td className="px-5 py-3">
                                        <StarRating rating={review.rating} />
                                        <p className="text-xs text-muted-foreground mt-0.5">{review.rating}/5</p>
                                    </td>
                                    <td className="px-5 py-3">
                                        <p className="text-sm text-muted-foreground line-clamp-2 max-w-[220px]">
                                            {review.comment || <span className="italic">No comment</span>}
                                        </p>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                        {new Date(review.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-5 py-3">
                                        <button onClick={() => handleDelete(review.id)}
                                            disabled={deletingId === review.id}
                                            className="h-8 w-8 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors disabled:opacity-50">
                                            {deletingId === review.id
                                                ? <Loader2 size={14} className="animate-spin" />
                                                : <Trash2 size={14} />}
                                        </button>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        className="h-8 px-3 rounded-xl text-xs font-bold bg-muted hover:bg-muted/70 disabled:opacity-40 transition-colors">
                        Previous
                    </button>
                    <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="h-8 px-3 rounded-xl text-xs font-bold bg-muted hover:bg-muted/70 disabled:opacity-40 transition-colors">
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
