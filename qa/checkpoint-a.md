# Checkpoint A: plan, prices, cost

Date: 2 Nov 2026. Read with `qa/diagnosis.md`. Nothing has been built, installed, pushed or changed in production.

## 1. Where the brief and the codebase disagree

| # | Conflict | Proposed fix |
|---|---|---|
| 1 | The brief calls `fetchBingCatalogImages` the main cause of "no image found". Supplier uploads never call it. Only admin create and the `/ean` routes do. | Build the new pipeline for the supplier path. Remove the old path at Checkpoint C, as you planned. |
| 2 | **Fixing the OpenRouter key turns SerpApi back on** if `SERPAPI_API_KEY` is still set on Railway. | Delete that key from Railway before you fix the OpenRouter key. The first code step also removes the SerpApi call. |
| 3 | The DoD asks for 80% auto-approved. §7 says search images are licence "unknown" and need admin approval unless the setting allows them. Open Food Facts photos are phone shots, which fail `studio_quality`. | With the setting off, 80% is probably out of reach. Default it to off. Checkpoint B will report the approved share under both settings, so you decide on real numbers. |
| 4 | §5 wants Photoroom to do the whole layout in one call. Padding and positioning are Plus only ($0.10 an image), not Basic ($0.02). | Use Basic to remove the background and `sharp` to compose. Same result, 5x cheaper. The §5 post-checks still run. |
| 5 | Budget under $1 per 100 is not met by Plus plus a strong model ($6 to $10). | See section 4. Under $1 needs Haiku to prove accurate and Photoroom on 15% of products or fewer. |
| 6 | `AUTO_APPLY` is off, and a photo on a live product waits for staff (`held`). The brief wants a passing photo shown automatically. | The new pipeline applies a passing photo to a product with no photo, live or not. A product that already has a photo is never touched. The product's own status never changes. |
| 7 | "Storefront shows only approved" would hide every existing photo, because existing products have no `imageStatus`. | Empty `imageStatus` means an existing photo and keeps showing. The rule applies to pipeline results only. |
| 8 | `Product.imageCredits` is keyed by image URL in camelCase. The brief uses a flat snake_case shape. | Keep the existing shape and add the new fields, so current pages keep working. |
| 9 | "Cache every response 30 days" conflicts with Brave's terms, which forbid storing results. The current cache is in memory and is lost on restart. | Add a database cache for every source except Brave. |
| 10 | The `tools/packshot/reference/` folder is really `reference/` at the repo root. | Use the real path. The backend needs its 2 style images, so 2 small copies go into the module's assets. |
| 11 | No `sharp`, no zxing and no job queue library in the backend. Redis exists but nothing uses it for jobs. | Install `sharp` (approved) and `zxing-wasm` (needs your OK). Use a database job table with the existing scheduler, no queue library. |
| 12 | Open Food Facts lookups are limited to 12 a minute, so concurrency 4 does not speed them up: about 17 minutes for 200 rows. | Keep the limit, it protects us from their block. The progress bar shows the wait. |
| 13 | §3 ran Bing and DDG scraping once, under your explicit brief, even though the rule is no scraping. | Disclosed. It was 34 Bing and 40 DDG requests from this laptop. It will not run again. |
| 14 | Earlier briefs asked for a soft shadow and said Open Food Facts must never be final. This brief says no shadow and allows it. | Latest brief wins. |
| 15 | Shutterstock API licence cost is not public, and an adapter can't be proven without an account. | Build the editorial rule now, test it with fixtures, and keep the adapter off and marked untested until you have an account. |

## 2. Build plan

**New module `backend/src/products/image-pipeline/`**

- `image-pipeline.module.ts`, `image-pipeline.service.ts`: orchestration, per-product trace
- `normalise.ts`, `gs1-prefixes.ts`: EAN, check digit, GTIN-14, name cleaning
- `identity.ts`: identity merge and conflicts
- `http.ts`: 15s timeout, 2 retries, per-source rate limit, warn logging, cache
- `sources/`: `off.ts`, `ean-search.ts`, `ean-db.ts`, `upcitemdb.ts`, `go-upc.ts`, `barcode-spider.ts`, `serper.ts`, `brave.ts`, `shutterstock.ts`, `supplier.ts`, `README.md` (terms, one line each)
- `barcode.ts`: decode with zxing
- `scoring.ts`: hard rejects and the 0 to 100 score
- `vision.ts`: one OpenRouter call, which also returns the closest pick if none passes
- `compose.ts`: trim, Photoroom Basic, 1000×1000, post-checks, JPEG and WebP
- `licensing.ts`: §7 rules and the admin setting
- `image-jobs.worker.ts`: concurrency 4, idempotent per GTIN
- `__tests__/` plus recorded fixtures

It reuses `lookupPlan`, `sameGtin`, `HostQueue` and `uploadProductImage`. The `.xlsx` picture mapping is ported from `tools/packshot/packshot/catalogs.py`.

**Later, at §6:** the `supplier-import.service.ts` hook, supplier progress and attention filter, barcode photo upload, the admin review queue on `/admin/products/photos`, and the placeholder rule. I read `docs/DESIGN_SYSTEM.md` first and add the seven-language strings.

**Not touched:** pricing, orders, auth.

**Database, additive only**

- `Product`: `imageStatus String?`, `imageStatusReason String?`
- `ImageJob`: GTIN, product, upload id, status, attempts, trace JSON, cost
- `ImageCandidate`: the top 5 for review, with source, score, licence, vision reason
- `ImageLookupCache`: source plus key, response, expiry
- `AppConfig` entry for the unknown-licence setting

**Checkpoint B runs locally.** It uses fixtures and the smoke set, writes to local files, and touches neither the production database nor Supabase.

## 3. Verified prices

Read from each provider's pages on 2 Nov 2026.

| Source | Free | Paid | Not confirmed |
|---|---|---|---|
| Open Food / Beauty / Products Facts | Free, no key | None | Shared rate limit |
| UPCitemdb | 100 calls a day, 20 of them search | $99/mo 20k a day; $699 PRO | |
| EAN-DB | 250 calls after sign-up | €9/5,000; €69/50,000; €249/300,000 prepaid | How many of our products have images |
| ean-search.org | Trial €1 first month, 100 queries, then €9 | €19/mo 5k; €39/50k; €99/150k; €149/300k | Unmeasured, no token here. Is it set on Railway? |
| Barcode Spider | 7-day trial, no card | $39/mo 10k; $89/50k; $249/200k | Image terms |
| Go-UPC | Trial key | $74.95/5k; $245/45k | Their terms say images are third-party, no rights granted |
| Barcode Lookup | None found | $99/5k; $249/25k; $499/100k; $949/500k | |
| Serper | 2,500 free credits | $50/50k, down to $3,750/12.5M ($1.00 to $0.30 per 1,000). Credits expire in 6 months | Credits per image query. To be measured |
| Brave Image Search | $5 free credit monthly, card needed | $5/1,000 | Forbids storing results |
| Photoroom | 10 free production Basic calls; sandbox 1,000 a month, watermarked | Basic $0.02; Plus $0.10 an image | Monthly plans, unused calls don't roll over |
| OpenRouter, per million tokens in/out | None | Opus 5.5 $4/$20; Sonnet 5.5 $2/$10; Haiku 5.5 $0.10/$0.50; Gemini 3.8 Flash $0.825/$4.125 | |
| Shutterstock | None found | Subscriptions from ¥2,900/mo for 10 images on the public page | API access looks team/enterprise only; per-image API licence cost unknown |
| Dynamsoft Barcode Reader | 30-day trial, no card | Sales quote only | Price. Not needed unless zxing's decode rate is poor |

Google Custom Search is closed to new customers and ends 1 Jan 2027, so it is out.

## 4. Estimated cost per 100 products

These are estimates. Checkpoint B replaces them with measured numbers.

Assumptions: 5 Serper queries a product at one credit each, 8 images in the vision call, 40% of winners not already white.

| Item | Brief as written | Recommended | Cheapest |
|---|---|---|---|
| EAN-DB | $0.20 | $0.20 | $0.20 |
| Serper | $0.30 to $0.50 | $0.30 to $0.50 | $0.30 to $0.50 |
| Vision | Opus at 1000px $4.90, or Sonnet at 768px $1.60 | Sonnet at 768px $1.60 | Haiku at 768px $0.08 |
| Photoroom | Plus $4.00 | Basic $0.80 | Basic $0.80 |
| **Total** | **$6 to $10** | **$2.90 to $3.10** | **$1.40 to $1.60** |

Under $1 needs Haiku plus Photoroom on 15% of products or fewer. I have not tested Haiku on this job, and a cheaper model must not let one wrong photo through. Checkpoint B runs Sonnet and Haiku on the same smoke set, and Haiku is only chosen if it makes no wrong approval there.

## 5. Sources to start with

- **Start:** Open Food Facts family, ean-search.org, EAN-DB, UPCitemdb free, Serper, Photoroom Basic, supplier images.
- **Try on free trials during the smoke set, keep only if they add approved photos:** Barcode Spider, Go-UPC, Brave.
- **Leave out for now:** Barcode Lookup (price), Shutterstock (no account, no price), Dynamsoft (only if zxing fails).

## 6. Keys

Add them yourself, and don't paste any in chat. For the local smoke run they go in `~/atlantis-image-pipeline/backend/.env`, which is outside the repo. Production keys are a separate step at §6.

**Required**

- `OPENROUTER_API_KEY`: a new valid key
- `PHOTO_CHECK_MODEL`: optional override, I will test `anthropic/claude-sonnet-5.5` and `anthropic/claude-haiku-5.5`
- `SERPER_API_KEY`
- `PHOTOROOM_API_KEY`: live, not `sandbox_`
- `EAN_SEARCH_TOKEN`
- `EANDB_API_KEY`

**Optional**

- `BARCODESPIDER_API_KEY`
- `GOUPC_API_KEY`
- `BRAVE_SEARCH_API_KEY`

**Later only**

- `BARCODELOOKUP_API_KEY`
- `SHUTTERSTOCK_API_TOKEN`
- `SHUTTERSTOCK_ENABLED=false`

## 7. What I need from you

1. Approve this plan, including the fixes in section 1.
2. Approve installing `zxing-wasm`.
3. Approve the schema additions in section 2.
4. Send one real supplier sheet with TENA and Pampers rows. This diagnosis had no real sheet for those, and the DoD can't be judged without one.
5. Add the required keys.
6. Delete `SERPAPI_API_KEY` from Railway before fixing the OpenRouter key there.
