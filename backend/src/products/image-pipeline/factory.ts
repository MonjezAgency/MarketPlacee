import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { buildProviders, HostQueue } from '../product-data-providers';
import { PhotoroomService } from '../photoroom.service';
import type { Budget } from './budget';
import { SourceHttp, type LookupCache } from './http';
import { ImagePipeline, type PipelineDeps } from './image-pipeline';
import { barcodeSpider, eanDb, goUpc, openFacts, serper, shutterstock, upcItemDb } from './sources';
import { VisionGate } from './vision';

const STYLE_DIR = join(process.cwd(), 'assets', 'image-style');

async function styleImages(): Promise<Buffer[]> {
    const names = (await readdir(STYLE_DIR)).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort().slice(0, 2);
    return Promise.all(names.map((n) => readFile(join(STYLE_DIR, n))));
}

/** Paid cut-outs stay off until the owner decides on them. A live key alone turns nothing on. */
const liveCutouts = () => (process.env.PHOTOROOM_LIVE || '').trim() === 'true';

/** Every source, in the order they are asked; each one decides from its own key whether it is on. */
export function buildPipeline(cache: LookupCache, budget: Budget, extra: Partial<PipelineDeps> = {}) {
    const http = new SourceHttp(cache);
    const photoroom = new PhotoroomService();
    const lookups = [openFacts(buildProviders(new HostQueue(Number(process.env.PRODUCT_DATA_PER_MINUTE) || 12))), upcItemDb(http, budget), eanDb(http, budget), goUpc(http, budget), barcodeSpider(http, budget)];
    const searches = [serper(http, budget), shutterstock(http)];
    const vision = new VisionGate(cache, fetch, { budget });
    const deps: PipelineDeps = {
        lookups, searches, vision, cache, style: styleImages,
        removeBackground: (image) => photoroom.segment(image),
        cutoutBlocked: () => (!liveCutouts() ? 'paid_cutouts_off' : !photoroom.configured ? 'photoroom_not_configured' : photoroom.testMode ? 'photoroom_sandbox_key' : null),
        ...(photoroom.testMode ? { previewBackground: (image: Buffer) => photoroom.sandboxPreview(image) } : {}),
        ...extra,
    };
    return { pipeline: new ImagePipeline(deps), deps, photoroom };
}
