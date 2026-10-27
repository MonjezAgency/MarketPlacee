import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SecurityService } from './security.service';

@Catch()
export class SecurityExceptionFilter implements ExceptionFilter {
    constructor(private securityService: SecurityService) { }

    async catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const ip = request.ip;
        const user = (request as any).user;
        const url = request.url;
        const method = request.method;

        // Detect Security Anomalies based on HTTP Status
        if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
            this.securityService.logEvent({
                level: 'WARN',
                eventType: status === HttpStatus.UNAUTHORIZED ? 'UNAUTHORIZED_ACCESS' : 'FORBIDDEN_ACCESS',
                description: `Failed access attempt to ${url}`,
                ip,
                userId: user?.userId,
                path: url,
                method,
            });
        }

        if (status === HttpStatus.TOO_MANY_REQUESTS) {
            this.securityService.logEvent({
                level: 'WARN',
                eventType: 'RATE_LIMIT_EXCEEDED',
                description: `Rate limit hit by IP: ${ip}`,
                ip,
                path: url,
                method,
            });
        }

        if (status === HttpStatus.NOT_FOUND) {
            // Could be endpoint scanning
            this.securityService.logEvent({
                level: 'INFO',
                eventType: 'NOT_FOUND_SCAN',
                description: `404 encountered for ${url}`,
                ip,
                path: url,
                method,
            });
        }

        if (!(exception instanceof HttpException)) {
            new Logger('ExceptionFilter').error(`${method} ${url} → 500: ${(exception as any)?.message || exception}`);
        }

        // Default Nest behavior for the response
        // Keep the structured fields our own exceptions carry (e.g. { code:
        // 'EMAIL_NOT_VERIFIED' }, { code: 'ORIGIN_MISMATCH', productIds })
        // so clients can branch on a stable code.
        const body = exception instanceof HttpException ? exception.getResponse() : null;
        const extra = body && typeof body === 'object' ? { ...(body as Record<string, unknown>) } : {};
        delete (extra as any).statusCode; delete (extra as any).error;
        response.status(status).json({
            ...extra,
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            message: exception instanceof HttpException
                ? (typeof (extra as any).message === 'string' || Array.isArray((extra as any).message) ? (extra as any).message : (exception as any).message)
                : publicErrorMessage(exception),
        });
    }
}

/**
 * Message for a non-HTTP exception. Plain Errors keep their message (legacy
 * behaviour: some services throw readable Errors), but database client errors
 * never reach the client: they carry SQL fragments, column names and server
 * file paths. They are logged on the server (see catch()).
 */
export function publicErrorMessage(exception: unknown): string {
    const name = String((exception as any)?.name || (exception as any)?.constructor?.name || '');
    if (/^PrismaClient/.test(name)) return 'Internal server error';
    return (exception as any)?.message || 'Internal server error';
}
