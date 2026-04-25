import { fetchProducts } from './src/lib/api';

async function main() {
    try {
        const products = await fetchProducts();
        console.log('Valid Product IDs:', products.slice(0, 5).map(p => p.id));
    } catch (err) {
        console.error('Error:', err);
    }
}

main();
