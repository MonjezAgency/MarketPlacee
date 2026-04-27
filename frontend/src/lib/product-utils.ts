import { Product } from './types';

const UNIT_KEYWORDS = ['CARTON', 'PALLET', 'UNIT', 'CASE', 'BOX', 'PACK', 'KG', 'GRAM', 'LITER', 'PCS', 'PIECES', 'PIECE'];

/**
 * Returns a cleaned-up category name.
 * If the current category is a logistics unit (e.g., 'Carton'), 
 * it attempts to derive a better category from the product name.
 */
export function getDisplayCategory(product: Product): string {
    const currentCat = product.category?.toUpperCase() || '';
    
    // If category is a unit or generic, try to derive it from name
    if (!currentCat || currentCat === 'GENERAL' || currentCat === 'OTHERS' || UNIT_KEYWORDS.includes(currentCat)) {
        const name = product.name.toLowerCase();
        
        // Beverages
        if (name.includes('pepsi') || name.includes('cola') || name.includes('fanta') || name.includes('sprite') || name.includes('soda')) return 'Soft Drinks';
        if (name.includes('red bull') || name.includes('monster') || name.includes('energy drink')) return 'Energy Drinks';
        if (name.includes('water') || name.includes('evian') || name.includes('perrier')) return 'Beverages';
        if (name.includes('coffee') || name.includes('nescafe') || name.includes('tea')) return 'Coffee & Tea';
        if (name.includes('juice')) return 'Juice & Nectars';
        
        // Food & Snacks
        if (name.includes('chocolate') || name.includes('ferrero') || name.includes('nutella')) return 'Chocolates & Sweets';
        if (name.includes('biscuit') || name.includes('cookie') || name.includes('oreo')) return 'Snacks & Biscuits';
        
        // Personal Care
        if (name.includes('shampoo') || name.includes('shave') || name.includes('gillette')) return 'Personal Care';
        if (name.includes('cream') || name.includes('nivea') || name.includes('dove') || name.includes('lotion')) return 'Skincare';
        
        // Home
        if (name.includes('detergent') || name.includes('laundry')) return 'Laundry & Detergents';

        // Fallback for units
        if (UNIT_KEYWORDS.includes(currentCat)) return 'General Distribution';
    }
    
    return product.category || 'General Distribution';
}
