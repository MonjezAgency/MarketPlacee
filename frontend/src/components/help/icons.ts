import type * as React from 'react';
import { Compass, User, ShoppingCart, Store, Box, Layers, CreditCard, Truck, Settings, AlertTriangle, BookOpen } from 'lucide-react';

/** Category icon keys (content/help CATEGORIES[].icon) → icons. Shared by server and client components. */
export const CATEGORY_ICONS: Record<string, React.ElementType> = { compass: Compass, user: User, cart: ShoppingCart, store: Store, box: Box, layers: Layers, card: CreditCard, truck: Truck, settings: Settings, alert: AlertTriangle, book: BookOpen };
