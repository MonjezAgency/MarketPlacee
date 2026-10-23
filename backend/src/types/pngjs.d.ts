/** Minimal typing for pngjs (pure-JS PNG codec; ships no types). Only what the code and its tests use. */
declare module 'pngjs' {
    export class PNG {
        constructor(opts?: { width?: number; height?: number });
        width: number;
        height: number;
        data: Buffer;
        static sync: { read(buffer: Buffer): PNG; write(png: PNG): Buffer };
    }
}
