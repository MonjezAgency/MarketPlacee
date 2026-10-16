# Orders, payments, refunds — gap analysis

This document audits how an Atlantis order moves and how money is meant to move with it: checkout, the confirmation workflow, payment, deposits, refunds, returns, disputes, delivery charges, shipments, inspections, invoices, finance and the scheduled jobs that touch orders.

Every statement was checked against the code (file:line) and the schema. "Confirmed" means the code path was read end to end. Runtime checks against the local test environment are marked as such. **Nothing in this document was implemented.** Every change described here is approval-required (see [DESIGN_VS_SYSTEMS_BOUNDARY.md](DESIGN_VS_SYSTEMS_BOUNDARY.md)). Gap IDs refer to [MARKETPLACE_GAP_REGISTER.md](MARKETPLACE_GAP_REGISTER.md).

## Summary — enforced in code vs. stated in policy

| Rule or promise | Where it is stated | Enforced in code? | Gap IDs |
|---|---|---|---|
| An order is a request until every supplier accepts and Atlantis approves | Protected Payments, How it works, order pages | **Yes** in the order workflow (`orders/order-workflow.ts`). **No** on the Stripe webhook path, which moves PENDING orders to PROCESSING | TX-03 |
| Buyers pay after approval, with payment details sent by the team | Protected Payments, workflow steps | Not recorded: nothing ever writes `paymentStatus`, `paidAt` or the escrow fields; staff have no "mark paid" action for orders | TX-05 |
| Stripe escrow; funds released on delivery | Terms of Service, supplier earnings (copy removed in this phase), checkout payment page (unlinked) | **No.** `releaseEscrow` is never called; Protected Payments and Returns say there is no escrow | CNT-01, TX-08, SUP-02 |
| Refunds after a dispute decision (1–3 days processing, 5–10 days to the bank) | Returns & Refunds | **No** working refund path (the Stripe reason value is invalid and errors are swallowed); timelines are not tracked | TX-06, CNT-19 |
| Disputes within 7 days, decided in 48–72 hours | Returns, Shipping, Terms | **No** window check and no SLA tracking. Pages anchor the window to different dates | TX-13, CNT-19, DES-05 |
| Evidence (photos) with a dispute; supplier contacted | Returns | The API accepts `evidence`, but the form has no upload; only admins are notified | CNT-19, TX-13 |
| Delivery charge from configured rates, or quoted after the order | Shipping, checkout, order page | **Yes** (server calculation `fulfillment/`), stored in `Order.fulfillment` and `Order.shippingCost`. But `Order.totalAmount` is goods only and pages sum differently | BUY-06, TX-09, TX-10 |
| Invoice available | Wholesale ("for every order"), order page | Generated only on delivery, **in USD, with a flat 5% tax, without freight** | TX-09, DES-08 |
| Deposit | Reference designs | **Not modelled.** No deposit field or flow exists | TX register (deposits) |
| Best-before date on delivered goods | Reference designs | **Not modelled** per line; only the product's listing `shelfLife` exists | DES-04 |
| Order conversations linked to a specific order | Support | Threads are per order, but Support can't be opened on a specific order by link | TX register (support) |

### Payment-status display in this phase

The buyer pages show `Order.paymentStatus` exactly as recorded. Because no code writes it (TX-05), production orders will show **"Not recorded as paid"** on the Payments page, and no payment badge on order cards, until a payment-recording system exists. This is intentional: the UI does not infer payment.

## Part 1 — Workflow by workflow

### 1. Checkout / order creation

- **Current UI**: `frontend/src/app/checkout/page.tsx` (3 steps: address → carrier preference → review). Calls `POST /orders/quote` via `quoteCart` (line ~201), `/coupons/validate/:code` (176), `/shipping/agent-rates` (89, fallback `/shipping/rates` 106), destination check, then `POST /orders` (215). Review copy: "Placing the order sends a request — nothing is charged…" (597). Success step: "Our Marketplace team will contact you to finalize payment and delivery" (336). Totals shown: `grandTotal + freight` "excl. VAT" (582-585).
- **Backend**: `OrdersController.create` `POST /orders` — roles CUSTOMER/ADMIN/OWNER/SUPPLIER, profile completeness + step-up 2FA (`orders.controller.ts:104-119`). `OrdersService.create` (`orders.service.ts:331-469`): idempotency key (332-340), destination policy check (344-348), server repricing via `priceCart` (350, 195-298), client total compared to server total → 409 `PRICE_CHANGED` (354-356), transaction: conditional stock decrement in cases (365-374), Order row with `totalAmount = quote.total` (goods − coupon), `shippingCost` only when fulfilment fully priced (384), `reviewStatus: 'PENDING_REVIEW'`, `submittedTerms` (388), one `OrderSupplierConfirmation` per supplier with deadline (411-413), mixed-load lock (415-419). Post-commit: buyer email (433-440), supplier notifications + emails (445-457), low stock alerts, admin notification.
- **API**: `POST /orders/quote` (CUSTOMER/ADMIN/OWNER/SUPPLIER) `orders.controller.ts:122-127`; `POST /orders` `:104`.
- **DB**: `Order` (schema.prisma:324-405), `OrderItem` (518-567: `price`, `supplierUnitPrice`, `stockCases`, `selectedTier`, `mixComposition`, `mixedLoadId`), `OrderSupplierConfirmation` (407-423), `OrderStatusHistory` (505-516).
- **Enforced**: server pricing, MOQ/stock, destination, idempotency, oversell protection, supplier confirmation rows, freight only from server calc.
- **Policy-only / inconsistent**: buyer email says "✅ Order Confirmed … your order has been placed successfully" with a `$` total of goods only (`email.service.ts:321-335`) while the order is only a request; ref uses `id.slice(0,8)` (email) vs `slice(-8)` everywhere else (`frontend/src/lib/buyer-orders.ts:35`, `orders.service.ts:449`). `Order.supplierId` is never set at creation (no write anywhere; schema.prisma:362) — downstream payment/earnings code depends on it.
- **Missing**: buyer cancellation of a request (no endpoint; `PATCH /orders/:id/status` excludes CUSTOMER, `orders.controller.ts:228`); quote expiry; VAT calculation; deposit/pro-forma.
- **Risks**: coupon applies to the whole cart, no usage limits (see §11); stock is taken at request time and never released when a supplier confirmation expires (see §12).

### 2. Order lifecycle / status transitions

- **State machine**: `ORDER_TRANSITIONS` PENDING→{PAID,PROCESSING,CANCELLED}, PAID→{PROCESSING,CANCELLED}, PROCESSING→{SHIPPED,CANCELLED}, SHIPPED→{DELIVERED,CANCELLED} (`orders.service.ts:36-43`). Workflow overlay `workflowBlocker` (`order-workflow.ts:103-114`): PENDING→PROCESSING/PAID only via approval; SHIPPED/DELIVERED require APPROVED and buyer acceptance of changed terms. LEGACY orders exempt.
- **Implementation**: `internalUpdateStatus` (`orders.service.ts:1288-1470`) — optimistic status check, restock on cancel before dispatch (1321-1340), history row, emails/notifications, invoice on DELIVERED (1445-1451), escrow void/refund on CANCELLED (1454-1467).
- **API**: `PATCH /orders/:id/status` roles SUPPLIER/ADMIN/OWNER/MODERATOR/SUPPORT/LOGISTICS + PolicyGuard ownership (`orders.controller.ts:227-258`; supplier limited to PROCESSING → routed to `supplierAccept`); `PATCH /orders/bulk-status` ADMIN (330-343); `POST /orders/:id/confirm-delivery` CUSTOMER (345-350, `orders.service.ts:1682-1696`); `DELETE /orders/:id` and `DELETE /orders/bulk` ADMIN hard delete (364-374, `orders.service.ts:1729-1740`).
- **UI**: buyer `dashboard/customer/orders/page.tsx`, `orders/[id]/page.tsx` (confirm receipt button); admin `admin/orders/page.tsx`, `admin/orders/[id]/page.tsx:810-830` (Mark as Paid/Confirmed hidden for workflow orders).
- **Enforced**: transitions, approval gate, buyer-acceptance gate, restock-once.
- **Gaps**: Stripe webhook bypasses all of this (writes `status` directly — see §4); `PAID` status unreachable for workflow orders (approval goes to PROCESSING; PROCESSING has no →PAID), so `OrderStatus.PAID` is effectively legacy-only; SUPPORT/MODERATOR/LOGISTICS can cancel or ship **any** order (PolicyGuard staff bypass `auth/policy.guard.ts:28`); hard delete cascades disputes, invoices, escrow (schema.prisma:694, 835, 944) with no restock and no audit; status emails use `slice(0,8)` refs.

### 3. Supplier confirmation + Atlantis approval workflow

- **Rules** (`backend/src/orders/order-workflow.ts`): per-version confirmations, `confirmationState` (56-71), `approvalBlocker` (83-92), `buyerMustAccept` (95-97), `partyStatus` texts (117-127), supplier view without buyer price (45-49). Default deadline 72 h, override `AppConfig ORDER_SUPPLIER_CONFIRM_HOURS` (20; `orders.service.ts:920-924`).
- **Service**: `supplierAccept` (874-888), `supplierReject` (895-916; single-supplier order → cancelled + restock; shared → recorded, admin decides), `decide` with double-click guard and lazy expiry (970-985), `approveOrder` (1002-1019; optimistic on termsVersion, freezes `termsSnapshot`, → PROCESSING, notifies buyer "The Atlantis team will send payment details"), `rejectOrder` (1022-1031), `requestReconfirmation` (1034-1043), `amendOrder` (1050-1107; quantity down only / buyer unit price), `buyerAcceptTerms` (1110-1120), freight change via `setShipping` creates new version (95-137), `expireStaleConfirmations` hourly cron (`order-workflow.cron.ts:11-19`, service 1123-1131).
- **API**: `POST /orders/:id/supplier-accept|supplier-decline` SUPPLIER; `POST /orders/:id/approve|reject|request-confirmation|amend` ADMIN/OWNER; `GET /orders/:id/workflow` ADMIN/OWNER/SUPPORT/MODERATOR/LOGISTICS; `POST /orders/:id/accept-terms` CUSTOMER; `PATCH /orders/:id/shipping` ADMIN/LOGISTICS/OWNER (`orders.controller.ts:213-316, 268-276`).
- **UI**: `components/orders/AdminWorkflowPanel.tsx`, `BuyerWorkflowPanel.tsx`, `frontend/src/lib/order-workflow.ts`, supplier `app/supplier/orders/page.tsx`. Tests: `backend/src/orders/__tests__/order-workflow.spec.ts`.
- **Enforced**: well implemented and tested. Supplier never sees buyer price (`supplierView`, `findBySupplier` 713-822).
- **Gaps**: (a) `amendOrder` recomputes `totalAmount` as Σ price×qty (1090-1093) — the coupon discount in the original total is silently dropped; (b) amended unit price has no floor vs `supplierUnitPrice` (1076-1080) → negative margin possible; (c) quantity amendments don't re-run fulfilment, so `fulfillment`/`shippingCost` go stale; (d) expired confirmations are only flagged — no auto-cancel/restock, so stock stays reserved indefinitely; (e) approval does not require a freight figure — an order can be approved and shipped with `shippingCost = null` ("quoted after the order") and the buyer is never asked to accept a figure; (f) Stripe webhook can move a PENDING_REVIEW order to PROCESSING without any of this (§4).

### 4. Payments (Stripe), paymentStatus, escrow

- **Backend**: `POST /payments/create-intent` CUSTOMER/ADMIN/OWNER/SUPPLIER (`payments.controller.ts:19-31`) → `PaymentsService.createPaymentIntent` (`payments.service.ts:129-262`): allows only `status === 'PENDING'` (149-154) — i.e. **before** supplier acceptance/approval, and never after approval (approved orders are PROCESSING); amount = `order.totalAmount` (goods only, no freight) (162); `capture_method: 'manual'` (202); creates `EscrowTransaction` with `platformFee = totalAmount × platformFee%` (157-159); metadata `destinationAddress` stringifies a JSON object (209-211) and `estimatedDays` defaults to `'3-5'` (208). Returns `findByIdWithItems` which includes the order's `supplier.stripeAccountId`/email (`orders.service.ts:1661-1668`).
- **Webhook** `POST /api/payments/webhook` (raw body `main.ts:57`; `stripe-webhook.controller.ts`): signature verified (35-43); **no idempotency** — `ProcessedWebhookEvent` model (schema.prisma:866-876) is never used; `amount_capturable_updated` → escrow CAPTURED (actually only authorised) and **order PENDING→PROCESSING by direct `prisma.order.update`** (94-99) — bypasses `workflowBlocker`, history, stock checks; emails "payment received / funds held securely in escrow / ready to ship" (120-191); `payment_intent.succeeded` → same PENDING→PROCESSING (236-241); `payment_intent.payment_failed` → escrow REFUNDED and **order CANCELLED** directly (250-258) with no restock, no history, throws if no escrow row.
- **Escrow service** (`escrow.service.ts`): `releaseEscrow` (58-117) is **never called** anywhere; `refundEscrow` (119-135) calls `stripe.refunds.create` with free-text `reason` (stripe.gateway.ts:37-43) — callers pass `'Order cancelled/refunded'` (orders.service.ts:1461) or the **customerId** (disputes.service.ts:118); Stripe only accepts `duplicate|fraudulent|requested_by_customer`, and errors are swallowed → refunds fail silently; refunding an authorised-but-uncaptured intent also fails (CAPTURED is set on authorisation).
- **paymentStatus / paidAt / paymentIntentId / escrowStatus / escrowHeldAt / escrowReleasedAt** (schema.prisma:332-339): **never written** by any code path (grep: only reads in `finance.service.ts:164,169,175,213`, `owner.service.ts:85`, `threat-detection.service.ts:146`, `support-context.service.ts:163`, excel export). No admin endpoint or UI to record a manual payment.
- **Frontend**: `/checkout/payment` (`app/checkout/payment/page.tsx`, `PaymentForm.tsx`, `OrderSummary.tsx`) exists but **no link to it anywhere** (grep `checkout/payment` → none). Copy: "full escrow protection" (page.tsx:175), "Protected by Atlantis Escrow … released when you confirm delivery" (PaymentForm.tsx:117-118), "Platform Protection" fee line = 5% of total shown but not added (OrderSummary.tsx:50-52, 98-107). Buyer `/dashboard/payment-methods` stores IBAN "for refunds and settlements" (page.tsx:45; IBAN encrypted `users.service.ts:247`), card "coming in the next release" (134). Supplier `/supplier/payment-methods` Stripe Connect onboarding (`payments.service.ts:22-78`, KYC check disabled 26-31).
- **Policy text**: protected-payments says "Atlantis doesn’t hold buyer funds in escrow" (`ProtectedPaymentsClient.tsx:68, 237`); returns locale "No escrow" (`locales/en.ts:974-975`); **Terms** say "payment via Stripe escrow", "complete payment at the time of order placement", "confirming delivery triggers the release of escrow funds", KYC required (`TermsClient.tsx:21, 42, 55, 67-68, 73-80`); supplier earnings "Funds held in secure escrow … automatically released" (`supplier/earnings/page.tsx:55-59, 146-148`); webhook emails claim escrow.
- **Net**: there is no working payment collection or recording system. Payment "details are sent by the team" manually and nothing in the DB ever records that a buyer paid.

### 5. Deposits

- No deposit/advance/pro-forma field or flow anywhere (grep `deposit|proforma` → none in backend/prisma/frontend). `CreditTerm` exists (schema.prisma:710-721) but `usedCredit` is never incremented (`FinanceService.useCredit` has no callers) and `credit-check` isn't used at checkout. **Missing**.

### 6. Refunds

- Only automated path: `refundEscrow` (broken, §4) triggered by order cancel (orders.service.ts:1454-1467) and dispute RESOLVED_REFUND (disputes.service.ts:116-119). Always full amount; no partial refund; no refund record (no Refund model; `FinancialAuditLog` REFUND_ISSUED never written — only `INVOICE_GENERATED` is logged, `invoice.service.ts:70-76,107-112`).
- No refund for non-Stripe (bank transfer) payments, no credit note, no invoice cancellation.
- Policy promises: "Refund processing 1–3 business days", "Funds 5–10 business days", Stripe fee note (`locales/en.ts:1011-1017`), "full or partial refund or price adjustment" (988), inspection "deducted on the invoice" (`GoodsInspectionClient.tsx:170`). None is backed by code.

### 7. Returns

- Policy page `app/returns/ReturnsClient.tsx` + `locales/en.ts:968-1034`: dispute-based returns, "Don’t send goods back without written confirmation". No return/RMA model, no return shipping record, no restock on return. **Policy-only** (honestly framed as team-coordinated, but timelines are promised — see findings).

### 8. Disputes

- **Backend** `disputes.controller.ts` / `disputes.service.ts`: `POST /disputes` CUSTOMER (17-30) — order must belong to buyer and not be PENDING/CANCELLED (service 19-21; so PAID/PROCESSING allowed), one active dispute per order (23-26), **no time window**, no validation of reason/description/evidence; notifies ADMIN+SUPPORT only (33). `GET /disputes/my` CUSTOMER; `GET /disputes`, `GET /disputes/stats`, `PATCH /disputes/:id/resolve`, `PATCH /disputes/:id/status` — roles ADMIN/SUPPORT/MODERATOR/**DEVELOPER/LOGISTICS**/OWNER (40-86). `resolve` (101-133) can be repeated (only CLOSED blocked), decision not validated, triggers broken refund. `updateStatus` accepts any status (135-139).
- **DB**: `Dispute` (schema.prisma:832-847): no amount, no supplier, no deadline, no messages; `evidence String[]`.
- **UI**: **Buyer UI exists** (lead disproved): order page dispute card + form (`app/dashboard/customer/orders/[id]/page.tsx:163-174, 210, 415-450`; HEAD version had it too at 219-242, 724-835), deep link `#dispute` from the list (`orders/page.tsx:226`), buyer payments page lists disputes. **No evidence/photo upload** in the form (body sends only orderId/reason/description, line 168). Admin `app/admin/disputes/page.tsx` (no amount input, no evidence view). Suppliers have no dispute view and are not notified.
- **Stats bug**: service returns `{open, underReview, …}` (service 148) but `app/admin/page.tsx:135` reads `disputesData?.OPEN`, `app/admin/support/page.tsx:266,278,618` read `stats?.OPEN` / `stats?.openDisputes` → always 0/fallback.
- **Policy**: "within 7 days of the expected delivery date" (en.ts:984) vs "more than 7 days after delivery confirmation" (1004) vs Terms "within 7 days of delivery confirmation" (`TermsClient.tsx:69, 96`) vs shipping "within 7 days, with photos" (`ShippingClient.tsx:171`); "review within 48–72 hours" (988, 1009); "The supplier is contacted as well" (986). None enforced.

### 9. Delivery / fulfilment pricing

- **Backend** `fulfillment/fulfillment-calc.ts` (pure; "no rate → quote_required, never estimated", lines 1-13), `fulfillment.service.ts` (`forQuote`, `forBuyer` strips supplierId 86-89), admin rates/hubs `fulfillment.controller.ts:43-66` (ADMIN/OWNER/LOGISTICS), supplier settings (22-41). Used by `priceCart` (orders.service.ts:289-297) and stored on `Order.fulfillment`. Tests `fulfillment/__tests__/fulfillment-calc.spec.ts`.
- **Legacy carrier list**: `POST /shipping/agent-rates` returns three hard-coded carriers (DB Schenker, LKW Walter, Raben) with **formula costs and estimatedDays** (`shipping.service.ts:165-207`); checkout shows only names + "Cost and transit time are confirmed by Atlantis…" (`checkout/page.tsx:400-428`) — the computed cost isn't displayed, but the endpoint is public and implies carrier relationships; the chosen name is stored as `shippingCompany` (orders.service.ts:380-381) and drives the logistics portal matching (§10).
- **Enforced**: freight only from server calc or admin `setShipping`; freight change on workflow order = new terms version + buyer acceptance (orders.service.ts:114-133).
- **Gaps**: freight is never charged by the Stripe path (amount = goods); invoice excludes freight (§13); "Processing time … up to 48 business hours after payment is received" (`ShippingClient.tsx:149`) — no payment-received state exists to start such a clock.

### 10. Shipments / tracking

- **Backend** `shipping/shipment.controller.ts`: `GET /shipments/track?number=` **public, no guard** (12-15) → returns shipment + **entire Order row** incl. customer name/email, `shippingAddress`, `submittedTerms`, `fulfillment` (`shipment.service.ts:38-53`); `GET /shipments/order/:orderId` JWT only, **no ownership check** (17-21); `POST /shipments`, `POST /shipments/:id/updates`, `GET /shipments/admin/all` ADMIN. `Shipment.status` never changes (addUpdate only inserts `ShipmentUpdate`, 27-36). Tracking via `PATCH /orders/:id/shipping` upserts Shipment (orders.service.ts:140-170). `GET /shipping/track/:id` DHL/Aramex providers.
- **Logistics portal**: `GET /orders/logistics/assigned` (LOGISTICS/ADMIN/OWNER) fuzzy two-way substring match on `shippingCompany` vs user companyName/name (orders.service.ts:479-515) → returns customer name/email/phone; `app/logistics/orders/page.tsx`. LOGISTICS also gets full admin view of any order via `GET /orders/:id` (orders.controller.ts:207-209).
- **UI**: `/dashboard/customer/orders/[id]/track/page.tsx` is **entirely hard-coded demo content** (Cairo hub, "Steel Reinforcement Bars", "$14,500.00", ETA "28 April 2024", "Verified by Monjez Logistics", lines 19-56, 200-260). `/dashboard/track` (linked from How it works, `HowItWorksClient.tsx:20`) and `/admin/logistics` call `axios.get('/api/shipments/...')` (`dashboard/track/page.tsx:24`, `admin/logistics/page.tsx:18,132,171`) but there is no Next route `/api/shipments` (only `/api/proxy/...`; middleware excludes `/api`, `middleware.ts:37`) → always "not found". Order detail shows tracking number with carrier deep link (HEAD `[id]/page.tsx:348-380`).
- **Missing**: carrier status sync, ETA, proof of delivery, delivered-at timestamp, partial shipments (Shipment is 1:1 with Order, schema.prisma:785).

### 11. Coupons / discounts affecting totals

- `priceCart` applies `Coupon.discountPercent` (0-100) to the whole subtotal (orders.service.ts:279-288); `Coupon` is tied to a `placementId` (schema.prisma:615-627) but not restricted to that placement's product; no usage count, per-buyer limit, minimum order, or stacking rule; 100 % allowed. `GET /coupons/validate/:code` JWT (coupons.controller.ts:12-16). Supplier net price unaffected (`supplierUnitPrice` computed pre-coupon, 264) → Atlantis bears it; but escrow `supplierAmount` is derived from post-coupon `totalAmount` (payments.service.ts:157-159). Coupon lost on amendment (§3).
- `discounts` module (tiered prices, customer groups): controller has **only JWT, no roles** (`discounts.controller.ts:14-92`) — any user can create tiers/groups and add themselves to a group; but these are not used by `priceCart` (no references in orders) → dead feature that doesn't affect totals; `GET /discounts/calculate` returns `product.price`-based figures (discounts.service.ts:65).

### 12. Stock reservation

- Taken in cases at request time (orders.service.ts:365-374, conditional decrement), returned on cancel from PENDING/PAID/PROCESSING (1321-1340), returned on amendment quantity cut (1069-1073). Ledger `products/stock-ledger.ts` (RESERVED_STATUSES 19). Tests in `orders-create.spec.ts`.
- **Gaps**: no reservation expiry (expired confirmations keep stock); webhook payment_failed cancels without restock (stripe-webhook.controller.ts:255-258); admin hard delete doesn't restock; mixed load stays `ORDERED` after cancellation (no reset in internalUpdateStatus).

### 13. Invoices

- **Backend** `invoices/invoice.controller.ts`: guarded by `AuthGuard('jwt')` only, **no roles, no ownership** — `GET /invoices` (all invoices, all customers), `GET /invoices/:id`, `POST /invoices/generate/:orderId`, `POST /invoices/:id/pay` (marks paid, reduces credit) are open to any signed-in user (lines 5-33). `GET /invoices/my` returns `include: { order: true }` (invoice.service.ts:117-123) → raw `submittedTerms`/`termsSnapshot`/`fulfillment` (supplier ids) to buyer.
- **Generation**: auto only on DELIVERED (orders.service.ts:1445-1451); amount = `order.totalAmount` (goods), **freight excluded**, flat 5 % "tax" unless an APPROVED exemption (validity dates ignored) (invoice.service.ts:50-53); `currency` default `"USD"` (schema.prisma:700) while orders are EUR; number = `count()+1` (15-20) → duplicates after any invoice deletion (cascade on order delete) → unique violation, swallowed (orders.service.ts:1448-1450). `sendInvoiceEmail` never called. Manual invoice `POST /finance/manual-invoice` ADMIN (finance.controller.ts:172-176).
- **Supplier invoice**: `POST/DELETE /orders/:id/supplier-invoice` SUPPLIER + staff incl. LOGISTICS, PolicyGuard (orders.controller.ts:59-102), stored as product image in Supabase; shown to buyer/admin.
- **UI**: buyer print via `lib/invoice-print.ts:50-53` (Subtotal/Tax/Total, `€` hard-coded); buyer payments page; admin `admin/finance/page.tsx:97-106` (mark paid).
- **Policy**: "VAT is calculated on the invoice" (`ProtectedPaymentsClient.tsx:242`, en.ts:1093/1188) — it's a flat 5 %; payment "after approval" but invoice only after delivery.

### 14. Inspections

- `POST /orders/:id/inspections`, `PATCH /orders/:id/inspections/:inspectionId` ADMIN/OWNER/LOGISTICS (orders.controller.ts:318-328) → `saveInspection` validates statuses, lines, findings, photos (https only), inspector/date (orders.service.ts:1186-1234). Buyer sees `inspectionView` (1175-1183) via `components/orders/InspectionReport.tsx`. Model `OrderInspection` (schema.prisma:426-449).
- **Gaps**: `resolution` (ACCEPTED_WITH_DISCOUNT / PARTIALLY_ACCEPTED / REJECTED) has **no financial or status effect** (no discount, no line cancel, no refund) though `GoodsInspectionClient.tsx:129-132,170` describes those outcomes; hub not required to be verified (1221); photo upload UI for inspectors not verified; no expected BBD to check the `DATE` finding against (§15).

### 15. Best-before date per order line

- Product has free-text `shelfLife` ("BBD / Shelf life"), Offer has `bbd` (`offers.service.ts:23,133,178`). `OrderItem` has **no BBD/lot snapshot** (schema.prisma:518-567). Buyer order page shows product `shelfLife` (current WIP `[id]/page.tsx:378-384`; HEAD labelled it "BBD" at 569). Inspection DATE finding has no reference value. **Confirmed missing.**

### 16. Finance / commissions / earnings / payouts

- **FinanceController** `@UseGuards(JwtAuthGuard, RolesGuard)` but only 2 handlers have `@Roles` (`finance.controller.ts:27, 173`); `RolesGuard` returns `true` when no roles are set (`auth/roles.guard.ts:14-16`) → **every other finance route is open to any signed-in buyer/supplier**: revenue report, report send, credit-terms CRUD (self-grant credit), credit-check, tax-exemptions create **and review** (self-approve → 0 % invoice tax), warehouses CRUD, financial audit trail (`finance.controller.ts:45-170`).
- **Numbers**: revenue = Σ `totalAmount` where `paymentStatus='PAID'` (always 0) (finance.service.ts:161-205); `platformRevenue = total × PLATFORM_FEE_PERCENT` — not the real markup model (`common/markups.ts`); supplier earnings (finance) use buyer prices × (1−fee) (208-233) — would show suppliers the buyer price; `/payments/my-earnings` (supplier/earnings page) queries escrow by `order.supplierId` (never set) → always empty, and would return `order.totalAmount` (buyer total) to suppliers (payments.service.ts:80-113). Admin orders list `supplierProfit` = buyer price × qty, `adminProfit` = total × fee% (orders.service.ts:573-577). `getOrderStats.totalRevenue` = Σ totalAmount non-cancelled incl. unapproved requests (1253-1257) with comment "EGP". Reports cron weekly/monthly email (`reports.service.ts:18,32`) revenue = delivered totalAmount (68).
- **Payouts**: none (releaseEscrow never called; no payout record/schedule); supplier earnings copy promises automatic release.
- **UI**: `admin/finance/page.tsx`, `admin/billing/page.tsx`, `supplier/earnings/page.tsx`.

### 17. Support order conversations

- `components/support/SupportCenter.tsx:21-23` reads only `?tab=orders`; `OrderThreads.tsx` keeps the active thread in local state (`setActive`, 125) — no `?order=` param. Order page links to `/dashboard/customer/support?tab=orders` (WIP `[id]/page.tsx:238`) without the order id. Thread → order link exists (OrderThreads.tsx:215). **Confirmed: can’t deep-link to a specific order thread.**

### 18. Scheduled jobs touching orders/payments

- `OrderWorkflowCron.expire` hourly (`orders/order-workflow.cron.ts:11`).
- `ReportsService` weekly Mon 08:00 and monthly 1st 08:00 (`finance/reports.service.ts:18,32`).
- `ThreatDetectionService` `setInterval` 5 min (`security/threat-detection.service.ts:16`): flags every order > 10 000 with `paymentStatus != 'PAID'` in the last 24 h as `FRAUD_LARGE_ORDER` (141-162) — since paymentStatus is never PAID, normal B2B truckload orders are flagged every 5 minutes; velocity and dispute-rate checks also.
- None: payment-authorisation expiry/capture, invoice overdue, dispute SLA, auto-cancel of expired requests, payout scheduling.

---

## Part 2 — Findings

The findings for these workflows (TX-01 … TX-33, with DES-04, DES-07 and DES-08) are kept in one place, the [gap register](MARKETPLACE_GAP_REGISTER.md#tx--orders-payments-refunds-disputes-delivery-invoices-33), so that their status is tracked once.

| System | Status | Evidence | Notes |
|---|---|---|---|
| Server-side cart pricing & quote | Implemented | `orders.service.ts:195-298`, `orders.controller.ts:122-127` | MOQ, stock, offers, mixed loads; tests `pricing.spec.ts`, `orders-create.spec.ts` |
| Order creation (idempotent, destination check) | Implemented | `orders.service.ts:331-469` | Email wording wrong (TX-25) |
| Order status machine | Implemented | `orders.service.ts:36-54, 1288-1470` | Bypassed by Stripe webhook (TX-03/04) |
| Supplier confirmation + Atlantis approval + buyer re-acceptance | Implemented | `order-workflow.ts`, `orders.service.ts:874-1167`, `order-workflow.spec.ts` | Amend drops coupon (TX-11) |
| Confirmation expiry cron | Partial | `order-workflow.cron.ts:11` | Flags only; no auto-cancel/restock (TX-23) |
| Buyer cancellation | Missing | `orders.controller.ts:227-258` | TX-31 |
| Stock reservation / restock | Partial | `orders.service.ts:365-374, 1321-1340`; `products/stock-ledger.ts` | No expiry; webhook/delete paths don't restock |
| Fulfilment / freight calculation | Implemented | `fulfillment/fulfillment-calc.ts`, `fulfillment.service.ts`, spec | "quote_required" when no rate |
| Legacy carrier rate list | Partial | `shipping/shipping.service.ts:165-207` | Formula prices, names only shown |
| Freight change as new terms version | Implemented | `orders.service.ts:95-137` | |
| Coupons | Partial | `orders.service.ts:279-288`, `coupons/*` | No limits/scope (TX-28) |
| Tiered prices / customer groups | Unverified→effectively unused | `discounts/*` | Not used in pricing; unguarded (TX-29) |
| Stripe payment intent | Partial (unsafe) | `payments.service.ts:129-262` | Pre-approval only, goods only (TX-03) |
| Stripe webhook | Partial (unsafe) | `stripe-webhook.controller.ts` | Not idempotent, bypasses workflow |
| Payment recording (paymentStatus/paidAt) | Missing | schema.prisma:332-334 (no writers) | TX-05 |
| Escrow (capture/release/payout) | Missing (dead code) | `escrow.service.ts:58-117` never called; Order.escrow* unused | Policy says no escrow; Terms say escrow (TX-08) |
| Refunds | Missing (broken path) | `escrow.service.ts:119-135`, `stripe.gateway.ts:37-43` | TX-06 |
| Deposits / pro forma / payment terms | Missing | grep none; `CreditTerm` unused | TX-20 |
| Credit terms | Partial | `finance.service.ts:10-63` | Never consumed; endpoints unguarded (TX-01) |
| Tax / VAT | Partial | `invoice.service.ts:46-53` | Flat 5 %, exemption self-approvable |
| Invoices (Atlantis) | Partial | `invoices/*` | Unguarded (TX-02), wrong amounts (TX-09) |
| Supplier invoice upload | Implemented | `orders.controller.ts:59-102` | Stored in product-image bucket |
| Disputes — buyer create/view | Implemented | `disputes.controller.ts:17-37`; order page `[id]/page.tsx:163-174, 415-450` | No evidence upload, no window (TX-13) |
| Disputes — admin resolve | Partial | `disputes.service.ts:101-139`; `admin/disputes/page.tsx` | Roles too wide, repeatable, no amount (TX-14) |
| Disputes — supplier side | Missing | — | Not notified, no view |
| Returns / RMA | Missing (policy-only) | `app/returns`, `locales/en.ts:968-1034` | |
| Inspections | Implemented (record only) | `orders.service.ts:1169-1234`, `InspectionReport.tsx` | No financial effect (TX-22) |
| Per-line BBD / lot | Missing | schema.prisma:518-567 | TX-21 |
| Shipments & tracking | Partial | `shipping/shipment.*`, `orders.service.ts:140-170` | Public PII leak (TX-07); status never updated |
| Buyer tracking pages | Broken | `[id]/track/page.tsx` mock; `dashboard/track` wrong path | TX-15 |
| Logistics portal | Partial | `orders.service.ts:479-515`, `app/logistics/orders` | Fuzzy match, over-reach (TX-30) |
| Supplier earnings | Missing (UI over empty data) | `payments.service.ts:80-113`, `supplier/earnings` | TX-17 |
| Payouts | Missing | — | |
| Finance reports / revenue | Partial (wrong data) | `finance.service.ts:152-257`, `reports.service.ts` | Depend on never-set paymentStatus (TX-05/18) |
| Financial audit log | Partial | `common/financial-audit.service.ts`; only invoices write | TX-19 |
| Webhook idempotency store | Missing (model unused) | schema.prisma:866-876 | |
| Order hard delete | Implemented (risky) | `orders.service.ts:1729-1740` | TX-24 |
| Support order threads | Implemented | `components/support/OrderThreads.tsx` | No order deep link (TX-26) |
| Transactional emails | Partial | `email/email.service.ts` | Wrong wording/currency/refs (TX-25), English only |
| Scheduled jobs (orders/payments) | Partial | workflow cron, reports cron, threat interval | No auth-expiry, overdue-invoice, dispute-SLA, auto-cancel jobs |
