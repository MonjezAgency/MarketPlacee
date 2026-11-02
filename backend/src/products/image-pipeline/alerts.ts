import type { Logger } from '@nestjs/common';

const KEY = 'imagePipeline:alert';

/** The one thing admins must see about the image pipeline: why nothing is being approved by itself. */
export interface VisionAlert { code: string; status?: number; scope: string; at: string }

interface Store {
    appConfig: {
        findUnique(a: { where: { key: string } }): Promise<{ value: string } | null>;
        upsert(a: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }): Promise<unknown>;
        deleteMany(a: { where: { key: string } }): Promise<unknown>;
    };
}

/**
 * Stored for the admin screens and logged at error, once per scope (an upload,
 * or an hour outside uploads), however many products hit the same dead key.
 * The status code is enough to act on: nothing about the key goes in here.
 */
export async function raiseVisionAlert(store: Store, logger: Pick<Logger, 'error'>, alert: Omit<VisionAlert, 'at'>): Promise<boolean> {
    const current = await readVisionAlert(store);
    if (current?.scope === alert.scope && current.code === alert.code) return false;
    const value = JSON.stringify({ ...alert, at: new Date().toISOString() });
    await store.appConfig.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    logger.error(`[images] AI vision check unavailable (${alert.code}${alert.status ? `, HTTP ${alert.status}` : ''}): nothing is approved automatically until it is fixed. Check OPENROUTER_API_KEY.`);
    return true;
}

export async function readVisionAlert(store: Store): Promise<VisionAlert | null> {
    const row = await store.appConfig.findUnique({ where: { key: KEY } }).catch(() => null);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
}

export const clearVisionAlert = (store: Store) => store.appConfig.deleteMany({ where: { key: KEY } });
