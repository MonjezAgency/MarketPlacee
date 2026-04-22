'use client';
import { apiFetch } from '@/lib/api';


import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, CheckCircle, XCircle, ShieldCheck, 
    Phone, Activity, ShieldAlert, Building2, 
    Globe, Link as LinkIcon, X, Filter,
    Download, MoreVertical, Mail, Briefcase, Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';

type UserStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'BLOCKED';

interface ManagedUser {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    status: UserStatus;
    createdAt?: string;
    companyName?: string;
    website?: string;
    socialLinks?: string;
    avatar?: string;
}

export default function AdminUsersPage() {
    const [activeTab, setActiveTab] = React.useState<UserStatus>('PENDING_APPROVAL');
    const [users, setUsers] = React.useState<ManagedUser[]>([]);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedUser, setSelectedUser] = React.useState<ManagedUser | null>(null);
    const [loading, setLoading] = React.useState(true);

    const loadUsers = async () => {
        try {
            
            const res = await apiFetch('/users', {
            });
            if (res.ok) {
                const result = await res.json();
                const usersData = Array.isArray(result) ? result : (result.users || []);
                setUsers(usersData.filter((u: any) => u.role !== 'ADMIN'));
            }
        } catch (err) {
            console.error("Failed to load users:", err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadUsers();
    }, []);

    const updateStatus = async (id: string, status: UserStatus) => {
        try {
            const res = await apiFetch(`/users/${id}/status`, {
                method: 'POST',
                body: JSON.stringify({ status })
            });

            if (res.ok) {
                setUsers(users.map(u => u.id === id ? { ...u, status } : u));
                if (selectedUser?.id === id) setSelectedUser(null);
            }
        } catch (err) {
            console.error("Failed to update status:", err);
        }
    };

    const [selectedUsers, setSelectedUsers] = React.useState<Set<string>>(new Set());
    const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);

    const toggleUserSelection = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const next = new Set(selectedUsers);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedUsers(next);
    };

    const handleSelectAll = () => {
        if (selectedUsers.size === filteredUsers.length) {
            setSelectedUsers(new Set());
        } else {
            setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
        }
    };

    const handleBulkStatusUpdate = async (status: UserStatus) => {
        if (selectedUsers.size === 0) return;
        if (!confirm(`Are you sure you want to set ${selectedUsers.size} users to ${status}?`)) return;

        setIsBulkUpdating(true);
        try {
            await Promise.all(
                Array.from(selectedUsers).map(id => apiFetch(`/users/${id}/status`, {
                    method: 'POST',
                    body: JSON.stringify({ status })
                }))
            );
            setSelectedUsers(new Set());
            loadUsers();
        } catch (err) {
            console.error("Bulk update failed:", err);
            alert("Some updates failed. Please try again.");
        } finally {
            setIsBulkUpdating(false);
        }
    };

    const filteredUsers = users.filter(u =>
        u.status === activeTab &&
        (u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const TABS = [
        { id: 'PENDING_APPROVAL', label: 'Verifications', icon: Activity },
        { id: 'ACTIVE', label: 'Active Network', icon: ShieldCheck },
        { id: 'BLOCKED', label: 'Policy Blocks', icon: ShieldAlert },
    ];

    return (
        <div className="space-y-8 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 font-sans">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 py-4">
                <div className="space-y-2">
                    <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase">Members Hub</h1>
                    <p className="text-muted-foreground font-black text-[10px] uppercase tracking-[0.4em] opacity-80">
                        Managing {users.length} Platform Entities
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    {selectedUsers.size > 0 && (
                        <div className="flex items-center gap-2 animate-in slide-in-from-right-4">
                            {activeTab === 'PENDING_APPROVAL' ? (
                                <button
                                    onClick={() => handleBulkStatusUpdate('ACTIVE')}
                                    disabled={isBulkUpdating}
                                    className="h-16 px-8 bg-emerald-500 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all flex items-center gap-2"
                                >
                                    <CheckCircle size={18} /> Approve ({selectedUsers.size})
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleBulkStatusUpdate('BLOCKED')}
                                    disabled={isBulkUpdating}
                                    className="h-16 px-8 bg-destructive text-white rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-destructive/20 hover:scale-105 transition-all flex items-center gap-2"
                                >
                                    <Ban size={18} /> Block ({selectedUsers.size})
                                </button>
                            )}
                        </div>
                    )}
                    <div className="relative group">
                        <Search className="absolute start-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Find by name, email or company..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-16 ps-16 pe-8 bg-card rounded-3xl border border-border/50 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground font-bold text-sm min-w-[350px] transition-all shadow-lg"
                        />
                    </div>
                    <button className="h-16 px-8 glass-card hover:bg-muted transition-all flex items-center gap-3 font-black text-[10px] uppercase tracking-widest shadow-lg">
                        <Download size={18} />
                        Export
                    </button>
                </div>
            </div>

            {/* Custom Tab Navigation */}
            <div className="flex items-center gap-3 p-2 glass rounded-[2.5rem] w-fit shadow-2xl overflow-x-auto no-scrollbar">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id as UserStatus); setSelectedUsers(new Set()); }}
                            className={cn(
                                "flex items-center gap-3 px-8 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.1em] transition-all",
                                activeTab === tab.id
                                    ? "bg-primary text-primary-foreground shadow-xl shadow-primary/30"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            )}
                        >
                            <Icon size={16} />
                            {tab.label}
                            {users.filter(u => u.status === tab.id).length > 0 && (
                                <span className={cn(
                                    "flex items-center justify-center min-w-[20px] h-[20px] rounded-full px-1.5 text-[8px]",
                                    activeTab === tab.id ? "bg-white/20" : "bg-primary/10 text-primary"
                                )}>
                                    {users.filter(u => u.status === tab.id).length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Content Display */}
            <div className="glass-card-strong min-h-[600px] overflow-hidden">
                <table className="w-full text-start border-collapse">
                    <thead>
                        <tr className="border-b border-border/50">
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={handleSelectAll}
                                        className={cn(
                                            "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                            selectedUsers.size === filteredUsers.length && filteredUsers.length > 0
                                                ? "bg-primary border-primary text-primary-foreground"
                                                : "border-muted-foreground/30 hover:border-primary/50"
                                        )}
                                    >
                                        {selectedUsers.size === filteredUsers.length && filteredUsers.length > 0 && <CheckCircle size={14} />}
                                    </button>
                                    Identity Hub
                                </div>
                            </th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Business Unit</th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Compliance Check</th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em] text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        <AnimatePresence mode="popLayout">
                            {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                                <motion.tr
                                    key={user.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className={cn(
                                        "group hover:bg-primary/5 transition-all cursor-pointer",
                                        selectedUsers.has(user.id) && "bg-primary/10 hover:bg-primary/15"
                                    )}
                                    onClick={() => setSelectedUser(user)}
                                >
                                    <td className="px-10 py-8">
                                        <div className="flex items-center gap-5">
                                            <button
                                                onClick={(e) => toggleUserSelection(user.id, e)}
                                                className={cn(
                                                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                                                    selectedUsers.has(user.id)
                                                        ? "bg-primary border-primary text-primary-foreground"
                                                        : "border-muted-foreground/30 hover:border-primary/50"
                                                )}
                                            >
                                                {selectedUsers.has(user.id) && <CheckCircle size={14} />}
                                            </button>
                                            <div className="relative">
                                                {user.avatar ? (
                                                    <img src={user.avatar} className="w-14 h-14 rounded-2xl object-cover border-2 border-border group-hover:border-primary transition-colors" />
                                                ) : (
                                                    <div className="w-14 h-14 rounded-2xl bg-muted glass-card flex items-center justify-center font-black text-xl text-primary uppercase">
                                                        {user.name[0]}
                                                    </div>
                                                )}
                                                <div className={cn(
                                                    "absolute -bottom-1 -end-1 w-5 h-5 rounded-full border-4 border-card",
                                                    user.status === 'ACTIVE' ? "bg-emerald-500" : "bg-amber-500"
                                                )} />
                                            </div>
                                            <div>
                                                <p className="text-base font-black tracking-tight flex items-center gap-2">
                                                    {user.name}
                                                    {user.role === 'SUPPLIER' && <Briefcase size={12} className="text-secondary" />}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground font-black uppercase opacity-60 flex items-center gap-1">
                                                    <Mail size={10} /> {user.email}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-10 py-8">
                                        <p className="text-sm font-black text-foreground mb-1">{user.companyName || 'Individual Entity'}</p>
                                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{user.role}</p>
                                    </td>
                                    <td className="px-10 py-8">
                                        <div className={cn(
                                            "inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] border",
                                            user.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                            user.status === 'PENDING_APPROVAL' ? "bg-amber-400/10 text-amber-500 border-amber-400/20" :
                                            "bg-red-500/10 text-red-500 border-red-500/20"
                                        )}>
                                            <ShieldCheck size={14} />
                                            {user.status.replace('_', ' ')}
                                        </div>
                                    </td>
                                    <td className="px-10 py-8 text-end">
                                        <button className="w-12 h-12 glass rounded-2xl flex items-center justify-center hover:bg-primary hover:text-white transition-all ms-auto group-hover:scale-110">
                                            <MoreVertical size={20} />
                                        </button>
                                    </td>
                                </motion.tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="px-10 py-32 text-center">
                                        <div className="flex flex-col items-center gap-4 opacity-30">
                                            <Filter size={60} />
                                            <p className="text-xl font-black uppercase tracking-widest">No Records Found</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* User Details Modal - Total Design Overhaul */}
            <AnimatePresence>
                {selectedUser && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setSelectedUser(null)} className="absolute inset-0 bg-background/80 backdrop-blur-2xl" />
                        
                        <motion.div 
                            initial={{ scale: 0.9, y: 50, opacity: 0 }} 
                            animate={{ scale: 1, y: 0, opacity: 1 }} 
                            exit={{ scale: 0.9, y: 50, opacity: 0 }}
                            className="glass-card-strong w-full max-w-4xl relative z-10 overflow-hidden flex flex-col md:flex-row h-[700px] shadow-[0_0_100px_rgba(0,0,0,0.5)] border-primary/20"
                        >
                            {/* Left Side: Identity */}
                            <div className="w-full md:w-[40%] bg-primary/5 p-12 flex flex-col items-center justify-center text-center space-y-8 border-e border-border/10">
                                <div className="relative">
                                    <div className="absolute -inset-4 bg-gradient-to-tr from-primary to-secondary opacity-30 blur-2xl rounded-full" />
                                    {selectedUser.avatar ? (
                                        <img src={selectedUser.avatar} className="w-40 h-40 rounded-[3rem] object-cover relative z-10 border-4 border-card" />
                                    ) : (
                                        <div className="w-40 h-40 rounded-[3rem] bg-card flex items-center justify-center text-6xl font-black text-primary relative z-10 border-4 border-card">
                                            {selectedUser.name[0]}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black uppercase tracking-tighter leading-none mb-4">{selectedUser.name}</h2>
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-widest">
                                        <ShieldCheck size={14} /> {selectedUser.role}
                                    </div>
                                </div>
                                <div className="w-full space-y-3 pt-8 border-t border-border/10">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Contact Registry</p>
                                    <p className="text-sm font-bold flex items-center justify-center gap-2"><Mail size={16} /> {selectedUser.email}</p>
                                    <p className="text-sm font-bold flex items-center justify-center gap-2"><Phone size={16} /> {selectedUser.phone || 'N/A'}</p>
                                </div>
                            </div>

                            {/* Right Side: Data & Actions */}
                            <div className="flex-1 p-12 flex flex-col h-full bg-card/10">
                                <div className="flex-1 space-y-10">
                                    <section className="space-y-6">
                                        <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 border-b border-border/20 pb-4">
                                            <Building2 className="text-secondary" /> Business Profiling
                                        </h3>
                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Entity Name</p>
                                                <p className="text-base font-black">{selectedUser.companyName || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Market Sector</p>
                                                <p className="text-base font-black">Professional B2B</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Validation State</p>
                                                <p className={cn("text-base font-black", selectedUser.status === 'ACTIVE' ? "text-emerald-500" : "text-amber-500")}>
                                                    {selectedUser.status}
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                <div className="pt-12 border-t border-border/20 grid grid-cols-2 gap-4">
                                    {selectedUser.status === 'PENDING_APPROVAL' ? (
                                        <>
                                            <button onClick={() => updateStatus(selectedUser.id, 'REJECTED')} className="h-16 flex items-center justify-center gap-3 rounded-3xl border-2 border-red-500/20 text-red-500 font-black uppercase text-xs tracking-widest hover:bg-red-500 hover:text-white transition-all">
                                                <XCircle size={20} /> Deny Entry
                                            </button>
                                            <button onClick={() => updateStatus(selectedUser.id, 'ACTIVE')} className="h-16 flex items-center justify-center gap-3 rounded-3xl bg-emerald-500 text-white font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20">
                                                <CheckCircle size={20} /> Grant Access
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={() => updateStatus(selectedUser.id, 'BLOCKED')} className="h-16 col-span-2 flex items-center justify-center gap-3 rounded-3xl bg-red-500 text-white font-black uppercase text-xs tracking-widest hover:scale-105 transition-all shadow-xl shadow-red-500/20">
                                            <Ban size={20} /> Terminate Access / Policy Block
                                        </button>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setSelectedUser(null)} className="absolute top-8 end-8 w-12 h-12 glass rounded-full flex items-center justify-center hover:rotate-90 transition-transform">
                                <X size={24} />
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
