'use client';
import { apiFetch } from '@/lib/api';

import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowLeft, Save, Tag, CalendarClock, Hash, User, Package } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRouter } from 'next/navigation';

export default function AdminNewOfferPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [supplierProducts, setSupplierProducts] = useState<any[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);

    const [formData, setFormData] = useState({
        supplierId: '',
        productId: '',
        type: 'FEATURED',
        durationDays: '7'
    });

    useEffect(() => {
        apiFetch('/admin/users')
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                const list = Array.isArray(data) ? data : (data.data || []);
                setSuppliers(list.filter((u: any) => u.role === 'SUPPLIER'));
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!formData.supplierId) { setSupplierProducts([]); return; }
        setIsLoadingProducts(true);
        apiFetch(`/admin/products?supplierId=${formData.supplierId}&limit=100`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setSupplierProducts(Array.isArray(data) ? data : (data.data || [])))
            .catch(() => {})
            .finally(() => setIsLoadingProducts(false));
    }, [formData.supplierId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value,
            // Reset product when supplier changes
            ...(name === 'supplierId' ? { productId: '' } : {})
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            
            const res = await apiFetch('/placements/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: formData.productId,
                    supplierId: formData.supplierId || undefined,
                    type: formData.type,
                    durationDays: parseInt(formData.durationDays, 10)
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to create offer placement');
            }

            setSuccess(true);
            setTimeout(() => {
                router.push('/admin/offers');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Error creating offer.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-10 max-w-3xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <Link href="/admin/offers" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest">
                        <ArrowLeft size={16} />
                        Back to Offers
                    </Link>
                    <div>
                        <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
                            Initiate Promotion <Sparkles className="text-primary w-6 h-6" />
                        </h1>
                        <p className="text-muted-foreground font-medium mt-1">Configure premium visibility placements for specific SKUs.</p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border/50 rounded-[40px] p-8 md:p-12 shadow-sm relative overflow-hidden"
            >
                {/* Decorative background blur */}
                <div className="absolute top-0 end-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

                <form onSubmit={handleSubmit} className="relative z-10 space-y-10">
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b border-border/50 pb-4">
                            <Tag className="text-primary" size={20} />
                            <h2 className="text-xl font-bold text-foreground">Placement Details</h2>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1 flex items-center gap-2">
                                        Supplier <User size={12} />
                                    </label>
                                    <select
                                        name="supplierId"
                                        value={formData.supplierId}
                                        onChange={handleChange}
                                        className="w-full h-12 bg-background border border-border/50 rounded-xl px-4 text-foreground text-sm outline-none focus:border-primary/50 transition-colors cursor-pointer appearance-none"
                                    >
                                        <option value="">All suppliers...</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}{s.companyName ? ` (${s.companyName})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1 flex items-center gap-2">
                                        Target Product <Package size={12} />
                                    </label>
                                    {formData.supplierId && supplierProducts.length > 0 ? (
                                        <select
                                            name="productId"
                                            value={formData.productId}
                                            onChange={handleChange}
                                            className="w-full h-12 bg-background border border-border/50 rounded-xl px-4 text-foreground text-sm outline-none focus:border-primary/50 transition-colors cursor-pointer appearance-none"
                                            required
                                        >
                                            <option value="">Select product...</option>
                                            {supplierProducts.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="relative">
                                            <Input
                                                name="productId"
                                                value={formData.productId}
                                                onChange={handleChange}
                                                placeholder={isLoadingProducts ? 'Loading products...' : 'Enter product UUID...'}
                                                required
                                            />
                                        </div>
                                    )}
                                    {!formData.supplierId && (
                                        <p className="text-[10px] text-muted-foreground/50 ms-2 mt-1 font-medium">Select a supplier to pick from their products.</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Placement Type</label>
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={handleChange}
                                        className="w-full h-12 bg-background border border-border/50 rounded-xl px-4 text-foreground text-sm outline-none focus:border-primary/50 transition-colors cursor-pointer appearance-none"
                                        required
                                    >
                                        <option value="HERO" className="text-black bg-white dark:text-white dark:bg-gray-900">HERO (Homepage Banner)</option>
                                        <option value="FEATURED" className="text-black bg-white dark:text-white dark:bg-gray-900">FEATURED (Category Top)</option>
                                        <option value="LISTING" className="text-black bg-white dark:text-white dark:bg-gray-900">LISTING (Highlighted Row)</option>
                                        <option value="BANNER" className="text-black bg-white dark:text-white dark:bg-gray-900">BANNER (Sidebar Ad)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1 flex items-center gap-2">
                                        Duration (Days) <CalendarClock size={12} />
                                    </label>
                                    <Input
                                        name="durationDays"
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={formData.durationDays}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm font-bold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-bold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Placement request generated successfully!
                        </div>
                    )}

                    <div className="pt-6 border-t border-border/50 flex justify-end gap-4">
                        <Link href="/admin/offers">
                            <Button variant="outline" type="button" className="border-border/50 hover:bg-muted/50">Cancel</Button>
                        </Link>
                        <Button type="submit" isLoading={isSubmitting} className="font-black gap-2 min-w-[200px] bg-primary hover:bg-primary/90 text-primary-foreground">
                            Deploy Offer <Save size={18} />
                        </Button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
