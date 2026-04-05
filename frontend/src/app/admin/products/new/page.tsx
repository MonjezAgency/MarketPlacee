'use client';

import React, { useState } from 'react';
import { ArrowLeft, Save, Sparkles, Image as ImageIcon, LinkIcon, Upload, Package, UploadCloud, CheckCircle2, X, FileSpreadsheet } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { getCurrencyInfo } from '@/lib/currency';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRouter } from 'next/navigation';

export default function AdminNewProductPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const { symbol } = getCurrencyInfo(true);

    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkFiles, setBulkFiles] = useState<File[]>([]);
    const [bulkResults, setBulkResults] = useState<any>(null);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        brand: '',
        category: '',
        price: '',
        unit: 'carton',
        stock: '',
        minOrder: '1',
        unitDescription: '',
        images: [] as string[],
        supplierId: '',
        ean: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, images: [...prev.images, reader.result as string] }));
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index: number) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }));
    };

    const addImageUrl = () => {
        const urlInput = document.getElementById('image-url-input') as HTMLInputElement;
        if (urlInput && urlInput.value) {
            setFormData(prev => ({ ...prev, images: [...prev.images, urlInput.value] }));
            urlInput.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('bev-token');
            if (!token || token === 'LOCAL_ONLY') {
                localStorage.removeItem('bev-token');
                localStorage.removeItem('bev-user');
                window.location.href = '/auth/login';
                return;
            }
            const res = await fetch(('/api') + '/products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description,
                    brand: formData.brand,
                    category: formData.category,
                    price: parseFloat(formData.price),
                    stock: parseInt(formData.stock) || 0,
                    unit: formData.unit,
                    minOrder: parseInt(formData.minOrder) || 1,
                    unitDescription: formData.unitDescription,
                    images: formData.images,
                    ean: formData.ean || undefined,
                    supplierId: formData.supplierId || undefined
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || `Failed to create product (${res.status})`);
            }

            setSuccess(true);
            setTimeout(() => {
                router.push('/admin/orders');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Error creating product.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (bulkFiles.length === 0) return;

        setIsSubmitting(true);
        let accumulatedResults = {
            totalRows: 0,
            successCount: 0,
            errorCount: 0,
            createdCount: 0,
            results: [] as any[]
        };

        try {
            const token = localStorage.getItem('bev-token');
            if (!token || token === 'LOCAL_ONLY') {
                window.location.href = '/auth/login';
                return;
            }

            for (const file of bulkFiles) {
                const uploadData = new FormData();
                uploadData.append('file', file);

                const backendBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                const apiUrl = `${backendBase}/products/bulk-upload`;

                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: uploadData,
                });

                if (!res.ok) {
                    let errMsg = 'Upload failed';
                    try {
                        const data = await res.json();
                        errMsg = data.message || errMsg;
                    } catch {
                        const text = await res.text().catch(() => '');
                        errMsg = text || `Server error (${res.status})`;
                    }
                    throw new Error(`Failed on file ${file.name}: ${errMsg}`);
                }

                const report = await res.json();
                accumulatedResults.totalRows += report.totalRows || 0;
                accumulatedResults.successCount += report.successCount || 0;
                accumulatedResults.errorCount += report.errorCount || 0;
                accumulatedResults.createdCount += report.createdCount || 0;
                
                // Track filename in the error results for clarity
                const fileResults = (report.results || []).map((r: any) => ({
                    ...r,
                    file: file.name
                }));
                accumulatedResults.results.push(...fileResults);
            }

            setBulkResults(accumulatedResults);
            setSuccess(true);
        } catch (err: any) {
            console.error('Bulk upload error:', err);
            alert(`Upload failed: ${err.message || 'Unknown error. Check connection.'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-10 w-full max-w-[100vw] overflow-x-hidden pb-20 pt-10">
            <div className="max-w-7xl mx-auto space-y-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-6">
                    <div className="space-y-4">
                        <Link href="/admin/orders" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest">
                            <ArrowLeft size={16} />
                            Back to Dashboard
                        </Link>
                        <div>
                            <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
                                Add Product Catalog <Sparkles className="text-primary w-8 h-8" />
                            </h1>
                            <p className="text-muted-foreground font-medium mt-2">Global inventory listing for enterprise buyers.</p>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        onClick={() => setIsBulkModalOpen(true)}
                        className="h-12 px-6 rounded-xl font-black border-border/50 hover:bg-muted/50 flex items-center gap-2 text-foreground"
                    >
                        <UploadCloud size={18} /> Bulk Upload Sheet
                    </Button>
                </div>

                <main className="container mx-auto px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">

                        {/* Left Column: Visuals / Preview */}
                        <div className="lg:col-span-6 space-y-10">
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="bg-card rounded-[48px] p-12 lg:p-20 border border-border/50 flex items-center justify-center relative group overflow-hidden min-h-[500px] shadow-2xl"
                            >
                                {/* Background Effects */}
                                <div className="absolute top-10 end-10 w-64 h-64 bg-primary/5 rounded-full blur-[100px] group-hover:bg-primary/10 transition-colors duration-700" />
                                <div className="absolute bottom-10 start-10 w-48 h-48 bg-blue-500/5 rounded-full blur-[80px]" />

                                {formData.images.length > 0 ? (
                                    <div className="w-full h-full p-4 overflow-y-auto no-scrollbar relative z-10 grid grid-cols-2 gap-4 auto-rows-max">
                                        {formData.images.map((img, idx) => (
                                            <div key={idx} className="relative group/img bg-background/50 rounded-2xl border border-border/50 overflow-hidden aspect-square flex items-center justify-center">
                                                <img
                                                    src={img}
                                                    alt={`Preview ${idx + 1}`}
                                                    className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover/img:scale-110"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeImage(idx)}
                                                    className="absolute top-2 end-2 w-8 h-8 bg-destructive/80 hover:bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-white/20 space-y-4 relative z-10">
                                        <ImageIcon size={64} className="opacity-50" />
                                        <p className="font-bold text-sm tracking-widest uppercase">Multi-Image Preview</p>
                                    </div>
                                )}
                            </motion.div>
                        </div>

                        {/* Right Column: Form Info */}
                        <div className="lg:col-span-6 flex flex-col">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="bg-card border border-border/50 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                            >
                                <form onSubmit={handleSubmit} className="relative z-10 space-y-8">
                                    <div className="space-y-6">
                                        <h3 className="text-2xl font-black text-foreground font-heading">Product Details</h3>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Product Name</label>
                                                <Input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Red Bull Energy Drink 250ml" required className="bg-background border-border/50 text-foreground" />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Brand</label>
                                                    <Input name="brand" value={formData.brand} onChange={handleChange} placeholder="e.g. Red Bull" required className="bg-background border-border/50 text-foreground" />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Category</label>
                                                    <select
                                                        name="category"
                                                        value={formData.category}
                                                        onChange={handleChange}
                                                        className="w-full h-12 bg-background border border-border/50 rounded-xl px-4 text-foreground text-sm outline-none focus:border-primary/50 transition-colors cursor-pointer appearance-none"
                                                        required
                                                    >
                                                        <option value="" disabled>Select Category</option>
                                                        <option value="Soft Drinks">Soft Drinks</option>
                                                        <option value="Energy Drinks">Energy Drinks</option>
                                                        <option value="Coffee & Tea">Coffee & Tea</option>
                                                        <option value="Snacks & Sweets">Snacks & Sweets</option>
                                                        <option value="Personal Care">Personal Care</option>
                                                        <option value="Home Care">Home Care</option>
                                                        <option value="Makeup">Makeup</option>
                                                        <option value="Perfume">Perfume</option>
                                                        <option value="Food">Food</option>
                                                        <option value="Detergents">Detergents</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">EAN / Barcode</label>
                                                    <Input name="ean" value={formData.ean} onChange={handleChange} placeholder="e.g. 5449000000996" className="bg-background border-border/50 text-foreground" />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Description</label>
                                                    <textarea
                                                        name="description"
                                                        value={formData.description}
                                                        onChange={handleChange}
                                                        className="w-full bg-background border border-border/50 rounded-2xl p-4 text-foreground text-sm outline-none focus:border-primary/50 transition-colors min-h-[100px] resize-y"
                                                        placeholder="Brief technical or marketing description..."
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6 pt-6 border-t border-border/50">
                                        <h3 className="text-2xl font-black text-foreground font-heading flex items-center gap-2">Logistics & Media</h3>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Price ({symbol})</label>
                                                <Input name="price" type="number" step="0.01" value={formData.price} onChange={handleChange} placeholder="0.00" required className="bg-background border-border/50 text-foreground" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Unit Type</label>
                                                <select
                                                    name="unit"
                                                    value={formData.unit}
                                                    onChange={handleChange}
                                                    className="w-full h-12 bg-background border border-border/50 rounded-xl px-4 text-foreground text-sm outline-none focus:border-primary/50 transition-colors cursor-pointer appearance-none"
                                                    required
                                                >
                                                    <option value="carton">Carton</option>
                                                    <option value="box">Box</option>
                                                    <option value="pack">Pack</option>
                                                    <option value="case">Case</option>
                                                    <option value="pallet">Pallet</option>
                                                    <option value="truck">Truck</option>
                                                    <option value="container">Container</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Quantity Available</label>
                                                <Input name="stock" type="number" min="0" value={formData.stock} onChange={handleChange} placeholder="e.g. 50" required className="bg-background border-border/50 text-foreground" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">Min. Order</label>
                                                <Input name="minOrder" type="number" min="1" value={formData.minOrder} onChange={handleChange} placeholder="1" required className="bg-background border-border/50 text-foreground" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1">
                                                Unit Description <span className="text-muted-foreground/50 normal-case tracking-normal font-normal">(Optional — e.g. "Each pallet contains 48 cartons")</span>
                                            </label>
                                            <textarea
                                                name="unitDescription"
                                                value={formData.unitDescription}
                                                onChange={handleChange}
                                                className="w-full bg-background border border-border/50 rounded-2xl p-4 text-foreground text-sm outline-none focus:border-primary/50 transition-colors min-h-[60px] resize-y"
                                                placeholder="Describe the unit contents — e.g. 'Each carton contains 24 units' or 'Each pallet has 40 cartons'..."
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ms-1 flex items-center gap-2">
                                                Product Media Gallery <ImageIcon size={12} />
                                            </label>

                                            <div className="flex flex-col xl:flex-row gap-4">
                                                <div className="flex-[2] relative group flex gap-2">
                                                    <div className="relative flex-1">
                                                        <Input id="image-url-input" placeholder="Paste image URL here..." className="ps-10 bg-background border-border/50 text-foreground" />
                                                        <LinkIcon size={16} className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                    </div>
                                                    <Button type="button" onClick={addImageUrl} variant="secondary" className="h-12 px-4 rounded-xl">Add</Button>
                                                </div>

                                                <div className="flex items-center justify-center font-black text-muted-foreground uppercase text-xs">OR</div>

                                                <div className="flex-1">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        multiple
                                                        onChange={handleImageUpload}
                                                        className="hidden"
                                                        id="image-upload"
                                                    />
                                                    <label
                                                        htmlFor="image-upload"
                                                        className="flex items-center justify-center gap-2 w-full h-[52px] bg-muted/50 border border-border/50 rounded-xl px-4 text-foreground text-sm hover:bg-muted transition-colors cursor-pointer font-bold whitespace-nowrap"
                                                    >
                                                        <Upload size={16} /> Multi Upload
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl text-sm font-bold flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-destructive" />
                                            {error}
                                        </div>
                                    )}

                                    {success && (
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-4 rounded-xl text-sm font-bold flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Product listed successfully!
                                        </div>
                                    )}

                                    <div className="pt-8 flex gap-4">
                                        <Button type="submit" isLoading={isSubmitting} className="font-black gap-2 w-full py-6 text-lg hover:scale-[1.02] transition-transform shadow-xl shadow-primary/20">
                                            Launch Product <Save size={20} />
                                        </Button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    </div>
                </main>

                {/* Bulk Upload Modal */}
                {typeof window !== 'undefined' && createPortal(
                    <AnimatePresence>
                        {isBulkModalOpen && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 w-screen h-screen overflow-hidden"
                            >
                                <motion.form
                                    onSubmit={handleBulkUpload}
                                    initial={{ scale: 0.9, y: 20 }}
                                    animate={{ scale: 1, y: 0 }}
                                    className="bg-card w-full max-w-2xl max-h-[90vh] rounded-[40px] border border-border/50 overflow-hidden shadow-2xl flex flex-col"
                                >
                                    <div className="p-8 border-b border-border/50 flex items-center justify-between shrink-0">
                                        <div>
                                            <h2 className="text-2xl font-black text-foreground tracking-tight">Bulk Upload Products</h2>
                                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">Upload via Excel or CSV</p>
                                        </div>
                                        <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkResults(null); setBulkFiles([]); }} className="w-10 h-10 bg-muted/50 hover:bg-muted rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="p-8 space-y-6 overflow-y-auto" dir="ltr">
                                        {!bulkResults ? (
                                            <div className="border-2 border-dashed border-border/50 rounded-3xl p-6 sm:p-12 flex flex-col items-center justify-center text-center relative group hover:border-primary/50 hover:bg-primary/5 transition-all">
                                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                                    <FileSpreadsheet size={32} className="text-primary" />
                                                </div>
                                                <h1 className="text-lg sm:text-xl font-black text-foreground mb-2">Drop your spreadsheet here</h1>
                                                <p className="text-muted-foreground text-sm">Supports .xlsx and .csv files</p>

                                                <div className="mt-6 text-start bg-muted/30 p-4 rounded-xl border border-border/50 max-w-md w-full relative z-20 pointer-events-auto">
                                                    <h4 className="text-xs font-black uppercase tracking-widest text-foreground mb-2 flex items-center gap-2">
                                                        <CheckCircle2 size={14} className="text-primary" /> Important Rules
                                                    </h4>
                                                    <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ps-4 font-medium">
                                                        <li><strong className="text-foreground">Required Columns:</strong> name, description, category, price, stock</li>
                                                        <li>Products missing a title, description, or image <strong className="text-amber-500">will remain PENDING</strong> and hidden from the marketplace.</li>
                                                        <li>If no image URL is provided, the system will attempt to fetch one using the <strong className="text-foreground">EAN</strong> if available.</li>
                                                        <li>No default or placeholder images (e.g., Coca-Cola) will be used.</li>
                                                    </ul>
                                                </div>

                                                <input
                                                    type="file"
                                                    accept=".xlsx, .csv"
                                                    multiple
                                                    onChange={(e) => setBulkFiles(Array.from(e.target.files || []))}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                />

                                                {bulkFiles.length > 0 && (
                                                    <div className="mt-6 p-4 bg-muted/50 rounded-xl border border-border/50 flex flex-col gap-2 relative z-10 w-full justify-center">
                                                        <div className="flex items-center gap-3 justify-center text-emerald-500 font-bold">
                                                            <CheckCircle2 size={20} />
                                                            <span>{bulkFiles.length} file(s) selected</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 mt-2 max-h-[100px] overflow-y-auto w-full">
                                                            {bulkFiles.map((file, i) => (
                                                                <span key={i} className="px-2 py-1 bg-background rounded-md text-[10px] text-muted-foreground border border-border/50 truncate max-w-[200px]">
                                                                    {file.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col items-center justify-center text-center">
                                                    <CheckCircle2 className="text-emerald-500 mb-2" size={32} />
                                                    <h3 className="text-xl font-black text-foreground">Upload Complete!</h3>
                                                    <p className="text-emerald-500 mt-1">Successfully processed {bulkResults.totalRows} rows.</p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-muted/30 rounded-2xl p-6 border border-border/50 text-center">
                                                        <p className="text-3xl font-black text-foreground">{bulkResults.createdCount}</p>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black mt-1">Products Created</p>
                                                    </div>
                                                    <div className="bg-destructive/10 rounded-2xl p-6 border border-border/50 text-center">
                                                        <p className="text-3xl font-black text-destructive">{bulkResults.errorCount}</p>
                                                        <p className="text-[10px] text-destructive/60 uppercase tracking-widest font-black mt-1">Rows Failed</p>
                                                    </div>
                                                </div>

                                                {bulkResults.errorCount > 0 && (
                                                    <div className="p-6 bg-destructive/5 border border-destructive/20 rounded-2xl space-y-3">
                                                        <h4 className="text-xs font-black uppercase tracking-widest text-destructive">Error Details</h4>
                                                        <div className="max-h-[200px] overflow-y-auto space-y-2 pe-2 custom-scrollbar">
                                                            {bulkResults.results.filter((r: any) => !r.success).map((r: any, idx: number) => (
                                                                <div key={idx} className="text-[11px] text-destructive flex gap-2">
                                                                    <span className="font-bold shrink-0">Row {r.rowNumber}:</span>
                                                                    <span>{Array.isArray(r.errors) ? r.errors.join(' | ') : 'Unknown validation error'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-8 border-t border-border/50 bg-muted/10 flex gap-4">
                                        <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkResults(null); setBulkFiles([]); }} className="flex-1 h-14 bg-muted text-foreground font-bold rounded-xl border border-border/50 hover:bg-muted/80 transition-colors">
                                            {bulkResults ? 'Close' : 'Cancel'}
                                        </button>
                                        {!bulkResults && (
                                            <button
                                                type="submit"
                                                disabled={bulkFiles.length === 0 || isSubmitting}
                                                className="flex-[2] h-14 bg-primary text-primary-foreground font-black rounded-xl px-8 shadow-xl hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {isSubmitting ? 'Uploading...' : <><UploadCloud size={18} /> Process Upload</>}
                                            </button>
                                        )}
                                    </div>
                                </motion.form>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}
            </div>
        </div>
    );
}
