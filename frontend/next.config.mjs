/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        unoptimized: true,
        domains: ['images.unsplash.com', 'plus.unsplash.com'],
    },
    async rewrites() {
        return [
            {
                source: '/api/:path((?!auth).*)',
                destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001'}/:path*`,
            },
        ];
    },
};

export default nextConfig;

