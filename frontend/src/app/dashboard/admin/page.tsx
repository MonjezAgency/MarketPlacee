'use client';

import { useState, useEffect } from 'react';
import {
    Users, Package, Store, Activity,
    Settings, ShieldAlert, CheckCircle2,
    Search, Filter, ExternalLink, RefreshCcw, Percent, AlertCircle, X, Plus, Tag, Megaphone, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/currency';

const MOCK_PLATFORM_STATS = [
    { label: 'Total Users', value: '1,280', delta: '+45 this week', icon: Users, color: 'text-primary' },
    { label: 'Total Products', value: '4,500', delta: '+120 new', icon: Package, color: 'text-secondary' },
    { label: 'Approved Suppliers', value: '85', delta: '4 pending', icon: Store, color: 'text-success' },
    { label: 'Weekly GMV', value: '$850k', delta: '+15%', icon: Activity, color: 'text-accent' },
];

// PENDING_APPROVALS mock removed, fetching dynamically below

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('users');
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [pendingProducts, setPendingProducts] = useState<any[]>([]);
    const [approvedProducts, setApprovedProducts] = useState<any[]>([]);
    const [markup, setMarkup] = useState<number>(1.05);
    const [brands, setBrands] = useState<string[]>([]);
    const [newBrand, setNewBrand] = useState('');
    const [brandsLoading, setBrandsLoading] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [activeAds, setActiveAds] = useState<any[]>([]);
    const [adProductId, setAdProductId] = useState('');
    const [adPlacement, setAdPlacement] = useState('SPONSORED_PRODUCT');

    const fetchDashboardData = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('bev-token');
            const headers = { Authorization: `Bearer ${token}` };

            const [usersP, productsP, markupP, brandsP, adsP] = await Promise.allSettled([
                fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/users?status=PENDING_APPROVAL', { headers }),
                fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/admin/config/all-products', { headers }),
                fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/admin/config/markup', { headers }),
                fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/admin/config/allowed-brands', { headers }),
                fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/ads/admin/all', { headers })
            ]);

            if (usersP.status === 'fulfilled' && usersP.value.ok) {
                const data = await usersP.value.json();
                setPendingUsers(data.filter((u: any) => u.role !== 'ADMIN'));
            }

            if (productsP.status === 'fulfilled' && productsP.value.ok) {
                const data = await productsP.value.json();
                setPendingProducts(data.filter((p: any) => p.status === 'PENDING'));
                setApprovedProducts(data.filter((p: any) => p.status === 'APPROVED'));
            }

            if (markupP.status === 'fulfilled' && markupP.value.ok) {
                const data = await markupP.value.json();
                setMarkup(data.markup);
            }

            if (brandsP.status === 'fulfilled' && brandsP.value.ok) {
                const data = await brandsP.value.json();
                setBrands(data);
            }

            if (adsP.status === 'fulfilled' && adsP.value.ok) {
                const data = await adsP.value.json();
                setActiveAds(data);
            }
        } catch (err) {
            console.error('Failed to fetch dashboard data', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateMarkup = async () => {
        if (!confirm(`Update global markup rating to ${markup}?`)) return;
        try {
            const token = localStorage.getItem('bev-token');
            await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/admin/config/markup', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ percentage: markup })
            });
            alert('Markup updated successfully');
        } catch (e) {
            alert('Failed to update markup');
        }
    };

    const handleSaveBrands = async () => {
        setBrandsLoading(true);
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/admin/config/allowed-brands', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ brands })
            });
            if (res.ok) {
                alert('Brands updated successfully');
            } else {
                alert('Failed to update brands');
            }
        } catch (e) {
            alert('Failed to update brands');
        } finally {
            setBrandsLoading(false);
        }
    };

    const handleAddBrand = () => {
        if (!newBrand.trim()) return;
        const brand = newBrand.trim().toLowerCase();
        if (!brands.includes(brand)) {
            setBrands([...brands, brand]);
        }
        setNewBrand('');
    };

    const handleRemoveBrand = (brandToRemove: string) => {
        setBrands(brands.filter(b => b !== brandToRemove));
    };

    const handleApproveProduct = async (id: string) => {
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/admin/config/products/${id}/approve`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const updatedProduct = pendingProducts.find(p => p.id === id);
                setPendingProducts(prev => prev.filter(p => p.id !== id));
                if (updatedProduct) setApprovedProducts(prev => [{ ...updatedProduct, status: 'APPROVED' }, ...prev]);
            }
        } catch (e) {
            alert('Failed to approve');
        }
    };

    const handleRejectProduct = async (id: string) => {
        const reason = prompt('Reason for rejection:');
        if (!reason) return;
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/admin/config/products/${id}/reject`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            if (res.ok) {
                setPendingProducts(prev => prev.filter(p => p.id !== id));
            }
        } catch (e) {
            alert('Failed to reject');
        }
    };

    const handleCreateAd = async () => {
        if (!adProductId) return alert("Enter Product ID");
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ads/admin/create`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: adProductId, placement: adPlacement })
            });
            if (res.ok) {
                fetchDashboardData();
                setAdProductId('');
                alert("Ad Created");
            } else {
                alert("Failed to create ad");
            }
        } catch (e) {
            alert("Error creating ad");
        }
    };

    const handleRemoveAd = async (id: string) => {
        try {
            const token = localStorage.getItem('bev-token');
            await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ads/admin/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchDashboardData();
        } catch (e) {
            alert("Error removing");
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-poppins font-black tracking-tight">Platform Governance</h1>
                    <p className="text-foreground/60">Global control panel for users, inventory, and system health.</p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={fetchDashboardData} variant="outline" className="rounded-full gap-2 border-foreground/10 hover:bg-primary/5 hover:text-primary transition-all group">
                        <RefreshCcw className={cn("w-4 h-4", isLoading && "animate-spin text-primary")} />
                        Sync Data
                    </Button>
                    <Button className="rounded-full gap-2 shadow-xl shadow-destructive/20 bg-destructive hover:bg-destructive/90 text-white">
                        <ShieldAlert className="w-4 h-4" />
                        System Logs
                    </Button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {MOCK_PLATFORM_STATS.map((stat, i) => (
                    <div key={i} className="bg-surface border border-border/50 p-6 rounded-[2rem] hover:shadow-xl transition-all group">
                        <div className="flex items-center justify-between mb-4">
                            <div className={cn("w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center transition-transform group-hover:scale-110")}>
                                <stat.icon className={cn("w-5 h-5", stat.color)} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-success">{stat.delta}</span>
                        </div>
                        <p className="text-sm font-bold text-foreground/40 uppercase tracking-widest leading-none">{stat.label}</p>
                        <p className="text-3xl font-black mt-2">{stat.value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Pending Actions */}
                <div className="lg:col-span-2 bg-surface border border-border/50 rounded-[2.5rem] overflow-hidden shadow-sm">
                    <div className="p-8 border-b border-border/50 flex items-center justify-between">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-success" />
                            Approval Queue
                        </h2>
                        <div className="flex items-center gap-2 p-1 bg-muted/30 rounded-full flex-wrap">
                            {['users', 'products', 'approved', 'categories', 'brands', 'ads', 'settings'].map(tab => (
                                <button
                                    key={tab}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-tight transition-all",
                                        activeTab === tab ? "bg-white text-foreground shadow-sm" : "text-foreground/40 hover:text-foreground"
                                    )}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="divide-y divide-border/50 min-h-[200px] relative">
                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-surface/50 backdrop-blur-sm z-10">
                                <div className="animate-spin text-primary">
                                    <RefreshCcw className="w-8 h-8" />
                                </div>
                            </div>
                        )}

                        {activeTab === 'users' && pendingUsers.length === 0 && !isLoading && (
                            <div className="p-12 text-center text-foreground/40 font-bold">
                                No pending users found.
                            </div>
                        )}
                        {activeTab === 'users' && pendingUsers.map((user) => (
                            <div key={user.id} className="p-8 flex items-center justify-between hover:bg-muted/10 transition-colors group relative">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center font-black text-foreground/40 text-xs shadow-inner overflow-hidden">
                                        {user.avatar ? (
                                            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                                        ) : (
                                            user.role?.[0]?.toUpperCase() || 'U'
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{user.name || user.email}</h3>
                                        <div className="flex items-center gap-2 text-xs text-foreground/40 mt-1">
                                            <Badge variant="outline" className="text-[10px] font-mono">{user.role}</Badge>
                                            <span>•</span>
                                            <span>{user.email}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge variant="accent" className="animate-pulse">{user.status.replace('_', ' ')}</Badge>
                                    <Button variant="outline" size="sm" className="rounded-full px-5 h-10 font-black border-foreground/10 hover:bg-primary/5 hover:text-primary transition-all">Review</Button>
                                </div>
                            </div>
                        ))}

                        {activeTab === 'products' && pendingProducts.length === 0 && !isLoading && (
                            <div className="p-12 text-center text-foreground/40 font-bold">
                                No pending products found.
                            </div>
                        )}
                        {activeTab === 'products' && pendingProducts.map((product) => (
                            <div key={product.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between hover:bg-muted/10 transition-colors group relative gap-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center overflow-hidden border border-border/50 bg-white">
                                        {product.images?.length > 0 ? (
                                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain mix-blend-multiply" />
                                        ) : (
                                            <Package className="w-6 h-6 text-foreground/20" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{product.name}</h3>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/40 mt-1">
                                            <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                                            <span className="font-mono text-primary">{formatPrice(product.price, true)} (/w markup)</span>
                                            <span>Stock: {product.stock}</span>
                                        </div>
                                        {product.adminNotes && (
                                            <p className="flex items-center gap-1 text-[11px] text-destructive/80 font-bold mt-2 bg-destructive/10 px-2 py-1 rounded w-fit">
                                                <AlertCircle size={12} /> {product.adminNotes}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button onClick={() => handleApproveProduct(product.id)} size="sm" className="bg-success text-success-foreground hover:bg-success/90 rounded-full px-6 font-black h-10">
                                        Approve
                                    </Button>
                                    <Button onClick={() => handleRejectProduct(product.id)} variant="outline" size="sm" className="rounded-full px-6 text-destructive border-destructive/20 hover:bg-destructive/10 font-black h-10">
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        ))}

                        {activeTab === 'approved' && approvedProducts.map((product) => (
                            <div key={product.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between hover:bg-muted/10 transition-colors group relative gap-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center overflow-hidden border border-border/50 bg-white">
                                        {product.images?.length > 0 ? (
                                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain mix-blend-multiply" />
                                        ) : (
                                            <Package className="w-6 h-6 text-foreground/20" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{product.name}</h3>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/40 mt-1">
                                            <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                                            <span className="font-mono text-primary">{formatPrice(product.price, true)} (Live Price)</span>
                                            <span>Stock: {product.stock}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="bg-success/10 text-success border-success/20 animate-pulse h-10 px-4">APPROVED</Badge>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(`/categories?q=${encodeURIComponent(product.name)}`, '_blank')}
                                        className="rounded-full px-5 h-10 font-black border-foreground/10 hover:bg-primary/5 hover:text-primary transition-all flex items-center gap-2"
                                    >
                                        <ExternalLink size={16} /> View Listing
                                    </Button>
                                    <Button onClick={() => handleRejectProduct(product.id)} variant="outline" size="sm" className="rounded-full px-6 text-destructive border-destructive/20 hover:bg-destructive/10 font-black h-10">
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        ))}

                        {activeTab === 'categories' && (
                            <div className="p-8 space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        <Tag className="w-5 h-5 text-primary" />
                                        Categories Management
                                    </h3>
                                    <Button
                                        onClick={() => window.open('/admin/categories', '_blank')}
                                        variant="outline"
                                        className="rounded-xl gap-2 h-10 px-4 font-bold border-foreground/10"
                                    >
                                        <ExternalLink size={14} /> Open Full Manager
                                    </Button>
                                </div>
                                <p className="text-sm text-foreground/40 mb-6">
                                    Product categories determine how items are grouped in the store. You can manage them in detail in the dedicated Categories page.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Simplified view: showing count of categories based on products */}
                                    <div className="p-6 bg-muted/20 border border-border/50 rounded-2xl">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-1">Active Categories</p>
                                        <p className="text-2xl font-black">
                                            {Array.from(new Set([...pendingProducts, ...approvedProducts].map(p => p.category))).length}
                                        </p>
                                    </div>
                                    <div className="p-6 bg-muted/20 border border-border/50 rounded-2xl">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-1">Uncategorized Items</p>
                                        <p className="text-2xl font-black">
                                            {[...pendingProducts, ...approvedProducts].filter(p => !p.category).length}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="p-8 space-y-8 max-w-2xl">
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2 mb-2">
                                        <Percent className="w-5 h-5 text-primary" />
                                        Global Markup Percentage
                                    </h3>
                                    <p className="text-sm text-foreground/40 mb-6">
                                        This percentage is multiplied against supplier prices when they create products or offers. 1.05 = 5%, 1.25 = 25%.
                                    </p>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={markup}
                                            onChange={(e) => setMarkup(parseFloat(e.target.value))}
                                            className="h-12 bg-background border border-border rounded-xl px-4 font-black w-40 text-lg"
                                        />
                                        <Button onClick={handleUpdateMarkup} className="h-12 px-8 rounded-xl font-black">Save Configuration</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'brands' && (
                            <div className="p-8 space-y-8">
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2 mb-2">
                                        <Tag className="w-5 h-5 text-primary" />
                                        Allowed Brands configuration
                                    </h3>
                                    <p className="text-sm text-foreground/40 mb-6 max-w-2xl">
                                        Control which brands are permitted on Atlantis. This list is strictly enforced during catalog imports and product creation.
                                    </p>

                                    <div className="flex items-center gap-4 mb-8">
                                        <input
                                            type="text"
                                            value={newBrand}
                                            onChange={(e) => setNewBrand(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddBrand()}
                                            placeholder="Enter brand name..."
                                            className="h-12 bg-background border border-border rounded-xl px-4 font-bold flex-1 max-w-md"
                                        />
                                        <Button onClick={handleAddBrand} variant="secondary" className="h-12 px-6 rounded-xl font-black gap-2">
                                            <Plus size={18} /> Add
                                        </Button>
                                        <Button
                                            onClick={handleSaveBrands}
                                            disabled={brandsLoading}
                                            className="h-12 px-8 rounded-xl font-black ms-auto shadow-lg shadow-primary/20"
                                        >
                                            {brandsLoading ? 'Saving...' : 'Save Configuration'}
                                        </Button>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        {brands.map((brand) => (
                                            <div key={brand} className="flex items-center gap-2 bg-muted/30 border border-border/50 rounded-full ps-4 pe-1.5 py-1.5 group hover:border-primary/50 transition-colors">
                                                <span className="font-bold text-sm tracking-tight">{brand}</span>
                                                <button
                                                    onClick={() => handleRemoveBrand(brand)}
                                                    className="w-6 h-6 rounded-full bg-background flex items-center justify-center text-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        {brands.length === 0 && (
                                            <p className="text-sm font-bold text-foreground/30 italic">No brands configured. All products will be blocked.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'ads' && (
                            <div className="p-8 space-y-8">
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2 mb-2">
                                        <Megaphone className="w-5 h-5 text-primary" />
                                        Advertising & Sponsored Products
                                    </h3>
                                    <p className="text-sm text-foreground/40 mb-6 max-w-2xl">
                                        Inject products natively into search results and brand banners to increase their visibility. Matches Amazon's Ad Platform logic.
                                    </p>

                                    <div className="flex flex-wrap items-center gap-4 mb-8 bg-muted/10 p-6 rounded-2xl border border-border/50">
                                        <input
                                            type="text"
                                            value={adProductId}
                                            onChange={(e) => setAdProductId(e.target.value)}
                                            placeholder="Paste Product ID (ObjectId)..."
                                            className="h-12 bg-background border border-border rounded-xl px-4 font-bold min-w-[300px]"
                                        />
                                        <select
                                            value={adPlacement}
                                            onChange={(e) => setAdPlacement(e.target.value)}
                                            className="h-12 bg-background border border-border rounded-xl px-4 text-sm font-bold cursor-pointer outline-none"
                                        >
                                            <option value="SPONSORED_PRODUCT">Sponsored Product (Search Grid)</option>
                                            <option value="SPONSORED_BRAND">Sponsored Brand (Top Banner)</option>
                                            <option value="SPONSORED_DISPLAY">Sponsored Display (Sidebar)</option>
                                        </select>
                                        <Button onClick={handleCreateAd} variant="primary" className="h-12 px-6 rounded-xl font-black gap-2 shrink-0">
                                            <Plus size={18} /> Inject Ad
                                        </Button>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="font-bold text-sm text-foreground">Active Campaigns ({activeAds.length})</h4>
                                        <div className="grid grid-cols-1 gap-3">
                                            {activeAds.map(ad => (
                                                <div key={ad.id} className="flex items-center justify-between p-4 bg-background border border-border/50 rounded-xl hover:border-primary/30 transition-colors">
                                                    <div>
                                                        <div className="flex gap-2 items-center mb-1">
                                                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{ad.placement.replace('SPONSORED_', '')}</Badge>
                                                            <span className="text-xs text-muted-foreground font-mono">{ad.id}</span>
                                                        </div>
                                                        <p className="font-bold text-sm">{ad.productName}</p>
                                                        <p className="text-[11px] text-muted-foreground">Supplier: {ad.supplierName}</p>
                                                    </div>
                                                    <Button onClick={() => handleRemoveAd(ad.id)} variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive h-10 w-10 p-0 rounded-full">
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </div>
                                            ))}
                                            {activeAds.length === 0 && (
                                                <p className="text-sm text-foreground/30 italic px-2">No active ad configurations currently running.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    {pendingUsers.length > 5 && activeTab === 'users' && (
                        <div className="p-6 bg-muted/10 text-center border-t border-border/50">
                            <Button variant="ghost" className="text-primary font-bold text-sm hover:scale-105 transition-transform">View full audit queue ({pendingUsers.length - 5} more)</Button>
                        </div>
                    )}
                </div>

                {/* System Health / Shortcuts */}
                <div className="space-y-6">
                    <div className="bg-surface border border-border/50 p-8 rounded-[2.5rem] space-y-6">
                        <h3 className="text-xl font-bold">System Status</h3>
                        <div className="space-y-4">
                            {[
                                { name: 'Payment API', status: 'Healthy', color: 'bg-success' },
                                { name: 'Excel Engine', status: 'Healthy', color: 'bg-success' },
                                { name: 'Prisma DB', status: 'Healthy', color: 'bg-success' },
                                { name: 'Mail Server', status: 'Degraded', color: 'bg-accent' },
                            ].map(sys => (
                                <div key={sys.name} className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground/60">{sys.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-foreground/40">{sys.status}</span>
                                        <div className={cn("w-2 h-2 rounded-full", sys.color)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" className="w-full rounded-2xl h-12 border-foreground/10">Run Diagnostics</Button>
                    </div>

                    <div className="bg-surface border border-border/50 p-8 rounded-[2.5rem] space-y-4">
                        <h3 className="text-xl font-bold">Quick Actions</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Button variant="ghost" className="h-20 flex-col rounded-2xl border border-border/50 hover:bg-primary/5 hover:text-primary gap-1">
                                <Users className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase">Users</span>
                            </Button>
                            <Button variant="ghost" className="h-20 flex-col rounded-2xl border border-border/50 hover:bg-secondary/5 hover:text-secondary gap-1">
                                <Package className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase">Catalog</span>
                            </Button>
                            <Button variant="ghost" className="h-20 flex-col rounded-2xl border border-border/50 hover:bg-success/5 hover:text-success gap-1">
                                <Filter className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase">Filters</span>
                            </Button>
                            <Button variant="ghost" className="h-20 flex-col rounded-2xl border border-border/50 hover:bg-accent/5 hover:text-accent gap-1">
                                <Settings className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase">Settings</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
