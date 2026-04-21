'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
    id: string;
    name: string;
    brand: string;
    price: number;
    image: string;
    quantity: number;
    unit: string;
    category?: string;
    supplierId?: string;
}

interface CartContextType {
    items: CartItem[];
    addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, qty: number) => void;
    clearCart: () => void;
    total: number;
}

const CartContext = createContext<CartContextType>({
    items: [],
    addItem: () => { },
    removeItem: () => { },
    updateQuantity: () => { },
    clearCart: () => { },
    total: 0,
});

// Cart key is scoped per user so switching accounts never leaks items
function getCartKey(): string {
    if (typeof window === 'undefined') return 'bev-cart-guest';
    try {
        // Read user id from /api/auth/me response cached in window, or fall back to guest
        const stored = sessionStorage.getItem('bev-uid');
        return stored ? `bev-cart-${stored}` : 'bev-cart-guest';
    } catch {
        return 'bev-cart-guest';
    }
}

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [cartKey, setCartKey] = useState<string>('bev-cart-guest');

    // Detect user-id changes (login / logout) and reload the correct cart
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const syncKey = () => {
            const key = getCartKey();
            setCartKey(key);
            try {
                const saved = localStorage.getItem(key);
                setItems(saved ? JSON.parse(saved) : []);
            } catch {
                localStorage.removeItem(key);
                setItems([]);
            }
        };
        syncKey();
        window.addEventListener('bev-auth-changed', syncKey);
        return () => window.removeEventListener('bev-auth-changed', syncKey);
    }, []);

    // Persist to the current user's cart key
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(cartKey, JSON.stringify(items));
        }
    }, [items, cartKey]);

    const addItem = (item: Omit<CartItem, 'quantity'>, qty = 1) => {
        setItems(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + qty } : i);
            }
            return [...prev, { ...item, quantity: qty }];
        });
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const updateQuantity = (id: string, qty: number) => {
        if (qty <= 0) return removeItem(id);
        setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
    };

    const clearCart = () => {
        setItems([]);
        if (typeof window !== 'undefined') localStorage.removeItem(cartKey);
    };

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    return (
        <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, total }}>
            {children}
        </CartContext.Provider>
    );
}

export const useCart = () => useContext(CartContext);
