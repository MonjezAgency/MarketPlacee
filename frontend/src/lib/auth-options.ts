import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import type { NextAuthOptions } from 'next-auth';
import type { GoogleProfile } from 'next-auth/providers/google';
import { apiFetch } from '@/lib/api';

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],
    callbacks: {
        async jwt({ token, account, profile: rawProfile }) {
            const profile = rawProfile as GoogleProfile;
            if (account?.provider === 'google' && profile) {
                try {
                    const res = await apiFetch(`/auth/google-login`, {
                        method: 'POST',
                        // The backend verifies this Google-signed ID token itself;
                        // it never trusts an email sent by the client.
                        body: JSON.stringify({ idToken: account.id_token }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        token.authError = undefined;
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
            session.backendToken = token.backendToken;
            session.backendUser = token.backendUser;
            session.pendingApproval = token.pendingApproval;
            session.pendingEmail = token.pendingEmail;
            session.authError = token.authError;
            return session;
        },
    },
    pages: {
        signIn: '/auth/login',
        error: '/auth/login',
    },
    secret: process.env.NEXTAUTH_SECRET || 'atlantis-nextauth-secret-change-in-production',
};
