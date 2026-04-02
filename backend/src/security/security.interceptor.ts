import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SecurityService } from './security.service';

@Injectable()
export class SecurityInterceptor implements NestInterceptor {
    private readonly logger = new Logger('SecurityInterceptor');

    constructor(private securityService: SecurityService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const { method, url, ip, headers, body } = request;
        const user = request.user;

        // 1. Detect suspiciously large payloads
        const contentLength = parseInt(headers['content-length'] || '0');
        if (contentLength > 1000000) { // 1MB threshold
            this.securityService.logEvent({
                level: 'WARN',
                eventType: 'LARGE_PAYLOAD',
                description: `Suspiciously large payload detected: ${contentLength} bytes`,
                ip,
                userId: user?.userId,
                path: url,
                method,
                metadata: { contentLength },
            });
        }

        // 2. Detect basic XSS/SQLi in body/query (simple heuristic)
        const dangerousPatterns = [
            /<script\b[^>]*>([\s\S]*?)<\/script>/gim,
            /UNION\s+SELECT/gi,
            /OR\s+1=1/gi,
            /DROP\s+TABLE/gi,
        ];

        const bodyStr = JSON.stringify(body || {});
        const queryStr = JSON.stringify(request.query || {});

        for (const pattern of dangerousPatterns) {
            if (pattern.test(bodyStr) || pattern.test(queryStr)) {
                this.securityService.logEvent({
                    level: 'CRITICAL',
                    eventType: 'INJECTION_ATTEMPT',
                    description: `Dangerous pattern detected in request: ${pattern.source}`,
                    ip,
                    userId: user?.userId,
                    path: url,
                    method,
                    payload: body,
                });
                // Block the request immediately
                throw new BadRequestException('Request contains invalid characters');
            }
        }

        // 3. Sanitize string fields in body — strip HTML tags to prevent stored XSS.
        //    Modifies the request body in-place before it reaches the controller.
        if (body && typeof body === 'object') {
            this.sanitizeObject(body);
        }

        return next.handle().pipe(
            tap({
                error: (err) => {
                    // Errors are handled by the SecurityExceptionFilter
                },
            }),
        );
    }

    /**
     * Recursively strip HTML tags from all string values in an object.
     * Skips fields that are legitimately expected to hold URLs or base64 data.
     */
    private sanitizeObject(obj: Record<string, any>): void {
        const HTML_TAG_PATTERN = /<[^>]+>/g;
        // Fields that may contain HTML-like content legitimately (e.g. base64 image uploads)
        const skipFields = new Set(['avatar', 'imageUrl', 'images', 'frontImageUrl', 'backImageUrl', 'selfieUrl', 'pdfUrl']);

        for (const key of Object.keys(obj)) {
            if (skipFields.has(key)) continue;
            const val = obj[key];
            if (typeof val === 'string') {
                obj[key] = val.replace(HTML_TAG_PATTERN, '');
            } else if (val && typeof val === 'object' && !Array.isArray(val)) {
                this.sanitizeObject(val);
            } else if (Array.isArray(val)) {
                for (let i = 0; i < val.length; i++) {
                    if (typeof val[i] === 'string') {
                        val[i] = val[i].replace(HTML_TAG_PATTERN, '');
                    } else if (val[i] && typeof val[i] === 'object') {
                        this.sanitizeObject(val[i]);
                    }
                }
            }
        }
    }
}
