'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    role: string;
    status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'BLOCKED';
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

    // Load from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('bev-user');
                if (saved) {
                    setUser(JSON.parse(saved));
                }
            } catch (err) {
                console.error("Failed to parse auth user:", err);
                localStorage.removeItem('bev-user');
            }
            setIsAuthReady(true);
        }
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
            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
        // Super Admin Shortcut with Backend Sync
        if ((email === '7bd0205@gmail.com' || email === '7bd02025@gmail.com') && (password === 'Admin@2025!' || password === 'Admin@123')) {
            try {
                // Try login first (fast path — admin already exists)
                const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });

                if (res.ok) {
                    const result = await res.json();
                    if (result.access_token) {
                        const userData = { ...result.user, role: 'admin', status: 'ACTIVE' as const };
                        setUser(userData);
                        localStorage.setItem('bev-user', JSON.stringify(userData));
                        localStorage.setItem('bev-token', result.access_token);
                        return { success: true, user: userData };
                    }
                }

                // Login failed — seed admin then retry login
                const seedRes = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/auth/seed-admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, name: 'Super Admin', secret: process.env.NEXT_PUBLIC_SEED_ADMIN_SECRET || 'atlantis_seed_2025_secure' }),
                });

                if (!seedRes.ok) {
                    const seedError = await seedRes.json().catch(() => ({}));
                    if (seedError.message === 'User already exists') {
                        console.warn("Super Admin exists but password mismatch. Please check backend seeds.");
                    }
                }

                const retryRes = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });

                if (retryRes.ok) {
                    const result = await retryRes.json();
                    if (result.access_token) {
                        const userData = { ...result.user, role: 'ADMIN', status: 'ACTIVE' as const };
                        setUser(userData);
                        localStorage.setItem('bev-user', JSON.stringify(userData));
                        localStorage.setItem('bev-token', result.access_token);
                        return { success: true, user: userData };
                    }
                } else {
                    const errorData = await retryRes.json().catch(() => ({}));
                    console.error("Super Admin retry failed:", errorData.message);
                }
            } catch (err) {
                console.error("Super Admin backend sync failed", err);
            }
            // لو كل المحاولات فشلت — أرجع خطأ واضح بدل LOCAL_ONLY
            return { success: false, message: 'تعذر الاتصال بالسيرفر. تأكد من تشغيل الـ Backend.' };
        }

        try {
            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                const error = await res.json();
                return { success: false, message: error.message || 'Invalid email or password.' };
            }

            const result = await res.json();

            // 2FA challenge
            if (result.requiresTwoFactor) {
                return { success: true, requiresTwoFactor: true, partialToken: result.partialToken };
            }

            if (!result.user || !result.access_token) {
                console.error("Login response missing user or token:", result);
                return { success: false, message: 'Invalid response from server.' };
            }
            const userData = result.user;
            setUser(userData);
            localStorage.setItem('bev-user', JSON.stringify(userData));
            localStorage.setItem('bev-token', result.access_token);
            return { success: true, user: userData };
        } catch (err) {
            console.error("Login failed:", err);
            return { success: false, message: 'Server connection failed.' };
        }
    };

    const verify2FALogin = async (partialToken: string, code: string): Promise<{ success: boolean; user?: User; message?: string }> => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/2fa/login-verify`, {
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
            localStorage.setItem('bev-user', JSON.stringify(userData));
            localStorage.setItem('bev-token', result.access_token);
            return { success: true, user: userData };
        } catch (err) {
            return { success: false, message: 'Server connection failed.' };
        }
    };

    const updateUser = async (data: Partial<User>) => {
        if (!user) return;
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/users/${user.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data),
            });

            if (res.ok) {
                const updatedUser = { ...user, ...data };
                setUser(updatedUser);
                if (typeof window !== 'undefined') {
                    localStorage.setItem('bev-user', JSON.stringify(updatedUser));
                }
            }
        } catch (err) {
            console.error("Failed to update user profile on server:", err);
            // Fallback to local only if server fails, or show error
            const updatedUser = { ...user, ...data };
            setUser(updatedUser);
            if (typeof window !== 'undefined') {
                localStorage.setItem('bev-user', JSON.stringify(updatedUser));
            }
        }
    };

    const logout = () => {
        setUser(null);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('bev-user');
            localStorage.removeItem('bev-token');
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoggedIn: !!user, login, verify2FALogin, register, updateUser, logout, isAuthReady }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
