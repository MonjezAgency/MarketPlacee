import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * The visible brand is "Ali FMCG" (it was "Atlantis"). Text stored before the rename —
 * notifications, order delivery labels, support messages, status reasons — still says
 * "Atlantis", and those records are history, so they are not rewritten in the database.
 * Responses show the current name instead.
 *
 * Left alone: domains and addresses (atlantisfmcg.com), code-like tokens (ATLANTIS_COLLECTION,
 * AtlantisMarketplace), the legal entity name, and a value that is exactly "Atlantis"/"ATLANTIS"
 * (those are stored codes the app compares, e.g. a delivery charge's paidTo).
 */
const LEGAL = 'Atlantis FMCG SRL';
const BRAND_RX = /(?<![A-Za-z0-9_@.\-/])(Atlantis|ATLANTIS)( FMCG| fmcg)?(?![A-Za-z0-9_@\-])(?!\.(?:com|ro|eu)\b)/g;

export function displayBrand(text: string): string {
    if (!text || (text.indexOf('Atlantis') < 0 && text.indexOf('ATLANTIS') < 0)) return text;
    if (text === 'Atlantis' || text === 'ATLANTIS') return text;
    const parts = text.split(LEGAL);
    return parts.map((p) => p.replace(BRAND_RX, (_m, word: string) => (word === 'ATLANTIS' ? 'ALI FMCG' : 'Ali FMCG'))).join(LEGAL);
}

export function rebrandDeep<T>(value: T, depth = 0): T {
    if (depth > 40 || value == null) return value;
    if (typeof value === 'string') return displayBrand(value) as unknown as T;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) value[i] = rebrandDeep(value[i], depth + 1);
        return value;
    }
    if (typeof value === 'object') {
        if (value instanceof Date || Buffer.isBuffer(value) || value instanceof StreamableFile) return value;
        for (const k of Object.keys(value as any)) (value as any)[k] = rebrandDeep((value as any)[k], depth + 1);
    }
    return value;
}

@Injectable()
export class BrandDisplayInterceptor implements NestInterceptor {
    intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(map((data) => (data instanceof StreamableFile || Buffer.isBuffer(data) ? data : rebrandDeep(data))));
    }
}
