/**
 * Site-wide auto-translator. Listens for locale changes from
 * LanguageContext and translates EVERY visible English string in
 * the DOM (text nodes + selected attributes) into the target
 * language by calling the backend /i18n/translate endpoint, which
 * is backed by OpenRouter (Gemini 2.0 Flash).
 *
 * Why this exists:
 * The marketing pages (About / How It Works / Wholesale / Help /
 * Shipping / Terms / etc.) contain hundreds of hardcoded English
 * strings. Wrapping each one in a translation key would take days
 * and would still leave new content untranslated until the next
 * deploy. This translator runs at runtime, catches everything,
 * caches aggressively, and works on content that React hasn't
 * even rendered yet (via MutationObserver).
 *
 * Caching:
 * Translations are stored in localStorage keyed by locale. After
 * the first visit on each locale the page renders translated
 * content with zero network calls.
 *
 * Restoration:
 * The original English text node is preserved on a __i18nOrig
 * property of each Text node, so switching back to English is
 * instant and lossless — no re-fetch.
 */

const STORAGE_KEY = 'atlantis-auto-translate-v1';
const FLUSH_DELAY_MS = 60;
const SOURCE_LOCALE = 'en';

// locale -> (englishTrimmed -> translated)
const memCache = new Map<string, Map<string, string>>();
let cacheLoaded = false;

function apiBase(): string {
    if (typeof window === 'undefined') return '';
    return process.env.NEXT_PUBLIC_API_URL || '';
}

function loadCache() {
    if (cacheLoaded) return;
    cacheLoaded = true;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        Object.entries(parsed).forEach(([locale, dict]) => {
            if (dict && typeof dict === 'object') {
                memCache.set(locale, new Map(Object.entries(dict as Record<string, string>)));
            }
        });
    } catch {
        // Ignore corrupted cache.
    }
}

let saveTimer: any = null;
function saveCacheDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            const obj: Record<string, Record<string, string>> = {};
            memCache.forEach((m, locale) => {
                obj[locale] = Object.fromEntries(m);
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        } catch {
            // Quota exceeded etc. — silently drop, runtime still works.
        }
    }, 1500);
}

const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP',
    'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CANVAS', 'SVG',
]);

/**
 * Should this string be sent to the translator?
 * - Reject empty / whitespace-only.
 * - Reject pure-numeric / currency / punctuation strings.
 * - Reject emails, URLs, phone numbers, IDs that contain digits + dashes.
 * - Reject single brand tokens we explicitly want preserved.
 * - Require at least one Latin letter (otherwise it's already
 *   non-English or symbolic).
 */
function shouldTranslate(raw: string): boolean {
    const t = raw.trim();
    if (!t || t.length < 2) return false;
    if (!/[a-zA-Z]/.test(t)) return false;
    if (/^[\d\s\-+.,()€$£¥%/:#]+$/.test(t)) return false;
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) return false;
    if (/^https?:\/\//i.test(t)) return false;
    if (/^[A-Z]{2,5}$/.test(t)) return false; // ISO codes / abbrevs
    if (t === 'Atlantis' || t === 'Monjez') return false;
    return true;
}

const ATTR_NAMES = ['placeholder', 'alt', 'title', 'aria-label'];

interface PendingNode {
    type: 'text' | 'attr';
    node: Text | Element;
    attr?: string;
    original: string;        // raw with leading/trailing whitespace
    trimmed: string;         // key into the cache
}

let pendingNodes: PendingNode[] = [];
let pendingKeys: Set<string> = new Set();
let flushTimer: any = null;
let currentLocale: string = SOURCE_LOCALE;

function applyTranslation(item: PendingNode, translated: string) {
    if (!translated) return;
    // Preserve leading/trailing whitespace from the original — React
    // often relies on it for inline-flow spacing.
    const lead = item.original.match(/^\s*/)?.[0] ?? '';
    const trail = item.original.match(/\s*$/)?.[0] ?? '';
    const finalText = lead + translated + trail;

    if (item.type === 'text') {
        const n = item.node as Text;
        if (!n.isConnected) return;
        // Mark our update so MutationObserver can skip the feedback
        // loop on `characterData` mutations.
        (n as any).__i18nApplying = true;
        n.textContent = finalText;
        (n as any).__i18nApplying = false;
        (n as any).__i18nLoc = currentLocale;
    } else {
        const el = item.node as Element;
        if (!el.isConnected) return;
        (el as any)[`__i18nAttrApplying_${item.attr}`] = true;
        el.setAttribute(item.attr!, finalText);
        (el as any)[`__i18nAttrApplying_${item.attr}`] = false;
        (el as any)[`__i18nAttrLoc_${item.attr}`] = currentLocale;
    }
}

async function flushPending() {
    flushTimer = null;
    if (currentLocale === SOURCE_LOCALE) {
        pendingNodes = [];
        pendingKeys.clear();
        return;
    }
    if (pendingNodes.length === 0) return;

    const localeMap = memCache.get(currentLocale) ?? new Map<string, string>();
    memCache.set(currentLocale, localeMap);

    // First, apply anything that's already in cache.
    const stillPending: PendingNode[] = [];
    const need: string[] = [];
    const seen = new Set<string>();
    for (const item of pendingNodes) {
        const cached = localeMap.get(item.trimmed);
        if (cached !== undefined) {
            applyTranslation(item, cached);
        } else {
            stillPending.push(item);
            if (!seen.has(item.trimmed)) {
                seen.add(item.trimmed);
                need.push(item.trimmed);
            }
        }
    }
    pendingNodes = [];
    pendingKeys.clear();

    if (need.length === 0) return;

    // Network call — best-effort. On failure we leave the original
    // English in place rather than blanking the page.
    let translations: string[] = [];
    try {
        const resp = await fetch(`${apiBase()}/i18n/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: need, targetLocale: currentLocale }),
        });
        if (resp.ok) {
            const data = await resp.json();
            translations = Array.isArray(data?.translations) ? data.translations : [];
        }
    } catch {
        // Network down — silent fallback to English.
    }

    // Fill cache from response.
    if (translations.length === need.length) {
        for (let i = 0; i < need.length; i++) {
            localeMap.set(need[i], translations[i]);
        }
        saveCacheDebounced();
    }

    // Re-apply to all the still-pending nodes.
    for (const item of stillPending) {
        const t = localeMap.get(item.trimmed);
        if (t) applyTranslation(item, t);
    }
}

function queueFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushPending, FLUSH_DELAY_MS);
}

function queueNode(item: PendingNode) {
    const dedupeKey = `${item.type}::${item.trimmed}::${(item.node as any).__i18nNodeId ??
        ((item.node as any).__i18nNodeId = Math.random().toString(36).slice(2))}::${item.attr || ''}`;
    if (pendingKeys.has(dedupeKey)) return;
    pendingKeys.add(dedupeKey);
    pendingNodes.push(item);
}

function processTextNode(n: Text) {
    if (!n.parentElement) return;
    if (SKIP_TAGS.has(n.parentElement.tagName)) return;
    if (n.parentElement.closest('[data-no-translate]')) return;
    if ((n as any).__i18nApplying) return;

    // First time we see this node, freeze its English original.
    if ((n as any).__i18nOrig === undefined) {
        (n as any).__i18nOrig = n.textContent ?? '';
    }
    const original: string = (n as any).__i18nOrig;
    if (!shouldTranslate(original)) return;

    // Already translated for this locale? Skip.
    if ((n as any).__i18nLoc === currentLocale) return;

    queueNode({
        type: 'text',
        node: n,
        original,
        trimmed: original.trim(),
    });
}

function processAttributes(el: Element) {
    if (SKIP_TAGS.has(el.tagName)) return;
    if (el.closest('[data-no-translate]')) return;
    for (const attr of ATTR_NAMES) {
        const val = el.getAttribute(attr);
        if (!val) continue;
        if ((el as any)[`__i18nAttrApplying_${attr}`]) continue;
        const origKey = `__i18nAttrOrig_${attr}`;
        if ((el as any)[origKey] === undefined) {
            (el as any)[origKey] = val;
        }
        const original: string = (el as any)[origKey];
        if (!shouldTranslate(original)) continue;
        if ((el as any)[`__i18nAttrLoc_${attr}`] === currentLocale) continue;
        queueNode({
            type: 'attr',
            node: el,
            attr,
            original,
            trimmed: original.trim(),
        });
    }
}

function walkAndCollect(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) {
        processTextNode(root as Text);
        return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (SKIP_TAGS.has(el.tagName)) return;
    if (el.hasAttribute && el.hasAttribute('data-no-translate')) return;

    processAttributes(el);

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const e = node as Element;
                if (SKIP_TAGS.has(e.tagName)) return NodeFilter.FILTER_REJECT;
                if (e.hasAttribute && e.hasAttribute('data-no-translate')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    let cur: Node | null;
    while ((cur = walker.nextNode())) {
        if (cur.nodeType === Node.TEXT_NODE) {
            processTextNode(cur as Text);
        } else if (cur.nodeType === Node.ELEMENT_NODE) {
            processAttributes(cur as Element);
        }
    }
}

function restoreOriginals(root: Node) {
    const walk = (n: Node) => {
        if (n.nodeType === Node.TEXT_NODE) {
            const tn = n as Text;
            if ((tn as any).__i18nOrig !== undefined && (tn as any).__i18nLoc !== SOURCE_LOCALE) {
                (tn as any).__i18nApplying = true;
                tn.textContent = (tn as any).__i18nOrig;
                (tn as any).__i18nApplying = false;
                (tn as any).__i18nLoc = SOURCE_LOCALE;
            }
            return;
        }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const el = n as Element;
        for (const attr of ATTR_NAMES) {
            const orig = (el as any)[`__i18nAttrOrig_${attr}`];
            if (orig !== undefined && (el as any)[`__i18nAttrLoc_${attr}`] !== SOURCE_LOCALE) {
                (el as any)[`__i18nAttrApplying_${attr}`] = true;
                el.setAttribute(attr, orig);
                (el as any)[`__i18nAttrApplying_${attr}`] = false;
                (el as any)[`__i18nAttrLoc_${attr}`] = SOURCE_LOCALE;
            }
        }
        n.childNodes.forEach(walk);
    };
    walk(root);
}

let observer: MutationObserver | null = null;

function startObserver() {
    if (observer) return;
    if (typeof window === 'undefined') return;
    observer = new MutationObserver((mutations) => {
        if (currentLocale === SOURCE_LOCALE) return;
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach((n) => walkAndCollect(n));
            } else if (m.type === 'characterData') {
                const n = m.target;
                if (n.nodeType === Node.TEXT_NODE) {
                    const tn = n as Text;
                    if ((tn as any).__i18nApplying) continue;
                    // Real React update — refresh our captured original
                    // before re-translating so the new content is what
                    // we send to the translator.
                    (tn as any).__i18nOrig = tn.textContent ?? '';
                    (tn as any).__i18nLoc = undefined;
                    processTextNode(tn);
                }
            } else if (m.type === 'attributes' && m.attributeName) {
                if (ATTR_NAMES.includes(m.attributeName)) {
                    const el = m.target as Element;
                    if ((el as any)[`__i18nAttrApplying_${m.attributeName}`]) continue;
                    (el as any)[`__i18nAttrOrig_${m.attributeName}`] = el.getAttribute(m.attributeName) ?? '';
                    (el as any)[`__i18nAttrLoc_${m.attributeName}`] = undefined;
                    processAttributes(el);
                }
            }
        }
        queueFlush();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTR_NAMES,
    });
}

/**
 * Switch the page's display language. Called from LanguageContext
 * whenever the user picks a different locale.
 */
export function setAutoTranslateLocale(locale: string) {
    if (typeof window === 'undefined') return;
    loadCache();
    currentLocale = locale || SOURCE_LOCALE;
    startObserver();

    if (currentLocale === SOURCE_LOCALE) {
        restoreOriginals(document.body);
        return;
    }
    walkAndCollect(document.body);
    queueFlush();
}
