import { apiFetch } from '@/lib/api';

interface RecommendedProduct {
    id: string;
    name: string;
    price: number;
    images: string[];
    supplierId: string;
    brand?: string;
    category: string;
}

function ProductCardSmall({ product, onAdd, t }: { 
    product: RecommendedProduct; 
    onAdd: (p: RecommendedProduct) => void;
    t: any;
}) {
    return (
        <div className="flex gap-4 p-4 rounded-3xl border border-border/50 bg-background/50 hover:bg-muted/20 hover:border-primary/30 transition-all group">
                            <div className="w-20 h-20 bg-white rounded-2xl flex-shrink-0 border border-border/50 overflow-hidden p-2 flex items-center justify-center">
                                {product.images && product.images.length > 0 ? (
                                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300" />
                                ) : (
                                    <div className="w-full h-full bg-muted rounded-xl" />
                                )}
                            </div>
            <div className="flex flex-col justify-between flex-1 min-w-0">
                <div>
                    <h4 className="font-bold text-sm leading-tight truncate px-1">{product.name}</h4>
                    <p className="text-xs font-bold text-primary mt-1">{formatPrice(product.price, false)}</p>
                </div>
                <Button
                    size="sm"
                    onClick={() => onAdd(product)}
                    className="h-8 rounded-full text-xs font-black gap-2 w-full mt-2"
                    variant="outline"
                >
                    <ShoppingCart size={14} /> {t('cart', 'add')}
                </Button>
            </div>
        </div>
    );
}

export default function RecommendationsSidebar({ items }: { items: CartItem[] }) {
    const { addItem } = useCart();
    const { t } = useLanguage();
    const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // [FIX] 5s hard timeout to prevent blocking cart rendering

        const fetchRecommendations = async () => {
            if (items.length === 0) {
                setRecommendations([]);
                setIsLoading(false);
                return;
            }

            const categories = Array.from(new Set(items.map(item => item.category).filter(Boolean)));
            const excludeIds = items.map(item => item.id);

            setIsLoading(true);
            try {
                const params = new URLSearchParams();
                params.append('categories', categories.join(','));
                params.append('excludeIds', excludeIds.join(','));

                const res = await apiFetch(`/products/cart/recommendations?${params.toString()}`, {
                    signal: controller.signal
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setRecommendations(data);
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    console.warn("[RECOMMENDATIONS] Fetch timed out or aborted.");
                } else {
                    console.error("Failed to fetch recommendations:", error);
                }
            } finally {
                clearTimeout(timeoutId);
                setIsLoading(false);
            }
        };

        fetchRecommendations();
        return () => controller.abort();
    }, [items]);

    if (items.length === 0 || (!isLoading && recommendations.length === 0)) {
        return null;
    }

    return (
        <div className="bg-card rounded-[40px] border border-border/50 p-8 premium-shadow space-y-6 mt-8">
            <h3 className="font-heading font-bold text-xl flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-highlight" />
                {t('cart', 'frequentlyBought')}
            </h3>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm font-bold text-muted-foreground animate-pulse">{t('cart', 'analyzingCart')}</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {recommendations.map(product => (
                        <div key={product.id} className="flex gap-4 p-4 rounded-3xl border border-border/50 bg-background/50 hover:bg-muted/20 hover:border-primary/30 transition-all group">
                            <div className="w-20 h-20 bg-white rounded-2xl flex-shrink-0 border border-border/50 overflow-hidden p-2 flex items-center justify-center">
                                {product.images && product.images.length > 0 ? (
                                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300" />
                                ) : (
                                    <div className="w-full h-full bg-muted rounded-xl" />
                                )}
                            </div>
                            <div className="flex flex-col justify-between flex-1 min-w-0">
                                <div>
                                    <h4 className="font-bold text-sm leading-tight truncate px-1">{product.name}</h4>
                                    <p className="text-xs font-bold text-primary mt-1">{formatPrice(product.price, false)}</p>
                                </div>
                                    <Button
                                    size="sm"
                                    onClick={() => addItem({
                                        id: product.id,
                                        name: product.name,
                                        price: product.price,
                                        image: product.images?.[0] || '',
                                        supplierId: product.supplierId,
                                        brand: product.brand || 'Premium',
                                        unit: 'box',
                                        category: product.category
                                    }, 1)}
                                    className="h-8 rounded-full text-xs font-black gap-2 w-full mt-2"
                                    variant="outline"
                                >
                                    <ShoppingCart size={14} /> {t('cart', 'add')}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
