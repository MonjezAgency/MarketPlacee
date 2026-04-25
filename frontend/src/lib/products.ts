import { Product, ProductStatus } from '@/lib/types';
export type { Product, Category } from './types';

export { ProductStatus };

export const PRODUCTS: Product[] = [
    {
        "id": "1",
        "name": "Aquaphor Skin Protect & Repair Ointment",
        "brand": "Eucerin",
        "price": 26.052024327267468,
        "unit": "unit",
        "minOrder": 10,
        "image": "https://i5.walmartimages.com/asr/1d59b00e-1a8a-4366-813c-18ebc89e8732_1.e0f382fc8bab087977b36b6efd8339b6.jpeg?odnHeight=450&odnWidth=450&odnBg=ffffff",
        "images": [],
        "stock": 100,
        "inStock": true,
        "category": "Personal Care",
        "ean": "4005800019876",
        "status": ProductStatus.APPROVED
    },
    {
        "id": "2",
        "name": "Pregnacare Breastfeeding",
        "brand": "Vitabiotics",
        "price": 30.402510311036444,
        "unit": "unit",
        "minOrder": 10,
        "image": "https://images.openfoodfacts.org/images/products/502/126/523/2062/front_en.14.400.jpg",
        "images": [],
        "stock": 50,
        "inStock": true,
        "category": "Personal Care",
        "ean": "5021265232062",
        "status": ProductStatus.APPROVED
    },
];

export const CATEGORIES_LIST: string[] = [
    'Beverages', 'Soft Drinks', 'Energy Drinks', 'Coffee & Tea',
    'Snacks & Biscuits', 'Chocolates & Sweets', 'Confectionery',
    'Dairy & Eggs', 'Frozen Food', 'Bakery & Bread',
    'Pantry & Grains', 'Canned & Jarred Food', 'Spices & Condiments',
    'Meat & Poultry', 'Seafood',
    'Personal Care', 'Beauty & Makeup', 'Fragrances & Perfumes',
    'Hair Care', 'Skincare', 'Oral Care', 'Health & Wellness',
    'Baby Care', 'Pet Care',
    'Household & Cleaning', 'Laundry & Detergents', 'Paper & Plastic',
    'Home & Kitchen', 'Electronics & Accessories', 'Office & Stationery',
    'Tobacco & Accessories', 'Toys & Games', 'Other'
];

export const BRANDS: string[] = [
    'Coca-Cola', 'Pepsi', 'Red Bull', 'Monster', 'Nescafe', 'Starbucks',
    'L\'Oreal', 'Nivea', 'Dove', 'Colgate', 'Oral-B', 'Gillette',
    'P&G', 'Unilever', 'Henkel', 'Reckitt', 'Johnson & Johnson', 'Beiersdorf',
    'Ferrero', 'Mars', 'Mondelez', 'Nestle', 'Kellogg\'s', 'Danone',
    'Vitabiotics', 'Eucerin', 'La Roche-Posay', 'Vichy', 'Mexx'
];
