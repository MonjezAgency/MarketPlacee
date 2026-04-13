'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

export function useWishlist() {
    const { user } = useAuth();
    const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [isSessionExpired, setIsSessionExpired] = useState(false);

    const fetchWishlist = useCallback(async () => {
        if (!user) return;
        try {
            const res = await apiFetch('/wishlist');
            if (res.status === 401) {
                setWishlistIds(new Set());
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setWishlistIds(new Set(data.map((item: any) => item.product?.id || item.id)));
            }
        } catch (_e) { /* offline */ }
    }, [user]);

    useEffect(() => { fetchWishlist(); }, [fetchWishlist]);

    const toggle = useCallback(async (productId: string) => {
        if (!user) return false;
        const isSaved = wishlistIds.has(productId);
        
        // Optimistic update
        setWishlistIds(prev => {
            const next = new Set(prev);
            if (isSaved) next.delete(productId); else next.add(productId);
            return next;
        });

        try {
            setIsLoading(true);
            const res = await apiFetch(`/wishlist/${productId}`, {
                method: isSaved ? 'DELETE' : 'POST',
            });

            if (res.status === 401) {
                // Session expired — rollback optimistic update
                setWishlistIds(prev => {
                    const next = new Set(prev);
                    if (isSaved) next.add(productId); else next.delete(productId);
                    return next;
                });
                setIsSessionExpired(true);
                console.warn('[WISHLIST] Session expired — 401');
                // Soft redirect after short delay (prevents flash/404)
                setTimeout(() => {
                    window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname);
                }, 100);
                return isSaved;
            }

            if (res.status === 403) {
                // Permission denied — rollback, don't redirect
                setWishlistIds(prev => {
                    const next = new Set(prev);
                    if (isSaved) next.add(productId); else next.delete(productId);
                    return next;
                });
                console.warn('[WISHLIST] Permission denied — 403');
                return isSaved;
            }

            if (!res.ok) throw new Error('Failed to toggle wishlist');
            
        } catch (err) {
            console.error('[WISHLIST_TOGGLE_ERROR] Rolling back UI state', err);
            // Revert on error
            setWishlistIds(prev => {
                const next = new Set(prev);
                if (isSaved) next.add(productId); else next.delete(productId);
                return next;
            });
            return isSaved;
        } finally {
            setIsLoading(false);
        }
        return !isSaved;
    }, [user, wishlistIds]);

    return { wishlistIds, toggle, isLoading, isSaved: (id: string) => wishlistIds.has(id), isSessionExpired };
}
