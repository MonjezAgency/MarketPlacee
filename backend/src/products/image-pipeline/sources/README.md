# Image sources

Official APIs only. No search engine, retailer or stock site is scraped. A source turns on when its key appears.
Licence in the pipeline's sense: `unknown` goes to a person under policy A, whatever the score.

| Source | Key | Tier | Licence | Terms in one line |
|---|---|---|---|---|
| Open Food / Beauty / Products Facts | none | A | `cc_by_sa` | Photos CC BY-SA, data ODbL: publishable with attribution, kept in `imageCredits`. |
| ean-search.org | `EAN_SEARCH_TOKEN` | A | `unknown` | Paid lookup; grants no rights in the product photos it links. |
| EAN-DB | `EANDB_API_KEY` | A | `unknown` | Paid lookup; photo rights not granted by the terms. |
| Go-UPC | `GOUPC_API_KEY` | A | `unknown` | Paid lookup; photo rights not granted by the terms. |
| Barcode Spider | `BARCODESPIDER_API_KEY` | A | `unknown` | Images come from third parties; no rights granted. |
| UPCitemdb trial | none | A | `unknown` | Free trial, about 100 calls a day; no rights granted. |
| Serper | `SERPER_API_KEY` | B | `unknown` | A search result is not proof of rights. |
| Brave Search | `BRAVE_SEARCH_API_KEY` | B | `unknown` | Fallback; results are never stored (no cache, no raw lists kept). |
| Shutterstock | `SHUTTERSTOCK_API_TOKEN` + `SHUTTERSTOCK_ENABLED=true` | C | `editorial` / after purchase | Off by default, not yet tried live; editorial is never published. |
| Supplier (URL column, sheet, inbox) | none | D | `supplier` | The supplier's own material. |
| Brand or manufacturer domain | via Tier B | B | `manufacturer` | Publishable once vision passes. |

Services: OpenRouter `OPENROUTER_API_KEY` (vision), Photoroom Basic `PHOTOROOM_API_KEY` (live key only; `sandbox_` is refused).

SerpApi is removed and stays removed; a `SERPAPI_API_KEY` is logged as an error and ignored.
The older Bing and DuckDuckGo code in `ean.service.ts` goes after Checkpoint C.

Check the keys: `npm run images:providers`.
