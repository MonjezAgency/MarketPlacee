# Checkpoint B: partial report

Date: 2 Nov 2026. Branch `feat/image-pipeline`, local commits only. Nothing pushed, deployed, or changed in production. No database or Supabase write.

**This Checkpoint B is not complete.** Selection accuracy can only be judged on free sources so far:

- **Serper was not tested at all.** The key in `backend/.env` is refused with 403. It is 64 hex characters, the shape of a SerpApi key; Serper keys are usually 40. The code sends it only to Serper, so nothing touched SerpApi. Packshots were expected to come from Serper, so the numbers below say little about them.
- **The free vision allowance for today is spent** (OpenRouter's counter: 51 of 50). 7 rows have an image but no verdict, marked `vision_quota`. It resets at 00:00 UTC.
- **No real supplier sheet yet.** This is the 32-row test set: 6 rows have synthetic names, 3 reference rows have no barcode. The Definition of Done is measured on the real sheet at Checkpoint C.

## Result of the final run

| Status | Rows |
|---|---|
| `needs_bg_removal` | 3 |
| `needs_review` | 23 (16 by vision or no usable photo, 7 with a photo waiting for vision; see the table) |
| `not_found` | 3 |
| `invalid_ean` | 3 (no barcode in the test row) |
| Composed locally, already white | 0 |

Against the Definition of Done, for the 29 rows with a barcode and free sources only:

| Measure | Target | Now |
|---|---|---|
| Rows with a candidate | at least 95% | 24 of 29 (83%); 22 of 29 (76%) still usable after the size and download checks |
| Auto-approved | at least 80% | 0 now; 3 of 29 (10%) once backgrounds are removed |
| Wrong-product images published | 0 | 0 (nothing was published, and no wrong product passed vision) |
| Every row gives a precise reason | all | yes |

Rows 10 and 18 found nothing in the databases and hit `vision_quota` before a search, because the pipeline does not spend a search it cannot judge. They are effectively unfound.

## Selection accuracy, row by row

`qa/compare.jpg` shows each row by number (reference left, our candidate right). Most test rows have no reference photo; the 11 reference rows are 21 to 31. For rows in `vision_quota` the photo shown is simply the top score, not a model's choice.

| # | Product | Vision | Status | By my eye |
|---|---|---|---|---|
| 1 | Monster Strawberry Dreams | none | not_found | no candidate |
| 2 | barcode 5061013941181 | none | not_found | no candidate |
| 3 | Monster Lando Norris | rejected | needs_review | exact product; hand photo |
| 4 | Monster Ultra Strawberry Dreams | rejected | needs_review | exact product; shop photo |
| 5 | Prime Future Freeze | rejected | needs_review | exact product; phone photo |
| 6 | Prime Blue Chill | rejected | needs_review | exact product; hand photo |
| 7 | Prime Collector Series | rejected | needs_review | exact product; hand photo |
| 8 | case code 10810116125385 | none | not_found | no candidate |
| 9 | Prime Ice Pop | waiting | needs_review | exact product; phone photo |
| 10 | Prime Dragon Fruit | waiting | needs_review | no candidate |
| 11 | Prime Ice Red Chill | rejected | needs_review | exact product; phone photo |
| 12 | Milka Cake & Choc | **passed 0.95** | needs_bg_removal | exact product; 35g not readable |
| 13 | Nutella "750g x 6" | rejected | needs_review | **barcode and row disagree**: the barcode is a 400g jar, so vision was right |
| 14 | Red Bull 250ml | **passed 0.95** | needs_bg_removal | exact product; the row says 24x, the barcode is one can |
| 15 | Tena Pants Plus M [synthetic] | waiting | needs_review | all 3 photos too small or failed |
| 16 | Tena Protect+ Super L [synthetic] | waiting | needs_review | **unsure**: pack reads ProSkin Super L x12, likely a rebrand |
| 17 | TENA Men Active Fit L/XL [synthetic] | rejected | needs_review | exact product; crumpled pack |
| 18 | Pampers Pants 4 [synthetic] | waiting | needs_review | no candidate |
| 19 | Pampers 4 / 39 [synthetic] | rejected | needs_review | exact product; shelf photo |
| 20 | Pampers Premium 6 [synthetic] | rejected | needs_review | exact product; hand in shot |
| 21 | Pampers Active Baby 4 / 76 | none | invalid_ean | no barcode in the test row |
| 22 | Lavazza Crema e Aroma 1kg | rejected | needs_review | **not confirmed**: only side or back photos, top score is a small older pack |
| 23 | Nutella 350g | **passed 0.95** | needs_bg_removal | exact product and size; label differs from the reference |
| 24 | Nutella Biscuits 276g | waiting | needs_review | exact product; dark background |
| 25 | Dove Original spray | none | needs_review | only photo under 800px |
| 26, 27 | Fairy Platinum 96 | none | invalid_ean | no barcode in the test rows |
| 28 | Nutella 1kg | waiting | needs_review | **not usable**: top score is a crop of the recycling label |
| 29 | Kinder Bueno | waiting | needs_review | exact product; hand photo |
| 30 | Coca-Cola 1.5l | waiting | needs_review | **not confirmed**: blurred bottle on a rug |
| 31 | Coca-Cola 330ml | waiting | needs_review | **not confirmed**: back of an orange can |
| 32 | Monster Aussie Lemonade 500ml | rejected | needs_review | exact product; casual photo |

Of the 22 rows with a usable photo: 16 exact product, 1 barcode/row disagreement, 1 unsure, 4 not confirmed. No photo showed a clearly different product, and all three approvals are correct. The real problem is quality: Open Food Facts is mostly phone photos.

## Free-model verdict accuracy

16 readable verdicts from `nvidia/nemotron-3.5-super-vl:free`, compared with what I can see:

- **Wrong-product approvals: 0.**
- **Wrong rejections: 0** that I can see. All 12 rejections hold: 10 for quality, Lavazza for showing no front, Nutella 13 for size.
- **Wrong quality approval: 1.** Nutella Biscuits passed `studio_quality` on a dark background. Only a false `brand_conflict` stopped it in that run. I fixed that false alarm, so this row now needs a fresh verdict; it would go to `needs_bg_removal`, where the cut-out is reviewed before anything publishes.
- Confidence is unreliable alone: failed rows often read 0.90 to 0.95. The booleans carry the decision.

Sample is small; 4 approvals prove little.

## Sources

| Source | Candidates | Approved winners |
|---|---|---|
| Open Food Facts | 81 | 3 |
| EAN-DB | 26 | 0 |
| UPCitemdb | 3 | 0 |
| Serper | not tested | not tested |

Only EAN-DB's candidates that came after the Open Food Facts verdicts have no verdict of their own yet. EAN-DB started working during this session, so its account is now confirmed.

**Policy A and B gave the same result:** 0 now, 3 after cut-outs. All 3 winners are CC BY-SA, so B changes nothing until Serper supplies `unknown` photos.

## White vs cut-out, and Photoroom cost

- Winners already white: **0**. `needs_bg_removal`: **3**.
- Photoroom pricing, checked 2 Nov 2026 at photoroom.com/api/pricing: Remove Background $0.02 per image, sold in fixed monthly packs ($20 for 1,000), and unused images do not roll over.
- At this ratio, 1,000 products need 1,000 cut-outs: **about $20**, once, in the month they are processed.
- This is an upper bound from 3 winners. Serper packshots are often already white. Red Bull and Nutella 350g also look white but were flagged: their edges are near-white rather than pure white. I changed nothing there.
- No sandbox preview ran, because `PHOTOROOM_API_KEY` is empty. Paid cut-outs also need `PHOTOROOM_LIVE=true`, so a live key alone turns nothing on.

## Before and after: 31 Oct production failures

| Failure | Then | Now |
|---|---|---|
| OpenRouter 401 rows (16) | no vision at all | free vision works; this set's rows are judged, none approved yet |
| Prime 12-digit rows (2) | wrong or no match | rows 5 and 6 resolve to the right product, rejected for phone photos |
| Milka row | blocked | identified, passed vision, waits for a cut-out |
| Case-code rows (5) | not found | 3 resolve (rows 7, 9, 11), 2 have no candidate (rows 8, 10) |

Production itself is unchanged.

## Cost

- **Serper:** 0 searches served; 200 of 200 left. About 57 calls were refused with 403 (53 of them in the first run, before I added the skip). A refused call returns nothing, and I removed them from the local counter. I can't see a Serper dashboard to confirm.
- **OpenRouter:** `nvidia/nemotron-3.5-super-vl:free`. 51 calls by OpenRouter's counter: 48 from runs, 3 from my probes. **Cost $0** (the account reports `usage_daily: 0`). 32 of the 48 were wasted, see below.
- **Others:** Open Food Facts free. UPCitemdb 34 of 100 for the day. EAN-DB 25 of its 250 free. Photoroom 0.
- **Paid calls: none.**

## Tests

Backend: 934 tests in 68 suites, all green; `tsc` clean. Frontend not touched.

## Hard-rule conflicts and decisions

- **Budget rule 3 vs the later "EAN_SEARCH_TOKEN used if present":** I kept ean-search disabled, as a hard rule. The token is empty, so there is no effect today.
- **Real cause of the Prime and Milka failures was in `ean.service.ts`** and I fixed it there. The name gate still blocks where no vision stands behind it. This is the existing lookup, not pricing, orders or auth.
- Discovery's `CONTRADICTIONS` size and variant rules are kept.
- `held` is removed in the new pipeline, so a confirmed licensed photo can go on a live product. Nothing is wired yet.
- A `PHOTO_CHECK_MODEL` set to a paid model on Railway would now be refused.
- No local watermark detection: stock domains are blocked and vision checks the rest.
- Brave is removed because it isn't free.
- "Usable" means passed vision, so Serper runs after free photos fail vision. The second query runs when the first leaves under 3 usable after the download checks.

**Not built yet:** the frontend, the >20% source-failure banner, and the supplier path (all §6). Shutterstock is untested live.

## Mistakes and problems found

- **Run 1 wasted 32 of the 50 free calls.** `max_tokens` was too low for a model that thinks first, so every answer was empty. Fixed.
- **Serper and EAN-DB were called on every row despite refusals.** Fixed: a refused source is skipped for 10 minutes.
- **I told you the Photoroom key was live.** It is empty.
- **A verdict already cached was ignored once the daily limit was reached.** Fixed, with a test.
- **False `brand_conflict`:** Open Food Facts says Ferrero, the row says Nutella. An owner is no longer a conflict; a different brand of the same owner still is. Fixed, with tests.
- Open Food Facts failed on 8 calls in one run. I did not confirm the cause. It did not recur, and those rows retried fine.

## What blocks a real answer

1. **50 free vision calls a day cannot carry a real sheet.** Spending $10 once on OpenRouter credit raises it to 1,000 a day, and the models stay free. Owner's decision.
2. `dots-studio/dots-3-note-preview:free`, the fallback, expires 2026-12-31 and needs a replacement before then.
3. `ean-validator.service.ts` still names `google/gemini-2.0-flash-exp:free`, likely no longer listed. Untouched; it needs checking.

## To finish Checkpoint B

1. The real Serper key from serper.dev, placed in `backend/.env`.
2. A rerun after 00:00 UTC. Cached answers stay free, and the 7 waiting rows need about 10 vision calls. Serper's rows need the rest of the day's allowance.
