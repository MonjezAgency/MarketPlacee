'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';

// Use '/api' to ensure all requests go through the Next.js middleware proxy
// (API_BASE_URL can resolve to the direct backend URL, causing CORS issues)
const API_URL = '/api';

export function useWishlist() {
    const { user } = useAuth();
    const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);

    const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('bev-token') : null);

    const fetchWishlist = useCallback(async () => {
        if (!user) return;
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/wishlist`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
            if (res.ok) {
                const data = await res.json();
                setWishlistIds(new Set(data.map((item: any) => item.id)));
            }
        } catch { /* offline */ }
    }, [user]);

    useEffect(() => { fetchWishlist(); }, [fetchWishlist]);

    const toggle = useCallback(async (productId: string) => {
        if (!user) return false;
        const token = getToken();
        if (!token) return false;
        const isSaved = wishlistIds.has(productId);
        // Optimistic update
        setWishlistIds(prev => {
            const next = new Set(prev);
            if (isSaved) next.delete(productId); else next.add(productId);
            return next;
        });
        try {
            setIsLoading(true);
            await fetch(`${API_URL}/wishlist/${productId}`, {
                method: isSaved ? 'DELETE' : 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {
            // Revert on error
            setWishlistIds(prev => {
                const next = new Set(prev);
                if (isSaved) next.add(productId); else next.delete(productId);
                return next;
            });
        } finally {
            setIsLoading(false);
        }
        return !isSaved;
    }, [user, wishlistIds]);

    return { wishlistIds, toggle, isLoading, isSaved: (id: string) => wishlistIds.has(id) };
}
