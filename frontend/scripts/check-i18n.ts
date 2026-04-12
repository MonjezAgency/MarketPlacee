import { en } from '../src/locales/en';
import { ar } from '../src/locales/ar';

function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null
      ? getKeys(v as Record<string, unknown>, path)
      : [path];
  });
}

// Defensive import validation
if (!en || typeof en !== 'object' || Object.keys(en).length === 0) {
  console.error(
    '\n❌ Failed to import en.ts\n' +
    '   Received: ' + JSON.stringify(en) + '\n' +
    '   Check: is it "export const en = {}" or "export default {}"?\n'
  );
  process.exit(1);
}

if (!ar || typeof ar !== 'object' || Object.keys(ar).length === 0) {
  console.error(
    '\n❌ Failed to import ar.ts\n' +
    '   Received: ' + JSON.stringify(ar) + '\n' +
    '   Check: is it "export const ar = {}" or "export default {}"?\n'
  );
  process.exit(1);
}

// Compute keys
const enKeys = new Set(getKeys(en as Record<string, unknown>));
const arKeys = new Set(getKeys(ar as Record<string, unknown>));

// Sanity check — warn if suspiciously few keys
if (enKeys.size < 10) {
  console.warn(
    `\n⚠️  Only ${enKeys.size} keys found in en.ts` +
    ' — verify the import is loading correctly\n'
  );
}

const missingInAr = Array.from(enKeys).filter(k => !arKeys.has(k as string));
const missingInEn = Array.from(arKeys).filter(k => !enKeys.has(k as string));

if (missingInAr.length > 0) {
  console.error(`\n❌ ${missingInAr.length} keys missing in ar.ts:`);
  missingInAr.forEach(k => console.error(`   - ${k}`));
}
if (missingInEn.length > 0) {
  console.warn(`\n⚠️  ${missingInEn.length} keys in ar.ts but not in en.ts:`);
  missingInEn.forEach(k => console.warn(`   - ${k}`));
}

if (missingInAr.length > 0) {
  console.error('\n🛑 Build blocked: Fix missing Arabic translations before deploying.\n');
  process.exit(1);
} else {
  console.log('✅ i18n check passed: All en.ts keys exist in ar.ts.\n');
}
