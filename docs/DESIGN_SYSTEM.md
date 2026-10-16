# Atlantis Design System

**Status: binding.** Read this before creating or changing any frontend page or component.
If a new requirement doesn't fit these rules, change this document in the same commit
(with the reason) rather than introducing a one-off exception.
When you touch an existing page, bring the parts you touch in line with these rules;
don't redesign unrelated areas.

Source of truth in code:

| What | Where |
|---|---|
| Colour tokens (light/dark) | `frontend/src/app/globals.css` → `--atl-*` variables |
| Tailwind names for the tokens, type scale, shadows, motion | `frontend/tailwind.config.ts` |
| Shared page primitives | `frontend/src/components/ds/index.tsx` |
| Supplier/admin workspace primitives | `frontend/src/components/supplier/ui.tsx` |

`frontend/src/lib/design-tokens.ts` is **legacy** (old blue/amber palette). Don't use it in new work.

---

## 1. Brand

- **Name:** Atlantis (never "Atlantis Marketplace Ltd" or a made-up legal entity). Wordmark: `ATLAN` in heading navy + `TIS.` in `#2EC4B6`, uppercase, `font-black tracking-tighter`. Mark: `/brand/atlantis-mark.png`.
- **Personality:** a calm, exact B2B trading desk. Confident, plain, never hype. Real figures or none.

### Colour

Use the token, not the hex, wherever a token exists.

| Role | Token / Tailwind | Light | Use |
|---|---|---|---|
| Heading / brand navy | `text-heading`, `bg-heading` | `#0B1F3A` | Headings, dark bands, primary buttons |
| Body text | `text-ink` | `#0F172A` | Running text on white |
| Secondary text | `text-ink-2` | `#334155` | Leads, descriptions |
| Muted text | `text-ink-3` | `#64748B` | Captions, meta (≥ 13 px only) |
| Faint | `text-ink-4` | `#94A3B8` | Icons, placeholders — never body text |
| Surface | `bg-surface` / `-2` / `-3` | `#FFF` / `#F6F8FA` / `#EEF1F4` | Page / alternate band / wells |
| Lines | `ring-line`, `border-line`, `line-strong` | `#E6E8EC` / `#CBD5E1` | Dividers, card outlines, inputs |
| Primary action | `bg-cta`, `hover:bg-cta-hover`, `text-cta-fg` | navy (teal in dark mode) | One primary CTA per view |
| Accent (text-safe teal) | `text-teal`, `bg-teal-soft` | `#0E7C74` / `#E6F8F6` | Links, eyebrows, selected states |
| Accent (decorative teal) | `#2EC4B6` | — | Dots, markers, focus rings, chart strokes. **Not for text on white** (fails contrast). |

Semantic status colours (text on tinted background, both AA):

| Status | Background | Text | Ring |
|---|---|---|---|
| Success / passed | `#ECFDF5` | `#047857` | `#A7F3D0` |
| Warning / needs attention | `#FFFBEB` | `#B45309` | `#FDE68A` |
| Danger / rejected | `#FEF2F2` | `#B91C1C` | `#FECACA` |
| Info | `#EFF6FF` | `#1E3A8A` | `#BFDBFE` |

Rules: no gradients except the subtle surface washes already used (dot grid, soft teal glow); no
purple/pink/orange accents; dark mode comes from the tokens — don't hard-code `bg-white` on
storefront surfaces (admin pages currently do; leave them unless you are redesigning them).

### Elevation and radius

| Token | Use |
|---|---|
| `shadow-card` | Resting cards that need lift (most cards use a ring instead) |
| `shadow-float` | Floating UI: popovers, illustration cards, the active item in a stack |
| `rounded-lg` (8) | Small controls inside cards, badges in tables |
| `rounded-xl` (12) | Buttons, inputs, list rows |
| `rounded-2xl` (16) | Cards |
| `rounded-3xl` (24) | Feature panels, illustration frames, maps |
| `rounded-full` | Pills, avatars, status dots |

Cards are `ring-1 ring-line` on `bg-surface`. Don't combine a ring, a border and a heavy shadow.

## 2. Typography

- **Families:** Inter (`font-sans`) for everything, with Cairo automatically rendering Arabic glyphs. Poppins (`font-heading`) is legacy — don't use it in new work.
- **Scale** (Tailwind names from `tailwind.config.ts`; use these on marketing, trust, help and policy pages instead of `text-[Npx]`):

| Name | Size / line-height | Use |
|---|---|---|
| `text-display` | 48 / 1.05, −0.025em, 700 | Page hero (desktop) |
| `text-display-sm` | 36 / 1.1 | Page hero (mobile) |
| `text-title` | 32 / 1.15 | Section heading (desktop) |
| `text-title-sm` | 26 / 1.2 | Section heading (mobile) |
| `text-subtitle` | 20 / 1.35, 600 | Card and feature titles, FAQ questions |
| `text-lead` | 18 / 1.6 | Hero and section leads (desktop) |
| `text-body` | 15 / 1.65 | Body text, lead on mobile |
| `text-small` | 13 / 1.5 | Meta, table captions, pills |
| `text-eyebrow` | 12, uppercase, 0.14em | Section eyebrows (teal) |

- Responsive pairs: hero `text-display-sm sm:text-display`; section `text-title-sm sm:text-title`; lead `text-body sm:text-lead`.
- `globals.css` still gives bare `h1`–`h4` Poppins and very large sizes (legacy base layer). Every heading must set `font-sans` plus a scale class (`<SectionHeader>` does this for you).
- One `h1` per page. Headings in order (`h1` → `h2` → `h3`); don't pick a heading level for its size.
- Line length: prose max `max-w-prose` (≈ 65–75 characters). Leads max `max-w-2xl`.
- Numbers in tables, prices and counters: `tabular-nums`.
- Sentence case for headings and buttons. No ALL CAPS except eyebrows.
- **Workspace pages** (supplier hub, admin) use the compact 12–15 px sizes already in `components/supplier/ui.tsx`; keep them consistent with that file.

## 3. Spacing and layout

- Spacing uses Tailwind's 4 px scale. Common steps: 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 28. No `px` values outside the scale (`mt-[37px]`).
- **Containers** (`<Container>`): `max-w-page` 1280 for page width, `max-w-content` 1088 for feature sections, `max-w-prose` 672 for text. Gutters: `px-4 sm:px-6 lg:px-8`.
- **Sections** (`<Section>`): `py-16 sm:py-24` default, `sm` = `py-12 sm:py-16`, `lg` = `py-20 sm:py-28`. Alternate bands use `tone="muted"` (`bg-surface-2`). Never stack two muted bands.
- Inside a section: header → content gap `mt-10 sm:mt-12`; grid gaps `gap-4` (cards) or `gap-8` (feature columns).
- **Breakpoints:** mobile < 640, tablet 640–1023 (`sm`, `md`), desktop ≥ 1024 (`lg`). Grids: 1 column on mobile, 2 on tablet, 3–4 on desktop. Two-column feature layouts switch at `lg`.
- Alignment: storefront text is start-aligned (`text-start`). The root `<body>` currently carries a stray `text-end`; every new page root sets `text-start` until that is removed globally.
- No horizontal page scroll at any width (wide tables scroll inside their own `overflow-x-auto` wrapper).

## 4. Components

Use the shared primitive if it exists; add to `components/ds` rather than restyling locally.

| Component | Rule |
|---|---|
| Buttons / CTA links | `<ButtonLink>`: `primary` (navy, one per view), `secondary` (outlined), `ghost` (teal text), `inverse` (on navy bands). Height 48 (`lg`) on marketing pages, 40 (`md`) in content. Form buttons in workspaces use `components/supplier/ui` `Button`. |
| Links in text | `text-teal font-medium hover:underline`. External links open in a new tab only when leaving the product, with `rel="noopener noreferrer"`. |
| Cards | `rounded-2xl ring-1 ring-line bg-surface p-5 sm:p-6`. Hover lift (`hover:shadow-card`) only when the whole card is a link. |
| Pills / badges | `<Pill>` with a semantic tone. Status always has text, never colour alone. |
| Tables | Header row `text-small text-ink-3 font-medium`, rows `border-b border-line`, cells `py-3 px-4`, numbers right-aligned `tabular-nums`. Wrap in `overflow-x-auto` with a `min-w-*` so mobile scrolls the table, not the page. |
| Accordions / FAQ | `<Faq>` (native `<details>`): keyboard and screen-reader friendly by default. |
| Inputs | `inputCls` / `selectCls` from `components/supplier/ui` (40 px, `rounded-lg`, `ring-line-strong`, teal focus ring). Every input has a visible `<label>`. |
| Modals | `Dialog` from `components/supplier/ui`: focus trapped, Esc closes, returns focus. No modal on marketing pages. |
| Navigation / footer | `components/layout/Navbar.tsx` / `Footer.tsx`. New public pages get a footer link only if they are part of the buyer or supplier journey. |
| Illustrations | `<Frame>` panels built from real UI pieces (cards, pills, barcodes) in Atlantis colours, or simple vector shapes. |

### Conversation UI (Support and order threads)

Shared in `frontend/src/components/support` (`messages.tsx`, `Composer.tsx`); don't build another chat style.

| Part | Rule |
|---|---|
| Workspace | One panel with a fixed height that fits the viewport; only the message list scrolls; the composer stays anchored at the bottom. No page scroll on desktop. |
| Tabs | Underline tabs inside the panel (Assistant / Order conversations), `aria-selected`, arrow keys switch. |
| Incoming | Assistant: Atlantis mark, `bg-surface-2` bubble. Team: person icon, white bubble with a teal start border and a "Team" label. Max width ≈ 40rem. |
| Outgoing | Navy (`bg-heading`) bubble, right-aligned, max ≈ 34rem, time or state (Sending… / Not sent + Retry) underneath. |
| Day groups | `DayDivider` (Today / Yesterday / date). Times are small `text-ink-4`. |
| Composer | `Composer`: 40 px controls, `rounded-xl`, Enter sends, Shift+Enter adds a line; attachment and dictation only where they actually work. |
| Status | Show only what the server reports (e.g. "AI assistant on/off", "Atlantis team in your conversation"). Never a generic "available" dot. |
| States | Skeleton while loading, inline error with Retry, a useful empty state that says what will appear there. |

## 5. Motion

| Token | Value | Use |
|---|---|---|
| `MOTION.fast` | 150 ms | Hover and press colour changes |
| `MOTION.base` | 250 ms | Toggles, accordions, small UI changes |
| `MOTION.enter` | 600 ms | Section entrances |
| Easing | `ease-atl` / `MOTION.ease` = `cubic-bezier(0.22,1,0.36,1)` | Everything, unless linear is needed for loops |
| Ambient loops | `animate-atl-rise` (28 s), `animate-atl-scan-clip` + `animate-atl-scan-line` (7 s, paired), `animate-atl-pulse-ring` (2.4 s) | Hero illustrations and live markers only |

- Entrances: `<Reveal>` (fade + 16 px rise, once, when 60 px into view). Stagger siblings by `MOTION.stagger` (80 ms), max ~5 items.
- Above the fold use `<Reveal hero>` (CSS entrance that runs before hydration). Never hide first-screen content behind a JavaScript-triggered animation.
- Motion must explain something (a flow, a scan, a state change). No parallax, no bouncing, no auto-advancing content that moves text the user is reading.
- **Reduced motion is mandatory:** `<Reveal>` renders static; CSS loops are disabled in `globals.css` under `prefers-reduced-motion`. Any new loop must be added there.
- Hover: colour/ring change and at most a 4 px translate or `shadow-card`. No `scale` on cards or buttons.

## 6. Visual assets

- Product images: real photos only, `object-contain` on `bg-media`, square wells. No stock photos of warehouses or handshakes.
- Icons: `lucide-react`, stroke default. Sizes 14 (inline), 16 (buttons), 18–20 (cards), 22 (feature tiles). Icon tiles: `w-11 h-11 rounded-2xl bg-teal-soft text-teal`.
- Illustrations: built from UI parts and flat shapes in navy/teal/greys. No 3D, no glossy gradients, no clip-art.
- Example data in illustrations is clearly illustrative (labelled "Example") and never a real customer, supplier or order.
- Maps: outline style (land `bg-surface`, borders `line`, water `surface-2`), markers teal; only verified locations are plotted.

## 7. Accessibility

- Contrast: body text ≥ 4.5:1, large text ≥ 3:1. `ink-3` only at ≥ 13 px; `#2EC4B6` never as text on white.
- Focus: every interactive element shows `focus-visible:ring-2 ring-[#2EC4B6]` (with offset on filled buttons). Never remove outlines without a replacement.
- Keyboard: everything clickable is a `<button>` or `<a>`; custom widgets (map markers, step selectors) are buttons with `aria-pressed`/`aria-current` and visible labels.
- Semantics: landmarks (`main`, `nav`, `section aria-labelledby`), lists for lists, tables for tabular data, `<details>` for disclosure.
- Images: meaningful `alt`; decorative SVG `aria-hidden`.
- Live changes that matter (form results, step details) use `aria-live="polite"`.

## 8. Responsive behaviour

- **Mobile (< 640):** single column; hero `text-display-sm`; buttons may go full width in forms; tables scroll horizontally in place; side-by-side panels stack; touch targets ≥ 44 px.
- **Tablet (640–1023):** two-column grids; feature splits still stacked; maps stacked.
- **Desktop (≥ 1024):** feature splits side by side; up to 4-column grids; maps side by side.
- Test every touched page at 375, 768 and 1280 px for overflow, clipping and spacing.

## 9. Content

- Concise B2B English. Short sentences, active voice, the reader's task first.
- Terms (use exactly): *buyer*, *supplier*, *Atlantis*, *order request*, *confirmed terms*, *net price* (supplier's price), *EXW location*, *case / pallet / truck*, *hub* (a verified Atlantis location), *delivery country*.
- **Honesty rules:** never claim escrow, held funds, guarantees, partners, warehouses, coverage, delivery times or prices that the product and the business don't actually provide. If something is planned, say "planned" or leave it out. Prices exclude VAT unless stated.
- CTA hierarchy: one primary (navy) action per view, one secondary at most. Labels say what happens ("Request a quote", not "Learn more").
- Numbers and dates follow the interface language (`fmt`, `formatPrice(…, meta.intl)`); in English: `€1,234.00`, `16 Oct 2026`.

### Languages and direction

The interface ships in seven languages: English, Arabic (right-to-left), French, Romanian,
Italian, Spanish and Portuguese (Portugal). The list lives in `frontend/src/locales/config.ts`.

- **All visible text comes from the dictionaries.** That covers labels, buttons, placeholders,
  `aria-label`/`title`, empty, loading and error states, and dialogs. Use
  `t('section', 'key', vars)` from `useLanguage()`. Never write English in JSX.
  New keys go in `locales/en.ts` and in every other locale file. Terms follow
  `locales/GLOSSARY.md`.
- **Variables and plurals** use ICU syntax: `"Placed {date}"`,
  `"{count, plural, one {# pallet} other {# pallets}}"`. Never build a sentence by concatenating.
- **Inline links and emphasis** go through `<Trans text={t(…)} tags={{ link: (c) => <Link…>{c}</Link> }} />`,
  so each language keeps its own word order.
- **Dates and numbers** use `fmt.date` / `fmt.number` from `useLanguage()`. For prices, use
  `formatPrice(amount, undefined, meta.intl)`. Values never change; only their display does.
- **Direction-safe layout:** use logical utilities (`ms-`/`me-`/`ps-`/`pe-`, `start-`/`end-`,
  `text-start`). Never use `left`/`right`. Arrows and chevrons that point "forward" get
  `rtl:rotate-180`. Order ids, EANs, tracking numbers and emails sit in `<bdi dir="ltr">`.
- **Regions rendered from dictionaries** carry `data-no-translate`, so the legacy runtime
  translator (used only by pages not yet on the dictionaries) never rewrites them.
- `npm run check:i18n` (part of the build) fails on any missing, empty or untranslated value,
  mismatched placeholder, tag or plural form, and on hard-coded text in the localized files.
  When you localize another file, add it to that script's scope list.

## 10. Checklist before you finish a UI change

1. Uses tokens and the type scale (no arbitrary `text-[Npx]`/hex on marketing pages).
2. Uses `components/ds` primitives where they apply.
3. Works at 375 / 768 / 1280 px with no horizontal scroll.
4. Keyboard and focus visible; reduced motion respected.
5. Every claim on the page is true today.
6. Text is in the dictionaries for all seven languages, and the page works in Arabic (RTL) as well as English.
7. `tsc`, `npm run build` (includes the i18n check) and relevant tests pass.
