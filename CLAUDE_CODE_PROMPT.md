# B2B Marketplace — Claude Code Task Specification
> Read CLAUDE.md fully before starting. All prices stored in EUR. Backend on port 3005.

---

## CONTEXT

This is a B2B marketplace (NestJS backend + Next.js 14 frontend). Prices in the DB are in **EUR** (base currency). The admin uploads supplier price lists via Excel. Customers buy in bulk units: Truck → Pallet → Case (no single pieces — B2B only).

---

## TASK 1 — Fix Price Discrepancy After Re-Upload

**Problem:** Products currently in the DB have slightly wrong `basePrice` values because they were uploaded when the frontend was defaulting to the wrong currency (USD instead of EUR). The fix for the upload currency has already been deployed. The admin needs to:
1. Delete the old TENA products from `/admin/products`
2. Re-upload the supplier spreadsheet from `/dashboard/supplier` with **EUR selected** in the currency dropdown

**Your job:** Verify the upload flow is correct end-to-end:

- `frontend/src/app/dashboard/supplier/page.tsx` line ~181:
  ```typescript
  const currentCurrency = localStorage.getItem('platform-currency') || 'EUR';
  ```
  This must default to `'EUR'`, not `'USD'`. ✅ Already fixed — confirm it's correct.

- `backend/src/products/products.controller.ts` — `TO_EUR` table:
  ```typescript
  EUR: 1, USD: 0.926, GBP: 1.162, EGP: 0.018
  ```
  When currency=`EUR`, `priceInBase = price * 1 = price`. Confirm no multiplication is happening.

- `backend/src/products/products.service.ts` line ~197:
  ```typescript
  basePrice: dto.price,   // dto.price IS already priceInBase from controller
  price: dto.price * finalMarkup,
  ```
  `basePrice` must equal the raw EUR supplier price (e.g., 14 for Medium TENA). Confirm.

**Expected after re-upload:**
- TENA Medium: basePrice = 14.00 (not 13.55)
- TENA Large: basePrice = 16.00 (not 15.86)
- Admin PRICE PER PIECE field matches the spreadsheet exactly.

---

## TASK 2 — EAN Image Lookup (Already Fixed — Verify)

**Problem:** `fetchBingCatalogImages` was returning 0 results for hygiene products (TENA, Pampers, etc.) because:
1. The `filterui:color2-bw-white` filter blocked most product images
2. The single regex `/"murl":"(https?:[^"]+?)"/g` was outdated for current Bing HTML

**Fix already applied in:** `backend/src/products/ean.service.ts`

**Verify the fix is correct:**
```typescript
// Should have 3 strategies:
// Strategy 1: Bing simple (no restrictive filters): ?q=TENA+proskin+7322541802145&form=HDRSC2
// Strategy 2: Bing EAN-only: ?q=7322541802145+product&form=HDRSC2  
// Strategy 3: DuckDuckGo images fallback
// Plus 4 regex patterns covering different Bing HTML formats
```

If the fix is NOT there (or git wasn't pushed yet), implement it now. The method signature:
```typescript
private async fetchBingCatalogImages(ean: string, productName?: string, max: number = 6): Promise<string[]>
```

**Test:** Click "Find images by EAN" on product `7322541802145` (TENA proskin slip plus Medium). Should find real product images, not return "Bing returned 0 candidates".

---

## TASK 3 — Customer Unit Quantity Selector with MOQ Enforcement

**File:** `frontend/src/app/products/[id]/ProductDetailClient.tsx`

**Current state:** Customer can select unit type (Truck/Pallet/Case) and adjust quantity with +/- buttons. However, the minimum quantity is always 1 regardless of the supplier's MOQ.

**Required behavior:**
1. When customer selects a unit type, the minimum allowed quantity must reflect the product's MOQ:
   - If `moq` is set (in pieces), compute min units as: `Math.ceil(moq / piecesPerUnit)`
   - `piecesPerUnit` for Case = `unitsPerCase`; for Pallet = `unitsPerCase * casesPerPallet`; for Truck = `unitsPerCase * casesPerPallet * palletsPerShipment`

2. Quantity selector must start at and enforce the computed minimum:
   ```typescript
   // Example: moq=84 pieces, piecesPerPallet=84 → minPallets = ceil(84/84) = 1
   // Example: moq=168 pieces, piecesPerPallet=84 → minPallets = ceil(168/84) = 2
   const minUnits = Math.max(1, Math.ceil((product.moq || 1) / piecesPerUnit));
   ```

3. Show MOQ hint below the quantity selector:
   ```
   Min. order: 1 pallet (84 pcs)
   ```

4. The `-` button must be disabled when `quantity <= minUnits`.

5. When unit type changes, reset quantity to `minUnits` for the new unit type.

**Implementation notes:**
- `product.moq` is the MOQ in pieces (from DB)
- `piecesPerCase` = `product.unitsPerCase || 1`
- `piecesPerPallet` = `(product.unitsPerCase || 1) * (product.casesPerPallet || 1)`
- `piecesPerTruck` = piecesPerPallet × `(product.palletsPerShipment || 1)`
- The state `quantity` and `setQuantity` already exist on line ~32
- The `selectedUnit` state already exists on line ~49

---

## TASK 4 — Show Markup as Percentage in Admin (Already Done — Verify)

**File:** `frontend/src/app/admin/products/page.tsx`

**Problem:** The PRICING & UNITS preview shows markup as a raw multiplier (e.g., `× 1.5`), which operators don't understand.

**Fix already applied:** Lines ~1242, ~1250, ~1260 now show:
```
€13.55 × 3 +50%    ← instead of "× 1.5"
€13.55 × 3 × 28 +10%   ← instead of "× 1.1"
```

Formula: `+${Math.round((markup - 1) * 100)}%`

**If not yet committed/deployed, implement:**
```typescript
// Replace:
{fmt(pp)} × {pc} × {markups.piece}
// With:
{fmt(pp)} × {pc} <span className="text-emerald-600 font-bold">+{Math.round((markups.piece - 1) * 100)}%</span>
```

Apply the same pattern for `markups.pallet` and `markups.container`.

Also verify the **Admin Settings page** (`frontend/src/app/admin/settings/page.tsx`) shows markup inputs as percentage (not multiplier). Lines ~555-580 already do:
```typescript
value={Math.round((markupPiece - 1) * 100 * 10) / 10}
```
Confirm the input label says "%" and the save handler converts back: `markupPiece = 1 + (inputValue / 100)`.

---

## TASK 5 — Git Push

All fixes above need to be committed and pushed to GitHub. The sandbox cannot push due to SSH key restrictions.

**Run from terminal:**
```bash
cd /Users/abdelrhman/Documents/MarketPlace-main

# Clear stuck lock files from sandbox session
rm -f .git/HEAD.lock .git/index.lock

# Stage all pending changes
git add backend/src/products/ean.service.ts
git add frontend/src/app/admin/products/page.tsx

# Commit
git commit -m "fix: markup as %, MOQ enforcement, EAN image search improvement"

# Push
git push origin main
```

---

## SUMMARY OF ALL CHANGES

| # | File | Change | Status |
|---|------|--------|--------|
| 1 | `frontend/src/lib/currency.ts` | EUR as base currency (EUR_RATES, EUR=1) | ✅ Committed |
| 2 | `frontend/src/app/products/[id]/ProductDetailClient.tsx` | Remove PIECE unit button (B2B only) | ✅ Committed |
| 3 | `frontend/src/app/dashboard/supplier/page.tsx` | Default upload currency = EUR | ✅ Committed |
| 4 | `backend/src/products/ean.service.ts` | Multi-strategy Bing + DDG image search | ⏳ Staged, needs commit |
| 5 | `frontend/src/app/admin/products/page.tsx` | Markup shown as % (+50% not 1.5) | ⏳ Modified, needs stage+commit |
| 6 | `frontend/src/app/products/[id]/ProductDetailClient.tsx` | MOQ enforcement per unit type | ❌ TODO |

---

## EXPECTED OUTCOME

After all tasks complete:
- Upload TENA Medium with price=14 EUR → admin shows 14.00 (not 13.55)
- "Find images by EAN" on TENA product → finds actual product photos
- Customer on product page selects "Pallet" → can't go below MOQ minimum pallets
- Admin modal pricing preview shows "+50% margin" instead of "× 1.5"
