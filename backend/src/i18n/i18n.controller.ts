import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { I18nService } from './i18n.service';

/**
 * Public i18n endpoint. No auth — any visitor (including
 * unauthenticated browsers) needs to be able to translate the
 * marketing pages. Throttled at a higher-than-default rate
 * because a single page load can fire one batched request with
 * up to ~200 strings; subsequent loads hit the in-memory cache
 * and return instantly.
 */
@Controller('i18n')
export class I18nController {
    constructor(private readonly svc: I18nService) {}

    @Post('translate')
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    async translate(
        @Body() body: { texts?: string[]; targetLocale?: string },
    ): Promise<{ translations: string[] }> {
        const texts = Array.isArray(body?.texts) ? body!.texts! : null;
        const targetLocale = (body?.targetLocale || '').toString().toLowerCase().trim();
        if (!texts) throw new BadRequestException('texts must be a string array');
        if (!targetLocale) throw new BadRequestException('targetLocale is required');
        // Cap batch size to avoid abusive payloads
        const capped = texts.slice(0, 400).map((t) => (typeof t === 'string' ? t.slice(0, 1000) : ''));
        return this.svc.translateBatch(capped, targetLocale);
    }
}
