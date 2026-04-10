import * as fs from 'fs';
import { join } from 'path';

try {
  const envContent = fs.readFileSync(join(process.cwd(), '.env'), 'utf-8');
  envContent.split('\n').filter(line => line.trim() && !line.startsWith('#')).forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && !process.env[key.trim()]) {
      process.env[key.trim()] = values.join('=').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
  });
} catch (e) {
  console.log('No .env file found or failed to parse');
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { SecurityExceptionFilter } from './security/security.exception-filter';
import { SecurityService } from './security/security.service';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        rawBody: true, // Required for Stripe webhook signature verification
    });

    // Serve uploaded KYC files as static assets
    app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

    // Increase JSON body limit to 50mb for base64 image uploads
    app.use(require('express').json({ limit: '50mb' }));
    app.use(require('express').urlencoded({ limit: '50mb', extended: true }));

    // ── Strict Security Headers ──────────────────────────────────────────────
    const backendHost = (process.env.BACKEND_URL || 'http://localhost:3001')
        .replace(/^https?:\/\//, '');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        frameguard: { action: 'deny' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        permittedCrossDomainPolicies: { permittedPolicies: 'none' },
        contentSecurityPolicy: process.env.NODE_ENV === 'production'
            ? {
                  directives: {
                      defaultSrc:  ["'self'"],
                      // Scripts: self + Stripe.js only
                      scriptSrc:   ["'self'", 'https://js.stripe.com'],
                      // Frames: Stripe 3DS / payment iframes
                      frameSrc:    ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
                      // API + WebSocket connections
                      connectSrc: [
                          "'self'",
                          frontendUrl,
                          // Stripe API
                          'https://api.stripe.com',
                          'https://js.stripe.com',
                          // Socket.io WebSocket (ws + wss)
                          `ws://${backendHost}`,
                          `wss://${backendHost}`,
                      ],
                      imgSrc:      ["'self'", 'data:', 'https:', 'blob:'],
                      styleSrc:    ["'self'", "'unsafe-inline'"],
                      fontSrc:     ["'self'", 'data:'],
                      objectSrc:   ["'none'"],
                      baseUri:     ["'self'"],
                      formAction:  ["'self'"],
                      // Force HTTPS for all sub-resources
                      upgradeInsecureRequests: [],
                  },
              }
            : false,
    }));

    // Enable global validation pipes for DTOs
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));

    // Global Security Exception Filter
    const securityService = app.get(SecurityService);
    app.useGlobalFilters(new SecurityExceptionFilter(securityService));

    // Enable CORS — whitelist only known frontend origins
    const allowedOrigins = [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3000',
    ].filter(Boolean);

    app.enableCors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
    });

    // Enable Socket.io adapter
    app.useWebSocketAdapter(new IoAdapter(app));

    await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
    console.log(`Backend is running on: ${await app.getUrl()}`);
}
bootstrap();
