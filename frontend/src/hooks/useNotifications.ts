'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

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
        } catch { /* offline or no auth */ }
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
