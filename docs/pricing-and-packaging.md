# Pricing, packaging and minimum orders

The single source of truth is `backend/src/orders/pricing.ts`. The cart quote (`POST /orders/quote`), order creation (`POST /orders`), mixed loads (`/mixed-loads`) and the product page all follow the same rules. The cart and checkout always show the **server quote**; the product page mirrors the same formula for display, and order creation re-prices everything.

## Field meanings

| Field (Product) | Meaning | Unit |
|---|---|---|
| `basePrice` | Supplier's own price for **one case**, converted to EUR. Never shown to buyers. | EUR / case |
| `supplierPrice` + `supplierCurrency` | What the supplier typed, in their currency. The server converts it once to `basePrice` with a fixed rate (`catalog-rules.ts TO_EUR`). No other conversion happens anywhere. | supplier currency / case |
| `price` | Legacy list price (`basePrice × piece markup`), kept for old screens. Pricing uses `basePrice`. | EUR / case |
| `unitsPerCase` | Pieces in one case. | pieces |
| `casesPerPallet` | Cases on one pallet. | cases |
| `palletsPerShipment` | Pallets on one truck. | pallets |
| `moq` + `moqUnit` | Minimum order, in `PIECE`, `CASE`, `PALLET` or `TRUCK`. | as stated |
| `stock` | Stock available to sell. | **cases** |
| `variantPrices` | Optional per-variant **case** price (supplier price). | EUR / case |
| Offer `discountPercent` / `variantDiscounts` | An approved, unexpired wholesale offer: a percentage off. | % |

AppConfig markups (multipliers, admin-set): `piece` (case tier), `pallet`, `container` (truck tier), `mix` (mixed loads). They are applied **once**, on the server, and never sent to suppliers or buyers (non-staff only get ratios between tiers).

The supplier price is always per case. A piece price is derived as `case price ÷ unitsPerCase`, for display only. Selling units are **case**, **pallet** and **truckload**. A tier is offered only when its pack data exists: a case needs `unitsPerCase`, a pallet also needs `casesPerPallet`, and a truck also needs `palletsPerShipment`. Nothing is defaulted.

## Calculation (single-product line)

1. `perCase = round2(basePrice × tierMarkup × (1 − offer%))`. This is rounded once, to the cent.
2. `unitPrice = round2(perCase × casesInUnit)`. `casesInUnit` is 1 for a case, `casesPerPallet` for a pallet, and `casesPerPallet × palletsPerShipment` for a truck.
3. `lineTotal = round2(unitPrice × quantity)`.
4. `subtotal = Σ lineTotal`. Then `discount = round2(subtotal × coupon%)` and `total = subtotal − discount`.

A supplier buying their own listing pays the raw price (no markup). The supplier's value of a line (`supplierUnitPrice`) is `round2(basePrice × (1 − offer%) × casesInUnit)`. The offer cuts the supplier price and the buyer price by the same percentage, so the Atlantis margin ratio is unchanged.

**Not included in the total:** delivery and VAT. Freight is quoted by Atlantis after the order (`Order.shippingCost` stays empty until then), and VAT is added on the invoice. No client-side freight figure is stored.

**Currency:** all prices are EUR. The storefront can *display* other currencies with a visible currency code, and checkout states that the charge is in EUR.

## Minimum order (MOQ)

`minUnits(product, tier) = ceil(moqInPieces ÷ piecesPerUnit)`, at least 1. Below it, the line is refused with `BELOW_MOQ`. The error carries `minUnits`, `quantity`, `remaining`, `unitPrice`, `minLineTotal`, `moq`, `moqUnit` and `mixable`, so the cart can show progress and both ways forward:

* **Option 1:** set the quantity to the minimum (the price of the minimum line is shown).
* **Option 2:** start a **mixed load** with the same quantity: cases go to a mixed pallet, pallets to a mixed truck. This is only offered when the product's minimum fits in one such load.

### Mixed pallets and trucks

* A mixed pallet is filled with whole cases; a mixed truck with whole pallets. Each line uses `quantity ÷ that product's capacity` of the load, and the load can't go above 100%.
* **Minimum order in a mixed load:** a product's MOQ applies to that product (its SKU) inside the load. On Atlantis one Product row is one supplier's listing, and its **variants** (flavour, size…) are the only items that share that SKU — so variants of the same product count together toward its minimum, and other products never do. A minimum larger than the load itself is reported as impossible (order by the full pallet or truck instead).
* Several products in one load need one verified dispatch site (the same warehouse, or the same stated EXW location). Different countries are refused.
* An optional admin fill rule (`MIX_MIN_FILL_PERCENT`) can also require a minimum fill. It is not set by default.
* Price: `Σ (case price × cases) × mix markup`, rounded once.
* Each cart line also gets `minimum` (`unit`, `required`, `have`, `remaining`, `percent`, `met`) in the MOQ's own unit — e.g. 1 of 5 pallets = 20% — converted only through the product's own pack sizes; the cart's progress bar shows exactly this.

### Add Mix candidates

`GET /mixed-loads/:id/candidates` returns only the **other variants of the same product** (same SKU, so same supplier and dispatch site) that still have stock and room in the load. If there are none, the cart disables Add Mix and says why.

## Stock

Stock is checked in **cases** in the quote, before checkout, and again atomically when the order is created. That includes every product inside a mixed load. Each line records the cases it took (`OrderItem.stockCases`, or `stockCases` on each mixed-load entry). Stock goes back when an order is cancelled before dispatch.

## Worked examples

Pinned by `pricing.spec.ts › Documented pricing examples`. The product has a supplier price of €10.00 per case, 12 pieces per case, 80 cases per pallet and 33 pallets per truck. The markups are 1.10 (case), 1.05 (pallet), 1.02 (truck) and 1.15 (mix).

| Order | Per case | Unit price | Total |
|---|---|---|---|
| 5 cases | €11.00 | €11.00 | €55.00 (60 pieces) |
| 15 pallets | €10.50 | €840.00 | €12,600.00 (1,200 cases) |
| 1 truck | €10.20 | €26,928.00 | €26,928.00 (2,640 cases) |
| 1 case with a 10% offer | €9.90 | €9.90 | €9.90 |
| Mixed truck: 8 + 7 pallets (both €10/case) | — | — | €13,800.00 (1,200 cases × €10 × 1.15) |

With an MOQ of 15 pallets, 1 pallet gives `BELOW_MOQ` (14 more needed). 8 pallets of one variant + 7 of another variant of the same product qualify; 8 + 7 of two different products do not.

## What was fixed in this round

* The product page showed approved offer discounts (−X%), but the cart, quote and order charged the list price. The server now applies the same offer.
* Stock was not checked for mixed loads at all, and not shown in the quote. It is now checked in the quote and taken atomically at order time, per product.
* Mixed loads ignored product minimums whenever no fill rule was set, so a one-case load of a 15-pallet-MOQ product could be ordered. The same-supplier minimum now applies.
* The checkout stored a client-invented freight figure as `shippingCost`. It now stores none until Atlantis quotes freight.
