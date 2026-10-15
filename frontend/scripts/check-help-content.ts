/**
 * Help Center content check: unique slugs, every related ref and inline link
 * resolves, every heading id is unique within its article, and every
 * non-help internal link points at an existing app route.
 * Run: npx tsx scripts/check-help-content.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ARTICLES, CATEGORIES, blockText, findRef, headingId } from '../src/content/help';

const APP = join(__dirname, '..', 'src', 'app');
const errors: string[] = [];

/** Does /a/b/c match a route folder (allowing [param] segments and (group) folders)? */
function routeExists(path: string): boolean {
    const segs = path.split(/[?#]/)[0].split('/').filter(Boolean);
    const walk = (dir: string, i: number): boolean => {
        if (i === segs.length) return ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].some((f) => existsSync(join(dir, f)));
        if (!existsSync(dir)) return false;
        const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
        for (const e of entries) {
            if (e.name.startsWith('(') && walk(join(dir, e.name), i)) return true;
            if (e.name === segs[i] && walk(join(dir, e.name), i + 1)) return true;
            if (/^\[[^.]+\]$/.test(e.name) && walk(join(dir, e.name), i + 1)) return true;
        }
        return false;
    };
    return walk(APP, 0);
}

const seen = new Set<string>();
for (const a of ARTICLES) {
    const key = `${a.category}/${a.slug}`;
    if (seen.has(key)) errors.push(`duplicate article ${key}`);
    seen.add(key);
    if (!CATEGORIES.some((c) => c.id === a.category)) errors.push(`${key}: unknown category`);
    if (!a.blocks.length) errors.push(`${key}: no content`);
    for (const r of a.related || []) {
        if (!findRef(r)) errors.push(`${key}: related "${r}" does not exist`);
        if (r === key) errors.push(`${key}: relates to itself`);
    }
    const ids = new Set<string>();
    for (const b of a.blocks) if ('h2' in b || 'h3' in b) {
        const id = headingId('h2' in b ? b.h2 : (b as { h3: string }).h3);
        if (ids.has(id)) errors.push(`${key}: duplicate heading id "${id}"`);
        ids.add(id);
    }
    const text = [a.summary, ...(a.prerequisites || []), ...a.blocks.map(blockText)].join('\n');
    for (const m of Array.from(text.matchAll(/\]\(([^)]+)\)/g))) {
        const href = m[1];
        if (!href.startsWith('/')) { errors.push(`${key}: external or relative link "${href}"`); continue; }
        if (href.startsWith('/help/')) {
            const [, , c, s] = href.split(/[?#]/)[0].split('/');
            if (s ? !findRef(`${c}/${s}`) : !CATEGORIES.some((x) => x.id === c) && c !== 'all' && c !== 'search') errors.push(`${key}: broken help link "${href}"`);
        } else if (!routeExists(href)) errors.push(`${key}: no app route for "${href}"`);
    }
}

// Learning paths on the Help Center home page.
const home = readFileSync(join(APP, 'help', 'page.tsx'), 'utf8');
for (const line of home.split('\n').filter((l) => /_PATH = \[/.test(l))) for (const m of Array.from(line.matchAll(/'([a-z-]+\/[a-z0-9-]+)'/g))) if (!findRef(m[1])) errors.push(`help home: path ref "${m[1]}" does not exist`);
for (const c of CATEGORIES) if (!ARTICLES.some((a) => a.category === c.id)) errors.push(`category ${c.id} is empty`);

console.log(`${ARTICLES.length} articles in ${CATEGORIES.length} categories; ${ARTICLES.filter((a) => a.popular).length} popular.`);
if (errors.length) { console.error(errors.map((e) => `✗ ${e}`).join('\n')); process.exit(1); }
console.log('✓ all slugs, related refs, links and learning paths resolve');
