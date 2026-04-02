'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
    read: boolean;
    createdAt: string;
    data?: any;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

export function useNotifications() {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const socketRef = useRef<Socket | null>(null);

    const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('bev-token') : null);

    const fetchNotifications = useCallback(async () => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/notifications`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data: AppNotification[] = await res.json();
                setNotifications(data);
                setUnreadCount(data.filter(n => !n.read).length);
            }
        } catch { /* offline or no token */ }
    }, []);

    // Connect WebSocket and listen for real-time notifications
    useEffect(() => {
        const token = getToken();
        if (!token) return;

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
        const token = getToken();
        if (!token) return;
        await fetch(`${API_URL}/notifications/${id}/read`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` },
        });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
    }, []);

    const markAllRead = useCallback(async () => {
        const token = getToken();
        if (!token) return;
        await fetch(`${API_URL}/notifications/read-all`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` },
        });
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    }, []);

    return { notifications, unreadCount, markRead, markAllRead };
}
