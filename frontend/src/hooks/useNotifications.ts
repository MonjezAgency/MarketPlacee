'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { notifyToast, toneOf } from '@/components/ui/NotifyToasts';
import { apiFetch, getToken } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { notificationText } from '@/lib/notifications';

export interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    createdAt: string;
    data?: any;
}

export type NotificationFilter = 'all' | 'unread';
export type NotificationsStatus = 'loading' | 'ready' | 'error';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const PAGE = 30;
/** Fallback when the socket is down: the unread count is re-read this often while the tab is visible. */
const POLL_MS = 60_000;

/** Newest first, one row per id. */
function merge(a: AppNotification[], b: AppNotification[]) {
    const seen = new Map<string, AppNotification>();
    for (const n of [...a, ...b]) if (!seen.has(n.id)) seen.set(n.id, n);
    return Array.from(seen.values()).sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt));
}

/**
 * The signed-in user's notifications (GET /notifications, their own rows only).
 * Live updates come over the socket (`new_notification`); if it is down, the
 * unread count is polled and the list re-read when it changes. Read state is
 * saved on the server; a failed save is rolled back, never shown as done.
 * `enabled=false` skips the socket and the requests (logged-out visitors).
 */
export function useNotifications(enabled: boolean = true) {
    const { t, fmt } = useLanguage();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [status, setStatus] = useState<NotificationsStatus>('loading');
    const [filter, setFilter] = useState<NotificationFilter>('all');
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const filterRef = useRef(filter);
    filterRef.current = filter;
    const countRef = useRef(0);
    const textRef = useRef({ t, fmt });
    textRef.current = { t, fmt };

    const readCount = useCallback(async () => {
        const res = await apiFetch('/notifications/unread-count', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const n = Number((await res.json())?.count) || 0;
        countRef.current = n;
        setUnreadCount(n);
        return n;
    }, []);

    const fetchPage = useCallback(async (f: NotificationFilter, before?: string) => {
        const q = new URLSearchParams({ limit: String(PAGE) });
        if (f === 'unread') q.set('filter', 'unread');
        if (before) q.set('before', before);
        const res = await apiFetch(`/notifications?${q}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as AppNotification[];
    }, []);

    const reload = useCallback(async (f: NotificationFilter = filterRef.current) => {
        setStatus((s) => (s === 'ready' ? s : 'loading'));
        try {
            const [rows] = await Promise.all([fetchPage(f), readCount()]);
            if (filterRef.current !== f) return;
            setNotifications(rows);
            setHasMore(rows.length === PAGE);
            setStatus('ready');
        } catch {
            setStatus('error');
        }
    }, [fetchPage, readCount]);

    const loadMore = useCallback(async () => {
        const last = notifications[notifications.length - 1];
        if (!last || loadingMore) return;
        setLoadingMore(true);
        try {
            const rows = await fetchPage(filterRef.current, last.createdAt);
            setNotifications((prev) => merge(prev, rows));
            setHasMore(rows.length === PAGE);
        } catch { /* the button stays; a retry is one click */ } finally { setLoadingMore(false); }
    }, [notifications, loadingMore, fetchPage]);

    const changeFilter = useCallback((f: NotificationFilter) => {
        setFilter(f);
        filterRef.current = f;
        setStatus('loading');
        setNotifications([]);
        reload(f);
    }, [reload]);

    useEffect(() => {
        if (!enabled) return;
        const socket = io(`${API_URL}/chat`, { auth: { token: getToken() }, transports: ['websocket'] });
        socketRef.current = socket;
        socket.on('new_notification', (n: AppNotification) => {
            let added = false;
            setNotifications((prev) => {
                if (prev.some((p) => p.id === n.id)) return prev;
                added = true;
                return merge([n], prev);
            });
            if (!n.read) {
                // The server count is the truth; a duplicate push never inflates it.
                readCount().catch(() => { if (added) setUnreadCount((c) => c + 1); });
            }
            const { t: tt, fmt: f } = textRef.current;
            const text = notificationText(n, tt, (v) => f.number(v, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            notifyToast({ id: `n:${n.id}`, title: text.title || tt('notifications', 'title'), message: text.body || '', tone: toneOf(n.type) });
        });
        reload();

        const poll = () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            const before = countRef.current;
            readCount().then((now) => { if (now !== before) reload(); }).catch(() => {});
        };
        const timer = window.setInterval(poll, POLL_MS);
        window.addEventListener('focus', poll);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', poll);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [enabled, reload, readCount]);

    const markRead = useCallback(async (id: string) => {
        let was: AppNotification | undefined;
        setNotifications((prev) => prev.map((n) => { if (n.id === id) { was = n; return { ...n, read: true }; } return n; }));
        setUnreadCount((c) => Math.max(0, c - 1));
        try {
            const res = await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
            if (!res.ok) throw new Error(String(res.status));
            if (filterRef.current === 'unread') setNotifications((prev) => prev.filter((n) => n.id !== id));
        } catch {
            if (was && !was.read) {
                setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)));
                setUnreadCount((c) => c + 1);
            }
            throw new Error('mark-read-failed');
        }
    }, []);

    const markAllRead = useCallback(async () => {
        const snapshot = { list: notifications, count: unreadCount };
        setNotifications((prev) => (filterRef.current === 'unread' ? [] : prev.map((n) => ({ ...n, read: true }))));
        setUnreadCount(0);
        try {
            const res = await apiFetch('/notifications/read-all', { method: 'PATCH' });
            if (!res.ok) throw new Error(String(res.status));
        } catch {
            setNotifications(snapshot.list);
            setUnreadCount(snapshot.count);
            throw new Error('mark-all-failed');
        }
    }, [notifications, unreadCount]);

    return { notifications, unreadCount, status, filter, setFilter: changeFilter, hasMore, loadingMore, loadMore, reload, markRead, markAllRead };
}
