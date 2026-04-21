'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch } from './api';
import { useRouter } from 'next/navigation';

export interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    companyName?: string;
    company?: string;
    country?: string;
    vatNumber?: string;
    website?: string;
    socialLinks?: string;
    role: string;
    status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'BLOCKED';
    kycStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
}

interface AuthContextType {
    user: User | null;
    isLoggedIn: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; user?: User; message?: string; requiresTwoFactor?: boolean; partialToken?: string }>;
    verify2FALogin: (partialToken: string, code: string) => Promise<{ success: boolean; user?: User; message?: string }>;
    register: (data: {
        name: string;
        email: string;
        phone?: string;
        companyName?: string;
        website?: string;
        socialLinks?: string;
        password: string;
        role: string;
        inviteToken?: string;
        vatNumber?: string;
        taxId?: string;
        country?: string;
        bankAddress?: string;
        iban?: string;
        swiftCode?: string;
        locale?: string;
    }) => Promise<boolean | string>;
    updateUser: (data: Partial<User>) => void;
    logout: () => void;
    isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoggedIn: false,
    login: async () => ({ success: false }),
    verify2FALogin: async () => ({ success: false }),
    register: async () => false,
    updateUser: () => { },
    logout: () => { },
    isAuthReady: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // Load from backend /auth/me on mount
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await apiFetch('/auth/me');
                if (res.ok) {
                    const userData = await res.json();
                    setUser(userData);
                    if (typeof window !== 'undefined' && userData?.id) {
                        sessionStorage.setItem('bev-uid', userData.id);
                        window.dispatchEvent(new Event('bev-auth-changed'));
                    }
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.error("Auth hydration failed:", err);
                setUser(null);
            } finally {
                setIsAuthReady(true);
            }
        };
        checkAuth();
    }, []);

    const register = async (data: {
        name: string;
        email: string;
        phone?: string;
        companyName?: string;
        website?: string;
        socialLinks?: string;
        password: string;
        role: string;
        inviteToken?: string;
        vatNumber?: string;
        taxId?: string;
        country?: string;
        bankAddress?: string;
        iban?: string;
        swiftCode?: string;
        locale?: string;
    }): Promise<boolean | string> => {
        try {
            const res = await apiFetch('/auth/register', {
                method: 'POST',
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                let errorMessage = 'Registration failed.';
                if (Array.isArray(error.message)) {
                    errorMessage = error.message.join(', ');
                } else if (typeof error.message === 'string') {
                    errorMessage = error.message;
                }
                return errorMessage;
            }

            // Since they are pending approval, we do NOT log them in automatically.
            return true;
        } catch (err) {
            console.error("Registration failed:", err);
            return 'Server is currently unreachable. Please try again later.';
        }
    };

    const login = async (email: string, password: string): Promise<{ success: boolean; user?: User; message?: string; requiresTwoFactor?: boolean; partialToken?: string }> => {
        const attemptLogin = async () => {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            let data: any;
            try {
                data = await res.json();
            } catch {
                return { ok: false, data: { message: 'Server connection failed.' } };
            }
            return { ok: res.ok, status: res.status, data };
        };

        try {
            let { ok, status, data } = await attemptLogin();

            // If we hit a cold-start timeout (503 with gateway-style message), retry once automatically
            const isColdStart =
                !ok &&
                status === 503 &&
                (data?.message?.includes('starting up') ||
                 data?.message?.includes('temporarily unavailable') ||
                 data?.message?.includes('Application failed') ||
                 data?.message?.includes('aborted'));

            if (isColdStart) {
                console.warn('[AUTH] Cold start detected — retrying login in 4s...');
                await new Promise((r) => setTimeout(r, 4000));
                ({ ok, status, data } = await attemptLogin());
            }

            if (!ok) {
                return { success: false, message: data?.message || 'Invalid email or password.' };
            }

            // 2FA challenge
            if (data.requiresTwoFactor) {
                return { success: true, requiresTwoFactor: true, partialToken: data.partialToken };
            }

            if (!data.user) {
                console.error("Login response missing user:", data);
                return { success: false, message: 'Invalid response from server.' };
            }
            setUser(data.user);
            if (typeof window !== 'undefined' && data.user?.id) {
                sessionStorage.setItem('bev-uid', data.user.id);
                window.dispatchEvent(new Event('bev-auth-changed'));
            }
            return { success: true, user: data.user };
        } catch (err) {
            console.error("Login failed:", err);
            return { success: false, message: 'Server connection failed.' };
        }
    };

    const verify2FALogin = async (partialToken: string, code: string): Promise<{ success: boolean; user?: User; message?: string }> => {
        try {
            // Use local API proxy for 2FA
            const res = await fetch('/api/auth/2fa/login-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partialToken, code }),
            });
            if (!res.ok) {
                const error = await res.json();
                return { success: false, message: error.message || 'Invalid verification code.' };
            }
            const result = await res.json();
            const userData = result.user;
            setUser(userData);
            if (typeof window !== 'undefined' && userData?.id) {
                sessionStorage.setItem('bev-uid', userData.id);
                window.dispatchEvent(new Event('bev-auth-changed'));
            }
            return { success: true, user: userData };
        } catch (err) {
            return { success: false, message: 'Server connection failed.' };
        }
    };

    const updateUser = async (data: Partial<User>) => {
        if (!user) return;
        try {
            const res = await apiFetch(`/users/${user.id}`, {
                method: 'POST',
                body: JSON.stringify(data),
            });

            if (res.ok) {
                const updatedUser = { ...user, ...data };
                setUser(updatedUser);
            }
        } catch (err) {
            console.error("Failed to update user profile on server:", err);
            // Optional: fallback to local optimization
            const updatedUser = { ...user, ...data };
            setUser(updatedUser);
        }
    };

    const logout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error("Logout request failed:", err);
        }
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('bev-uid');
            window.dispatchEvent(new Event('bev-auth-changed'));
        }
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, isLoggedIn: !!user, login, verify2FALogin, register, updateUser, logout, isAuthReady }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
