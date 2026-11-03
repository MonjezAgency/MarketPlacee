# Final run: 12 barcodes, 3 Nov 2026 (local only)

Real wizard, supplier-b@atl.test (local, VERIFIED), real OpenRouter and Serper, local database and storage.
Product names in the sheet were written from the barcode databases, because the 12 came as barcodes only.
Row 1 has no name in any database, so it carries a placeholder name.

Every image below was opened and looked at by Claude, not only judged by the vision model.

## Result after the fixes

7 published, 5 need attention, 0 wrong products among the 7. Two live pictures are weak (see notes).

| # | EAN | Row | Status | Image | Supplier message |
|---|---|---|---|---|---|
| 1 | 5061013943987 | Product 5061013943987 | Needs your attention | none | We found images for EAN 5061013943987 but couldn't confirm any is your product. Please check the EAN or upload a product photo. |
| 2 | 5061013949798 | Monster Zero Sugar Ultra Rosa 500ml | Published | supplier photo, white | (none) |
| 3 | 5060947542860 | Monster Khaotic 500ml | Published | crop, black backdrop | Published on its own background. It will be replaced by a white-background version later. |
| 4 | 5060639123292 | Monster Punch 500ml | Needs your attention | none | We found images for EAN 5060639123292 but couldn't confirm any is your product. Please check the EAN or upload a product photo. |
| 5 | 10850040427063 | Prime Ice Pop 500ml | Needs your attention | none | We found images for EAN 10850040427063 but couldn't confirm any is your product. Please check the EAN or upload a product photo. |
| 6 | 10810116128713 | Prime Nightmare 500ml | Published | clean studio picture | Published on its own background. It will be replaced by a white-background version later. |
| 7 | 10810116128065 | Prime Ice UK Red Chill 500ml | Published | crop, dark counter | Published on its own background. It will be replaced by a white-background version later. |
| 8 | 5060896621630 | Monster Ultra Fiesta Mango 500ml | Published | crop, wooden table; weak | Published on its own background. It will be replaced by a white-background version later. |
| 9 | 10810116128492 | Prime Hydration The Nightmare 500ml | Published | white | (none) |
| 10 | 7622210276650 | Milka Choco & Cake 35g | Published | crop, pale wall | Published on its own background. It will be replaced by a white-background version later. |
| 11 | 9002490205973 | Red Bull Energy Drink 250ml | Needs your attention | none | We found images for EAN 9002490205973 but couldn't confirm any is your product. Please check the EAN or upload a product photo. |
| 12 | 9002490100056 | Red Bull Energy Drink Bottle 250ml | Needs your attention | none | We found images for EAN 9002490100056 but couldn't confirm any is your product. Please check the EAN or upload a product photo. |

Final pictures: `qa/final-12/`. First pass: `qa/final-12/first-pass/`.

## What the first pass got wrong

The first pass published 9 of 12. The free vision model passed all of these at 0.95 to 0.98:

- **Red Bull 250ml: wrong product.** A 35.5 cl can turned sideways, from a page whose address says 35-5cl. It would have been a wrong image on a live product.
- Prime Nightmare 713: a price sticker on the bottle and a hand behind it.
- Prime Ice Pop: bottle running off the bottom of the photo.
- Monster Khaotic: a grey shop panel left around the can.

Fixes, all in code that does not trust the model:

- `sizeDiffers`: a page naming another size is refused before download.
- `touchesFrame`: a pack reaching the edge of the photo is refused.
- `paleFrame`: a pale panel left in a "white" photo is refused.
- Vision questions tightened (version b6): brand fully in view, no sticker on the pack, no hand anywhere, read only visible letters. Crops now also answer straight_on and hand_fragments.

The five rows were reset locally and run again. Results are the table above.

## Weak pictures still published

Right product, poor picture. The model passed these with the tightened questions, so it is still lenient on quality:

- Monster Ultra Fiesta Mango (row 8): base of the can cut off by the photo, Greek pack, wooden table.
- Monster Ultra Rosa on supplier-a: blurred, turned so the name wraps ("MONSTE"), straw in shot, Greek pack.

## Other findings

- Open Food Facts hangs on and off: 20 s and 40 s timeouts tonight, its home page fine. At the reset all four demo rows failed on it and were told "no image". Fixed: a failed source or download now waits and retries every 15 minutes, 8 tries, then the supplier is told.
- "Check again" forgot a blank stock cell, so a row could publish with stock 0. Fixed.
- A product staff removed, on a row that runs again, shows reason missing_fields. It stays REMOVED; only the reason is wrong. Not fixed.

## Demo rows on supplier-a (unverified)

| Row | Before verifying | After verifying |
|---|---|---|
| Monster Ultra Rosa | DRAFT, awaiting_verification | APPROVED, published |
| Test row | DRAFT, needs_attention, no_image | same |
| Milka (stock blank) | DRAFT, needs_attention, missing_fields | same |
| Red Bull (removed by staff in an earlier test) | REMOVED | still REMOVED |

Verified at 00:45:35 UTC; the minute cron published at 00:46:00 and sent one notification: "1 of your products are now live." A further tick sent none.

## Upload a photo (browser)

- Wrong photo (Rosa can on the Monster Punch row): refused, "Wrong variant: pack shows Ultra Rosá, not Punch." Row stayed a draft and needs attention.
- Right photo (Rosa can on the Rosa row, set up locally as needs_attention): vision 0.98, licence supplier, published.

## Usage

| | Calls |
|---|---|
| Serper, month total in the database counter | 17 of 200 (3 before tonight) |
| Serper, 12 rows first pass | 12 |
| Vision, 12 rows first pass | 23 |
| Vision and Serper, 5 rows run again | 13 and 2 |
| Vision, whole night | 48 of 50 for the day |
| OpenRouter cost | free models only |

Estimate for a 50-row sheet: 95 to 130 vision calls, so 2 to 3 days at 50 a day, and about 50 Serper searches, 100 at most. Rows beyond the day's allowance wait as "Image being prepared". The 12 rows took about 5 minutes of work.

## Checks

Backend tsc clean, jest 1033 tests in 69 suites, nest build. Frontend tsc clean, check-i18n pass, build exit 0.
