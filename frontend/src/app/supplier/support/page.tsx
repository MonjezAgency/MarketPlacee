'use client';

import * as React from 'react';
import { SupportChat } from '@/components/chat/SupportChat';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';
import { MessageCircle, ShieldCheck, Users, Search } from 'lucide-react';
import axios from 'axios';
import { cn } from '@/lib/utils';

export default function SupportPage() {
    const { user } = useAuth();
    const [conversations, setConversations] = React.useState<any[]>([]);
    const [selectedUser, setSelectedUser] = React.useState<any>(null);
    const [searchTerm, setSearchTerm] = React.useState('');

    const userRole = user?.role?.toUpperCase();
    const isSupportTeam = ['SUPPORT', 'ADMIN', 'DEVELOPER', 'LOGISTICS'].includes(userRole || '');

    const fetchConversations = async () => {
        if (!isSupportTeam) return;
        try {
            const res = await apiFetch(`/chat/admin/conversations`);
            if (res.ok) {
                setConversations(await res.json());
            }
        } catch (err) {
            console.error(err);
        }
    };

    React.useEffect(() => {
        if (isSupportTeam) {
            fetchConversations();
            const interval = setInterval(fetchConversations, 10000);
            return () => clearInterval(interval);
        }
    }, [isSupportTeam]);

    if (!isSupportTeam) {
        return (
            <div className="flex flex-col h-[calc(100vh-80px)] bg-accent/5 rounded-3xl overflow-hidden border border-border/50">
                <SupportChat />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background pt-20">
            {/* Conversations Sidebar */}
            <div className="w-80 border-e border-border bg-card flex flex-col">
                <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2 mb-4">
                        <ShieldCheck className="text-primary" size={20} />
                        <h2 className="font-black uppercase tracking-widest text-sm">Support Center</h2>
                    </div>
                    <div className="relative">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                        <input 
                            type="text" 
                            placeholder="Search users..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-accent/10 border-none rounded-lg py-2 ps-9 pe-4 text-xs outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {conversations.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map((conv) => (
                        <button
                            key={conv.id}
                            onClick={() => setSelectedUser(conv)}
                            className={cn(
                                "w-full p-4 flex items-center gap-3 hover:bg-accent/5 transition-colors border-b border-border/30",
                                selectedUser?.id === conv.id && "bg-primary/5 border-s-4 border-s-primary"
                            )}
                        >
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                                {conv.name[0]}
                            </div>
                            <div className="text-start overflow-hidden">
                                <p className="text-sm font-black truncate">{conv.name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{conv.role}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 bg-accent/5 p-6 flex items-center justify-center">
                {selectedUser ? (
                    <div className="w-full max-w-4xl h-full">
                         <SupportChat isSupport={true} targetUserId={selectedUser.id} />
                    </div>
                ) : (
                    <div className="text-center">
                        <div className="w-20 h-20 bg-card rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl border border-border">
                            <MessageCircle className="text-primary" size={40} />
                        </div>
                        <h2 className="text-2xl font-black mb-2">Welcome to Support Dashboard</h2>
                        <p className="text-muted-foreground">Select a conversation from the left to start chatting with customers.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
