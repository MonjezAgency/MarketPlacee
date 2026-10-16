# Supplier product import: real files, PDF price lists and photos by barcode

## 1. What this document covers

- How real suppliers lay out their product files, based on the 19 files supplied (4 Excel workbooks and 15 PDFs).
- What Atlantis's importer did and didn't handle with those files, and what was changed.
- The import flow a supplier now follows, including PDF price lists.
- The optional photo search by barcode (Open Food Facts and its sister databases): limits, licensing and safeguards.
- How it was tested, what works, what depends on configuration, and what is not done.

The supplier files themselves are private and are **not** in the repository. Tests use small synthetic PDFs built in code (`backend/src/products/__tests__/pdf-fixture.ts`).

## 2. The files analysed

| File | Type | Layout | Notable for the importer |
|---|---|---|---|
| Corny offer | Excel | One sheet, 24 columns, product photos in cells | "EAN piece / EAN case" in one cell; "Manufacturer" (Schwartauer Werke) differs from the brand ("Trade Mark": Corny); MOQ "full layers"; price per piece |
| Trolli offer | Excel | Same template as Corny, 57 rows | Same issues; prices with many hidden decimals (4.82688333…) |
| HALLS offer | Excel | 6 rows | Two barcode columns ("EAN CODE", "EAN Code") that disagree on one row (57023335 vs 59070689); no "name" column (only "Product Description"); weight in its own column |
| Food snacks Italy | Excel | 111 rows, 34 MB because of photos | Plain "Price" with no basis; "Units per pallet"; file far above any upload limit until photos are separated |
| Takis | PDF, 1 page | Table | Price written "0.65 eur"; one row without barcode; notes under the table ("MOQ 15 pallets mix", "Expiry Minim 5 months") |
| 7 Days croissants | PDF, 2 pages | Table | Names over two or three lines; "€" printed apart from the amount; prices "-" (none) on the last rows |
| Coca-Cola 330 ml | PDF, 1 page | Table | S/N starts at 25; BBD "Fresh"; "2,376" (comma = thousands) |
| Drinks | PDF, 2 pages | Table; page 2 has no header | 23 rows without price; Red Bull row with no barcode or price; "Pieces/Pallet" as a cross-check |
| LINDOR | PDF, 1 page | Table | "PALLETS AVAILABLE" (stock in pallets), header on two lines; BBD dates |
| Monster | PDF, 2 pages | Table | Barcodes written with a space ("5060896 625492"); names over two lines |
| Pepsi | PDF, 2 pages | Table, headers on three lines | Two columns both titled "N of cases per pallet" (11 and 110: the first is really cases per layer); price per can with 3 decimals |
| Prime | PDF, 4 pages | Table | 12-digit UPC and 14-digit case codes (GTIN-14) in the same column; "NEW" instead of a barcode; the same barcode on two different rows; "£1.79" price mark inside names |
| Water (VOSS, Fiji) | PDF, 1 page, landscape | Table, headers on three lines | HS code, remaining shelf life, box weight, pallet height — none are product fields |
| Ice cream | PDF, 2 pages | Table | Piece EAN and box EAN in separate columns; "EXW PRICE LIST €" |
| Coccolino | PDF, 6 pages | Table, 120 rows | Fabric softener (not food); names over two lines; "€" and the amount in different columns |
| Mondelez offer (OFFER 08) | PDF, 2 pages | Table without S/N or price header | The price column has **no header**; "Net/Gross weight per case" (not per piece); language codes wrapped above and below the row; ligature glyphs ("SensaƟons" = Sensations) |
| Nutella display | PDF, 1 page | One-product sheet | "Label: ▪ value" pairs; "25.344" (dot = thousands); "4,77€" (comma = decimal) |
| Kinder Bueno | PDF, 1 page | One-product sheet | "EAN-Pcs.: -" (no barcode) |
| Product brochure (21-2-26) | PDF, 24 pages, 20 MB | Picture grid | Names and sizes only, no prices or barcodes — not a price list |

## 3. What suppliers actually do

- **No two layouts are the same.** Column names vary ("Pieces/ Carton", "Pcs.*box", "Case Count", "pcs in box", "N of bottles per case" all mean pieces per case).
- **The price basis is rarely stated.** "Price at €", "Price", "EXW PRICE LIST €", "Unit price" — the same file can mean per piece (Takis, €0.65) or per case (Coca-Cola, €8.60 for 24 cans). It can't be guessed safely.
- **Number formats mix conventions.** "2,376" (thousands), "25.344" (thousands), "4,77€" (decimal comma), "0.268" (decimal point) — sometimes in one supplier's files.
- **Identifiers are messy.** Two barcode columns that disagree, case barcodes (GTIN-14) mixed with piece barcodes, barcodes with spaces, "NEW" or "-" where a barcode should be, the same barcode on two different products.
- **Packaging is given in many ways**, often redundantly (pieces per case, cases per pallet, pieces per pallet, cases per layer), and sometimes wrongly (Pepsi's two "cases per pallet" columns).
- **Stock is given in pieces, cases or pallets**, or not at all.
- **Offer terms sit outside the table** (MOQ, expiry, dates).
- **Brand and manufacturer are different things** (Corny vs Schwartauer Werke).
- **Some files aren't price lists at all** (a 24-page picture brochure).

## 4. What was already handled, and what was changed

The importer already read multi-sheet workbooks, two-row headers, brand headings between rows, photos placed in cells, "piece / case" barcode pairs, MOQ text such as "full layers", hidden decimals, unusual prices and existing products. It never guessed an ambiguous column. Against the real files these gaps remained, and were fixed:

| Gap found in the real files | Change |
|---|---|
| PDFs couldn't be imported at all | New PDF reader (section 6) feeding the same matching, review and import steps |
| "Manufacturer" was taken as the brand | "Trade Mark" (and marke/marque/marca) now maps to Brand; "Manufacturer" is kept in the import record |
| A second barcode column was ignored, so disagreements went unnoticed | It is recognised as a second barcode column and compared row by row; rows where they differ are blocked |
| "Product Description" wasn't used as the name when sizes were in a separate weight column (HALLS) | It is proposed as the name (to confirm) |
| "Units/Pieces per pallet" wasn't recognised | Recognised and checked against pieces per case × cases per pallet (catches Pepsi's wrong column) |
| Stock given in pallets ("PALLETS AVAILABLE") couldn't be used | New "Stock (pallets)" field, converted to cases with Cases per Pallet |
| Case weight ("Net weight per cse KG") was read as the piece weight | Recognised as case weight and kept in the import record, not stored as the piece weight |
| A 14-digit case code was accepted as the piece barcode silently | Warned: a GTIN-14 starting with 1–8 usually identifies the case |
| A price cell in another currency than the import ("€ 1.19" with RON selected) was converted silently | Blocked with the reason; the currency is also detected from the cells of a price column without a header |
| A column called "Product image" with no links was mapped to Image URL | Not mapped unless the cells hold links |
| The blank template contained an example row that could be imported by mistake | The blank template has no example; a separate completed example uses made-up products whose barcodes start with 2 (reserved for in-store use, never a real product) and are blocked if uploaded |

## 5. The import flow

1. **Upload** an .xlsx, .xls, .csv or .pdf file. Spreadsheets: photos stay in the browser and only the cells are uploaded. PDFs up to 4 MB and 40 pages.
2. **Check rows (PDF only).** Every row read from the PDF, with its page number, next to a picture of that page. The supplier corrects values (the PDF's value stays visible beside each correction, with undo) and unticks rows that aren't products. Rows to look at closely are marked with the reason. Offer terms printed around the table are listed but not imported.
3. **Match columns.** Each column with sample values, the proposed Atlantis field and why. Ambiguous columns (such as a bare price) must be chosen. Number formats that can be read two ways must be chosen. Fields missing from the file can take one value for all rows, a value per sheet, a section heading or the product name — or stay empty (draft).
4. **Review.** Every row: new / draft / update / unchanged / error, with each value next to the cell it came from. Existing products (same barcode, or same name without a barcode) are left alone or updated as the supplier chooses; updates show old → new. Optional: find missing photos by barcode (section 7).
5. **Confirm & import.** An explicit confirmation; then a per-row report (created, updated, unchanged, skipped, failed) that can be downloaded as CSV. Each product keeps its import record: file, page, sheet, row, the original cells, any corrections the supplier made, and photo credits.

Nothing is written to the catalog before step 5. Uploading the same catalog again — as a PDF after the Excel file, for example — shows those products as already in the catalog instead of creating duplicates.

### Field formats that matter

| Field | Expected | Notes |
|---|---|---|
| EAN | The piece barcode: EAN-13, EAN-8, UPC-A or GTIN-14, digits only, valid check digit | Format the Excel column as Text. Case barcodes go in a separate column. |
| Product name | As on the pack, with size | One product per row |
| Brand | The brand on the pack | Not the manufacturer |
| Country of origin | Where it was made | Not the warehouse (that is EXW location) |
| Price | Per case **or** per piece (or per display) | A bare "Price" must be confirmed; stored per case in EUR, the original kept |
| Currency | ISO code | A price cell naming another currency is blocked |
| Unit of sale | piece, can, bottle, jar… | What one piece is |
| Case pack | Pieces per case | Needed to convert piece prices and piece stock |
| Pallet configuration | Cases per pallet; optionally pieces per pallet, cases per layer, layers per pallet | Cross-checked |
| Stock | Cases, pieces or pallets | Converted to whole cases |
| MOQ | Number + unit, or text like "1 pallet", "full layers" | |

The blank template (`/supplier-catalog/import/template?format=xlsx`) and the completed example (`…&variant=example`) are generated from the same field list the importer uses, so they can't drift apart.

## 6. PDF price lists

**How it works.** The server reads the words and their positions with pdf.js (through `pdf-parse`, already a dependency). It finds the header row (even over three lines), builds columns from the header and the values below it, groups a product's text that wraps over several lines, continues a table onto pages without a header, joins "€" printed apart from the amount, creates a column for values that have no header (the Mondelez price column), repairs broken ligature glyphs, and reads one-product sheets made of "Label: value" pairs. Every row carries its page number, how it was read, and the words as on the page.

**Accuracy on the supplied PDFs.** 14 of the 15 PDFs were read: 12 price-list tables and 2 one-product offer sheets, 356 product rows in all. In every file that numbers its rows (11 of them), the numbering read back is continuous — no row lost or merged. 11 rows are marked for checking (text between two rows, barcodes written with spaces, one-product sheets). The 15th file, the 20 MB picture brochure, is refused with the reason (over the size limit, and it has no price table).

**Safeguards.** Only `%PDF-` content is accepted (the file name and browser type are not trusted). Limits are checked on the server: 4 MB (uploads pass through a ~4.5 MB proxy), 40 pages, 25 seconds. Password-protected, damaged, scanned and table-less PDFs are refused with a clear reason and a fallback (spreadsheet, or one by one). Extracted text is only ever data; nothing in a PDF can change what the importer does. The PDF is not stored: the server reads it in memory and returns small page pictures for the check step.

**Scanned PDFs and OCR.** Scanned pages are detected and reported. **OCR is not implemented and not configured**, so scanned PDFs cannot be imported. Options if needed later:

| Option | Cost | Notes |
|---|---|---|
| Tesseract (tesseract.js or the tesseract binary) on the server | Free; CPU time (several seconds per page) and ~20–40 MB of language data per language | Accuracy on small table text is moderate; needs testing with real scans |
| Google Cloud Vision / Document AI | Paid per page; credentials required | Good table structure (Document AI form/table parser) |
| AWS Textract | Paid per page; AWS account required | Good table extraction |
| Azure AI Document Intelligence | Paid per page; Azure account required | Good table extraction |

Any of these would plug in where scanned pages are detected (`backend/src/products/pdf-import.ts`), producing the same positioned words, so the rest of the flow is unchanged. No credentials or paid services are assumed.

## 7. Photos by barcode (Open Food Facts)

**What it does.** In the review, for rows that have a valid barcode and no photo of their own, the supplier can start a photo search. It runs in the background on the server; results appear in the review as they arrive. Nothing is stored until the supplier imports with a photo selected.

**Sources and routing.** Open Food Facts for food and drinks (and products with no category); Open Beauty Facts for personal care; Open Products Facts for household and cleaning; Open Pet Food Facts for pet products. Each is a `ProductDataProvider` (`backend/src/products/product-data-providers.ts`); another approved source can be added by implementing that interface.

**API use.**
- Current recommended API: v3 (`/api/v3/product/{barcode}.json`), requesting only `code, product_name, product_name_en, brands, quantity, categories_tags, selected_images, image_front_url, image_packaging_url`.
- User-Agent `AtlantisFMCG/1.0 (info@atlantisfmcg.com)` (contact configurable with `PRODUCT_DATA_CONTACT`).
- Rate limit: Open Food Facts allows 15 product reads per minute per IP and can ban IPs that exceed it. Every lookup in the server process — bulk import and the existing one-product photo search — goes through one queue per host at 12 per minute (`PRODUCT_DATA_PER_MINUTE`), one request at a time, pausing after HTTP 429/503 (Retry-After honoured), with one retry.
- Photo downloads use a separate queue (120 per minute, `PRODUCT_IMAGE_PER_MINUTE`) from the databases' image servers only.
- Cache: one lookup per distinct barcode; found records kept 7 days, not-found 12 hours, in memory (cleared on restart; not shared between server instances).
- Bulk imports: at 12 per minute, 100 barcodes take about 8 minutes. The review shows progress and an estimate; the supplier can import without waiting.

**When is a photo "verified"?** Only when all of these hold: the record has the same barcode (UPC/EAN-13 forms treated as the same code); the name or the brand agrees; nothing contradicts the row (a different size, multipack count, percentage or variant); the source may verify that kind of product; and the kind of product is known (from the row's category or the record's categories). Verified photos are pre-selected; everything else is shown as "check before using" and is never pre-selected. Every result lists its reasons.

**Cleaning and personal-care products.** A community database is never the only proof: their photos are always "check before using", with the reason shown, until a second approved source is added.

**Never overwritten, never invented.** A supplier's own photo (from the file or a link) is never replaced; an existing product that already has photos keeps them. For an existing product with no photo, a chosen photo is shown as a change (old → new) before import. No name, price, stock, packaging or barcode is ever taken from these databases — only the photo, and only if the supplier keeps it selected.

**Data separation and licensing.**
- The databases are read-only for Atlantis: only the barcode is sent, nothing is ever written or contributed back.
- Database: Open Database License (ODbL 1.0); individual contents: Database Contents License 1.0. Product images: Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0). Images can also show third-party trademarks and packaging artwork.
- Each accepted photo is copied to Atlantis storage and recorded on the product (`Product.imageCredits`, additive JSON field) with its source, licence, licence link, attribution ("Open Food Facts contributors"), source page and barcode, and in the product's import record. The product page shows "Photo: Open Food Facts contributors, CC BY-SA 3.0" with links under that photo.
- **Owner decision before relying on this in production:** ShareAlike means the photo (and adaptations of it) must stay under CC BY-SA; Atlantis must not claim exclusive rights to these images. Using packaging photos commercially can also involve trademark rights that the CC licence does not grant. The credit line is implemented; whether this use is acceptable is a legal/business decision.

**Existing one-product photo search.** The photo finder in the product editor now uses the same rate-limited queue. It still does not save the source and licence with the photo it adds (a gap that predates this work; it should record credits the same way).

## 8. Verification

| Check | Result |
|---|---|
| Real PDFs through the extractor | 14 of 15 read (12 tables, 2 offer sheets), 356 rows; row numbering continuous in all 11 files that number rows; the brochure refused |
| Invalid inputs: not a PDF, truncated PDF, password-protected PDF (made with macOS PDFKit), scanned PDF (page picture saved as PDF), over 4 MB, over 40 pages, picture brochure | Each refused with its own reason, on the server |
| Mixed PDF (one scanned page + one text page) | Text page read, scanned page reported |
| Excel files (4) through column matching | Brand/manufacturer, second barcode column, description-as-name, pieces per pallet now proposed correctly |
| End-to-end on a local server with the real Takis PDF and live Open Food Facts | 11 rows read; 10 barcodes looked up in 50 s; 9 verified, 1 sent to manual check (database name "Dragon Sweet Chili" vs "Takis Sweet Chilli"); import created 11 drafts; importing the same PDF again: all 11 shown as already in the catalog |
| Same flow in the browser (Drinks, OFFER 08, Takis PDFs) | Check-rows step with page pictures, corrections and exclusions; mapping with the price basis held for choice; review with page numbers; photo search progress and results; import of 6 updates with photos stored and credited; credit line on the product page |
| Arabic (RTL) and a 375 px screen | Check-rows, mapping and review screens correct, no horizontal overflow |
| Backend unit tests | 285 of 285 pass (29 suites), including new PDF, photo search, rate limit, currency and template tests |
| Frontend type check, i18n check (7 languages), production build | Pass |

Not tested: OCR (not implemented); the photo search against Open Beauty / Products / Pet Food Facts live (tested with fakes; Open Food Facts tested live); production Supabase storage for photo copies (tested with a local stand-in); a real Railway deploy of the PDF page pictures, which use the `@napi-rs/canvas` binary already in the lockfile for Linux x64.

## 9. What depends on configuration, and what is not done

- **Production database:** `Product.imageCredits` is a new optional column; production runs `prisma db push`, which adds it without touching existing data.
- **Storage:** photo copies need the existing Supabase storage to be configured (as for any product photo).
- **Optional settings:** `PRODUCT_DATA_CONTACT`, `PRODUCT_DATA_PER_MINUTE`, `PRODUCT_IMAGE_PER_MINUTE`.
- **Several server instances:** the lookup queue and cache are per process. With more than one backend instance, the combined rate could exceed 15 per minute; a shared queue (e.g. Redis) would then be needed.
- **Not done:** OCR for scanned PDFs; extracting product pictures embedded in PDFs (most of these PDFs have a picture column — the photo search covers rows with a barcode); combining a PDF and a spreadsheet in one import (one file per import; duplicates across imports are caught by barcode); PDFs over 4 MB (limited by the upload proxy); recording photo credits in the one-product photo finder; server messages in the mapping step that are still English (existing debt).
