# Design vs. systems — the boundary for this phase

Atlantis is changing in two very different ways:

* **Design work.** How existing information and existing actions are presented.
* **System work.** What the platform actually does with orders and money.

This document is the rule for which is which. Design work may be done now. System work is
documented in [ORDER_PAYMENT_REFUND_GAPS.md](ORDER_PAYMENT_REFUND_GAPS.md) and
[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md), and waits for explicit owner approval.

Gap IDs (`TX-…`, `BUY-…`, `SUP-…`, `PLT-…`, `CNT-…`, `L10N-…`) refer to
[MARKETPLACE_GAP_REGISTER.md](MARKETPLACE_GAP_REGISTER.md).

---

## A. Safe to implement now

A change is safe when **all** of these hold:

1. It reads data the API already returns, or calls an action the API already offers, in the way the UI already calls it.
2. It changes no server code that decides an order, payment, refund, dispute, delivery charge, commission, permission or approval.
3. It adds no database field, migration or new transactional endpoint.
4. Every status, amount, date and promise it shows is something the server records or the business has published.

Within that rule, the following kinds of work are in scope:

| Kind of work | Examples in this phase |
|---|---|
| Page layout and visual hierarchy | Returns & Refunds; buyer order list cards; buyer order page; Payments & invoices (read-only) |
| Responsive behaviour and accessibility | Phone layouts at 375 px, keyboard focus, `aria-*` labels, landmark headings, reduced motion |
| Design-system components | `components/ds`, the shared order pieces in `components/orders/order-ui.tsx` |
| Rendering existing data | Payment status as recorded (`Order.paymentStatus`), invoices from `GET /invoices/my`, disputes from `GET /disputes/my`, inspection status, delivery summary |
| Truthful UI states | Loading, empty, error, retry and "not issued yet" / "quoted after confirmation" states that match what the API returns |
| Navigation and links | Links to existing routes only; deep links to an existing section (`/orders/{id}#dispute`) |
| Localization of existing UI | Dictionary keys in all seven languages, RTL/LTR, locale-aware dates and numbers |
| Presentation fixes that keep behaviour | Buyer-voiced delivery labels instead of supplier-voiced server text; escaping user text in the printable invoice (an XSS fix that changes no business logic) |
| Correcting copy to match the system | Policy and help text that described a flow differently from how it works (wording only, the policy's facts unchanged) |

Two read-only API additions were made in the earlier round (round 10) under the same rule. The buyer order list now also returns packaging fields, the EXW location, the latest inspection status and a buyer-safe delivery summary. These are fields the order page already exposed, and no supplier ids or charges are included (see `backend/src/orders/orders.service.ts` `findByBuyer` and its test).

## B. Document only — explicit approval required

None of the following is implemented in this phase. Each is recorded as a gap with a recommended task.

| Area | What is out of bounds | Related gaps |
|---|---|---|
| Order lifecycle | New statuses or transitions; automatic status changes; cancellation rules | TX register |
| Payments | Payment processing, payment confirmation, marking orders or invoices paid, Stripe flows, deposits, settlement, payouts | TX register |
| Refunds and returns | Refund execution, refund eligibility rules, return authorisation | TX register |
| Disputes | Changes to dispute submission or resolution; enforcing the 7-day window; SLA timers | TX register |
| Supplier approval | The confirmation/approval workflow in `order-workflow.ts`; product approval rules | TX / SUP register |
| Money calculations | Commissions and margins, delivery-fee calculation, what `Order.totalAmount` includes | TX register |
| Policy enforcement | Deadlines, automatic reminders, scheduled jobs, auto-expiry | TX register |
| Data model | Migrations or new transaction-related fields (deposit, best-before date per line, refund records) | TX register |
| Integrations | New payment, banking, shipping/carrier, ERP or tax integrations | PLT register |
| Permissions and security of transactional endpoints | Adding ownership or role checks to invoice, dispute, payment and order endpoints. These are urgent but change API behaviour, so the owner approves first | PLT / TX register |
| Owner account | The owner/admin account, its role, its permissions and `/admin/owner` | — |

### Why the security fixes sit in B

Several findings are access-control gaps on transactional endpoints (for example invoices
readable or markable as paid by any signed-in user). They are the most urgent items in the
register. Fixing them changes who may call an endpoint, which is a permission change on
money-related behaviour, so this phase records them with a ready-to-implement
recommendation instead of changing them silently.

## How the boundary was applied to specific designs

| Design | Safe part implemented | Part left unchanged and why |
|---|---|---|
| Order cards and order page | Recorded status, stages from recorded data, packaging, EXW, delivery summary, payment badge only when a payment status is recorded | No deposit row (no deposit exists in the data); no per-delivery best-before date (not stored); "Shelf life" shown as the product's listing value, not as a BBD |
| Order page — dispute | The existing dispute form (same `POST /disputes` call, same eligibility as before), restyled and localized; reasons still stored in English for staff | No new eligibility rule, no 7-day enforcement, no SLA promise (the old "24–48 hours" success text contradicted the published 48–72 h and was removed rather than guessed) |
| Payments & invoices (new, read-only) | Invoices, recorded payment status per order, disputes and their resolution notes | No "Pay now", no refund request, no payment method capture; invoice amounts shown in the invoice's own recorded currency, unconverted |
| Returns & Refunds | Layout, motion, localization, and the reporting path corrected to the existing dispute form | Timelines (48–72 h, 1–3 and 5–10 days) and fees are the published policy, shown as policy; they are not enforced by code (documented) |
| Delivery breakdown | Buyer-voiced method names and responsibility text by method | Charge labels, bases and "quote required" reasons are composed by the server in English; changing them is a server change |
