# Step 0 diagnosis: why products end up without a photo

Run on 2 Nov 2026 against the code on this branch (fab14e4), using the real backend classes with every call recorded. Nothing was changed, stored or spent.

## What this sample is, and is not

No real supplier sheet with TENA or Pampers is on this Mac or in Drive, and Gmail is disconnected. So this is the closest honest sample, not "20 real rows from one sheet":

- 10 barcodes that really failed in production (Railway logs, 31 Oct). Their names are not public, so title matching could not be tested on 9 of them.
- 4 rows with real sheet names (Prime, Milka, Nutella, Red Bull).
- 6 real TENA and Pampers barcodes from the open databases, with names **I wrote** in German, Romanian and Dutch supplier style.

Limits:

- `EAN_SEARCH_TOKEN` is on the server only, so that column is not measured. Whether production has it set is unknown.
- Bing and DDG ran from this Mac, once, as section 3 asked (40 DDG and 34 Bing requests). Server IP results may differ, and those failures are logged at debug in production, so the logs can't show them.
- The AI validator had no key here. Production has a key that OpenRouter refuses (401), and neither gives a verdict.

## Main finding: the supplier upload never calls Bing or DuckDuckGo

`fetchBingCatalogImages` is reached only from `EanService`, which serves staff saves and the `/ean` lookup routes. Supplier imports go through `ImportEnrichmentService` and `ImageDiscoveryService`: the Open*Facts databases, then a name search, then SerpApi. `products.controller.ts:745` says so directly. Removing the scraper will not raise the supplier hit rate.

## Top 3 root causes, with counts

1. **No working AI verdict, and automatic publishing is switched off.**
   - Production sweep, 31 Oct: 20 products searched, 0 got a photo. 16 of 20 stopped on `check failed (401)`.
   - `AUTO_APPLY` is `false` in the code, so nothing could be published even with a working key.
   - Since fab14e4, a refused key also stops the name search and the web search.
   - Old path in this run: 13 of 20 rows had web candidates and all were thrown away for lack of a verdict.
2. **The free databases give crowd photos, and thin ones.**
   - 5 of 20 rows have no photo in any database (25%).
   - The other 15 give 1 to 12 phone-style photos. 0 of 20 came out verified.
   - Why the 15 stayed unverified: 4 `second_source_needed` (three TENA, one Pampers), 3 case code, 2 name or brand differ, 2 sold as a case, 4 nothing to compare (my sample has no name for those).
   - 2 of the 15 have no photo reaching the brief's 800px minimum (two TENA, at 596px and 586px).
3. **Identity checks on the old path reject the right product.**
   - 2 of 20: `EAN mismatch: requested 810116128037, API returned 0810116128037`. A 12-digit code fails against its own padded form, which hits every Prime UPC.
   - 1 of 20: Milka on a real name, Jaccard 0.20 against "Cake & Choc", same barcode and brand.
   - 5 of 20 are 14-digit case codes, and the old path has no way to reach the inner EAN. In the production sweep it was 14 of 20. The supplier path handles this.

## Your suspects, checked

| Suspect | Result |
|---|---|
| Silent scrape failures | **True for DDG.** 20 of 20 `i.js` calls returned HTTP 202 with no results, with no log line at all. **Not for Bing here:** 34 of 34 HTTP 200, candidates on 19 of 20 rows. |
| Jaccard 0.4 rejecting foreign names | **Real but small.** 3 of 9 comparable rows fell below 0.4, including Pampers "Windeln" against Norwegian "Bleier" at 0.00. Only Milka was actually stopped, because when OFF has no record the old path skips the gate. |
| Validator too strict | **Not testable.** It gave no verdict in this run or in production (401), so its strictness can only be measured once a working key is in place. |
| 6 to 7s timeouts | **Minor.** OFF timed out on the first 3 rows at 5s and again at 20s, then answered in 0.2s on recheck. That is a passing slowdown, not a pattern. DDG and Bing answered in under 0.6s. |
| Supplier codes and units in the query | **Not shown here.** No row with article codes in this sample. It needs the real sheet. |

## Also found

- One save failed in production on 31 Oct at 23:35: `Image upload failed: <none>. Check Supabase bucket`. It is a single case, cause unknown.
- 46 products had no photo at the time of that sweep.
- `5061013941402` returned `not_in_database` 4 times in the log, then `found_review no_exact_match` with 6 photos offered.

## Row by row

Final-status columns are separate because there are two paths. "Supplier path today" is what a supplier sheet gets.

| # | EAN | Row name | Name source | OFF: product / images | OBF: product / images | OPF: product / images | ean-search.org | Bing: HTTP, candidates | DDG: HTTP, candidates | Title match (Jaccard, gate 0.4) | AI validator | Old path (EanService) | Supplier path today | Production log, 31 Oct |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5061013941402 | Strawberry Dreams | from your screenshot | timeout | no | no | not measured | 200, 6 (page had 25) | 200+202, 0 | n/a | no verdict | 0 images (6 web candidates, no verdict) | not_in_database (OFF timed out in the run; 404 on recheck) | not_found not_in_database |
| 2 | 5061013941181 | (unknown) | none (only the barcode is in the log) | timeout | no | no | not measured | 200/200, 1 (page had 1) | 200+202, 0 | n/a | no verdict | 0 images (1 web candidates, no verdict) | not_in_database (OFF timed out in the run; 404 on recheck) | found_review no_exact_match (6 similar) |
| 3 | 5056784907382 | (unknown) | none (only the barcode is in the log) | timeout | no | no | not measured | 200/200, 6 (page had 35) | 200+202, 0 | n/a | no verdict | 0 images (6 web candidates, no verdict) | needs_confirmation: nothing_to_compare | found_review identity_unconfirmed (1) |
| 4 | 5056784903735 | (unknown) | none (only the barcode is in the log) | yes / 1 | no | no | not measured | 200/200, 6 (page had 35) | 200+202, 0 | n/a | no verdict | 1 unverified OFF image(s) | needs_confirmation: nothing_to_compare | not_found record_mismatch |
| 5 | 810116128037 | (unknown) | none (only the barcode is in the log) | yes / 1 | no | no | not measured | 200, 6 (page had 35) | 200+202, 0 | n/a | no verdict | rejected: 12-digit code vs padded code | needs_confirmation: nothing_to_compare | no_match, found_review identity_unconfirmed (2) |
| 6 | 810116127672 | (unknown) | none (only the barcode is in the log) | yes / 1 | no | no | not measured | 200, 6 (page had 35) | 200+202, 0 | n/a | no verdict | rejected: 12-digit code vs padded code | needs_confirmation: nothing_to_compare | check_down (401), found_review (5) |
| 7 | 10810116128836 | (unknown) | none (only the barcode is in the log) | no | no | no | not measured | 200/200, 6 (page had 25) | 200+202, 0 | n/a | no verdict | 0 images (6 web candidates, no verdict) | needs_confirmation: case_code, nothing_to_compare | check_down (401), found_review (10) |
| 8 | 10810116125385 | (unknown) | none (only the barcode is in the log) | no | no | no | not measured | 200/200, 0 (page had 1) | 200+202, 0 | n/a | no verdict | 0 images, 0 candidates | not_in_database | check_down (401), found_review no_exact_match (9) |
| 9 | 10850040427063 | (unknown) | none (only the barcode is in the log) | no | no | no | not measured | 200/200, 6 (page had 25) | 200+202, 0 | n/a | no verdict | 0 images (6 web candidates, no verdict) | needs_confirmation: case_code, nothing_to_compare | check_down (401), found_review (11) |
| 10 | 10810116129000 | (unknown) | none (only the barcode is in the log) | no | no | no | not measured | 200/200, 6 (page had 37) | 200+202, 0 | n/a | no verdict | 0 images (6 web candidates, no verdict) | no_photo | check_down (401), found_review no_exact_match (3) |
| 11 | 10810116128065 | Prime Ice - UK - Red Chill 500ml | real sheet name | no | no | no | not measured | 200/200, 6 (page had 25) | 200+202, 0 | n/a | no verdict | 0 images (6 web candidates, no verdict) | needs_confirmation: case_code | not in the log |
| 12 | 7622210276650 | MILKA CHOCO &CAKE 35GR | real sheet name | yes / 2 | no | no | not measured | 200/200, 6 (page had 36) | 200+202, 0 | 0.20 below gate | no verdict | rejected: title gate | needs_confirmation: name_differs, brand_differs | not in the log |
| 13 | 3017620422003 | Nutella 750g x 6 | real sheet name | yes / 8 | no | no | not measured | 200/200, 2 (page had 1) | 200+202, 0 | 0.50 | no verdict | 2 unverified OFF image(s) | needs_confirmation: size_differs | not in the log |
| 14 | 9002490100070 | Red Bull Energy Drink 24x250ml | real sheet name | yes / 12 | no | no | not measured | 200, 6 (page had 35) | 200+202, 0 | 0.40 | no verdict | 3 unverified OFF image(s) | needs_confirmation: case_of_unit | not in the log |
| 15 | 7322540592412 | Tena Pants Plus M 9 Stk. | written by me in supplier style | no | yes / 2 | no | not measured | 200/200, 6 (page had 35) | 200+202, 0 | 0.50 | no verdict | 0 images (6 web candidates, no verdict) | needs_confirmation: second_source_needed | not in the log |
| 16 | 7322540574890 | Tena Pants Protect+ Super L 12 Stk. | written by me in supplier style | no | yes / 1 | no | not measured | 200, 6 (page had 35) | 200+202, 0 | 0.57 | no verdict | 0 images (6 web candidates, no verdict) | needs_confirmation: second_source_needed | not in the log |
| 17 | 7322540887648 | TENA Men Active Fit Pants L/XL 8 Stk. | written by me in supplier style | no | no | yes / 2 | not measured | 200/200, 1 (page had 25) | 200+202, 0 | 0.86 | no verdict | 0 images (1 web candidates, no verdict) | needs_confirmation: second_source_needed | not in the log |
| 18 | 8001841159676 | Pampers Pants Marimea 4 Scutece | written by me in supplier style | no | no | yes / 0 | not measured | 200/200, 1 (page had 1) | 200+202, 0 | 0.20 below gate | no verdict | 0 images (1 web candidates, no verdict) | no_photo | not in the log |
| 19 | 8700216665100 | Pampers Windeln Gr. 4 9-14kg 39 Stk. | written by me in supplier style | no | yes / 2 | no | not measured | 200, 6 (page had 25) | 200+202, 0 | 0.00 below gate | no verdict | 0 images (6 web candidates, no verdict) | needs_confirmation: name_differs | not in the log |
| 20 | 8006540704707 | Pampers Premium Protection Gr. 6 Luiers | written by me in supplier style | no | yes / 1 | no | not measured | 200/200, 1 (page had 1) | 200+202, 0 | 0.67 | no verdict | 0 images (1 web candidates, no verdict) | needs_confirmation: second_source_needed | not in the log |
