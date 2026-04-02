'use client';

import React, { useState, useEffect } from 'react';
import { getHomepageCategories, setHomepageCategories, fetchImageByEan } from '@/lib/api';
import { Plus, Trash2, Save, Upload, Search, Link as LinkIcon, Image as ImageIcon, Loader2 } from 'lucide-react';

export default function AdminHomepageConfig() {
    const [categories, setCategories] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [loadingTileEan, setLoadingTileEan] = useState<string | null>(null);

    useEffect(() => {
        getHomepageCategories().then(data => {
            if (data && Array.isArray(data)) {
                setCategories(data);
            }
            setIsLoading(false);
        });
    }, []);

    const handleAddCategory = () => {
        setCategories([...categories, {
            title: 'New Section',
            footerLink: '/categories',
            footerText: 'See more',
            items: [
                { label: 'Item 1', image: '', link: '' },
                { label: 'Item 2', image: '', link: '' },
                { label: 'Item 3', image: '', link: '' },
                { label: 'Item 4', image: '', link: '' },
            ]
        }]);
    };

    const handleRemoveCategory = (index: number) => {
        setCategories(categories.filter((_, i) => i !== index));
    };

    const handleChangeCategory = (index: number, field: string, value: string) => {
        const updated = [...categories];
        updated[index] = { ...updated[index], [field]: value };
        setCategories(updated);
    };

    const handleChangeItem = (catIndex: number, itemIndex: number, field: string, value: string) => {
        const updated = [...categories];
        const updatedItems = [...updated[catIndex].items];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], [field]: value };
        updated[catIndex].items = updatedItems;
        setCategories(updated);
    };

    const handleFetchEanImage = async (catIndex: number, itemIndex: number, ean: string) => {
        if (!ean) return;
        setLoadingTileEan(`${catIndex}-${itemIndex}`);
        const imageUrl = await fetchImageByEan(ean);
        setLoadingTileEan(null);
        if (imageUrl) {
            handleChangeItem(catIndex, itemIndex, 'image', imageUrl);
        } else {
            alert('Could not find an image for this EAN.');
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, catIndex: number, itemIndex: number) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                handleChangeItem(catIndex, itemIndex, 'image', reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const token = localStorage.getItem('bev-token') || '';
            console.log('Token present:', !!token, 'Length:', token.length, 'First 20:', token.substring(0, 20));

            if (!token) {
                alert('No auth token found. Please log in again.');
                window.location.href = '/auth/login';
                return;
            }

            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/admin/config/homepage-categories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ categories }),
            });
            if (res.ok) {
                alert('Homepage categories saved successfully!');
            } else if (res.status === 401) {
                alert('Session expired. Please log in again.');
                localStorage.removeItem('bev-token');
                localStorage.removeItem('bev-user');
                window.location.href = '/auth/login';
            } else {
                const errText = await res.text();
                console.error('Save failed:', res.status, errText);
                alert(`Failed to save (${res.status}): ${errText}`);
            }
        } catch (err: any) {
            console.error('Save error:', err);
            alert('Failed to save. Network error.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center animate-pulse text-muted-foreground font-black tracking-widest uppercase">Loading Configuration...</div>;

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex justify-between items-center bg-card p-6 rounded-2xl border border-border/50 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground">Homepage Layout</h1>
                    <p className="text-sm text-muted-foreground mt-1">Configure the 4-tile ad blocks on the main store.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                    <Save size={20} />
                    {isSaving ? 'Deploying...' : 'Save & Publish'}
                </button>
            </div>

            <div className="space-y-6">
                {categories.map((cat, catIndex) => (
                    <div key={catIndex} className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm relative group transition-all hover:border-border">
                        <button
                            onClick={() => handleRemoveCategory(catIndex)}
                            className="absolute top-6 end-6 p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove Section"
                        >
                            <Trash2 size={20} />
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 pe-12">
                            <div>
                                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Section Title</label>
                                <input
                                    type="text"
                                    value={cat.title}
                                    onChange={(e) => handleChangeCategory(catIndex, 'title', e.target.value)}
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold text-foreground focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                                    placeholder="e.g. Makeup for Everyone"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Footer Text</label>
                                    <input
                                        type="text"
                                        value={cat.footerText}
                                        onChange={(e) => handleChangeCategory(catIndex, 'footerText', e.target.value)}
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-medium text-foreground outline-none"
                                        placeholder="Shop all..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Footer Link</label>
                                    <input
                                        type="text"
                                        value={cat.footerLink}
                                        onChange={(e) => handleChangeCategory(catIndex, 'footerLink', e.target.value)}
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-medium text-foreground outline-none"
                                        placeholder="/categories?category=..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {cat.items.map((item: any, itemIndex: number) => (
                                <div key={itemIndex} className="border border-border/50 rounded-xl p-4 bg-background/50 space-y-3 flex flex-col items-center">
                                    <div className="text-xs font-black text-primary uppercase tracking-widest w-full text-center">Tile {itemIndex + 1}</div>
                                    {item.image ? (
                                        <div className="w-20 h-20 rounded bg-muted overflow-hidden flex-shrink-0">
                                            <img src={item.image} alt={item.label} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97' }} />
                                        </div>
                                    ) : (
                                        <div className="w-20 h-20 rounded bg-muted border border-border border-dashed flex items-center justify-center text-[10px] text-muted-foreground uppercase text-center p-2">No Image</div>
                                    )}
                                    <input
                                        type="text"
                                        value={item.label}
                                        onChange={(e) => handleChangeItem(catIndex, itemIndex, 'label', e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-bold text-center outline-none focus:border-primary/50 transition-colors"
                                        placeholder="Label"
                                    />
                                    <div className="flex w-full gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={item.ean || ''}
                                                onChange={(e) => handleChangeItem(catIndex, itemIndex, 'ean', e.target.value)}
                                                className="w-full bg-background border border-border rounded-lg ps-3 pe-8 py-2 text-xs font-medium outline-none focus:border-primary/50 transition-colors"
                                                placeholder="Enter EAN..."
                                            />
                                            <button
                                                onClick={() => handleFetchEanImage(catIndex, itemIndex, item.ean)}
                                                disabled={loadingTileEan === `${catIndex}-${itemIndex}` || !item.ean}
                                                className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                                                title="Fetch Image from EAN"
                                            >
                                                {loadingTileEan === `${catIndex}-${itemIndex}` ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex w-full gap-2 items-center">
                                        <div className="relative flex-1">
                                            <ImageIcon size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                type="text"
                                                value={item.image}
                                                onChange={(e) => handleChangeItem(catIndex, itemIndex, 'image', e.target.value)}
                                                className="w-full bg-background border border-border rounded-lg ps-8 pe-3 py-2 text-xs font-medium outline-none focus:border-primary/50 transition-colors"
                                                placeholder="Image URL"
                                            />
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            id={`upload-${catIndex}-${itemIndex}`}
                                            onChange={(e) => handleImageUpload(e, catIndex, itemIndex)}
                                        />
                                        <label
                                            htmlFor={`upload-${catIndex}-${itemIndex}`}
                                            className="w-8 h-8 shrink-0 bg-muted hover:bg-muted/80 border border-border rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                                            title="Upload Local Image"
                                        >
                                            <Upload size={14} className="text-foreground" />
                                        </label>
                                    </div>
                                    <div className="relative w-full">
                                        <LinkIcon size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            value={item.link}
                                            onChange={(e) => handleChangeItem(catIndex, itemIndex, 'link', e.target.value)}
                                            className="w-full bg-background border border-border rounded-lg ps-8 pe-3 py-2 text-xs font-medium outline-none focus:border-primary/50 transition-colors"
                                            placeholder="Target URL /categories?..."
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={handleAddCategory}
                className="w-full py-6 border-2 border-dashed border-primary/30 rounded-2xl text-primary font-black uppercase tracking-widest hover:bg-primary/5 hover:border-primary/50 transition-all flex items-center justify-center gap-2"
            >
                <Plus size={24} /> Add New Catalog Section
            </button>
        </div>
    );
}
