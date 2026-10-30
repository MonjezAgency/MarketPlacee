import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const PHOTOROOM_URL = 'https://image-api.photoroom.com/v2/edit';
const OUTPUT_SIZE = '1200x1200';
const PADDING = '0.08';

/**
 * Photoroom: puts a product photo on a pure white square. The key stays on the
 * server (PHOTOROOM_API_KEY). A sandbox key (it starts with "sandbox_") is free
 * but its results carry a watermark, so they are previews and are never saved
 * as a product photo (ImageDiscoveryService.apply refuses them).
 */
@Injectable()
export class PhotoroomService {
    private readonly logger = new Logger(PhotoroomService.name);

    private get key() { return (process.env.PHOTOROOM_API_KEY || '').trim(); }
    get configured() { return !!this.key; }
    get testMode() { return this.key.startsWith('sandbox_'); }

    async whiteBackground(image: Buffer, type: string): Promise<Buffer> {
        if (!this.key) throw new ServiceUnavailableException({ code: 'NOT_CONFIGURED', message: 'White backgrounds aren’t set up yet.' });
        const form = new FormData();
        form.append('imageFile', new Blob([new Uint8Array(image)], { type }), 'product');
        form.append('removeBackground', 'true');
        form.append('background.color', 'FFFFFF');
        form.append('outputSize', OUTPUT_SIZE);
        form.append('padding', PADDING);
        form.append('export.format', 'png');
        const res = await fetch(PHOTOROOM_URL, { method: 'POST', headers: { 'x-api-key': this.key }, body: form, signal: AbortSignal.timeout(60_000) }).catch((e) => {
            this.logger.warn(`[photoroom] request failed: ${e?.name}`);
            return null;
        });
        if (!res || !res.ok) {
            if (res) this.logger.warn(`[photoroom] HTTP ${res.status}`);
            throw new ServiceUnavailableException({ code: 'WHITEN_FAILED', message: 'The white background couldn’t be made right now. Try again in a minute.' });
        }
        return Buffer.from(await res.arrayBuffer());
    }
}
