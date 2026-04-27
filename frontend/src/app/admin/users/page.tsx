'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, Filter, Download, UserCircle2, 
    MoreVertical, ShieldCheck, Mail, Phone,
    Check, X, FileText, Globe, Building2,
    Calendar, ArrowUpRight, ShieldAlert,
    ChevronRight, Eye, Briefcase, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface User {
    id: string;
    name: string;
    email: string;
    companyName: string;
    role: 'BUYER' | 'SUPPLIER';
    country: string;
    status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'BLOCKED' | 'PENDING' | 'APPROVED';
    createdAt: string;
    website?: string;
    linkedIn?: string;
    taxId?: string;
    phone?: string;
    kycDocuments?: {
        type: string;
        url: string;
    }[];
}

export default function UserManagementPage() {
    const [users, setUsers] = React.useState<User[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [filterStatus, setFilterStatus] = React.useState('ALL');
    const [selectedUser, setSelectedUser] = React.useState<User | null>(null);
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/users?limit=100', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
            } else {
                toast.error('Failed to fetch users');
            }
        } catch (err) {
            console.error('Failed to load users:', err);
            toast.error('Connection error while loading users');
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        loadUsers();
    }, []);

    const filteredUsers = users.filter(u => {
        const name = (u.name || '').toLowerCase();
        const company = (u.companyName || '').toLowerCase();
        const search = searchTerm.toLowerCase();
        const matchesSearch = name.includes(search) || company.includes(search);
        const matchesFilter = filterStatus === 'ALL' || 
                             (filterStatus === 'PENDING' && u.status === 'PENDING_APPROVAL') ||
                             (filterStatus === 'APPROVED' && u.status === 'ACTIVE') ||
                             u.status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    const handleAction = async (id: string, action: 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'DELETE') => {
        const tid = toast.loading(`${action === 'DELETE' ? 'Deleting' : 'Updating'} user...`);
        try {
            if (action === 'DELETE') {
                if (!confirm('Are you sure? This is permanent.')) {
                    toast.dismiss(tid);
                    return;
                }
                const res = await apiFetch(`/users/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    toast.success('User deleted successfully', { id: tid });
                    loadUsers();
                } else {
                    const error = await res.json().catch(() => ({}));
                    toast.error(error.message || 'Failed to delete user', { id: tid });
                }
            } else {
                const statusMap = {
                    'APPROVED': 'ACTIVE',
                    'REJECTED': 'REJECTED',
                    'BLOCKED': 'BLOCKED'
                };
                const status = statusMap[action as keyof typeof statusMap] || action;
                const res = await apiFetch(`/users/${id}/status`, {
                    method: 'POST',
                    body: JSON.stringify({ status })
                });
                
                if (res.ok) {
                    toast.success(`User ${action.toLowerCase()} successfully`, { id: tid });
                    loadUsers();
                } else {
                    const error = await res.json().catch(() => ({}));
                    toast.error(error.message || `Failed to ${action.toLowerCase()} user`, { id: tid });
                }
            }
        } catch (err) {
            toast.error('Network error', { id: tid });
        }
        setSelectedUser(null);
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredUsers.length) setSelectedIds([]);
        else setSelectedIds(filteredUsers.map(u => u.id));
    };

    const handleBulkAction = async (action: 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'DELETE') => {
        if (selectedIds.length === 0) return;
        
        const tid = toast.loading(`Performing bulk ${action.toLowerCase()}...`);
        try {
            const statusMap = {
                'APPROVED': 'bulk-approve',
                'BLOCKED': 'bulk-block',
                'DELETE': 'bulk-delete',
                'REJECTED': 'bulk-block'
            };
            
            const endpoint = `/users/${statusMap[action as keyof typeof statusMap] || 'bulk-block'}`;
            
            if (action === 'DELETE' && !confirm(`Delete ${selectedIds.length} users?`)) {
                toast.dismiss(tid);
                return;
            }

            const res = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify({ ids: selectedIds })
            });

            if (res.ok) {
                toast.success(`Bulk ${action.toLowerCase()} completed`, { id: tid });
                setSelectedIds([]);
                loadUsers();
            } else {
                toast.error('Bulk action failed', { id: tid });
            }
        } catch (err) {
            toast.error('Network error during bulk action', { id: tid });
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-20 font-inter">
            {/* Header */}
            <div className="bg-white border-b border-[#E6EAF0] px-8 py-6 sticky top-0 z-30">
                <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-[24px] font-[700] text-[#0F172A] leading-tight">User Management</h1>
                        <p className="text-[14px] text-[#6B7280] mt-1">Review and manage platform access</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
                            <input 
                                type="text"
                                placeholder="Search users or companies..."
                                className="w-[260px] h-[40px] pl-10 pr-4 bg-[#F1F5F9] border-none rounded-[10px] text-sm focus:ring-2 focus:ring-[#00BFA6]/20 outline-none transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select 
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="h-[40px] px-3 bg-[#F1F5F9] text-[#475569] rounded-[10px] text-sm border-none outline-none focus:ring-2 focus:ring-[#00BFA6]/20 transition-all"
                        >
                            <option value="ALL">All Status</option>
                            <option value="PENDING">Pending</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                        </select>
                        <button className="h-[40px] px-4 rounded-[10px] bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] transition-all flex items-center gap-2">
                            <Download size={18} />
                            <span className="text-sm font-bold uppercase tracking-wider text-[11px]">Export CSV</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bulk Action Bar */}
            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#0F172A] text-white px-6 py-4 rounded-2xl shadow-2xl z-40 flex items-center gap-6"
                    >
                        <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
                            <div className="w-8 h-8 rounded-lg bg-[#00BFA6] flex items-center justify-center font-bold text-xs">
                                {selectedIds.length}
                            </div>
                            <span className="text-sm font-bold">Selected</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleBulkAction('APPROVED')} className="h-10 px-4 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2">
                                <Check size={14} /> Approve All
                            </button>
                            <button onClick={() => handleBulkAction('REJECTED')} className="h-10 px-4 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-all flex items-center gap-2">
                                <X size={14} /> Reject
                            </button>
                            <button onClick={() => handleBulkAction('BLOCKED')} className="h-10 px-4 rounded-lg bg-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-600 transition-all flex items-center gap-2">
                                <ShieldAlert size={14} /> Block
                            </button>
                            <button onClick={() => handleBulkAction('DELETE')} className="h-10 px-4 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-2">
                                <Trash2 size={14} /> Delete
                            </button>
                        </div>
                        <button onClick={() => setSelectedIds([])} className="ml-4 p-2 text-slate-400 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-[1440px] mx-auto px-8 py-6">
                <div className="bg-white border border-[#E6EAF0] rounded-[16px] overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#F8FAFC] border-b border-[#E6EAF0]">
                                <th className="px-6 py-4 w-12">
                                    <input 
                                        type="checkbox" 
                                        className="rounded border-slate-300 text-[#00BFA6] focus:ring-[#00BFA6]" 
                                        checked={selectedIds.length === filteredUsers.length && filteredUsers.length > 0}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">User Name</th>
                                <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Company</th>
                                <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Type</th>
                                <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Country</th>
                                <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider">Created At</th>
                                <th className="px-6 py-4 text-[12px] font-bold text-[#6B7280] uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user) => (
                                <tr 
                                    key={user.id} 
                                    className={cn(
                                        "h-[72px] border-b border-[#E6EAF0] hover:bg-[#F7F9FB] transition-colors group cursor-pointer",
                                        selectedIds.includes(user.id) && "bg-teal-50/50"
                                    )}
                                    onClick={() => setSelectedUser(user)}
                                >
                                    <td className="px-[20px]" onClick={(e) => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            className="rounded border-slate-300 text-[#00BFA6] focus:ring-[#00BFA6]" 
                                            checked={selectedIds.includes(user.id)}
                                            onChange={() => toggleSelect(user.id)}
                                        />
                                    </td>
                                    <td className="px-[20px]">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                                                {user.name[0]}
                                            </div>
                                            <div>
                                                <p className="text-[14px] font-bold text-[#0F172A]">{user.name}</p>
                                                <p className="text-[11px] text-[#6B7280]">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-[20px]">
                                        <div className="flex items-center gap-2 text-[14px] text-[#475569] font-medium">
                                            <Building2 size={14} className="text-slate-400" />
                                            {user.companyName}
                                        </div>
                                    </td>
                                    <td className="px-[20px]">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter",
                                            user.role === 'SUPPLIER' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                        )}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-[20px]">
                                        <div className="flex items-center gap-2 text-[14px] text-[#475569] font-medium">
                                            <Globe size={14} className="text-slate-400" />
                                            {user.country}
                                        </div>
                                    </td>
                                    <td className="px-[20px]">
                                        <span className={cn(
                                            "px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider",
                                            (user.status === 'ACTIVE' || user.status === 'APPROVED') ? "bg-[#22C55E]/10 text-[#22C55E]" :
                                            (user.status === 'PENDING_APPROVAL' || user.status === 'PENDING') ? "bg-[#F59E0B]/10 text-[#F59E0B]" :
                                            user.status === 'BLOCKED' ? "bg-slate-900 text-white" :
                                            "bg-[#EF4444]/10 text-[#EF4444]"
                                        )}>
                                            {user.status === 'PENDING_APPROVAL' ? 'PENDING' : 
                                             user.status === 'ACTIVE' ? 'APPROVED' : 
                                             user.status}
                                        </span>
                                    </td>
                                    <td className="px-[20px] text-[11px] text-slate-400 font-medium text-right">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Review Drawer */}
            <AnimatePresence>
                {selectedUser && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedUser(null)}
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                        />
                        <motion.div 
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 right-0 w-[520px] h-full bg-white z-50 shadow-2xl border-l border-[#E6EAF0] overflow-y-auto"
                        >
                            <div className="p-8 space-y-8">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[20px] font-bold text-[#0F172A]">Review User Request</h2>
                                    <button 
                                        onClick={() => setSelectedUser(null)}
                                        className="w-10 h-10 rounded-xl bg-[#F8FAFC] flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-xl font-bold text-slate-400 shadow-sm">
                                                {selectedUser.name[0]}
                                            </div>
                                            <div>
                                                <p className="text-lg font-bold text-[#0F172A]">{selectedUser.name}</p>
                                                <p className="text-sm text-[#6B7280]">{selectedUser.email}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Company</p>
                                                <p className="text-sm font-bold text-slate-700">{selectedUser.companyName}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tax ID</p>
                                                <p className="text-sm font-bold text-slate-700">{selectedUser.taxId || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Website</p>
                                                <a href={selectedUser.website} target="_blank" className="text-sm font-bold text-teal-600 hover:underline flex items-center gap-1">
                                                    {selectedUser.website?.replace('https://', '') || 'N/A'} <ArrowUpRight size={12} />
                                                </a>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">LinkedIn</p>
                                                <a href={selectedUser.linkedIn} target="_blank" className="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1">
                                                    Official Profile <ArrowUpRight size={12} />
                                                </a>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-5 bg-white border border-[#E6EAF0] rounded-2xl shadow-sm space-y-1">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">KYC Score</p>
                                            <div className="flex items-end gap-2">
                                                <span className="text-2xl font-black text-[#0F172A]">94</span>
                                                <span className="text-xs font-bold text-[#22C55E] mb-1">High Confidence</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="w-[94%] h-full bg-[#00BFA6]" />
                                            </div>
                                        </div>
                                        <div className="p-5 bg-white border border-[#E6EAF0] rounded-2xl shadow-sm space-y-1">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Risk Level</p>
                                            <div className="flex items-center gap-2 pt-1">
                                                <div className="w-3 h-3 rounded-full bg-[#22C55E]" />
                                                <span className="text-lg font-black text-[#0F172A]">LOW</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-medium">Verified by AI Guardian</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest flex items-center gap-2">
                                            <FileText size={14} />
                                            KYC Documentation
                                        </h3>
                                        <div className="grid grid-cols-1 gap-3">
                                            {selectedUser.kycDocuments?.map((doc, i) => (
                                                <div key={i} className="p-4 bg-white border border-[#E6EAF0] rounded-xl flex items-center justify-between group hover:border-[#00BFA6]/50 transition-all cursor-pointer">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
                                                            <ShieldCheck size={20} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-700">{doc.type}</p>
                                                            <p className="text-[11px] text-slate-400">Identity Manifest • PDF</p>
                                                        </div>
                                                    </div>
                                                    <ArrowUpRight size={18} className="text-slate-300 group-hover:text-teal-600 transition-all" />
                                                </div>
                                            ))}
                                            {!selectedUser.kycDocuments && (
                                                <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center space-y-2">
                                                    <ShieldAlert size={32} className="text-slate-300" />
                                                    <p className="text-sm font-medium text-slate-500">No documents uploaded</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-[#E6EAF0] space-y-3">
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => handleAction(selectedUser.id, 'REJECTED')}
                                            className="flex-1 h-12 rounded-xl bg-white border border-[#EF4444] text-sm font-bold text-[#EF4444] hover:bg-red-50 transition-all"
                                        >
                                            Reject
                                        </button>
                                        <button 
                                            onClick={() => handleAction(selectedUser.id, 'APPROVED')}
                                            className="flex-[2] h-12 rounded-xl bg-[#22C55E] text-white text-sm font-bold shadow-lg shadow-[#22C55E]/20 hover:bg-[#1ea34d] transition-all active:scale-95"
                                        >
                                            Approve Access
                                        </button>
                                    </div>
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => handleAction(selectedUser.id, 'BLOCKED')}
                                            className="flex-1 h-12 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center gap-2"
                                        >
                                            <ShieldAlert size={16} /> Block Account
                                        </button>
                                        <button 
                                            onClick={() => handleAction(selectedUser.id, 'DELETE')}
                                            className="flex-1 h-12 rounded-xl bg-white border border-slate-200 text-slate-400 text-sm font-bold hover:bg-red-600 hover:text-white hover:border-red-600 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Trash2 size={16} /> Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
