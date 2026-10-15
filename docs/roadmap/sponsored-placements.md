# Supplier-funded promotion: proposal

Status: **proposal only.** Nothing here is implemented. There is no charging, no auction, no sponsored ranking and no paid campaign. The existing "Ads & Placements" admin entry stays paused ("SOON").

## 1. What suppliers could buy

| Format | Where the buyer sees it | Label |
|---|---|---|
| Sponsored product | Up to 2 fixed slots in category and search results (positions 3 and 9, say), never position 1 | "Sponsored" chip on the card |
| Featured supplier products | A rail on the category page | Rail title "Sponsored by suppliers" |
| Category placement | The category page header strip | "Sponsored" |
| Inclusion in a buyer email | One clearly marked block in the existing marketplace update email | "Sponsored" block |
| Fixed-term campaign | Any of the above, with start and end dates and a report | — |

Organic results are never re-ordered by payment. Sponsored slots are **added** at fixed positions, and they are capped per page. Search and filters (origin, brand and price) apply to sponsored items too, so a sponsored product only appears where it would be relevant anyway.

## 2. Eligibility: no paying for what buyers can't buy

A product can be promoted only while all of these are true. They are checked when the campaign is booked and **again at every impression**:

* status `APPROVED`, completeness rules met, with a real image;
* stock above one MOQ, and every pack tier it advertises available;
* the supplier account is active, and verified if KYC is required at that point;
* no open dispute against the product;
* delivery possible to at least one supported destination.

When eligibility fails mid-campaign, the slot is skipped, not filled by a weaker match, and the supplier isn't charged for it.

## 3. Pricing and purchase (supplier side)

* Start with **fixed-price, fixed-term** placements (for example per category per week), booked from the supplier hub. Inventory is limited and shown up front. Auctions only once demand exceeds slots.
* The budget is paid in advance against an Atlantis invoice, kept separate from order settlement (see §6). Any unused part is credited back.
* A supplier sees: impressions, clicks, add-to-cart actions, quote requests and orders containing the product within 14 days of a click. All are counted from Atlantis events; nothing is estimated.

## 4. Measurement

* **Impression:** the card was at least 50% visible for 1 second (IntersectionObserver), de-duplicated per session and slot.
* **Click:** a click on the card or its link.
* **Attributed outcome:** an add-to-cart, quote request or order line of the promoted product by the same buyer within 14 days of a click. This is reported as "orders after a click", never as "orders caused by" the ad.
* **Invalid traffic:** staff accounts, the supplier's own account and bots are excluded. Clicks from the same buyer are capped.

## 5. Protecting organic discovery and buyer trust

* There is a cap on sponsored share per page, and positions are fixed.
* Every sponsored item has a visible "Sponsored" label and an explanation ("Why am I seeing this?"). The label survives in email.
* A buyer email only includes sponsored blocks for buyers with marketing consent (the existing consent rules). Operational emails never carry promotion.
* Prices, minimums and availability inside sponsored units come from the same server quote as everywhere else.

## 6. Keeping ad revenue apart from transaction revenue

* Campaign purchases create their own invoice type and ledger entries (for example a `PromotionInvoice` and a `promotion` revenue line). They never touch order escrow, platform fees or supplier payouts.
* Reports show the two revenue lines separately.

## 7. When to build it: go/no-go criteria

Build the first version only when **all** of these hold for two consecutive months:

* at least 20 active suppliers with at least 10 approved, in-stock SKUs each;
* at least 2,000 monthly signed-in buyer sessions, and at least 50 orders a month (enough traffic for a slot to show measurable clicks);
* at least 5 suppliers who say they would pay. Run a free 4-week pilot with manual reporting first.

**Success metrics after launch:** click-through rate on sponsored slots compared with organic at the same position, add-to-cart rate after a click, repeat bookings by suppliers (the clearest sign of value), and no drop in organic conversion or search satisfaction.

## 8. Optional later: premium content and AI-assisted creative

Better product content (extra photos, spec sheets, translated descriptions) could be a paid option. Any AI-generated image or text must be labelled. It must never alter the product's real packaging or claims, and it needs supplier approval plus Atlantis review before it goes live (same review flow as listing edits).
