# Image sources

Official APIs only. No search engine, retailer or stock site is scraped. A source turns on when its key appears.

Every free source runs first and all their photos are ranked together: cache, supplier pictures, Open Facts (every upload, not just the front), UPCitemdb (every image), EAN-DB, Go-UPC, Barcode Spider. A white studio photo is laid out as it is. Otherwise the best ordinary photos go through a vision screen on the raw picture, and only one that passes costs a Photoroom cut-out. Vision always judges the finished 1000×1000 picture. A row with neither gets Serper, without quotes round the barcode (a free account refuses them), and a result naming neither the barcode nor the brand is dropped before download.
Barcode databases are only called inside their free allowance (`budget.ts`); past it they are skipped, never charged.
Licence in the pipeline's sense: `unknown` goes to a person under policy A, whatever the score.

| Source | Key | Tier | Licence | Terms in one line |
|---|---|---|---|---|
| Open Food / Beauty / Products Facts | none | A | `cc_by_sa` | Photos CC BY-SA, data ODbL: publishable with attribution, kept in `imageCredits`. |
| EAN-DB | `EANDB_API_KEY` | A | `unknown` | 250 free calls after sign-up, then skipped. No photo rights granted. |
| Go-UPC | `GOUPC_API_KEY` | A | `unknown` | 150 free calls a month, then skipped. No photo rights granted. |
| Barcode Spider | `BARCODESPIDER_API_KEY` + `BARCODESPIDER_TRIAL_UNTIL` | A | `unknown` | Its only free use is the 7-day trial, so it stays off without the trial's end date. |
| UPCitemdb trial | none | A | `unknown` | Free trial, 100 calls a day, counted; no rights granted. |
| Serper | `SERPER_API_KEY` | B | `unknown` | At most `SERPER_MONTHLY_CAP` (200) searches a month, 2 per product, only after the free sources; answers kept 90 days. A search result is not proof of rights. |
| Shutterstock | `SHUTTERSTOCK_API_TOKEN` + `SHUTTERSTOCK_ENABLED=true` | C | `editorial` / after purchase | Off by default, not yet tried live; editorial is never published. |
| Supplier (URL column, sheet, inbox) | none | D | `supplier` | The supplier's own material. |
| Brand or manufacturer domain | via Tier B | B | `manufacturer` | Publishable once vision passes. |

Not used: ean-search.org (paid), Brave (paid after a monthly credit), Barcode Lookup (no ongoing free tier).

Vision: OpenRouter `OPENROUTER_API_KEY`, free models only. Any model not ending in `:free` is refused and logged as an error, `PHOTO_CHECK_MODEL` included.
Calls are spaced to stay under 20 a minute, and when the day's allowance is gone the remaining rows are `needs_review: vision_quota` and no search is spent.

Photoroom: nothing is paid for. A winner that is not already white is cropped to the pack, published as it is and marked `bg_pending`. Paid cut-outs need `PHOTOROOM_LIVE=true` as well as a live key; `npm run images:backfill` then replaces every `bg_pending` picture.

SerpApi is removed and stays removed; a `SERPAPI_API_KEY` is logged as an error and ignored.
The older Bing and DuckDuckGo code in `ean.service.ts` goes after Checkpoint C.

Check the keys: `npm run images:providers`.
