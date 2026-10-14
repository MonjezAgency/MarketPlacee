import { call } from '@/lib/wholesale';

export type ListTier = 'carton' | 'pallet' | 'truck';
export interface ListProduct { id: string; name: string; brand: string | null; ean: string | null; image: string | null; status: string; available: boolean; unitsPerCase: number | null; casesPerPallet: number | null; palletsPerShipment: number | null; supplierId: string }
export interface ListItem { id: string; productId: string; variantKey: string; selectedVariants: Record<string, string> | null; tier: ListTier; quantity: number; product: ListProduct | null }
export interface ShoppingList { id: string; name: string; description?: string | null; reminderRepeat?: 'none' | 'weekly' | 'monthly'; nextReminderAt?: string | null; lastRemindedAt?: string | null; createdAt: string; updatedAt: string; items: ListItem[] }

export const getLists = () => call<ShoppingList[]>('/lists');
export const createList = (name: string) => call<ShoppingList>('/lists', { method: 'POST', body: JSON.stringify({ name }) });
export const renameList = (id: string, name: string) => call<ShoppingList>(`/lists/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
export const updateList = (id: string, body: { name?: string; description?: string | null; nextReminderAt?: string | null; reminderRepeat?: string }) =>
    call<ShoppingList>(`/lists/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteList = (id: string) => call<{ ok: true }>(`/lists/${id}`, { method: 'DELETE' });
export const addListItems = (id: string, items: { productId: string; selectedVariants?: Record<string, string> | null; tier: ListTier; quantity: number }[]) =>
    call<{ saved: number; skipped: number }>(`/lists/${id}/items`, { method: 'POST', body: JSON.stringify({ items }) });
export const setListQty = (id: string, itemId: string, quantity: number) => call<{ ok: true }>(`/lists/${id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
export const removeListItem = (id: string, itemId: string) => call<{ ok: true }>(`/lists/${id}/items/${itemId}`, { method: 'DELETE' });
export const saveOrderToList = (orderId: string, target: { listId?: string; name?: string }) =>
    call<{ listId: string; saved: number; skipped: number }>(`/lists/from-order/${orderId}`, { method: 'POST', body: JSON.stringify(target) });

export const tierLabel = (t: ListTier, n = 2) => (t === 'truck' ? (n === 1 ? 'truck' : 'trucks') : t === 'pallet' ? (n === 1 ? 'pallet' : 'pallets') : (n === 1 ? 'case' : 'cases'));
