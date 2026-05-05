import { Injectable, Logger } from '@nestjs/common';
import type { EanProductResult } from './ean.service';

/**
 * In-memory cache for EAN lookups.
 *
 * Why in-memory and not Redis? The marketplace runs on a single Railway dyno
 * and EAN lookups are ~rare (only on bulk uploads / single-product creation),
 * so a small process-local Map is sufficient. If we ever scale horizontally,
 * swap this implementation for ioredis without changing callers.
 *
 * Key  = `${ean}|${normalizedTitle ?? ''}|${imageCount}` so two requests for
 *        the same EAN with different requested image counts don't collide.
 * TTL  = 7 days (per user spec).
 * Cap  = 5,000 entries to bound memory; oldest evicted first.
 */
export interface CachedEanResult extends EanProductResult {
    cached: boolean;        // Always true when read out of cache (set by service)
    confidence_score?: number;
    cachedAt: number;
}

interface CacheEntry {
    value: Omit<CachedEanResult, 'cached'>;
    expiresAt: number;
    insertedAt: number;
}

@Injectable()
export class EanCacheService {
    private readonly logger = new Logger(EanCacheService.name);
    private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    private readonly MAX_ENTRIES = 5000;
    private readonly store = new Map<string, CacheEntry>();

    private buildKey(ean: string, title?: string, imageCount: number = 3): string {
        const normTitle = (title || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return `${String(ean).trim()}|${normTitle}|${imageCount}`;
    }

    get(ean: string, title?: string, imageCount: number = 3): CachedEanResult | null {
        const key = this.buildKey(ean, title, imageCount);
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return { ...entry.value, cached: true };
    }

    set(
        ean: string,
        title: string | undefined,
        imageCount: number,
        value: Omit<CachedEanResult, 'cached' | 'cachedAt'>,
    ): void {
        const key = this.buildKey(ean, title, imageCount);
        const now = Date.now();

        // Capacity check — evict oldest if over the limit.
        if (this.store.size >= this.MAX_ENTRIES) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;
            for (const [k, e] of this.store.entries()) {
                if (e.insertedAt < oldestTime) {
                    oldestTime = e.insertedAt;
                    oldestKey = k;
                }
            }
            if (oldestKey) this.store.delete(oldestKey);
        }

        this.store.set(key, {
            value: { ...value, cachedAt: now },
            expiresAt: now + this.TTL_MS,
            insertedAt: now,
        });
    }

    /** Force-clear the cache for an EAN (e.g. when an admin manually corrects images). */
    invalidate(ean: string): number {
        const prefix = `${String(ean).trim()}|`;
        let removed = 0;
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) {
                this.store.delete(key);
                removed++;
            }
        }
        return removed;
    }

    stats() {
        return { size: this.store.size, maxEntries: this.MAX_ENTRIES, ttlMs: this.TTL_MS };
    }
}
