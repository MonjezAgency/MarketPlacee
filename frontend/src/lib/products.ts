export enum ProductStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED'
}

export interface Product {
    id: string;
    name: string;
    brand: string;
    price: number;
    basePrice?: number;
    supplierId?: string;
    unit: string;
    minOrder: number;
    image: string;
    images: string[];
    stock: number;
    inStock: boolean;
    category: string;
    ean?: string;
    bulkSave?: boolean;
    rating?: number;
    reviews?: number;
    reviewsCount?: number;
    isNew?: boolean;
    description?: string;
    supplier?: {
        name: string;
        companyName?: string;
    };
    status: ProductStatus;
    variants?: { name: string; values: string[] }[];
}

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
    'Soft Drinks',
    'Energy Drinks',
    'Coffee & Tea',
    'Snacks & Sweets',
    'Personal Care',
    'Home Care',
    'Makeup',
    'Perfume',
];

export const BRANDS: string[] = [
    'Eucerin',
    'Vitabiotics',
    'Mexx',
    'Nivea',
    'L\'Oreal',
    'Unilever',
    'Henkel',
    'Reckitt',
    'Johnson & Johnson',
    'P&G',
    'Beiersdorf',
    'Colgate',
];
