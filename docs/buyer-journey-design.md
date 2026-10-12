# Atlantis — Buyer Journey & Dashboard Design (for approval)

Status: **design only. Nothing below is implemented** unless it is marked as existing.
Basis: a read-only audit of the repository on 2026-10-12 (frontend `frontend/src/app`, backend `backend/src`, `backend/prisma/schema.prisma`).

Legend: **EXISTS** = working today · **UI** = new frontend over existing APIs · **BACKEND** = new server work required · **BUSINESS** = a decision only Atlantis can make.

---

## 1. Audit — what actually exists

| Area | Reality today |
|---|---|
| Buyer dashboard | Under `/dashboard/customer`: an overview, an order list and order detail, settings, notifications and a support page. All of these are on real APIs. There is also `/dashboard/security` (2FA). It is a set of pages, not one tabbed dashboard. |
| Orders | **Multi-supplier orders already work.** One `Order` can contain items from several suppliers, and every supplier involved is notified. `OrderItem` has **no `supplierId`**; the supplier is only known through the product. Statuses are PENDING → PAID → PROCESSING → SHIPPED → DELIVERED, plus CANCELLED, with no enforced transitions. Buyers can list orders, view one, confirm delivery (only when SHIPPED) and hide an order. **Buyers cannot cancel an order.** |
| Stock | Stock is reduced when the order is created. `stock` and `variantStock` are numbers the supplier types in; `readyForDispatch` and `leadTime` exist. **There is no record of when a supplier last confirmed stock, and no per-line confirmation.** |
| Tracking | `Shipment` and `ShipmentUpdate` models exist (tracking number, carrier, expected delivery). Only an admin can create them, and `/dashboard/track` looks them up. Whether real orders actually get shipments depends on the operations team. |
| Invoices | An `Invoice` model and `/invoices/my` exist. There is **no PDF generator**: `pdfUrl` is only filled if someone supplies a file. The supplier can upload their own invoice (`Order.supplierInvoiceUrl`). |
| Saved lists | Only a wishlist exists (product only, **no quantity**). There is **no list model and no reorder endpoint**. The `/requests` buying list lives in the browser only. |
| Mixed loads | `MixedLoad` is saved server-side, with optimistic locking and a link to its order. |
| Pricing | Server-side `pricing.ts` (tiers plus admin markups) is the source of truth. Buyer price-group models exist but are unused, and the design does not use them. |
| Alternatives | `GET /products/:id/similar` exists. There is no "is this the same product?" logic. |
| Auth / sessions | JWT in a cookie (30 days) plus a refresh-token table (90 days). **The refresh-token table stores no device, IP or user-agent.** Logout only clears cookies and does not revoke the refresh token. A revoke-all function exists in code, but no endpoint calls it. Password change, forgot/reset password, 2FA (TOTP and email code), profile update and avatar all exist. |
| Support | The order chat (`SupportMessage` with `orderId`) and disputes both exist. Verified official contacts: **email `Info@atlantisfmcg.com`**, LinkedIn `linkedin.com/company/atlantis-fmcg`, Facebook `facebook.com/atlantisfmcg`. **There is no WhatsApp number and no phone number** anywhere in the code. |
| Admin / owner | `/admin/*`, `/dashboard/admin`, `/dashboard/supplier` and the role guards stay untouched. |

## 2. Buyer dashboard — screen by screen

One route, `/account`, with four tabs. It reuses the existing pages as tab content instead of rebuilding them. The tab is kept in the URL (`/account?tab=orders`). On a phone the tabs become a horizontally scrolling segmented control; on desktop they are a left rail with the content beside it.

**Header (every tab):** company name, "Start a new order" button (to the catalog) and "Need help?" (opens the Contact sheet).

### Tab 1 — Overview
- **Continue where you left off** (only if present): the pending mixed load (sessionStorage today) and the cart. — UI
- **Bought before**: the products from the buyer's past order items, newest first. Each card shows the current price, "Add to cart" and "Add to list". — UI (from `/orders/my-orders`)
- **Frequently bought**: shown **only when a product appears in 2 or more past orders**. Otherwise the section is hidden; it is never filled with filler. — UI (computed from real orders)
- **Recent orders**: the last 3, each with its status and a link. — EXISTS (data)

### Tab 2 — Orders & Tracking
- List with filters: All / In progress / Delivered / Cancelled. Each row shows the reference, date, number of suppliers, total and status. — UI over EXISTS
- **Order detail**:
  - Items are grouped **by supplier**, with one status block per supplier group. — UI (grouped through the product; BACKEND for a proper `OrderItem.supplierId` snapshot)
  - Every figure carries a confirmation badge (see §4): *Confirmed* / *Awaiting supplier confirmation* / *Not yet available*.
  - Tracking: shown only when a `Shipment` exists. Otherwise the order says "Tracking will appear once shipped". The design **never estimates a delivery date**.
  - Invoice: listed only if `/invoices/my` has one with a `pdfUrl`, or if the supplier uploaded one. Otherwise: "Invoice not yet issued".
  - Actions: Confirm delivery (EXISTS) · Report a problem (§6) · Save items to a list (§5) · Reorder (§5).

### Tab 3 — My Lists
- List cards (name, item count, last updated) and a "New list" button.
- **List detail**: a table with product, the buyer's chosen unit (case, pallet or truck), quantity stepper, current price and remove. Actions at the bottom: "Add all to cart" and "Review & reorder".
- The existing wishlist appears as a built-in list called "Saved products"; its quantities default to 1, because the wishlist has no quantity field.
- Real lists with quantities are new. — UI + BACKEND (§8)

### Tab 4 — Settings
- **Profile**: photo, name, email, phone and country. — EXISTS (`PATCH /users/me`, avatar)
- **Business details**: company name, VAT number, tax ID and website. — EXISTS (User fields)
- **Delivery addresses**: — BACKEND. Today addresses are kept in the browser (localStorage), so they disappear on another device.
- **Password**: change password. — EXISTS
- **Two-step verification**: link the existing `/dashboard/security` page in. — EXISTS
- **Active sessions**: — BACKEND (§7). This section is hidden until the backend work ships, so no sessions are ever invented.

## 3. Workflow — multi-supplier order

```
Catalog/PDP ──add──▶ Cart (items from any supplier, grouped by supplier)
   │                    │  prices shown = server quote (POST /orders/quote) — EXISTS
   │                    ▼
   │              Review step: per line → price source + availability badge
   │                    │   lines needing confirmation are labelled, totals marked "estimated"
   │                    ▼
   └────────────▶ Place order (POST /orders, idempotent) — EXISTS
                        │
                        ▼
              Order created (PENDING) ─▶ each supplier notified — EXISTS
                        │
            per-supplier confirmation (BACKEND: line confirm/adjust)
                        │
         ┌──────────────┴──────────────┐
   all lines confirmed           a line changed/short
         │                              │
   totals become "confirmed"     buyer asked to accept/remove the change
         ▼                              ▼
   payment / dispatch            never applied silently
```

The cart already supports mixed suppliers. The new pieces are the per-supplier grouping in the UI, the "estimated vs confirmed" labelling, and the supplier line-confirmation step.

## 4. Workflow — supplier-confirmed availability

Three states on every line, from **real fields only**:

| Badge | Rule | Data source |
|---|---|---|
| **Confirmed by supplier** | the supplier confirmed this line on the order | BACKEND: `OrderItem.confirmedQty`, `confirmedAt` |
| **Awaiting supplier confirmation** | the order exists but this line is not yet confirmed | default after order creation |
| **Stock info may be out of date** | the catalog stock figure is older than N days (N set by Atlantis) | BACKEND: `Product.stockUpdatedAt` (today only the general `updatedAt` exists, and it changes on any edit) |

Before ordering, the catalog stock is only ever described as "listed by supplier", never "in stock" or "guaranteed".

## 5. Workflow — saved lists and reorder

```
Order delivered ─▶ banner: "Save these items to a list for next time?"  (optional, dismissible)
                     └▶ choose existing list | create new (name) ─▶ items + quantities copied
My Lists ─▶ list ─▶ "Review & reorder"
            └▶ POST /orders/quote for every line (current prices) — EXISTS endpoint
               ├ price changed   → "€12.00 → €13.20 (+10%)" flag
               ├ unavailable / product removed → greyed, excluded, buyer told
               └ quantities editable ─▶ Add to cart ─▶ normal checkout
```

The reorder flow never submits an order by itself. It always lands in the cart for the buyer to review.

## 6. Workflow — order support

```
Order detail ─▶ "Report a problem" ─▶ choose: Missing item · Delay · Damaged · Wrong item · Other
   └▶ pre-filled message: "Order #REF · <date> · <items selected> · <issue>"
        ├ Send in Atlantis chat (EXISTS: order chat by orderId)  ← primary, keeps history
        ├ Email Atlantis  → mailto:Info@atlantisfmcg.com?subject=Order #REF – <issue>   (verified)
        ├ LinkedIn / Facebook → open the official page (verified; no message prefill possible)
        └ WhatsApp / Telephone → HIDDEN until Atlantis supplies an official number
```

Returns, refunds, delivery commitments and payment terms are shown as "contact us" until Atlantis confirms the policies (BUSINESS). A dispute can be opened only where `/disputes` already supports it.

## 7. Product alternatives and savings

The design shows two tiers, with a strict rule for each:

- **Same product**: the same EAN, **and** the same size/weight, **and** the same unit. Savings appear only when both prices are for the same quantity in the same unit (for example, per case of 24). — UI over `/similar`; matching rule is BACKEND
- **Different alternative**: labelled "Different product". It lists the differences (brand, size, pack, origin) and **shows no savings figure**.

Every swap is a buyer button ("Replace with this"), shown as a diff before it is applied. The system never substitutes automatically, including in reorders.

## 8. Active sessions (security)

Needed in the backend before any UI ships:
1. Add `createdAt`, `lastUsedAt`, a hashed IP / coarse location, and a parsed user agent (OS and browser) to `RefreshToken`, recorded at login and on refresh.
2. Make logout revoke the current refresh token (today it only clears cookies).
3. New endpoints: `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/sessions/revoke-others`. These can reuse the existing `revokeAllRefreshTokens`.
4. Note: the access JWT stays valid for 30 days even after its refresh token is revoked. Revocation only becomes real once the access-token lifetime is shortened, or a token version is checked per request. **This is a security decision to make before claiming "sign out other devices" works.**

The device label is derived only from the user agent ("Chrome on macOS"). Older sessions show "Unknown device" and nothing is fabricated.

## 9. Existing vs new — summary

| Feature | Existing | New UI | Backend required |
|---|---|---|---|
| Tabbed dashboard | pages exist | ✔ shell + tabs | — |
| Bought before / frequently bought | order data | ✔ | optional aggregate endpoint for speed |
| Multi-supplier order + grouping | ✔ | ✔ grouping, badges | `OrderItem.supplierId` snapshot |
| Supplier line confirmation | ✗ | ✔ badges | confirm/adjust endpoint + fields, buyer accept-change |
| Stock freshness | ✗ | ✔ badge | `stockUpdatedAt` + threshold (BUSINESS) |
| Tracking | model ✔, admin-fed | ✔ | none (process: ops must create shipments) |
| Invoices | model ✔, no PDF | ✔ list/download | PDF generation or upload workflow |
| Saved lists + reorder | wishlist only | ✔ | `ShoppingList`, `ShoppingListItem` models + CRUD |
| Save after order | ✗ | ✔ | uses the lists API |
| Alternatives & savings | `/similar` | ✔ | strict matching endpoint |
| Support entry | chat ✔, email ✔ | ✔ sheet + prefill | none (WhatsApp/phone need official numbers) |
| Buyer cancel | ✗ | — | BUSINESS rule first |
| Sessions | refresh tokens (no device data) | ✔ | §8 |
| Addresses | localStorage | ✔ | `Address` model + CRUD |

## 10. Prioritised plan

1. **P1 — Dashboard shell and Orders.** Build `/account` with the four tabs wrapping the existing pages, the Overview (bought before, recent orders), and order detail grouped by supplier with honest status, tracking and invoice states. *Frontend only, low risk.*
2. **P2 — Lists and reorder.** Add the `ShoppingList` models and CRUD, the My Lists tab, "save after order", and reorder through `/orders/quote` with price-change flags.
3. **P3 — Confirmation states.** Add `OrderItem.supplierId`, `confirmedQty` and `confirmedAt`, a supplier confirm endpoint, the badges, and a buyer accept-change step. Add `stockUpdatedAt`.
4. **P4 — Support sheet.** Order-prefilled chat and email plus the verified social links. Add WhatsApp and phone once they are provided.
5. **P5 — Sessions.** The backend work in §8, then the Settings section.
6. **P6 — Invoices and alternatives.** A PDF or upload workflow, and the strict same-product matching.

## 11. Decisions needed from Atlantis (BUSINESS)
- An official WhatsApp number and phone number, if any.
- Whether a buyer may cancel an order, and up to which status.
- The returns, refunds and payment-terms wording.
- How many days before catalog stock counts as "may be out of date".
- Who issues invoices: generated by Atlantis, or uploaded by the supplier.
- Session policy: a shorter access-token lifetime, or a per-request token check.
