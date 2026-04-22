export const API_BASE_URL = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_API_URL || '/api') 
    : (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-539c.up.railway.app');

// Debugging: Helpful for identifying environment variable issues in production.
if (typeof window !== 'undefined') {
    console.log('--- SYSTEM CONNECTIVITY DIAGNOSTICS ---');
    console.log('Connecting to Backend at:', API_BASE_URL);
}
