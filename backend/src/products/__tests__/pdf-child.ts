/**
 * Jest's module sandbox can't load pdf.js's ES-module worker, so PDF tests
 * run the extractor in a plain Node process — the same way the server runs it.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function analyseInChild(files: Record<string, Buffer>): Record<string, { ok: true; value: any } | { ok: false; code: string; message: string }> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-test-'));
    try {
        const names = Object.keys(files);
        names.forEach((n, i) => fs.writeFileSync(path.join(dir, `${i}.pdf`), files[n]));
        const script = `
            require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
            const fs = require('fs'); const path = require('path');
            const { analysePdf } = require(${JSON.stringify(path.resolve(__dirname, '../pdf-import.ts'))});
            (async () => {
                const out = {};
                const names = ${JSON.stringify(names)};
                for (let i = 0; i < names.length; i++) {
                    try { out[names[i]] = { ok: true, value: await analysePdf(fs.readFileSync(path.join(${JSON.stringify(dir)}, i + '.pdf')), names[i]) }; }
                    catch (e) { out[names[i]] = { ok: false, code: (e && e.response && e.response.code) || 'error', message: (e && e.message) || String(e) }; }
                }
                process.stdout.write('@@' + JSON.stringify(out));
            })();`;
        const stdout = execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
        return JSON.parse(stdout.slice(stdout.indexOf('@@') + 2));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
