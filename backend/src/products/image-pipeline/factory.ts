import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { buildProviders, HostQueue } from '../product-data-providers';
import { PhotoroomService } from '../photoroom.service';
import { SourceHttp, type LookupCache } from './http';
import { ImagePipeline, type PipelineDeps } from './image-pipeline';
import { barcodeSpider, brave, eanDb, eanSearch, goUpc, openFacts, serper, shutterstock, upcItemDb } from './sources';
import { VisionGate } from './vision';

const STYLE_DIR = join(process.cwd(), 'assets', 'image-style');

async function styleImages(): Promise<Buffer[]> {
    const names = (await readdir(STYLE_DIR)).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort().slice(0, 2);
    return Promise.all(names.map((n) => readFile(join(STYLE_DIR, n))));
}

/** Every source that exists; each one decides from its own key whether it is on. */
export function buildPipeline(cache: LookupCache, extra: Partial<PipelineDeps> = {}) {
    const http = new SourceHttp(cache);
    const photoroom = new PhotoroomService();
    const lookups = [openFacts(buildProviders(new HostQueue(Number(process.env.PRODUCT_DATA_PER_MINUTE) || 12))), eanSearch(http), eanDb(http), goUpc(http), barcodeSpider(http), upcItemDb(http)];
    const searches = [serper(http), brave(http), shutterstock(http)];
    const vision = new VisionGate(cache);
    const deps: PipelineDeps = {
        lookups, searches, vision, cache, style: styleImages,
        removeBackground: (image) => photoroom.segment(image),
        cutoutBlocked: () => (!photoroom.configured ? 'photoroom_not_configured' : photoroom.testMode ? 'photoroom_sandbox_key: a live key is needed' : null),
        ...extra,
    };
    return { pipeline: new ImagePipeline(deps), deps, photoroom };
}
