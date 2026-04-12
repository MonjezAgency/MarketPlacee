'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { apiFetch } from '@/lib/api';
// axios is not used anymore but keeping for potential legacy usage if needed elsewhere
import axios from 'axios';
import {
    Users,
    Shield,
    Mail,
    Trash2,
    Plus,
    ShieldCheck,
    CheckCircle2,
    X,
    Search,
    Lock,
    Crown
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SUPER_ADMIN_EMAIL = '7bd02025@gmail.com';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'Moderator' | 'Support' | 'Editor';
    status: 'ACTIVE' | 'INACTIVE';
    lastActive: string;
    permissions: string[];
}

export default function AdminTeamPage() {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
    const [isPermissionsModalOpen, setIsPermissionsModalOpen] = React.useState(false);
    const [selectedMember, setSelectedMember] = React.useState<TeamMember | null>(null);
    const [tempPermissions, setTempPermissions] = React.useState<string[]>([]);

    const AVAILABLE_PERMISSIONS = [
        'ALL_ACCESS', 'APPROVE_OFFERS', 'MANAGE_USERS', 'VIEW_ORDERS',
        'CHAT_SUPPORT', 'MANAGE_PLACEMENTS', 'FINANCIAL_REPORTS'
    ];

    const [team, setTeam] = React.useState<TeamMember[]>([]);
    const [isInviting, setIsInviting] = React.useState(false);
    const [newMember, setNewMember] = React.useState({
        name: '', email: '', role: 'Admin', permissions: [] as string[]
    });

    const fetchTeam = React.useCallback(async () => {
        try {
            const res = await apiFetch(`/admin/team`);
            if (!res.ok) throw new Error('Failed to fetch team');
            
            const data = await res.json();
            const members: TeamMember[] = (data || []).map((u: any) => ({
                id: u.id,
                name: u.name || 'Unknown',
                email: u.email,
                role: u.role === 'ADMIN' ? 'Admin' : u.role === 'MODERATOR' ? 'Moderator' : u.role === 'SUPPORT' ? 'Support' : 'Editor',
                status: u.status || 'ACTIVE',
                lastActive: u.updatedAt ? new Date(u.updatedAt).toLocaleDateString() : 'Never',
                permissions: u.permissions || [],
            }));
            setTeam(members);
        } catch (err: any) {
            console.error('Failed to fetch team:', err);
        }
    }, []);

    React.useEffect(() => { fetchTeam(); }, [fetchTeam]);

    const handleInvite = async () => {
        if (!newMember.name || !newMember.email) { toast.error('Please fill in all fields'); return; }
        setIsInviting(true);
        try {
            const res = await apiFetch(`/admin/team/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newMember)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to send invitation');
            }

            toast.success('Invitation sent successfully!');
            setIsAddModalOpen(false);
            setNewMember({ name: '', email: '', role: 'Admin', permissions: [] });
            fetchTeam();
        } catch (error: any) {
            toast.error(error.message || 'Failed to send invitation');
        } finally {
            setIsInviting(false);
        }
    };

    const toggleNewMemberPermission = (perm: string) => {
        setNewMember(prev => ({
            ...prev,
            permissions: prev.permissions.includes(perm)
                ? prev.permissions.filter(p => p !== perm)
                : [...prev.permissions, perm]
        }));
    };

    const superAdmin = team.find(m => m.email === SUPER_ADMIN_EMAIL);
    const regularTeam = team.filter(m => m.email !== SUPER_ADMIN_EMAIL);
    const filteredTeam = regularTeam.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openPermissionsModal = (member: TeamMember) => {
        setSelectedMember(member);
        setTempPermissions([...member.permissions]);
        setIsPermissionsModalOpen(true);
    };

    const handleTogglePermission = (perm: string) => {
        if (perm === 'ALL_ACCESS') {
            setTempPermissions(tempPermissions.includes('ALL_ACCESS') ? [] : ['ALL_ACCESS']);
            return;
        }
        let newPerms = tempPermissions.filter(p => p !== 'ALL_ACCESS');
        if (newPerms.includes(perm)) {
            newPerms = newPerms.filter(p => p !== perm);
        } else {
            newPerms.push(perm);
        }
        setTempPermissions(newPerms);
    };

    const handleSavePermissions = () => {
        if (!selectedMember) return;
        setTeam(team.map(m => m.id === selectedMember.id ? { ...m, permissions: tempPermissions } : m));
        setIsPermissionsModalOpen(false);
        setSelectedMember(null);
    };

    const handleDeleteMember = async (member: TeamMember) => {
        if (member.email === SUPER_ADMIN_EMAIL) return;
        if (!confirm(`Are you sure you want to remove ${member.name} from the team?`)) return;
        try {
            
            await axios.delete(`/api/admin/team/${member.id}`, {
                headers: {  }
            });
            toast.success(`${member.name} has been removed from the team`);
            fetchTeam();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to remove team member');
        }
    };

    return (
        <div className="space-y-10 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-poppins font-black tracking-tight">Atlantis Force</h1>
                    <p className="text-foreground/60">Manage your Atlantis internal team and permissions.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground/50" size={18} />
                        <input
                            type="text"
                            placeholder="Filter team members..."
                            className="h-12 ps-12 pe-6 bg-card rounded-xl border border-border/50 outline-none focus:border-primary/50 text-foreground text-sm w-[250px] transition-all shadow-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="h-12 px-6 bg-primary text-primary-foreground font-black text-sm rounded-xl hover:scale-105 transition-transform flex items-center gap-2 shadow-sm"
                    >
                        <Plus size={18} strokeWidth={3} /> Add Member
                    </button>
                </div>
            </div>

            {/* ═══ Super Admin Hero Banner ═══ */}
            {superAdmin && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-[32px] border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-card to-orange-500/5 p-8 shadow-lg"
                >
                    <div className="absolute top-0 end-0 w-64 h-64 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full -translate-y-1/3 translate-x-1/3" />
                    <div className="absolute bottom-0 start-0 w-40 h-40 bg-gradient-to-tr from-orange-500/10 to-transparent rounded-full translate-y-1/3 -translate-x-1/3" />

                    <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                            <Crown className="text-white" size={32} />
                        </div>

                        <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-2xl font-black text-foreground tracking-tight">{superAdmin.name}</h2>
                                <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-500 border border-amber-500/30">
                                    👑 Super Admin
                                </span>
                                <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    {superAdmin.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail size={13} className="text-amber-500/60" />
                                <p className="text-sm font-bold text-muted-foreground">{superAdmin.email}</p>
                            </div>
                            <p className="text-xs text-muted-foreground/60">Full system access • Cannot be removed • Primary administrator</p>
                        </div>

                        <div className="flex items-center gap-3 self-start">
                            <div className="text-center px-5 py-3 bg-card/60 rounded-2xl border border-border/50">
                                <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Team Size</p>
                                <p className="text-2xl font-black text-foreground mt-1">{regularTeam.length}</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ═══ Team Members Section ═══ */}
            {regularTeam.length > 0 && (
                <div className="flex items-center gap-3">
                    <Users size={18} className="text-primary" />
                    <h2 className="text-lg font-black text-foreground tracking-tight">Team Members</h2>
                    <span className="text-xs text-muted-foreground font-bold">({filteredTeam.length})</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                    {filteredTeam.map((member, i) => (
                        <motion.div
                            key={member.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-card border border-border/50 rounded-[32px] p-8 hover:border-primary/40 transition-all group relative overflow-hidden shadow-sm hover:shadow-md"
                        >
                            <div className="flex justify-between items-start mb-8">
                                <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center border border-border/50 group-hover:border-primary/30 transition-colors">
                                    <Shield className={cn(
                                        "transition-colors",
                                        member.role === 'Admin' ? "text-primary" : member.role === 'Moderator' ? "text-blue-500" : member.role === 'Support' ? "text-emerald-500" : "text-purple-500"
                                    )} size={28} />
                                </div>
                                <div className={cn(
                                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                    member.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground border-border/50"
                                )}>
                                    {member.status}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xl font-black text-foreground group-hover:text-primary transition-colors">{member.name}</h3>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <Mail size={12} className="text-muted-foreground/50" />
                                        <p className="text-xs font-bold text-muted-foreground tracking-tight">{member.email}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 py-4 border-y border-border/50">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Authority</p>
                                        <p className="text-xs font-black text-foreground">{member.role}</p>
                                    </div>
                                    <div className="w-[1px] h-8 bg-border/50" />
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Last Access</p>
                                        <p className="text-xs font-bold text-muted-foreground">{member.lastActive}</p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest mb-3">Privileges</p>
                                    <div className="flex flex-wrap gap-2">
                                        {member.permissions.length > 0 ? member.permissions.map(p => (
                                            <span key={p} className="px-2 py-0.5 rounded-lg bg-muted border border-border/50 text-[8px] font-black text-muted-foreground uppercase tracking-tighter">
                                                {p.replace('_', ' ')}
                                            </span>
                                        )) : (
                                            <span className="text-[10px] text-muted-foreground/40 italic">No specific permissions</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex gap-3 pt-4">
                                <button
                                    onClick={() => openPermissionsModal(member)}
                                    className="flex-1 h-10 bg-muted/50 hover:bg-muted text-foreground font-black text-[10px] uppercase rounded-xl transition-all border border-border/50 flex items-center justify-center gap-2"
                                >
                                    <Lock size={12} /> Permissions
                                </button>
                                <button
                                    onClick={() => handleDeleteMember(member)}
                                    className="w-10 h-10 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all border border-red-500/20 flex items-center justify-center"
                                    title="Remove from team"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Invite Placeholder */}
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="border-2 border-dashed border-border/50 rounded-[32px] p-8 flex flex-col items-center justify-center gap-4 group hover:border-primary/40 hover:bg-primary/5 transition-all outline-none"
                >
                    <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/20 transition-colors border border-border/50 group-hover:border-primary/20">
                        <Plus className="text-muted-foreground/50 group-hover:text-primary transition-colors" size={24} />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-black text-muted-foreground group-hover:text-foreground transition-colors">Add Team Member</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase font-black tracking-widest">Assign new role</p>
                    </div>
                </button>
            </div>

            {/* ═══ Add Member Modal ═══ */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 w-screen h-screen">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsAddModalOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-md w-screen h-screen"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-card w-full max-w-lg rounded-[32px] border border-border/50 p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto no-scrollbar"
                        >
                            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-6 end-6 p-2 text-muted-foreground/50 hover:text-foreground transition-colors">
                                <X size={20} />
                            </button>

                            <div className="mb-8">
                                <h2 className="text-2xl font-black text-foreground tracking-tight">New Member</h2>
                                <p className="text-muted-foreground text-sm mt-1">Invite a new administrator or moderator.</p>
                            </div>

                            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ms-1">Full Name</label>
                                    <input type="text" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                                        className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 text-foreground text-sm outline-none focus:border-primary/50 transition-all font-medium"
                                        placeholder="John Doe" />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ms-1">Email Address</label>
                                    <input type="email" value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                                        className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 text-foreground text-sm outline-none focus:border-primary/50 transition-all font-medium"
                                        placeholder="john@atlantis.eg" />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ms-1">Assigned Role</label>
                                    <select value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                                        className="w-full h-12 bg-muted/50 border border-border/50 rounded-xl px-4 text-foreground text-sm outline-none focus:border-primary/50 transition-all font-medium appearance-none">
                                        <option value="Admin">Super Admin</option>
                                        <option value="Moderator">Moderator</option>
                                        <option value="Support">Support Staff</option>
                                        <option value="Editor">Content Editor</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ms-1">Permissions</label>
                                    <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pe-2 no-scrollbar">
                                        {AVAILABLE_PERMISSIONS.map(perm => (
                                            <button key={perm} type="button" onClick={() => toggleNewMemberPermission(perm)}
                                                className={cn(
                                                    "px-3 py-2 rounded-xl border text-[10px] font-black uppercase transition-all text-start",
                                                    newMember.permissions.includes(perm)
                                                        ? "bg-primary/20 border-primary/50 text-primary"
                                                        : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50"
                                                )}>
                                                {perm.replace('_', ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4 flex gap-4">
                                    <button type="button" onClick={() => setIsAddModalOpen(false)}
                                        className="flex-1 h-12 bg-muted/50 text-muted-foreground font-black text-xs uppercase tracking-widest rounded-xl hover:bg-muted transition-all">
                                        Cancel
                                    </button>
                                    <button onClick={handleInvite} disabled={isInviting}
                                        className="flex-[2] h-12 bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 transition-transform flex items-center justify-center">
                                        {isInviting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Send Invitation'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ═══ Permissions Modal ═══ */}
            <AnimatePresence>
                {isPermissionsModalOpen && selectedMember && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 w-screen h-screen">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsPermissionsModalOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-md w-screen h-screen"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-card w-full max-w-lg rounded-[32px] border border-border/50 p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto no-scrollbar"
                        >
                            <button onClick={() => setIsPermissionsModalOpen(false)} className="absolute top-6 end-6 p-2 text-muted-foreground/50 hover:text-foreground transition-colors">
                                <X size={20} />
                            </button>

                            <div className="mb-8">
                                <h2 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-3">
                                    <ShieldCheck className="text-primary" size={28} />
                                    Access Controls
                                </h2>
                                <p className="text-muted-foreground text-sm mt-1">
                                    Configuring permissions for <strong className="text-foreground">{selectedMember.name}</strong> ({selectedMember.role})
                                </p>
                            </div>

                            <div className="space-y-4 max-h-[50vh] overflow-y-auto no-scrollbar pe-2 mb-8">
                                {AVAILABLE_PERMISSIONS.map((perm) => {
                                    const isAllowed = tempPermissions.includes(perm) || (perm !== 'ALL_ACCESS' && tempPermissions.includes('ALL_ACCESS'));
                                    return (
                                        <button key={perm} onClick={() => handleTogglePermission(perm)}
                                            className={cn(
                                                "w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-start",
                                                isAllowed
                                                    ? "bg-primary/10 border-primary/30 text-primary"
                                                    : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"
                                            )}>
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-5 h-5 rounded flex items-center justify-center transition-colors",
                                                    isAllowed ? "bg-primary text-primary-foreground" : "bg-muted/50 border border-border/50"
                                                )}>
                                                    {isAllowed && <CheckCircle2 size={14} strokeWidth={3} />}
                                                </div>
                                                <span className="font-black text-sm tracking-wide">{perm.replace('_', ' ')}</span>
                                            </div>
                                            {perm === 'ALL_ACCESS' && (
                                                <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full">Dangerous</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="pt-4 flex gap-4 border-t border-border/50 mt-4">
                                <button onClick={() => setIsPermissionsModalOpen(false)}
                                    className="flex-1 h-12 bg-muted/50 text-muted-foreground font-black text-xs uppercase tracking-widest rounded-xl hover:bg-muted transition-all">
                                    Cancel
                                </button>
                                <button onClick={handleSavePermissions}
                                    className="flex-[2] h-12 bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 transition-transform shadow-md">
                                    Save Controls
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
