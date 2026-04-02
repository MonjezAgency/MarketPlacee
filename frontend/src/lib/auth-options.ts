import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import type { NextAuthOptions } from 'next-auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],
    callbacks: {
        async jwt({ token, account, profile }) {
            if (account?.provider === 'google' && profile) {
                try {
                    const res = await fetch(`${API_URL}/auth/google`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: profile.email,
                            name: profile.name,
                            avatar: (profile as any).picture,
                            googleId: (profile as any).sub,
                        }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.pendingApproval) {
                            token.pendingApproval = true;
                            token.pendingEmail = data.email;
                        } else {
                            token.backendToken = data.access_token;
                            token.backendUser = data.user;
                        }
                    } else {
                        const err = await res.json().catch(() => ({}));
                        token.authError = err.message || 'Google login failed';
                    }
                } catch (e) {
                    token.authError = 'Backend unreachable';
                }
            }
            return token;
        },
        async session({ session, token }) {
            (session as any).backendToken = token.backendToken;
            (session as any).backendUser = token.backendUser;
            (session as any).pendingApproval = token.pendingApproval;
            (session as any).pendingEmail = token.pendingEmail;
            (session as any).authError = token.authError;
            return session;
        },
    },
    pages: {
        signIn: '/auth/login',
        error: '/auth/login',
    },
    secret: process.env.NEXTAUTH_SECRET || 'atlantis-nextauth-secret-change-in-production',
};
