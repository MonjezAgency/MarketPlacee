'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

export interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    createdAt: string;
    data?: any;
}

import { apiFetch, getToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export function useNotifications() {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const socketRef = useRef<Socket | null>(null);

    

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await apiFetch('/notifications');
            if (res.ok) {
                const data: AppNotification[] = await res.json();
                setNotifications(data);
                setUnreadCount(data.filter(n => !n.read).length);
            }
        } catch (_e) { /* offline or no auth */ }
    }, []);

    // Connect WebSocket and listen for real-time notifications
    // TODO: [WEBSOCKET-AUTH-MIGRATION]
    // The Socket.io gateway reads auth.token from socket.handshake.auth.token.
    // We cannot use httpOnly cookies for WebSocket without updating the backend 
    // gateway to read from socket.handshake.headers.cookie instead.
    // This is deferred to a separate task.
    // 
    // Current workaround: read token via getToken() purely for WebSocket connection.
    useEffect(() => {
        const token = getToken();

        const socket = io(`${API_URL}/chat`, {
            auth: { token },
            transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('new_notification', (notification: AppNotification) => {
            setNotifications(prev => [notification, ...prev]);
            setUnreadCount(prev => prev + 1);
            // Operator request: when a new notification arrives while
            // the user is in the app, surface a rectangular toast in
            // the corner so they don't have to refresh / open the bell
            // to know an order / approval / etc. just happened.
            toast.custom(
                (t) => (
                    React.createElement(
                        'div',
                        {
                            className:
                                'pointer-events-auto max-w-sm w-full bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3 ring-1 ring-black/5 ' +
                                (t.visible ? 'animate-in slide-in-from-right' : 'animate-out slide-out-to-right'),
                            onClick: () => toast.dismiss(t.id),
                        },
                        React.createElement(
                            'div',
                            { className: 'w-9 h-9 rounded-full bg-[#2EC4B6]/15 text-[#2EC4B6] flex items-center justify-center text-[16px] font-black shrink-0' },
                            '🔔',
                        ),
                        React.createElement(
                            'div',
                            { className: 'flex-1 min-w-0' },
                            React.createElement(
                                'p',
                                { className: 'text-[13px] font-black text-[#0F172A] truncate' },
                                notification.title || 'New notification',
                            ),
                            React.createElement(
                                'p',
                                { className: 'text-[12px] text-slate-500 mt-0.5 line-clamp-2' },
                                notification.message || '',
                            ),
                        ),
                    )
                ),
                { duration: 6000, position: 'top-right' },
            );
        });

        fetchNotifications();

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [fetchNotifications]);

    const markRead = useCallback(async (id: string) => {
        await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
    }, []);

    const markAllRead = useCallback(async () => {
        await apiFetch(`/notifications/read-all`, { method: 'PATCH' });
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    }, []);

    return { notifications, unreadCount, markRead, markAllRead };
}
