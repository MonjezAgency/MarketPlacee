import { useState, useEffect } from 'react';

// Lightweight Zustand-like store to prevent local state loss
// Maps chatId -> messages[]
let globalMessages: Record<string, any[]> = {};
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(l => l());

export const useChatStore = (chatId: string = 'default') => {
    const [, forceUpdate] = useState(0);
    
    // Fixed effect for subscribing
    useEffect(() => {
        const tick = () => forceUpdate(n => n + 1);
        listeners.add(tick);
        return () => { listeners.delete(tick); };
    }, []);

    const getMessages = () => globalMessages[chatId] || [];

    const setMessages = (updater: any) => {
        const current = getMessages();
        globalMessages[chatId] = typeof updater === 'function' ? updater(current) : updater;
        notify();
    };
    
    const addMessage = (msg: any) => {
        const current = getMessages();
        if (!current.some(m => m.id === msg.id)) {
            globalMessages[chatId] = [...current, msg];
            notify();
        }
    };

    const removeMessage = (id: string) => {
        const current = getMessages();
        globalMessages[chatId] = current.filter(m => m.id !== id);
        notify();
    };

    const updateMessage = (id: string, newMsg: any) => {
        const current = getMessages();
        globalMessages[chatId] = current.map(m => m.id === id ? newMsg : m);
        notify();
    };

    return { 
        messages: getMessages(), 
        setMessages, 
        addMessage, 
        removeMessage, 
        updateMessage 
    };
};
