import * as fs from 'fs';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { SecurityExceptionFilter } from './security/security.exception-filter';
import { SecurityService } from './security/security.service';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SupabaseStorageService } from './storage/supabase-storage.service';

async function bootstrap() {
    // try to load .env if it exists (for local development)
    try {
        if (fs.existsSync(join(process.cwd(), '.env'))) {
            const envContent = fs.readFileSync(join(process.cwd(), '.env'), 'utf-8');
            envContent.split('\n').filter(line => line.trim() && !line.startsWith('#')).forEach(line => {
                const [key, ...values] = line.split('=');
                if (key && !process.env[key.trim()]) {
                    process.env[key.trim()] = values.join('=').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
                }
            });
        }
    } catch (e) {
        console.log('Failed to parse .env file');
    }

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false, // Disables default NestJS body parser (which forces 100kb limit)
    });

    // 1. FIRST: Trust proxy for Railway/SSL termination
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    // Diagnostic Request Logger
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(`[REQUEST] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        });
        next();
    });

    // Note: KYC files are now stored in Supabase Storage (not local disk).
    // Local /uploads/ serving kept only for any legacy files already in the DB.
    // New uploads never touch the local filesystem.
    if (require('fs').existsSync(join(process.cwd(), 'uploads'))) {
        app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
    }

    // 2. SECOND: Raw body for Stripe webhooks (must be before regular parsers)
    app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

    // 3. THIRD: Cookie parser
    app.use(cookieParser());

    // 4. FOURTH: Increase payload size limit to support high-res KYC images (10MB+)
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // 5. FIFTH: Dynamic CORS matching
    const frontendUrl = process.env.FRONTEND_URL;
    
    app.enableCors({
        origin: (origin: string | undefined, callback: Function) => {
            const allowedOrigins = [
                frontendUrl,
                'https://marketpl7ce.vercel.app',
                'http://localhost:3000',
                'http://127.0.0.1:3000',
            ].filter(Boolean) as string[];

            // Allow requests with no origin (mobile apps, Postman, server-to-server)
            if (!origin) return callback(null, true);

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.error(`[CORS BLOCKED] Origin: ${origin}`);
            return callback(new Error(`CORS blocked: ${origin}`));
        },
        credentials: true,
        methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Cache-Control',
            'Pragma',
            'Expires',
            'stripe-signature'
        ],
        exposedHeaders: ['Set-Cookie'],
    });

    // Security headers
    app.use(helmet({
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: process.env.NODE_ENV === 'production'
            ? {
                  directives: {
                      defaultSrc: ["'self'"],
                      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
                      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                      imgSrc: ["'self'", "data:", "blob:", "https://*.stripe.com", "https://*.shoppy.gg"],
                      connectSrc: [
                          "'self'", 
                          frontendUrl, 
                          "https://api.stripe.com",
                          "https://checkout.stripe.com",
                          "wss://marketplace-backend-production-539c.up.railway.app",
                          "https://marketplace-backend-production-539c.up.railway.app"
                      ].filter(Boolean) as string[],
                      frameSrc: ["'self'", "https://js.stripe.com", "https://checkout.stripe.com"],
                      fontSrc: ["'self'", "https://fonts.gstatic.com"],
                      objectSrc: ["'none'"],
                      upgradeInsecureRequests: [],
                  },
              }
            : false,
    }));

    const securityService = app.get(SecurityService);
    app.useGlobalFilters(new SecurityExceptionFilter(securityService));
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: process.env.NODE_ENV === 'production',
    }));

    // WebSocket support
    app.useWebSocketAdapter(new IoAdapter(app));

    // Ensure Supabase KYC bucket exists on startup
    try {
        const storage = app.get(SupabaseStorageService);
        await storage.ensureBucketExists();
    } catch (e) {
        console.warn('[BOOTSTRAP] Supabase bucket check skipped:', e.message);
    }

    const port = process.env.PORT || 3005;
    await app.listen(port, '0.0.0.0');
    console.log(`[BOOTSTRAP] Server running on port ${port}`);
    console.log(`[BOOTSTRAP] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[BOOTSTRAP] FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set'}`);
    console.log(`[BOOTSTRAP] DATABASE_URL: ${process.env.DATABASE_URL ? '***set***' : '!!! NOT SET !!!'}`);
}

// Catch bootstrap errors (DB connection, missing modules, etc.)
bootstrap().catch((err) => {
    console.error('[FATAL] Bootstrap failed:', err);
    process.exit(1);
});

// Catch unhandled rejections so Railway logs the real error instead of silently crashing
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    process.exit(1);
});
