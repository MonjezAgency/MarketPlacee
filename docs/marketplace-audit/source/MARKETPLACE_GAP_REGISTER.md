# Marketplace gap register

The master list of gaps found in the Atlantis marketplace audit (October 2026, branch `claude/atlantis-marketplace-redesign-f7878d`). Every entry is based on the code (file:line), the schema or a recorded browser/API check — not on assumptions. Line numbers refer to the working tree at audit time.

**How to read an entry.** *Category* is one of the nine audit categories. *Status*: **Confirmed** = verified in code or by a test; **Suspected** = strong evidence, not yet reproduced; **Unverified** = needs a test environment or production configuration. *Boundary*: **Safe now** = presentation/links/copy that keeps behaviour; **Approval** = changes business logic, money, permissions, data or policy and waits for the owner (see [DESIGN_VS_SYSTEMS_BOUNDARY.md](DESIGN_VS_SYSTEMS_BOUNDARY.md)). Each entry also lists what it requires (backend, database, UI, integration, policy decision).

**Totals:** 190 findings — Critical: 18, High: 47, Medium: 80, Low: 45.

Related documents: [SYSTEMS_INVENTORY.md](SYSTEMS_INVENTORY.md) · [ORDER_PAYMENT_REFUND_GAPS.md](ORDER_PAYMENT_REFUND_GAPS.md) · [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) · [DESIGN_VS_SYSTEMS_BOUNDARY.md](DESIGN_VS_SYSTEMS_BOUNDARY.md)

## Executive summary

The audit read the whole marketplace (buyer, supplier, admin, payments, platform, content and the seven languages) and recorded **190 gaps: 18 critical, 47 high, 80 medium and 45 low.** Every gap is backed by a file path and line, the schema, or a recorded test.

**What works today.** The catalogue and ordering work. The order confirmation workflow is enforced on the server (supplier accepts → Atlantis approves → buyer accepts changed terms). The server calculates delivery charges, staff record inspections, and buyers and suppliers have private support conversations per order.

**What needs a decision first.**

1. **Security.** Several money-related endpoints (finance, invoices) are open to any signed-in account. Two-step sign-in can be bypassed, and an admin can create an owner account. *Fix first; owner approval needed because permissions change.*
2. **Price and identity privacy.** Buyers can receive supplier prices and ids in some responses, and suppliers can see buyer totals and margins. This breaks the marketplace's core rule.
3. **Payments.** No code records that a buyer has paid, refunds cannot succeed, and the Terms promise an escrow that doesn't exist. *A business decision on the payment model is needed before building.*
4. **Totals and invoices.** Pages, emails and invoices add totals differently; invoices are issued in USD with a flat 5% tax.
5. **Policy promises.** Dispute windows, response times, carriers and coverage are stated in copy but not enforced or confirmed.

**What has already been done (design phase, no business logic changed).** The order pages, the Payments & invoices view and the Returns & Refunds page were redesigned in seven languages. Fake features were removed (simulated identity check, mock tracking page) and false claims corrected. A cross-site scripting hole in the printable invoice was closed.

The recommended order of work is in *Implementation_Roadmap.docx*.

## Consolidated root causes

Several areas found the same problem independently. These are the root causes, in the order the
roadmap recommends fixing them. All of them need owner approval (they change API behaviour,
permissions, data or money flows), except where marked.

| # | Root cause | Findings | Why it matters |
|---|---|---|---|
| R1 | **Transactional endpoints without role or ownership checks.** Finance, invoices, discounts, notifications, shipments and wholesale offers lack them | TX-01, TX-02, PLT-05, PLT-06, SUP-13, PLT-07, PLT-08, PLT-12, TX-07, SUP-12, BUY-04 | Any signed-in account can read other customers' data, mark invoices paid, grant itself credit or tax exemption |
| R2 | **Authentication and account-control weaknesses** | PLT-01, PLT-02, PLT-03, PLT-09, PLT-10, PLT-11, PLT-13, PLT-14, PLT-15 | 2FA bypass, privilege escalation to OWNER, seeded credentials, sessions surviving blocks |
| R3 | **Price and identity leaks across the buyer/supplier wall** | DES-07, BUY-01, SUP-24, PLT-04, SUP-02, SUP-04, SUP-09, CNT-06, CNT-27, SUP-11 | Breaks the core rule: suppliers never see buyer price/margin; buyers never see supplier ids or net prices |
| R4 | **No payment record and no working refund path** | TX-03, TX-04, TX-05, TX-06, DES-08, TX-09 | Revenue reads 0, refunds fail silently, the webhook skips the approval workflow, invoices are in the wrong currency |
| R5 | **Policy and legal text that the system doesn't implement** | CNT-01, TX-08, CNT-02, CNT-19, TX-13, CNT-04, CNT-05, CNT-20, CNT-21, CNT-22, BUY-05, PLT-29, BUY-13, DES-05 | Escrow, timelines, carriers and processors are promised but don't exist. Some copy can be corrected now; the rest needs policy decisions |
| R6 | **Simulated or broken features presented as real** | BUY-02, SUP-05, BUY-03, TX-15, SUP-03, SUP-07, PLT-16, PLT-17 | Fake verification, fake tracking, unsaved payout details, alarms that do nothing. The two biggest UI fakes were replaced in this phase |
| R7 | **Totals disagree between pages** | BUY-06, TX-09, TX-10, DES-08 | `Order.totalAmount` is goods only; freight is held separately; pages, emails and invoices sum differently |
| R8 | **Supplier workflow gaps** | SUP-01, SUP-08, DES-06 | Mixed-load orders can't be confirmed; two supplier dashboards (an owner decision) |
| R9 | **Localization debt.** Safe now, ongoing | L10N-01 … L10N-16 | 111 of 126 routes still rely on the runtime machine translator |


## Index (most severe first)

| ID | Finding | Severity | Status | Category | Boundary | After this phase |
|---|---|---|---|---|---|---|
| [BUY-01](#buy-01) | Public product APIs expose supplier identity, including supplier email | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [BUY-02](#buy-02) | `/dashboard/kyc` is a simulated identity check (random pass/fail); the real KYC API has no UI | Critical | Confirmed | Broken or inconsistent behavior | Approval | UI: simulation replaced by an honest notice; real KYC UI still missing |
| [CNT-01](#cnt-01) | The Terms of Service promise Stripe escrow, but the rest of the site says there is none | Critical | Confirmed | Policy-only behavior | Approval | Open |
| [DES-07](#des-07) | `GET /invoices/my` returns the full order (raw terms with supplier ids and supplier prices) to buyers | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [L10N-01](#l10n-01) | Almost the whole product still depends on the runtime machine translator | Critical | Confirmed | Localization gap | Safe now | Open |
| [PLT-01](#plt-01) | The 2FA "partial token" works as a full access token (two-step verification bypass) | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-02](#plt-02) | ADMIN or DEVELOPER can create an OWNER (or any role) through team invite | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-03](#plt-03) | Committed seed credentials and forced re-activation of staff accounts on every deploy | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-04](#plt-04) | Public AI pricing chat leaks supplier base price and the Atlantis margin | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-05](#plt-05) | Invoices: any signed-in user can list, read, generate and mark-paid any invoice | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-06](#plt-06) | Finance controller: most routes have no role restriction | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [SUP-02](#sup-02) | Earnings page shows buyer totals and the platform fee, and claims escrow that doesn't exist | Critical | Confirmed | Security or permissions gap + Policy-only behavior | Approval | Escrow claim and dead buttons removed; data leak in the API remains |
| [SUP-04](#sup-04) | `GET /dashboard/supplier` returns buyer-price revenue, whole-order totals and buyer countries; polled every 60 s | Critical | Confirmed | Security or permissions gap | Approval | /supplier layout no longer polls it; API and legacy dashboard unchanged |
| [SUP-05](#sup-05) | Supplier KYC page is a simulation: it never submits and shows random success or failure | Critical | Confirmed | Missing UI | Approval | UI: simulation replaced by an honest notice; real KYC UI still missing |
| [SUP-13](#sup-13) | `/finance/*` endpoints have no role restriction (warehouses, credit terms, audit, reports) | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [TX-01](#tx-01) | Finance API open to any signed-in user (credit terms, tax exemptions, audit log, warehouses) | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [TX-02](#tx-02) | Invoice API has no role or ownership checks (anyone can list all invoices or mark any invoice paid) | Critical | Confirmed | Security or permissions gap | Approval | Open |
| [TX-03](#tx-03) | Stripe webhook confirms orders without supplier acceptance or Atlantis approval | Critical | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [BUY-03](#buy-03) | Per-order tracking page is entirely hardcoded | High | Confirmed | Broken or inconsistent behavior | Safe now | UI: mock replaced by redirect to the order page |
| [BUY-04](#buy-04) | `/dashboard/track` is broken, and the backend tracking endpoint leaks buyer data without auth | High | Confirmed | Broken or inconsistent behavior + Security or permissions gap | Approval | Open |
| [BUY-05](#buy-05) | Checkout "Preferred logistics partner" shows three hardcoded carriers with invented costs and ETAs | High | Confirmed | Policy-only behavior | Approval | Open |
| [BUY-06](#buy-06) | Delivery and total figures disagree between cart, checkout review and checkout sidebar | High | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [BUY-13](#buy-13) | `/wholesale` describes a pricing model the platform doesn't have | High | Confirmed | Policy-only behavior | Approval | Open |
| [CNT-02](#cnt-02) | The Privacy Policy misstates token lifetime, escrow and processors | High | Confirmed | Policy-only behavior | Approval | Open |
| [CNT-04](#cnt-04) | The "order placed" email calls a request "Order Confirmed" and shows "$" | High | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [CNT-05](#cnt-05) | Status emails and Stripe-webhook messages claim payment, confirmation and escrow | High | Confirmed | Policy-only behavior | Safe now | Open |
| [CNT-06](#cnt-06) | Supplier notification and email reveal the buyer's total (Stripe webhook) | High | Confirmed | Security or permissions gap | Approval | Open |
| [CNT-07](#cnt-07) | The public contact form can inject messages into any user's support thread, and its email HTML is unescaped | High | Confirmed | Security or permissions gap | Approval | Open |
| [CNT-19](#cnt-19) | Dispute and refund promises on Returns/Shipping/Terms aren't enforced by the code | High | Confirmed | Policy-only behavior | Approval | Open |
| [CNT-26](#cnt-26) | The carrier portal (`/logistics/orders`) gets full order data matched by a fuzzy name | High | Confirmed | Security or permissions gap | Approval | Open |
| [CNT-27](#cnt-27) | Buyers see the supplier's own invoice, which reveals supplier identity and net prices | High | Confirmed | Security or permissions gap | Approval | Open |
| [DES-02](#des-02) | Printable invoice inserted user text into a same-origin HTML document unescaped (stored XSS) | High | Confirmed | Security or permissions gap | Approval · done | Fixed (escaping) |
| [DES-08](#des-08) | Invoices auto-issued on delivery in USD with a flat 5% tax while orders are EUR | High | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [L10N-02](#l10n-02) | Native `alert/confirm/prompt` dialogs can never be translated | High | Confirmed | Broken behavior | Safe now | Open |
| [L10N-03](#l10n-03) | Printed invoice is English-only with hard-coded `€` | High | Confirmed | Localization gap | Safe now | Open |
| [L10N-07](#l10n-07) | Prices are formatted in the currency's locale, not the UI language | High | Confirmed | Inconsistent behavior | Safe now | Open |
| [L10N-12](#l10n-12) | Physical direction utilities break Arabic layouts | High | Confirmed | Localization | Safe now | Open |
| [PLT-07](#plt-07) | Discount tiers and customer groups: any signed-in user can create, delete or join | High | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-08](#plt-08) | Notifications IDOR: buyers and suppliers can read anyone's notifications | High | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-09](#plt-09) | Blocking, suspending, role changes and password resets do not end existing sessions | High | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-10](#plt-10) | Staff accounts are exempt from login lockout; login has no endpoint-specific throttle | High | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-11](#plt-11) | Emergency reset and seed-admin can take over any account given one shared secret | High | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-12](#plt-12) | Shipment data exposed: public tracking returns order and customer email; any user can read any order's shipment | High | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-13](#plt-13) | 2FA can be silently switched off by calling "setup" — no code required | High | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-14](#plt-14) | Team permissions are stored but never enforced; team-KYC guard is never applied | High | Confirmed | Policy-only behavior | Approval | Open |
| [PLT-15](#plt-15) | Production deploy uses `prisma db push --accept-data-loss` | High | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [PLT-16](#plt-16) | Hourly AI-agent job sends repeated, inaccurate notifications to buyers and suppliers | High | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [PLT-17](#plt-17) | IP blocking, emergency lockdown and the "auto-healer" are display-only | High | Confirmed | Policy-only behavior | Approval | Open |
| [PLT-29](#plt-29) | Fabricated carrier quotes (DB Schenker, LKW Walter, Raben) at checkout | High | Confirmed | Policy-only behavior | Safe now | Open |
| [SUP-01](#sup-01) | Two supplier dashboards; `/dashboard` and many links send suppliers to the broken old one | High | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [SUP-03](#sup-03) | Payout and bank details can't be saved on either page, and the UI claims they were | High | Confirmed | Broken or inconsistent behavior | Approval | Unverifiable "AES-256" and "5% commission" claims removed; saving still broken |
| [SUP-07](#sup-07) | Admin KYC review page calls a non-existent `/api/kyc/*` route; the queue always looks empty | High | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [SUP-08](#sup-08) | Mixed-load orders are invisible to suppliers, who can't confirm them, so the orders stall | High | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [SUP-09](#sup-09) | `mixComposition` sent to suppliers carries buyer (marked-up) unit prices | High | Confirmed | Security or permissions gap | Approval | Open |
| [SUP-11](#sup-11) | Supplier invoices go to the buyer and sit in a public bucket; one slot per order | High | Confirmed | Security or permissions gap | Approval | Open |
| [SUP-12](#sup-12) | Any supplier can read any wholesale offer (IDOR) | High | Confirmed | Security or permissions gap | Approval | Open |
| [SUP-24](#sup-24) | Catalog responses expose supplier identity to buyers (cross-area note) | High | Confirmed | Security or permissions gap | Approval | Open |
| [TX-04](#tx-04) | A failed card attempt cancels the order (no restock, no history) | High | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [TX-05](#tx-05) | Payment is never recorded: paymentStatus / paidAt / escrow fields are never written | High | Confirmed | Missing backend/system | Approval | Open |
| [TX-06](#tx-06) | Refunds cannot succeed (invalid Stripe reason, uncaptured intents, errors swallowed) | High | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [TX-07](#tx-07) | Public tracking endpoint leaks the full order (PII, address, terms); shipment-by-order has no ownership check | High | Confirmed | Security or permissions gap | Approval | Open |
| [TX-08](#tx-08) | Terms of Service describe a Stripe-escrow payment model that contradicts the rest of the site and the code | High | Confirmed | Policy-only behavior | Approval | Open |
| [TX-09](#tx-09) | Invoices omit freight, apply a flat 5 % "tax", default to USD, and are only issued after delivery | High | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [TX-13](#tx-13) | Dispute window, SLA, evidence and supplier involvement are policy-only (and the stated windows contradict each other) | High | Confirmed | Policy-only behavior | Approval | Open |
| [TX-15](#tx-15) | Tracking pages are fake or broken | High | Confirmed | Broken or inconsistent behavior | Approval | Per-order mock removed (redirect); /dashboard/track still broken |
| [BUY-07](#buy-07) | Checkout line prices come from the browser cart (€0.00 for list-added items); contradictory payment copy | Medium | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [BUY-08](#buy-08) | Checkout success bypasses `/checkout/confirmation`; `/checkout/payment` is orphaned | Medium | Confirmed | Incomplete integration | Approval | Open |
| [BUY-09](#buy-09) | After `PRICE_CHANGED`, checkout re-quotes without the destination | Medium | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [BUY-10](#buy-10) | Delivery address: three browser-only stores, and the address page corrupts its own data | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [BUY-11](#buy-11) | The cart lives only in localStorage per user; a guest cart is dropped at sign-in | Medium | Confirmed | Data-model limitation | Safe now | Open |
| [BUY-12](#buy-12) | `/deals` can never show promo codes to buyers | Medium | Confirmed | Incomplete integration | Approval | Open |
| [BUY-14](#buy-14) | Home page marketing claims and a hardcoded brand wall are not backed by data | Medium | Suspected | Policy-only behavior | Approval | Open |
| [BUY-15](#buy-15) | Product ratings can be inflated through the legacy `POST /products/:id/rate` | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [BUY-16](#buy-16) | Sourcing requests (RFQ) are emails only, and the public contact endpoint can post into any user's support thread | Medium | Confirmed | Missing backend/system + Security or permissions gap | Approval | Open |
| [BUY-17](#buy-17) | Buyer notifications: no way to reach the page, no loading/error state, and real-time never authenticates | Medium | Confirmed | Missing UI | Approval | Open |
| [BUY-21](#buy-21) | Card "from" prices depend on a hardcoded markup fallback that is cached for the session | Medium | Suspected | Broken or inconsistent behavior | Safe now | Open |
| [BUY-25](#buy-25) | Order history is capped at 100 with no pagination; "Bought before" matches only the 40 newest products | Medium | Confirmed | Data-model limitation | Approval | Open |
| [BUY-28](#buy-28) | Cart, checkout, deals and wholesale are English-only and partly off the design system; checkout has keyboard-access gaps | Medium | Confirmed | Localization/accessibility gap | Safe now | Open |
| [CNT-03](#cnt-03) | The Cookie Policy table doesn't match the cookies and storage actually used | Medium | Confirmed | Policy-only behavior | Approval | Open |
| [CNT-09](#cnt-09) | The staff support console mixes order-thread messages into general support conversations | Medium | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [CNT-10](#cnt-10) | "Ask the Atlantis team" doesn't reach a visible staff queue and doesn't pause the AI | Medium | Confirmed | Incomplete integration | Safe now | Open |
| [CNT-11](#cnt-11) | The legacy chat endpoints are still open to every user: inline images, no context limits, OWNER missing from the support room | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [CNT-13](#cnt-13) | The notification bell never navigates for real notifications | Medium | Confirmed | Broken or inconsistent behavior | Safe now | Bell now follows stored links; dead route fixed |
| [CNT-15](#cnt-15) | Server notifications, emails and the support UI are English-only in a seven-language interface | Medium | Confirmed | Localization/accessibility gap | Approval | Open |
| [CNT-16](#cnt-16) | Unsubscribe: every email (including security codes) carries a one-click header that doesn't work, and email-only unsubscribe is unauthenticated | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [CNT-17](#cnt-17) | Reviews are real, but anyone signed in can review and reviewer identities are public | Medium | Confirmed | Data-model limitation | Approval | Open |
| [CNT-20](#cnt-20) | About / Wholesale / How-it-works make product and operations claims the code doesn't support | Medium | Confirmed | Policy-only behavior | Safe now | Open |
| [CNT-21](#cnt-21) | Pages disagree on which regions Atlantis serves | Medium | Confirmed | Policy-only behavior | Approval | Open |
| [CNT-22](#cnt-22) | The Shipping policy names carriers and a processing SLA that only exist as stubs | Medium | Confirmed | Policy-only behavior | Approval | Open |
| [CNT-23](#cnt-23) | The Marketing page sells placement tools that suppliers can't reach | Medium | Confirmed | Missing UI | Safe now | Open |
| [CNT-24](#cnt-24) | Admin-edited Terms are never shown, and the Terms carry the wrong domain and a liveness claim | Medium | Confirmed | Incomplete integration | Approval | Open |
| [CNT-25](#cnt-25) | Legal pages are machine-translated at runtime by an LLM, with no "English prevails" clause | Medium | Confirmed | Localization/accessibility gap | Approval | Open |
| [DES-01](#des-01) | Correction: buyers DO have a dispute form; an earlier report and the Returns copy said otherwise | Medium | Confirmed | Broken or inconsistent behavior | Safe now · done | Fixed (copy + links) |
| [DES-06](#des-06) | Supplier entry point: owner instruction vs. auditors' recommendation | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [L10N-04](#l10n-04) | Partially keyed components are not protected from the translator (double translation in Latin locales) | Medium | Confirmed | Inconsistent behavior | Safe now | Open |
| [L10N-05](#l10n-05) | hreflang alternates point to routes that do not exist, and only 4 of 7 languages | Medium | Confirmed | Broken behavior | Safe now | Open |
| [L10N-08](#l10n-08) | Hard-coded English locales in shared money/number formatters | Medium | Confirmed | Inconsistent behavior | Safe now | Open |
| [L10N-09](#l10n-09) | Dates and quantities ignore the UI language | Medium | Confirmed | Inconsistent behavior | Safe now | Open |
| [L10N-10](#l10n-10) | English pluralisation by string concatenation | Medium | Confirmed | Localization gap | Safe now | Open |
| [L10N-11](#l10n-11) | Hard-coded `€` concatenation and `toFixed(2)` money | Medium | Confirmed | Inconsistent behavior | Safe now | Open |
| [L10N-13](#l10n-13) | Directional icons do not mirror (153 instances) | Medium | Confirmed | RTL gap | Safe now | Open |
| [L10N-15](#l10n-15) | Validator blind spots | Medium | Confirmed | Inconsistent behavior | Safe now | Open |
| [L10N-16](#l10n-16) | Server and API error messages displayed verbatim | Medium | Confirmed | Localization gap | — | Open |
| [PLT-18](#plt-18) | Stripe webhook has no idempotency, although the model for it exists | Medium | Confirmed | Incomplete integration | Safe now | Open |
| [PLT-19](#plt-19) | Email click tracker is an open redirect | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-20](#plt-20) | NextAuth exposes the backend JWT to page JavaScript; hard-coded fallback secrets | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-21](#plt-21) | Margin, currency and product approval editable by EDITOR/MODERATOR; staff role lists are broad and inconsistent | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-22](#plt-22) | Audit trail records only `ADMIN` actions and redacts only `password` | Medium | Confirmed | Data-model limitation | Safe now | Open |
| [PLT-23](#plt-23) | Legacy `/uploads` served publicly; product image upload accepts any `image/*` including SVG | Medium | Suspected | Security or permissions gap | Approval | Open |
| [PLT-24](#plt-24) | Rate limits key on the Vercel proxy IP, not the real client | Medium | Suspected | Broken or inconsistent behavior | Safe now | Open |
| [PLT-25](#plt-25) | Refresh tokens are never used through the proxy; session lifetimes are inconsistent | Medium | Confirmed | Incomplete integration | Approval | Open |
| [PLT-26](#plt-26) | Google sign-in: ACTIVE without approval, and the middleware blocks Google users from protected pages | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [PLT-27](#plt-27) | Admin pages call backend endpoints that don't exist | Medium | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [PLT-28](#plt-28) | Admin "Tech" and home pages show fabricated metrics | Medium | Confirmed | Policy-only behavior | Safe now | Open |
| [PLT-30](#plt-30) | Public LLM endpoints with in-memory cache: cost and memory abuse | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-33](#plt-33) | Route shadowing: `DELETE /users/me` and `GET /users/repair-data-secure-2026` are unreachable | Medium | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [PLT-34](#plt-34) | Newsletter: bulk import bypasses double opt-in; anyone can unsubscribe any address | Medium | Confirmed | Policy-only behavior | Approval | Open |
| [PLT-35](#plt-35) | Team invite emails a plaintext temporary password; send-invite trusts a caller-supplied link | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-40](#plt-40) | Parallel legacy finance subsystems with no product owner (escrow, credit terms, tax exemptions, warehouses, discounts) | Medium | Confirmed | Data-model limitation | Approval | Open |
| [SUP-06](#sup-06) | KYC backend: AI can auto-approve; client-set liveness score; review notes exposed to the user; REJECTED never reaches the user | Medium | Confirmed | Policy-only behavior | Approval | Open |
| [SUP-10](#sup-10) | Masked buyer email still reveals the buyer's company domain | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [SUP-14](#sup-14) | Supplier can link a product to any warehouse; the link counts as a "verified" dispatch site; no warehouse UI | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [SUP-15](#sup-15) | Placements API: hardcoded placeholder prices and no product ownership check | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [SUP-16](#sup-16) | Supplier order notifications aren't clickable; the NEW_ORDER mapping is dead and points to a 404 | Medium | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [SUP-18](#sup-18) | Analytics page: mislabelled and unordered figures, a different currency basis from the Overview, errors shown as "no data" | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [SUP-19](#sup-19) | Orphan legacy pages are reachable by URL but not in the nav, and duplicate or contradict the new workspace | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [SUP-21](#sup-21) | Supplier workspace is English-only, although it offers a language picker | Medium | Confirmed | Localization/accessibility gap | Safe now | Open |
| [SUP-22](#sup-22) | Variant stock is a separate counter: not decremented by orders, not logged, signatures not validated | Medium | Confirmed | Data-model limitation | Approval | Open |
| [SUP-23](#sup-23) | Revoked or blocked suppliers keep API access until their token expires | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [TX-10](#tx-10) | Order.totalAmount is goods-only; consumers disagree on what "total" means | Medium | Confirmed | Data-model limitation | Approval | Open |
| [TX-11](#tx-11) | Admin amendment drops the coupon discount and allows below-cost buyer prices | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [TX-12](#tx-12) | Orphan Stripe payment page with escrow claims and a fake "Platform Protection" fee | Medium | Confirmed | Policy-only behavior | Approval | Open |
| [TX-14](#tx-14) | Dispute resolution is open to LOGISTICS/DEVELOPER, can be repeated, and has no amount | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [TX-16](#tx-16) | Buyer order APIs expose supplier ids | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [TX-17](#tx-17) | Supplier earnings & payouts don't exist (and would leak the buyer total) | Medium | Confirmed | Missing backend/system | Approval | Open |
| [TX-18](#tx-18) | Financial figures in admin/finance are formula guesses, not the real margin | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [TX-19](#tx-19) | Stripe webhook not idempotent; FinancialAuditLog not written for payments | Medium | Confirmed | Incomplete integration | Approval | Open |
| [TX-20](#tx-20) | No deposit / pro forma / credit-term usage | Medium | Confirmed | Missing backend/system | Approval | Open |
| [TX-21](#tx-21) | No best-before date / lot captured per order line | Medium | Confirmed | Data-model limitation | Approval | Open |
| [TX-22](#tx-22) | Inspection outcome has no effect on the order or money | Medium | Confirmed | Policy-only behavior | Approval | Open |
| [TX-23](#tx-23) | Stock stays reserved forever on expired/unanswered requests; other non-restocking cancel paths | Medium | Confirmed | Missing backend/system | Approval | Open |
| [TX-24](#tx-24) | Admin hard delete destroys financial records | Medium | Confirmed | Data-model limitation | Approval | Open |
| [TX-25](#tx-25) | Order-created emails call a request "Order Confirmed" and show a USD goods total | Medium | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [TX-28](#tx-28) | Coupons: whole-cart, unlimited, up to 100 %, not tied to their placement | Medium | Confirmed | Incomplete integration | Approval | Open |
| [TX-30](#tx-30) | LOGISTICS role over-reach: any order view/cancel, fuzzy carrier matching exposes buyer contact data | Medium | Confirmed | Security or permissions gap | Approval | Open |
| [BUY-18](#buy-18) | Wishlist is a legacy duplicate of Saved / Lists, with a fake "Premium" brand and a wrong add-to-cart | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [BUY-19](#buy-19) | Products with no brand are shown as brand "Atlantis" | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [BUY-20](#buy-20) | PDP shows buyers the label "Mixing markup (×1.0xx)" | Low | Confirmed | Policy-only behavior | Safe now | Open |
| [BUY-22](#buy-22) | Signed-out PDP says the catalog is "members-only", but the catalog is public | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [BUY-23](#buy-23) | The proxy rejects anonymous `/config/*`, so the platform currency and markup ratios never reach visitors | Low | Confirmed | Incomplete integration | Safe now | Open |
| [BUY-24](#buy-24) | Legacy or orphan buyer pages | Low | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [BUY-26](#buy-26) | The offer comparison shows "In stock" and exact case counts | Low | Confirmed | Policy-only behavior | Safe now | Open |
| [BUY-27](#buy-27) | `docs/buyer-journey-design.md` describes the past | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [BUY-29](#buy-29) | Google sign-up activates buyers immediately; email sign-up waits for approval | Low | Confirmed | Policy-only behavior | Approval | Open |
| [BUY-30](#buy-30) | `/targets` ("Buyer Targets") is a supplier-facing demand page whose name clashes with buyer "Target prices", and its CTA loses the product | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [BUY-31](#buy-31) | The buyer account area has no role gate | Low | Suspected | Security or permissions gap | Approval | Open |
| [CNT-08](#cnt-08) | The contact page promises "within 24 business hours", which nothing enforces | Low | Confirmed | Policy-only behavior | Approval | Open |
| [CNT-12](#cnt-12) | Handover system messages are hard-coded in Arabic | Low | Confirmed | Localization/accessibility gap | Safe now | Open |
| [CNT-14](#cnt-14) | Many notifications are written straight to the DB and skip the real-time push | Low | Confirmed | Incomplete integration | Safe now | Open |
| [CNT-18](#cnt-18) | The Returns page's "Orders & tracking" link opens Support instead | Low | Confirmed | Broken or inconsistent behavior | Safe now | Fixed (step 2 links to Orders & tracking) |
| [CNT-28](#cnt-28) | Dead components contain fabricated statistics and broken links | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [CNT-29](#cnt-29) | The newsletter promises "weekly" updates, but campaigns are sent manually | Low | Confirmed | Policy-only behavior | Safe now | Open |
| [CNT-30](#cnt-30) | The help-content checker is good but narrow, and it isn't in the build | Low | Confirmed | Incomplete integration | Safe now | Open |
| [CNT-31](#cnt-31) | The Protected Payments page is accurate, but its "settlement" step implies a mechanism that doesn't exist | Low | Suspected | Policy-only behavior | Approval | Open |
| [DES-03](#des-03) | Buyer-facing delivery labels came from supplier-voiced server text | Low | Confirmed | Broken or inconsistent behavior | Approval · done | Fixed for method labels; charges still server English |
| [DES-04](#des-04) | Product "shelf life" was labelled "BBD" on the order page | Low | Confirmed | Data-model limitation | Approval · done | Label fixed; field missing |
| [DES-05](#des-05) | Dispute success message promised "within 24–48 hours", contradicting the published 48–72 hours | Low | Confirmed | Policy-only behavior | Approval · done | Contradicting text removed; SLA undecided |
| [L10N-06](#l10n-06) | SSR document is always `lang="en" dir="ltr"` until a pre-paint script runs | Low | Confirmed | Localization | Safe now | Open |
| [L10N-14](#l10n-14) | Order ids, EANs and emails not isolated with `<bdi dir="ltr">` outside the localized pages | Low | Confirmed | RTL gap | Safe now | Open |
| [PLT-31](#plt-31) | Error responses leak internal messages | Low | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-32](#plt-32) | Security interceptor stores full request bodies (including passwords) when a pattern matches | Low | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-36](#plt-36) | TOTP secrets stored in plaintext | Low | Confirmed | Data-model limitation | Safe now | Open |
| [PLT-37](#plt-37) | Duplicate and dead security/admin code | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [PLT-38](#plt-38) | Admin sidebar shows everything to every staff role; DEVELOPER filter matches nothing | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [PLT-39](#plt-39) | CORS allow-list is hard-coded; step-up headers are not allowed cross-origin | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [PLT-41](#plt-41) | `OrdersController.findMyOrders` and `findOne` ignore staff roles outside a fixed list | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [PLT-42](#plt-42) | WebSocket gateway skips session revocation; its mark-read event does nothing | Low | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-43](#plt-43) | Product rating endpoint allows unlimited anonymous-style ratings | Low | Confirmed | Security or permissions gap | Approval | Open |
| [PLT-44](#plt-44) | CI deploys the Next app to GitHub Pages; no tests or type checks in CI | Low | Confirmed | Broken or inconsistent behavior | Approval | Open |
| [PLT-45](#plt-45) | Vercel "keep-warm" cron runs once a day | Low | Confirmed | Incomplete integration | Approval | Open |
| [PLT-46](#plt-46) | Supabase misconfiguration likely crashes boot; startup bucket creation runs twice | Low | Suspected | Incomplete integration | Safe now | Open |
| [SUP-17](#sup-17) | Dead link on the Fulfilment page | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [SUP-20](#sup-20) | `/auth/partner` drops the supplier role; `/auth/onboarding` is unreachable and drops its fields | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [SUP-25](#sup-25) | Orders list is unbounded; no supplier order detail route | Low | Confirmed | Incomplete integration | Approval | Open |
| [TX-26](#tx-26) | Support order conversations can't be deep-linked to an order | Low | Confirmed | Missing UI | Safe now | Open |
| [TX-27](#tx-27) | Dispute stats keys mismatch on admin dashboard/support | Low | Confirmed | Broken or inconsistent behavior | Safe now | Open |
| [TX-29](#tx-29) | Discounts module endpoints unguarded (any user can create tiers/groups and join a group) | Low | Confirmed | Security or permissions gap | Approval | Open |
| [TX-31](#tx-31) | Buyers can't cancel a request; no proof-of-delivery / delivered-at; approval possible without a freight figure | Low | Confirmed | Missing backend/system | Approval | Open |
| [TX-32](#tx-32) | Hard-coded English in transactional emails and legacy pages | Low | Confirmed | Localization/accessibility gap | Safe now | Open |
| [TX-33](#tx-33) | Threat detection flags every large B2B order as fraud every 5 minutes | Low | Confirmed | Broken or inconsistent behavior | Approval | Open |

## DES — This phase — design work and corrections (8)

### DES-01
**Correction: buyers DO have a dispute form; an earlier report and the Returns copy said otherwise**
- Area / page / workflow: Returns & Refunds page; buyer order page; previous round's report
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: In round 10 the report said "there's no button for buyers to open a formal dispute", and the redesigned Returns page (step 2) sent buyers to Support → Order conversations. The order page has in fact had an "Open dispute" form calling `POST /disputes` for SHIPPED/DELIVERED orders all along.
- Expected behavior: Policy copy points to the real dispute form.
- Evidence: `frontend/src/app/dashboard/customer/orders/[id]/page.tsx` (dispute section, `id="dispute"`); `backend/src/disputes/disputes.controller.ts:17-29`; `frontend/src/locales/*.ts` `returns.step2Body`.
- Impact: Buyers were pointed to a chat instead of the formal dispute flow.
- Dependencies & risks: None.
- Recommended future task: Done in this phase — Returns step 2 now links to Orders & tracking and names "Open a dispute" in all seven languages; order cards' "Report a problem" deep-links to `/orders/{id}#dispute`. The round-10 statement is corrected here.
- Requires: UI
- Boundary: Safe-to-implement-now (done)

### DES-02
**Printable invoice inserted user text into a same-origin HTML document unescaped (stored XSS)**
- Area / page / workflow: Buyer order page → "Print or save" invoice
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed (fixed in this phase — presentation only)
- Current behavior: Before: `buildInvoiceHtml` interpolated product names (supplier-controlled) and invoice fields into HTML opened as a `blob:` URL, which runs with the site's origin; markup in a product name would execute.
- Expected behavior: All text escaped.
- Evidence: `frontend/src/lib/invoice-print.ts` (`esc()`), previously inline in `app/dashboard/customer/orders/[id]/page.tsx:97-145` (commit b3ddb7a).
- Impact: Session/token theft from a buyer who prints an invoice.
- Dependencies & risks: None; output text unchanged.
- Recommended future task: Server-generated PDF invoices (see TX invoice findings) would remove the client template entirely.
- Requires: UI
- Boundary: Safe-to-implement-now (done)

### DES-03
**Buyer-facing delivery labels came from supplier-voiced server text**
- Area / page / workflow: Order page, checkout, admin — `DeliveryBreakdown`
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed (presentation fixed in this phase)
- Current behavior: `METHOD_INFO.label`/`handover` are written for suppliers ("You deliver to an Atlantis hub", "At collection from your EXW location") and were shown to buyers as-is.
- Expected behavior: Buyers read buyer-voiced wording.
- Evidence: `backend/src/fulfillment/fulfillment-calc.ts:69-99`; `frontend/src/components/orders/DeliveryBreakdown.tsx` (`METHOD` map).
- Impact: Confusing responsibility text for buyers.
- Dependencies & risks: Charge labels/bases and "quote required" reasons are still English server text.
- Recommended future task: Return method keys + structured charge data from the server (no prose) so every language can render them.
- Requires: Backend (for charges), UI (done for methods)
- Boundary: Safe-to-implement-now for methods (done); Approval-required for server payload change

### DES-04
**Product "shelf life" was labelled "BBD" on the order page**
- Area / page / workflow: Buyer order page, product lines
- Category: Data-model limitation
- Severity: Low
- Status: Confirmed (label corrected)
- Current behavior: `Product.shelfLife` (a listing attribute) was shown as "BBD", suggesting a best-before date for the delivered batch. No per-line/per-delivery best-before date is stored.
- Expected behavior: Show "Shelf life"; record batch BBD only when a field exists.
- Evidence: previous `orders/[id]/page.tsx:567-571`; `backend/prisma/schema.prisma` `OrderItem` has no date field.
- Impact: Buyers could read a listing value as a delivery guarantee.
- Dependencies & risks: Inspection findings already have a `DATE` type.
- Recommended future task: Add an optional per-line BBD captured at dispatch/inspection (migration — approval).
- Requires: DB, Backend, UI
- Boundary: Approval-required (field); label fix done

### DES-05
**Dispute success message promised "within 24–48 hours", contradicting the published 48–72 hours**
- Area / page / workflow: Buyer order page → dispute submitted
- Category: Policy-only behavior
- Severity: Low
- Status: Confirmed (removed)
- Current behavior: Before: "Our team will review it within 24–48 hours." Returns policy says 48–72 hours; neither is tracked.
- Expected behavior: One published SLA, or none.
- Evidence: previous `orders/[id]/page.tsx:775`; `locales/en.ts` `returns.step4Body`.
- Impact: Conflicting promises.
- Dependencies & risks: Policy decision on the SLA.
- Recommended future task: Decide the SLA; if kept, track it (dispute timestamps exist).
- Requires: Policy decision
- Boundary: Policy decision required (copy now neutral)

### DES-06
**Supplier entry point: owner instruction vs. auditors' recommendation**
- Area / page / workflow: Supplier dashboard routes `/dashboard/supplier` vs `/supplier`
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed (needs a decision)
- Current behavior: The owner instructed (round 9) that `/dashboard/supplier` is the correct supplier dashboard and must not be broken. The supplier audit (SUP findings) found that `/supplier` is the maintained workspace and `/dashboard/supplier` is legacy (zeros, a PUT/PATCH mismatch on product edit, buyer-price revenue).
- Expected behavior: One supplier entry point.
- Evidence: see SUP register entries on the two dashboards; `CLAUDE.md` routes section.
- Impact: Suppliers land on different dashboards depending on the link.
- Dependencies & risks: Changing it would contradict the owner's instruction — not changed in this phase.
- Recommended future task: Owner decides the single entry point; then redirect the other.
- Requires: Policy decision, UI
- Boundary: Policy decision required

### DES-07
**`GET /invoices/my` returns the full order (raw terms with supplier ids and supplier prices) to buyers**
- Area / page / workflow: Buyer order page and Payments & invoices (both call it)
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: `getInvoicesByBuyer` uses `include: { order: true }`, so `submittedTerms`, `termsSnapshot`, `fulfillment` (supplier ids, supplier net prices) reach the buyer's browser. The new Payments page displays only invoice fields but cannot stop the payload.
- Expected behavior: Invoice fields plus a safe order reference only.
- Evidence: `backend/src/invoices/invoice.service.ts:117-123`; callers `app/dashboard/customer/orders/[id]/page.tsx`, `app/dashboard/customer/payments/page.tsx`.
- Impact: Breaks the rule "buyers never see supplier ids or supplier net prices".
- Dependencies & risks: Same class as TX-16.
- Recommended future task: Replace `include: { order: true }` with a `select` of id/status/createdAt; add a test like the order-list privacy test.
- Requires: Backend
- Boundary: Approval-required (API behaviour change; recommended first)

### DES-08
**Invoices auto-issued on delivery in USD with a flat 5% tax while orders are EUR**
- Area / page / workflow: Confirm receipt → invoice; Payments & invoices
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed (observed in local test: confirming receipt of a €504.00 order created INV-20261016-0001 for US$529.20)
- Current behavior: `Invoice.currency` defaults to "USD"; generation adds 5% tax and excludes freight.
- Expected behavior: EUR, the confirmed terms' totals, the correct VAT treatment.
- Evidence: `backend/prisma/schema.prisma` model `Invoice` (`currency @default("USD")`); `backend/src/invoices/invoice.service.ts:25-60`; browser check on `/dashboard/customer/payments` (local).
- Impact: Wrong legal/financial document.
- Dependencies & risks: Tax rules per country; accounting.
- Recommended future task: Invoice from `termsSnapshot` (goods + freight), EUR, VAT by destination — approval required.
- Requires: Backend, DB default, Policy decision (tax)
- Boundary: Approval-required

## TX — Orders, payments, refunds, disputes, delivery, invoices (33)

# Atlantis — Transactional workflows audit (orders, payments, refunds, disputes, fulfilment, finance)

Scope: read-only audit of the worktree `atlantis-marketplace-redesign-f7878d` (HEAD `b3ddb7a`). Paths are relative to the repo root.
Note: while auditing, other agents had **uncommitted** edits in `frontend/src/app/dashboard/customer/orders/[id]/page.tsx`, `.../orders/page.tsx`, the new `frontend/src/app/dashboard/customer/payments/page.tsx`, `frontend/src/lib/{disputes,invoice-print}.ts`, `frontend/src/locales/en.ts`. Frontend line numbers for those files refer to the working tree at audit time; backend files were unmodified.
Runtime behaviour was not exercised (no servers, no production calls); "Confirmed" below means confirmed by reading the code path end to end. No secret values were read.

Env vars referenced in this area (presence only): `STRIPE_SECRET_KEY` (payments/stripe.gateway.ts:15, stripe-webhook.controller.ts:20), `STRIPE_WEBHOOK_SECRET` (stripe-webhook.controller.ts:38), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (frontend checkout/payment/page.tsx:15), `PLATFORM_FEE_PERCENT` (escrow.service.ts:16, finance.service.ts:159/209/245), `DEFAULT_CURRENCY` (payments.service.ts:161), `FRONTEND_URL`.

---

# PART 1 — WORKFLOW AUDIT

## 1. Checkout / order creation

- **Current UI**: `frontend/src/app/checkout/page.tsx` (3 steps: address → carrier preference → review). Calls `POST /orders/quote` via `quoteCart` (line ~201), `/coupons/validate/:code` (176), `/shipping/agent-rates` (89, fallback `/shipping/rates` 106), destination check, then `POST /orders` (215). Review copy: "Placing the order sends a request — nothing is charged…" (597). Success step: "Our Marketplace team will contact you to finalize payment and delivery" (336). Totals shown: `grandTotal + freight` "excl. VAT" (582-585).
- **Backend**: `OrdersController.create` `POST /orders` — roles CUSTOMER/ADMIN/OWNER/SUPPLIER, profile completeness + step-up 2FA (`orders.controller.ts:104-119`). `OrdersService.create` (`orders.service.ts:331-469`): idempotency key (332-340), destination policy check (344-348), server repricing via `priceCart` (350, 195-298), client total compared to server total → 409 `PRICE_CHANGED` (354-356), transaction: conditional stock decrement in cases (365-374), Order row with `totalAmount = quote.total` (goods − coupon), `shippingCost` only when fulfilment fully priced (384), `reviewStatus: 'PENDING_REVIEW'`, `submittedTerms` (388), one `OrderSupplierConfirmation` per supplier with deadline (411-413), mixed-load lock (415-419). Post-commit: buyer email (433-440), supplier notifications + emails (445-457), low stock alerts, admin notification.
- **API**: `POST /orders/quote` (CUSTOMER/ADMIN/OWNER/SUPPLIER) `orders.controller.ts:122-127`; `POST /orders` `:104`.
- **DB**: `Order` (schema.prisma:324-405), `OrderItem` (518-567: `price`, `supplierUnitPrice`, `stockCases`, `selectedTier`, `mixComposition`, `mixedLoadId`), `OrderSupplierConfirmation` (407-423), `OrderStatusHistory` (505-516).
- **Enforced**: server pricing, MOQ/stock, destination, idempotency, oversell protection, supplier confirmation rows, freight only from server calc.
- **Policy-only / inconsistent**: buyer email says "✅ Order Confirmed … your order has been placed successfully" with a `$` total of goods only (`email.service.ts:321-335`) while the order is only a request; ref uses `id.slice(0,8)` (email) vs `slice(-8)` everywhere else (`frontend/src/lib/buyer-orders.ts:35`, `orders.service.ts:449`). `Order.supplierId` is never set at creation (no write anywhere; schema.prisma:362) — downstream payment/earnings code depends on it.
- **Missing**: buyer cancellation of a request (no endpoint; `PATCH /orders/:id/status` excludes CUSTOMER, `orders.controller.ts:228`); quote expiry; VAT calculation; deposit/pro-forma.
- **Risks**: coupon applies to the whole cart, no usage limits (see §11); stock is taken at request time and never released when a supplier confirmation expires (see §12).

## 2. Order lifecycle / status transitions

- **State machine**: `ORDER_TRANSITIONS` PENDING→{PAID,PROCESSING,CANCELLED}, PAID→{PROCESSING,CANCELLED}, PROCESSING→{SHIPPED,CANCELLED}, SHIPPED→{DELIVERED,CANCELLED} (`orders.service.ts:36-43`). Workflow overlay `workflowBlocker` (`order-workflow.ts:103-114`): PENDING→PROCESSING/PAID only via approval; SHIPPED/DELIVERED require APPROVED and buyer acceptance of changed terms. LEGACY orders exempt.
- **Implementation**: `internalUpdateStatus` (`orders.service.ts:1288-1470`) — optimistic status check, restock on cancel before dispatch (1321-1340), history row, emails/notifications, invoice on DELIVERED (1445-1451), escrow void/refund on CANCELLED (1454-1467).
- **API**: `PATCH /orders/:id/status` roles SUPPLIER/ADMIN/OWNER/MODERATOR/SUPPORT/LOGISTICS + PolicyGuard ownership (`orders.controller.ts:227-258`; supplier limited to PROCESSING → routed to `supplierAccept`); `PATCH /orders/bulk-status` ADMIN (330-343); `POST /orders/:id/confirm-delivery` CUSTOMER (345-350, `orders.service.ts:1682-1696`); `DELETE /orders/:id` and `DELETE /orders/bulk` ADMIN hard delete (364-374, `orders.service.ts:1729-1740`).
- **UI**: buyer `dashboard/customer/orders/page.tsx`, `orders/[id]/page.tsx` (confirm receipt button); admin `admin/orders/page.tsx`, `admin/orders/[id]/page.tsx:810-830` (Mark as Paid/Confirmed hidden for workflow orders).
- **Enforced**: transitions, approval gate, buyer-acceptance gate, restock-once.
- **Gaps**: Stripe webhook bypasses all of this (writes `status` directly — see §4); `PAID` status unreachable for workflow orders (approval goes to PROCESSING; PROCESSING has no →PAID), so `OrderStatus.PAID` is effectively legacy-only; SUPPORT/MODERATOR/LOGISTICS can cancel or ship **any** order (PolicyGuard staff bypass `auth/policy.guard.ts:28`); hard delete cascades disputes, invoices, escrow (schema.prisma:694, 835, 944) with no restock and no audit; status emails use `slice(0,8)` refs.

## 3. Supplier confirmation + Atlantis approval workflow

- **Rules** (`backend/src/orders/order-workflow.ts`): per-version confirmations, `confirmationState` (56-71), `approvalBlocker` (83-92), `buyerMustAccept` (95-97), `partyStatus` texts (117-127), supplier view without buyer price (45-49). Default deadline 72 h, override `AppConfig ORDER_SUPPLIER_CONFIRM_HOURS` (20; `orders.service.ts:920-924`).
- **Service**: `supplierAccept` (874-888), `supplierReject` (895-916; single-supplier order → cancelled + restock; shared → recorded, admin decides), `decide` with double-click guard and lazy expiry (970-985), `approveOrder` (1002-1019; optimistic on termsVersion, freezes `termsSnapshot`, → PROCESSING, notifies buyer "The Atlantis team will send payment details"), `rejectOrder` (1022-1031), `requestReconfirmation` (1034-1043), `amendOrder` (1050-1107; quantity down only / buyer unit price), `buyerAcceptTerms` (1110-1120), freight change via `setShipping` creates new version (95-137), `expireStaleConfirmations` hourly cron (`order-workflow.cron.ts:11-19`, service 1123-1131).
- **API**: `POST /orders/:id/supplier-accept|supplier-decline` SUPPLIER; `POST /orders/:id/approve|reject|request-confirmation|amend` ADMIN/OWNER; `GET /orders/:id/workflow` ADMIN/OWNER/SUPPORT/MODERATOR/LOGISTICS; `POST /orders/:id/accept-terms` CUSTOMER; `PATCH /orders/:id/shipping` ADMIN/LOGISTICS/OWNER (`orders.controller.ts:213-316, 268-276`).
- **UI**: `components/orders/AdminWorkflowPanel.tsx`, `BuyerWorkflowPanel.tsx`, `frontend/src/lib/order-workflow.ts`, supplier `app/supplier/orders/page.tsx`. Tests: `backend/src/orders/__tests__/order-workflow.spec.ts`.
- **Enforced**: well implemented and tested. Supplier never sees buyer price (`supplierView`, `findBySupplier` 713-822).
- **Gaps**: (a) `amendOrder` recomputes `totalAmount` as Σ price×qty (1090-1093) — the coupon discount in the original total is silently dropped; (b) amended unit price has no floor vs `supplierUnitPrice` (1076-1080) → negative margin possible; (c) quantity amendments don't re-run fulfilment, so `fulfillment`/`shippingCost` go stale; (d) expired confirmations are only flagged — no auto-cancel/restock, so stock stays reserved indefinitely; (e) approval does not require a freight figure — an order can be approved and shipped with `shippingCost = null` ("quoted after the order") and the buyer is never asked to accept a figure; (f) Stripe webhook can move a PENDING_REVIEW order to PROCESSING without any of this (§4).

## 4. Payments (Stripe), paymentStatus, escrow

- **Backend**: `POST /payments/create-intent` CUSTOMER/ADMIN/OWNER/SUPPLIER (`payments.controller.ts:19-31`) → `PaymentsService.createPaymentIntent` (`payments.service.ts:129-262`): allows only `status === 'PENDING'` (149-154) — i.e. **before** supplier acceptance/approval, and never after approval (approved orders are PROCESSING); amount = `order.totalAmount` (goods only, no freight) (162); `capture_method: 'manual'` (202); creates `EscrowTransaction` with `platformFee = totalAmount × platformFee%` (157-159); metadata `destinationAddress` stringifies a JSON object (209-211) and `estimatedDays` defaults to `'3-5'` (208). Returns `findByIdWithItems` which includes the order's `supplier.stripeAccountId`/email (`orders.service.ts:1661-1668`).
- **Webhook** `POST /api/payments/webhook` (raw body `main.ts:57`; `stripe-webhook.controller.ts`): signature verified (35-43); **no idempotency** — `ProcessedWebhookEvent` model (schema.prisma:866-876) is never used; `amount_capturable_updated` → escrow CAPTURED (actually only authorised) and **order PENDING→PROCESSING by direct `prisma.order.update`** (94-99) — bypasses `workflowBlocker`, history, stock checks; emails "payment received / funds held securely in escrow / ready to ship" (120-191); `payment_intent.succeeded` → same PENDING→PROCESSING (236-241); `payment_intent.payment_failed` → escrow REFUNDED and **order CANCELLED** directly (250-258) with no restock, no history, throws if no escrow row.
- **Escrow service** (`escrow.service.ts`): `releaseEscrow` (58-117) is **never called** anywhere; `refundEscrow` (119-135) calls `stripe.refunds.create` with free-text `reason` (stripe.gateway.ts:37-43) — callers pass `'Order cancelled/refunded'` (orders.service.ts:1461) or the **customerId** (disputes.service.ts:118); Stripe only accepts `duplicate|fraudulent|requested_by_customer`, and errors are swallowed → refunds fail silently; refunding an authorised-but-uncaptured intent also fails (CAPTURED is set on authorisation).
- **paymentStatus / paidAt / paymentIntentId / escrowStatus / escrowHeldAt / escrowReleasedAt** (schema.prisma:332-339): **never written** by any code path (grep: only reads in `finance.service.ts:164,169,175,213`, `owner.service.ts:85`, `threat-detection.service.ts:146`, `support-context.service.ts:163`, excel export). No admin endpoint or UI to record a manual payment.
- **Frontend**: `/checkout/payment` (`app/checkout/payment/page.tsx`, `PaymentForm.tsx`, `OrderSummary.tsx`) exists but **no link to it anywhere** (grep `checkout/payment` → none). Copy: "full escrow protection" (page.tsx:175), "Protected by Atlantis Escrow … released when you confirm delivery" (PaymentForm.tsx:117-118), "Platform Protection" fee line = 5% of total shown but not added (OrderSummary.tsx:50-52, 98-107). Buyer `/dashboard/payment-methods` stores IBAN "for refunds and settlements" (page.tsx:45; IBAN encrypted `users.service.ts:247`), card "coming in the next release" (134). Supplier `/supplier/payment-methods` Stripe Connect onboarding (`payments.service.ts:22-78`, KYC check disabled 26-31).
- **Policy text**: protected-payments says "Atlantis doesn’t hold buyer funds in escrow" (`ProtectedPaymentsClient.tsx:68, 237`); returns locale "No escrow" (`locales/en.ts:974-975`); **Terms** say "payment via Stripe escrow", "complete payment at the time of order placement", "confirming delivery triggers the release of escrow funds", KYC required (`TermsClient.tsx:21, 42, 55, 67-68, 73-80`); supplier earnings "Funds held in secure escrow … automatically released" (`supplier/earnings/page.tsx:55-59, 146-148`); webhook emails claim escrow.
- **Net**: there is no working payment collection or recording system. Payment "details are sent by the team" manually and nothing in the DB ever records that a buyer paid.

## 5. Deposits

- No deposit/advance/pro-forma field or flow anywhere (grep `deposit|proforma` → none in backend/prisma/frontend). `CreditTerm` exists (schema.prisma:710-721) but `usedCredit` is never incremented (`FinanceService.useCredit` has no callers) and `credit-check` isn't used at checkout. **Missing**.

## 6. Refunds

- Only automated path: `refundEscrow` (broken, §4) triggered by order cancel (orders.service.ts:1454-1467) and dispute RESOLVED_REFUND (disputes.service.ts:116-119). Always full amount; no partial refund; no refund record (no Refund model; `FinancialAuditLog` REFUND_ISSUED never written — only `INVOICE_GENERATED` is logged, `invoice.service.ts:70-76,107-112`).
- No refund for non-Stripe (bank transfer) payments, no credit note, no invoice cancellation.
- Policy promises: "Refund processing 1–3 business days", "Funds 5–10 business days", Stripe fee note (`locales/en.ts:1011-1017`), "full or partial refund or price adjustment" (988), inspection "deducted on the invoice" (`GoodsInspectionClient.tsx:170`). None is backed by code.

## 7. Returns

- Policy page `app/returns/ReturnsClient.tsx` + `locales/en.ts:968-1034`: dispute-based returns, "Don’t send goods back without written confirmation". No return/RMA model, no return shipping record, no restock on return. **Policy-only** (honestly framed as team-coordinated, but timelines are promised — see findings).

## 8. Disputes

- **Backend** `disputes.controller.ts` / `disputes.service.ts`: `POST /disputes` CUSTOMER (17-30) — order must belong to buyer and not be PENDING/CANCELLED (service 19-21; so PAID/PROCESSING allowed), one active dispute per order (23-26), **no time window**, no validation of reason/description/evidence; notifies ADMIN+SUPPORT only (33). `GET /disputes/my` CUSTOMER; `GET /disputes`, `GET /disputes/stats`, `PATCH /disputes/:id/resolve`, `PATCH /disputes/:id/status` — roles ADMIN/SUPPORT/MODERATOR/**DEVELOPER/LOGISTICS**/OWNER (40-86). `resolve` (101-133) can be repeated (only CLOSED blocked), decision not validated, triggers broken refund. `updateStatus` accepts any status (135-139).
- **DB**: `Dispute` (schema.prisma:832-847): no amount, no supplier, no deadline, no messages; `evidence String[]`.
- **UI**: **Buyer UI exists** (lead disproved): order page dispute card + form (`app/dashboard/customer/orders/[id]/page.tsx:163-174, 210, 415-450`; HEAD version had it too at 219-242, 724-835), deep link `#dispute` from the list (`orders/page.tsx:226`), buyer payments page lists disputes. **No evidence/photo upload** in the form (body sends only orderId/reason/description, line 168). Admin `app/admin/disputes/page.tsx` (no amount input, no evidence view). Suppliers have no dispute view and are not notified.
- **Stats bug**: service returns `{open, underReview, …}` (service 148) but `app/admin/page.tsx:135` reads `disputesData?.OPEN`, `app/admin/support/page.tsx:266,278,618` read `stats?.OPEN` / `stats?.openDisputes` → always 0/fallback.
- **Policy**: "within 7 days of the expected delivery date" (en.ts:984) vs "more than 7 days after delivery confirmation" (1004) vs Terms "within 7 days of delivery confirmation" (`TermsClient.tsx:69, 96`) vs shipping "within 7 days, with photos" (`ShippingClient.tsx:171`); "review within 48–72 hours" (988, 1009); "The supplier is contacted as well" (986). None enforced.

## 9. Delivery / fulfilment pricing

- **Backend** `fulfillment/fulfillment-calc.ts` (pure; "no rate → quote_required, never estimated", lines 1-13), `fulfillment.service.ts` (`forQuote`, `forBuyer` strips supplierId 86-89), admin rates/hubs `fulfillment.controller.ts:43-66` (ADMIN/OWNER/LOGISTICS), supplier settings (22-41). Used by `priceCart` (orders.service.ts:289-297) and stored on `Order.fulfillment`. Tests `fulfillment/__tests__/fulfillment-calc.spec.ts`.
- **Legacy carrier list**: `POST /shipping/agent-rates` returns three hard-coded carriers (DB Schenker, LKW Walter, Raben) with **formula costs and estimatedDays** (`shipping.service.ts:165-207`); checkout shows only names + "Cost and transit time are confirmed by Atlantis…" (`checkout/page.tsx:400-428`) — the computed cost isn't displayed, but the endpoint is public and implies carrier relationships; the chosen name is stored as `shippingCompany` (orders.service.ts:380-381) and drives the logistics portal matching (§10).
- **Enforced**: freight only from server calc or admin `setShipping`; freight change on workflow order = new terms version + buyer acceptance (orders.service.ts:114-133).
- **Gaps**: freight is never charged by the Stripe path (amount = goods); invoice excludes freight (§13); "Processing time … up to 48 business hours after payment is received" (`ShippingClient.tsx:149`) — no payment-received state exists to start such a clock.

## 10. Shipments / tracking

- **Backend** `shipping/shipment.controller.ts`: `GET /shipments/track?number=` **public, no guard** (12-15) → returns shipment + **entire Order row** incl. customer name/email, `shippingAddress`, `submittedTerms`, `fulfillment` (`shipment.service.ts:38-53`); `GET /shipments/order/:orderId` JWT only, **no ownership check** (17-21); `POST /shipments`, `POST /shipments/:id/updates`, `GET /shipments/admin/all` ADMIN. `Shipment.status` never changes (addUpdate only inserts `ShipmentUpdate`, 27-36). Tracking via `PATCH /orders/:id/shipping` upserts Shipment (orders.service.ts:140-170). `GET /shipping/track/:id` DHL/Aramex providers.
- **Logistics portal**: `GET /orders/logistics/assigned` (LOGISTICS/ADMIN/OWNER) fuzzy two-way substring match on `shippingCompany` vs user companyName/name (orders.service.ts:479-515) → returns customer name/email/phone; `app/logistics/orders/page.tsx`. LOGISTICS also gets full admin view of any order via `GET /orders/:id` (orders.controller.ts:207-209).
- **UI**: `/dashboard/customer/orders/[id]/track/page.tsx` is **entirely hard-coded demo content** (Cairo hub, "Steel Reinforcement Bars", "$14,500.00", ETA "28 April 2024", "Verified by Monjez Logistics", lines 19-56, 200-260). `/dashboard/track` (linked from How it works, `HowItWorksClient.tsx:20`) and `/admin/logistics` call `axios.get('/api/shipments/...')` (`dashboard/track/page.tsx:24`, `admin/logistics/page.tsx:18,132,171`) but there is no Next route `/api/shipments` (only `/api/proxy/...`; middleware excludes `/api`, `middleware.ts:37`) → always "not found". Order detail shows tracking number with carrier deep link (HEAD `[id]/page.tsx:348-380`).
- **Missing**: carrier status sync, ETA, proof of delivery, delivered-at timestamp, partial shipments (Shipment is 1:1 with Order, schema.prisma:785).

## 11. Coupons / discounts affecting totals

- `priceCart` applies `Coupon.discountPercent` (0-100) to the whole subtotal (orders.service.ts:279-288); `Coupon` is tied to a `placementId` (schema.prisma:615-627) but not restricted to that placement's product; no usage count, per-buyer limit, minimum order, or stacking rule; 100 % allowed. `GET /coupons/validate/:code` JWT (coupons.controller.ts:12-16). Supplier net price unaffected (`supplierUnitPrice` computed pre-coupon, 264) → Atlantis bears it; but escrow `supplierAmount` is derived from post-coupon `totalAmount` (payments.service.ts:157-159). Coupon lost on amendment (§3).
- `discounts` module (tiered prices, customer groups): controller has **only JWT, no roles** (`discounts.controller.ts:14-92`) — any user can create tiers/groups and add themselves to a group; but these are not used by `priceCart` (no references in orders) → dead feature that doesn't affect totals; `GET /discounts/calculate` returns `product.price`-based figures (discounts.service.ts:65).

## 12. Stock reservation

- Taken in cases at request time (orders.service.ts:365-374, conditional decrement), returned on cancel from PENDING/PAID/PROCESSING (1321-1340), returned on amendment quantity cut (1069-1073). Ledger `products/stock-ledger.ts` (RESERVED_STATUSES 19). Tests in `orders-create.spec.ts`.
- **Gaps**: no reservation expiry (expired confirmations keep stock); webhook payment_failed cancels without restock (stripe-webhook.controller.ts:255-258); admin hard delete doesn't restock; mixed load stays `ORDERED` after cancellation (no reset in internalUpdateStatus).

## 13. Invoices

- **Backend** `invoices/invoice.controller.ts`: guarded by `AuthGuard('jwt')` only, **no roles, no ownership** — `GET /invoices` (all invoices, all customers), `GET /invoices/:id`, `POST /invoices/generate/:orderId`, `POST /invoices/:id/pay` (marks paid, reduces credit) are open to any signed-in user (lines 5-33). `GET /invoices/my` returns `include: { order: true }` (invoice.service.ts:117-123) → raw `submittedTerms`/`termsSnapshot`/`fulfillment` (supplier ids) to buyer.
- **Generation**: auto only on DELIVERED (orders.service.ts:1445-1451); amount = `order.totalAmount` (goods), **freight excluded**, flat 5 % "tax" unless an APPROVED exemption (validity dates ignored) (invoice.service.ts:50-53); `currency` default `"USD"` (schema.prisma:700) while orders are EUR; number = `count()+1` (15-20) → duplicates after any invoice deletion (cascade on order delete) → unique violation, swallowed (orders.service.ts:1448-1450). `sendInvoiceEmail` never called. Manual invoice `POST /finance/manual-invoice` ADMIN (finance.controller.ts:172-176).
- **Supplier invoice**: `POST/DELETE /orders/:id/supplier-invoice` SUPPLIER + staff incl. LOGISTICS, PolicyGuard (orders.controller.ts:59-102), stored as product image in Supabase; shown to buyer/admin.
- **UI**: buyer print via `lib/invoice-print.ts:50-53` (Subtotal/Tax/Total, `€` hard-coded); buyer payments page; admin `admin/finance/page.tsx:97-106` (mark paid).
- **Policy**: "VAT is calculated on the invoice" (`ProtectedPaymentsClient.tsx:242`, en.ts:1093/1188) — it's a flat 5 %; payment "after approval" but invoice only after delivery.

## 14. Inspections

- `POST /orders/:id/inspections`, `PATCH /orders/:id/inspections/:inspectionId` ADMIN/OWNER/LOGISTICS (orders.controller.ts:318-328) → `saveInspection` validates statuses, lines, findings, photos (https only), inspector/date (orders.service.ts:1186-1234). Buyer sees `inspectionView` (1175-1183) via `components/orders/InspectionReport.tsx`. Model `OrderInspection` (schema.prisma:426-449).
- **Gaps**: `resolution` (ACCEPTED_WITH_DISCOUNT / PARTIALLY_ACCEPTED / REJECTED) has **no financial or status effect** (no discount, no line cancel, no refund) though `GoodsInspectionClient.tsx:129-132,170` describes those outcomes; hub not required to be verified (1221); photo upload UI for inspectors not verified; no expected BBD to check the `DATE` finding against (§15).

## 15. Best-before date per order line

- Product has free-text `shelfLife` ("BBD / Shelf life"), Offer has `bbd` (`offers.service.ts:23,133,178`). `OrderItem` has **no BBD/lot snapshot** (schema.prisma:518-567). Buyer order page shows product `shelfLife` (current WIP `[id]/page.tsx:378-384`; HEAD labelled it "BBD" at 569). Inspection DATE finding has no reference value. **Confirmed missing.**

## 16. Finance / commissions / earnings / payouts

- **FinanceController** `@UseGuards(JwtAuthGuard, RolesGuard)` but only 2 handlers have `@Roles` (`finance.controller.ts:27, 173`); `RolesGuard` returns `true` when no roles are set (`auth/roles.guard.ts:14-16`) → **every other finance route is open to any signed-in buyer/supplier**: revenue report, report send, credit-terms CRUD (self-grant credit), credit-check, tax-exemptions create **and review** (self-approve → 0 % invoice tax), warehouses CRUD, financial audit trail (`finance.controller.ts:45-170`).
- **Numbers**: revenue = Σ `totalAmount` where `paymentStatus='PAID'` (always 0) (finance.service.ts:161-205); `platformRevenue = total × PLATFORM_FEE_PERCENT` — not the real markup model (`common/markups.ts`); supplier earnings (finance) use buyer prices × (1−fee) (208-233) — would show suppliers the buyer price; `/payments/my-earnings` (supplier/earnings page) queries escrow by `order.supplierId` (never set) → always empty, and would return `order.totalAmount` (buyer total) to suppliers (payments.service.ts:80-113). Admin orders list `supplierProfit` = buyer price × qty, `adminProfit` = total × fee% (orders.service.ts:573-577). `getOrderStats.totalRevenue` = Σ totalAmount non-cancelled incl. unapproved requests (1253-1257) with comment "EGP". Reports cron weekly/monthly email (`reports.service.ts:18,32`) revenue = delivered totalAmount (68).
- **Payouts**: none (releaseEscrow never called; no payout record/schedule); supplier earnings copy promises automatic release.
- **UI**: `admin/finance/page.tsx`, `admin/billing/page.tsx`, `supplier/earnings/page.tsx`.

## 17. Support order conversations

- `components/support/SupportCenter.tsx:21-23` reads only `?tab=orders`; `OrderThreads.tsx` keeps the active thread in local state (`setActive`, 125) — no `?order=` param. Order page links to `/dashboard/customer/support?tab=orders` (WIP `[id]/page.tsx:238`) without the order id. Thread → order link exists (OrderThreads.tsx:215). **Confirmed: can’t deep-link to a specific order thread.**

## 18. Scheduled jobs touching orders/payments

- `OrderWorkflowCron.expire` hourly (`orders/order-workflow.cron.ts:11`).
- `ReportsService` weekly Mon 08:00 and monthly 1st 08:00 (`finance/reports.service.ts:18,32`).
- `ThreatDetectionService` `setInterval` 5 min (`security/threat-detection.service.ts:16`): flags every order > 10 000 with `paymentStatus != 'PAID'` in the last 24 h as `FRAUD_LARGE_ORDER` (141-162) — since paymentStatus is never PAID, normal B2B truckload orders are flagged every 5 minutes; velocity and dispute-rate checks also.
- None: payment-authorisation expiry/capture, invoice overdue, dispute SLA, auto-cancel of expired requests, payout scheduling.

---

# PART 2 — FINDINGS

### TX-01
**Finance API open to any signed-in user (credit terms, tax exemptions, audit log, warehouses)**
- Area / page / workflow: Finance / `admin/finance`, `admin/billing` / credit, tax, audit
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: `FinanceController` applies `RolesGuard` at class level but only `export/statement` and `manual-invoice` carry `@Roles`; `RolesGuard` allows any request when no roles metadata exists. A buyer can `POST /finance/credit-terms` for themselves, `POST /finance/tax-exemptions` + `POST /finance/tax-exemptions/:id/review {status:'APPROVED'}` to zero their invoice tax, read `GET /finance/audit/recent`, `GET /finance/reports/revenue`, create/delete warehouses, spam `POST /finance/report/send`.
- Expected behavior: every finance route restricted to ADMIN/OWNER (some read-only to SUPPORT); suppliers only their own earnings.
- Evidence: `backend/src/finance/finance.controller.ts:15-17, 45-170` (no `@Roles`), `:27, :173` (only roles); `backend/src/auth/roles.guard.ts:14-16`; tax effect `backend/src/invoices/invoice.service.ts:46-52`.
- Impact: privilege escalation, tax manipulation, disclosure of platform financial data.
- Dependencies & risks: admin UI uses these routes — adding roles must keep ADMIN/OWNER working.
- Recommended future task: add `@Roles(ADMIN, OWNER)` (class-level) and explicit per-route exceptions; add a test that every controller handler has roles or is intentionally public.
- Requires: Backend
- Boundary: Approval-required

### TX-02
**Invoice API has no role or ownership checks (anyone can list all invoices or mark any invoice paid)**
- Area / page / workflow: Invoices
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: `InvoiceController` only uses `AuthGuard('jwt')`. `GET /invoices` returns all invoices with customer name/email/company; `GET /invoices/:id` any invoice; `POST /invoices/generate/:orderId` any order; `POST /invoices/:id/pay` marks any invoice PAID and reduces the customer's `usedCredit`.
- Expected behavior: list/generate/pay staff-only; `:id` owner or staff.
- Evidence: `backend/src/invoices/invoice.controller.ts:5-33`; `invoice.service.ts:125-154`.
- Impact: PII and financial disclosure across customers; falsified payment records.
- Dependencies & risks: `admin/finance/page.tsx:97-106` and buyer pages use these routes.
- Recommended future task: add `RolesGuard` + roles, ownership check on `:id`, audit-log `markAsPaid`.
- Requires: Backend
- Boundary: Approval-required

### TX-03
**Stripe webhook confirms orders without supplier acceptance or Atlantis approval**
- Area / page / workflow: Payments / order workflow
- Category: Broken or inconsistent behavior
- Severity: Critical
- Status: Confirmed
- Current behavior: on `payment_intent.amount_capturable_updated` and `payment_intent.succeeded` the webhook sets `order.status = 'PROCESSING'` for any PENDING order with a direct `prisma.order.update` — no `workflowBlocker`, no history row, `reviewStatus` stays PENDING_REVIEW. `create-intent` only accepts PENDING orders, i.e. before approval. Emails say "paid … ready to ship … funds held in escrow".
- Expected behavior: payment only after approval (as all buyer copy states), and payment events must never change workflow status; they should set `paymentStatus`/`paidAt`.
- Evidence: `backend/src/payments/stripe-webhook.controller.ts:94-99, 236-241, 166-191`; `backend/src/payments/payments.service.ts:149-154`; `backend/src/orders/order-workflow.ts:103-114`.
- Impact: CLAUDE.md rule "Orders are requests until every supplier accepts and Atlantis approves (server-enforced)" is violated by this path.
- Dependencies & risks: path is reachable only if Stripe keys + webhook are configured and someone opens the unlinked `/checkout/payment?orderId=` page (TX-12); decision needed on whether Stripe is in scope at all.
- Recommended future task: either remove/disable the Stripe flow, or rewrite: intent only for APPROVED + buyer-accepted orders, amount = goods + freight, webhook writes payment fields only, idempotent via `ProcessedWebhookEvent`.
- Requires: Backend, Integration, Policy decision
- Boundary: Approval-required

### TX-04
**A failed card attempt cancels the order (no restock, no history)**
- Area / page / workflow: Payments / stock
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed
- Current behavior: `payment_intent.payment_failed` sets escrow REFUNDED and `order.status = 'CANCELLED'` directly; stock taken at creation is not returned, no `OrderStatusHistory`, no notification; throws if no escrow row.
- Expected behavior: record `paymentStatus = FAILED`, let the buyer retry; cancellation only through `internalUpdateStatus`.
- Evidence: `backend/src/payments/stripe-webhook.controller.ts:246-261`; restock logic only in `orders.service.ts:1321-1340`.
- Impact: lost orders and permanently lost stock on a routine card decline.
- Dependencies & risks: same as TX-03.
- Recommended future task: part of the payments rewrite.
- Requires: Backend
- Boundary: Approval-required

### TX-05
**Payment is never recorded: paymentStatus / paidAt / escrow fields are never written**
- Area / page / workflow: Payments, finance reports, buyer Payments page, owner dashboard
- Category: Missing backend/system
- Severity: High
- Status: Confirmed
- Current behavior: `Order.paymentStatus` (default UNPAID), `paymentIntentId`, `paidAt`, `escrowStatus`, `escrowHeldAt`, `escrowReleasedAt` have no writer anywhere (not the webhook, not admin). There is no admin endpoint/UI to mark a workflow order paid ("Mark as Paid" is hidden for workflow orders). Reports filter on `paymentStatus='PAID'` → revenue/paid counts are always 0; buyer Payments page shows every order "Not recorded as paid"; threat detection flags every >10 000 order every 5 min.
- Expected behavior: a single payment-record mechanism (manual bank transfer and/or Stripe) that sets these fields, with audit log.
- Evidence: `backend/prisma/schema.prisma:332-339`; readers `backend/src/finance/finance.service.ts:164,169,175,213`, `backend/src/owner/owner.service.ts:85`, `backend/src/security/threat-detection.service.ts:141-162`; `frontend/src/app/dashboard/customer/payments/page.tsx:105,181`; `frontend/src/app/admin/orders/[id]/page.tsx:813-818, 974`.
- Impact: no source of truth for "paid"; every finance figure is wrong; false fraud alerts.
- Dependencies & risks: policy decision on payment method (manual vs Stripe).
- Recommended future task: add `POST /orders/:id/payments` (staff) to record payments (amount, method, reference, date), set paymentStatus/paidAt, log to FinancialAuditLog; show on buyer/admin pages.
- Requires: Backend, DB (additive: payment records), UI, Policy decision
- Boundary: Approval-required

### TX-06
**Refunds cannot succeed (invalid Stripe reason, uncaptured intents, errors swallowed)**
- Area / page / workflow: Refunds / disputes / cancellation
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed (by code; Stripe API constraint not exercised live)
- Current behavior: `refundEscrow` passes a free-text reason to `stripe.refunds.create` (`'Order cancelled/refunded'` or the customer's id from disputes); escrow is marked CAPTURED on mere authorisation, so cancel paths call refund instead of cancel; all errors are caught and dropped, while the buyer is told "A refund will be issued". Always full amount; no refund record.
- Expected behavior: explicit refund records (amount, method, reference, status), partial refunds, failures surfaced to staff.
- Evidence: `backend/src/payments/stripe.gateway.ts:37-43`; `backend/src/payments/escrow.service.ts:119-135`; `backend/src/disputes/disputes.service.ts:116-127`; `backend/src/orders/orders.service.ts:1454-1467`; `stripe-webhook.controller.ts:80-84`.
- Impact: buyers promised refunds that never happen; no trace for finance.
- Dependencies & risks: TX-05 payment records.
- Recommended future task: Refund model + staff refund action (manual or Stripe), dispute resolution with amount.
- Requires: Backend, DB, UI, Integration
- Boundary: Approval-required

### TX-07
**Public tracking endpoint leaks the full order (PII, address, terms); shipment-by-order has no ownership check**
- Area / page / workflow: Shipments / tracking
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: `GET /shipments/track?number=` has no guard and returns the shipment with the whole `Order` row (customer name/email, `shippingAddress`, `submittedTerms` with supplier ids, `fulfillment`). Tracking numbers are carrier numbers or `ATL-` + 8 random chars. `GET /shipments/order/:orderId` requires only a JWT — any user can read any order's shipment.
- Expected behavior: public tracking returns only status/updates; order-scoped reads check buyer/supplier/staff.
- Evidence: `backend/src/shipping/shipment.controller.ts:12-21`; `backend/src/shipping/shipment.service.ts:9, 38-53, 69-74`.
- Impact: personal data disclosure; supplier identity disclosure to non-staff.
- Dependencies & risks: `/dashboard/track` and `/admin/logistics` consume it (currently broken, TX-15).
- Recommended future task: guard + select-limited response.
- Requires: Backend
- Boundary: Approval-required

### TX-08
**Terms of Service describe a Stripe-escrow payment model that contradicts the rest of the site and the code**
- Area / page / workflow: `/terms`, `/protected-payments`, `/returns`, supplier earnings, payment pages, emails
- Category: Policy-only behavior
- Severity: High
- Status: Confirmed
- Current behavior: Terms: "payment via Stripe escrow", "Complete payment at the time of order placement", "confirming delivery triggers the release of escrow funds", "payment is held in escrow (Stripe manual capture) until the buyer confirms delivery", suppliers need full KYC and Stripe. Protected payments / Returns: "Atlantis doesn’t hold buyer funds in escrow", "pay after approval". Supplier earnings: "funds … automatically released". Code: no release ever, KYC check disabled, confirm-delivery releases nothing.
- Expected behavior: one payment model described consistently; legal terms match operations (CLAUDE.md: never claim escrow/held funds).
- Evidence: `frontend/src/app/terms/TermsClient.tsx:21, 42, 55, 67-69, 73-80, 96-100, 136`; `frontend/src/app/protected-payments/ProtectedPaymentsClient.tsx:68, 237-238`; `frontend/src/locales/en.ts:973-975`; `frontend/src/app/supplier/earnings/page.tsx:55-59, 146-148`; `frontend/src/app/checkout/payment/PaymentForm.tsx:117-118`, `page.tsx:175`, `OrderSummary.tsx:112-123`; `backend/src/payments/stripe-webhook.controller.ts:180`; `backend/src/payments/payments.service.ts:26-31`; `backend/src/orders/orders.service.ts:1682-1696`.
- Impact: legal/consumer-protection exposure; buyer and supplier misled.
- Dependencies & risks: legal review of Terms text; other locales (ar/es/fr/it/pt/ro) mirror en.
- Recommended future task: rewrite Terms §§2, 4, 5, 7, 9, 12 to the request → approval → payment-under-terms model; remove escrow copy from supplier earnings and payment pages.
- Requires: Policy decision, UI
- Boundary: Approval-required (legal text); the non-legal UI copy removals are Safe-to-implement-now

### TX-09
**Invoices omit freight, apply a flat 5 % "tax", default to USD, and are only issued after delivery**
- Area / page / workflow: Invoices / buyer order page / payments page
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed
- Current behavior: invoice `amount = order.totalAmount` (goods after coupon), `tax = 5 %` unless any APPROVED exemption (validity dates ignored), `currency` default USD, created only on DELIVERED. The order page and list show "Total = goods + freight"; the buyer Payments page "Total" column shows goods only; the email after authorisation shows Subtotal + Shipping but "Total" = goods only; site copy says "VAT is calculated on the invoice" and "you pay after approval".
- Expected behavior: invoice (or pro forma at approval) = approved terms: goods + freight + correct VAT, EUR.
- Evidence: `backend/src/invoices/invoice.service.ts:15-20, 41-53`; `backend/prisma/schema.prisma:690-708 (700)`; `backend/src/orders/orders.service.ts:1445-1451`; `frontend/src/lib/invoice-print.ts:50-53`; `frontend/src/app/dashboard/customer/orders/[id]/page.tsx:308`; `frontend/src/app/dashboard/customer/orders/page.tsx:200-203`; `frontend/src/app/dashboard/customer/payments/page.tsx:188`; `backend/src/payments/stripe-webhook.controller.ts:116-136`; `frontend/src/app/protected-payments/ProtectedPaymentsClient.tsx:242`.
- Impact: wrong amounts on legal documents; buyers can't pay from an invoice before delivery.
- Dependencies & risks: VAT rules (reverse charge EU B2B) are a policy/accounting decision.
- Recommended future task: invoice from `termsSnapshot` with freight line; VAT engine or manual VAT field; pro forma at approval; EUR currency.
- Requires: Backend, DB (additive fields), Policy decision
- Boundary: Approval-required (display of goods vs total labels on Payments page is Safe-to-implement-now)

### TX-10
**Order.totalAmount is goods-only; consumers disagree on what "total" means**
- Area / page / workflow: Orders, emails, finance, admin, Stripe
- Category: Data-model limitation
- Severity: Medium
- Status: Confirmed
- Current behavior: `totalAmount` = goods − coupon; `shippingCost` separate. Buyer order page/list add them; Payments page, invoices, Stripe amount, buyer order email ("Total $…"), finance revenue, admin analytics and `getOrderStats` use goods only; admin order detail adds them (`fmtMoney(order.total + shippingCost)`).
- Expected behavior: explicit `goodsTotal`, `freightTotal`, `vat`, `grandTotal` (or a single helper) used everywhere.
- Evidence: `backend/src/orders/orders.service.ts:379-384, 1253-1257, 1780`; `backend/src/email/email.service.ts:321-335`; `backend/src/payments/payments.service.ts:162`; `frontend/src/app/admin/orders/[id]/page.tsx:866`; files in TX-09.
- Impact: inconsistent figures for the same order across screens/emails.
- Dependencies & risks: additive schema only.
- Recommended future task: introduce a shared `orderTotals(order)` helper (backend + frontend) and label goods vs total explicitly.
- Requires: Backend, UI
- Boundary: Safe-to-implement-now for presentation labels using existing fields; Approval-required for schema/email changes

### TX-11
**Admin amendment drops the coupon discount and allows below-cost buyer prices**
- Area / page / workflow: Confirmation workflow / amend
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: `amendOrder` sets `totalAmount = Σ price × quantity` of the items, ignoring the coupon applied at creation; a new unit price only needs to be > 0, no check against `supplierUnitPrice`; fulfilment/freight not recalculated after quantity cuts.
- Expected behavior: amended totals keep the coupon; guard against negative margin; re-quote freight.
- Evidence: `backend/src/orders/orders.service.ts:1076-1080, 1090-1093`; coupon applied at `:279-297`.
- Impact: buyer charged more than the promo after an amendment; possible loss-making orders.
- Dependencies & risks: tests in `order-workflow.spec.ts` should cover it.
- Recommended future task: store discountPercent on the order; recompute total = goods × (1 − discount); add margin check.
- Requires: Backend, DB (additive)
- Boundary: Approval-required

### TX-12
**Orphan Stripe payment page with escrow claims and a fake "Platform Protection" fee**
- Area / page / workflow: `/checkout/payment`
- Category: Policy-only behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: page not linked anywhere but reachable by URL; shows "Protected by Atlantis Escrow", "released when you confirm delivery", and a 5 % "Platform Protection" line not included in the total; the API it calls returns the order with the supplier's Stripe account id/email when `Order.supplierId` is set.
- Expected behavior: removed or rebuilt for the approved-terms model.
- Evidence: `frontend/src/app/checkout/payment/page.tsx:46-54, 175`; `PaymentForm.tsx:113-118`; `OrderSummary.tsx:50-52, 98-107`; `backend/src/orders/orders.service.ts:1638-1680`.
- Impact: misleading claims; latent supplier data exposure.
- Dependencies & risks: TX-03 decision.
- Recommended future task: remove the route (or gate behind a feature flag) until payments are designed.
- Requires: UI, Policy decision
- Boundary: Approval-required

### TX-13
**Dispute window, SLA, evidence and supplier involvement are policy-only (and the stated windows contradict each other)**
- Area / page / workflow: Disputes / returns / shipping / terms
- Category: Policy-only behavior
- Severity: High
- Status: Confirmed
- Current behavior: backend accepts a dispute any time after PENDING (also on PAID/PROCESSING, unlike the UI), no 7-day check, no review deadline, no evidence upload (form sends no evidence), suppliers are not told. Copy: "within 7 days of the expected delivery date" vs "more than 7 days after delivery confirmation" vs Terms "within 7 days of delivery confirmation"; "reviews within 48–72 hours" vs (HEAD order page) "24–48 hours"; "Add photos… The supplier is contacted as well"; shipping "report … within 7 days, with photos".
- Expected behavior: one window, enforced server-side from a recorded delivery date; evidence upload; supplier notification/visibility; SLA tracked.
- Evidence: `backend/src/disputes/disputes.service.ts:15-45`; `frontend/src/app/dashboard/customer/orders/[id]/page.tsx:163-174, 210`; `frontend/src/locales/en.ts:984-988, 1004, 1009`; `frontend/src/app/terms/TermsClient.tsx:69, 96`; `frontend/src/app/shipping/ShippingClient.tsx:171`; HEAD `[id]/page.tsx:775`.
- Impact: unenforceable promises; disputes can be filed on orders not yet shipped via API.
- Dependencies & risks: needs a delivered-at timestamp (OrderStatusHistory has one) and upload storage.
- Recommended future task: decide the window; enforce in `create`; add evidence upload; notify suppliers; align copy in all 7 locales.
- Requires: Backend, UI, Policy decision
- Boundary: Approval-required (copy alignment alone is Safe-to-implement-now once the window is decided)

### TX-14
**Dispute resolution is open to LOGISTICS/DEVELOPER, can be repeated, and has no amount**
- Area / page / workflow: Disputes admin
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: `PATCH /disputes/:id/resolve` and `/status` allowed for ADMIN, SUPPORT, MODERATOR, DEVELOPER, LOGISTICS, OWNER; `resolve` may run again on an already resolved dispute (each RESOLVED_REFUND re-triggers a refund attempt); `decision`/`status` not validated; no refund amount; OWNER not notified of new disputes.
- Expected behavior: refund decisions restricted (ADMIN/OWNER, maybe SUPPORT), single resolution, validated decision, amount + audit.
- Evidence: `backend/src/disputes/disputes.controller.ts:70-86`; `backend/src/disputes/disputes.service.ts:33, 101-139`.
- Impact: unauthorised refund decisions; duplicate refunds once refunds work.
- Recommended future task: tighten roles, state machine, amount field.
- Requires: Backend, DB (additive), UI
- Boundary: Approval-required

### TX-15
**Tracking pages are fake or broken**
- Area / page / workflow: `/dashboard/customer/orders/[id]/track`, `/dashboard/track`, `/admin/logistics`
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed (by code; not run)
- Current behavior: the per-order track page is a static mock (Cairo hub, steel bars, $14,500, ETA April 2024, "Verified by Monjez Logistics") for any order id; `/dashboard/track` (linked from How it works) and `/admin/logistics` call `/api/shipments/...`, which has no Next route (only `/api/proxy`), so lookups fail; `Shipment.status` never changes from PENDING.
- Expected behavior: real data or no page (CLAUDE.md honesty rules).
- Evidence: `frontend/src/app/dashboard/customer/orders/[id]/track/page.tsx:17-56, 200-260`; `frontend/src/app/dashboard/track/page.tsx:24`; `frontend/src/app/admin/logistics/page.tsx:18, 132, 171`; `frontend/src/app/how-it-works/HowItWorksClient.tsx:20`; `frontend/src/middleware.ts:37`; `backend/src/shipping/shipment.service.ts:27-36`.
- Impact: buyers see fabricated shipment data and a foreign brand.
- Recommended future task: delete the mock page (or redirect to the order page), point tracking UIs to `apiFetch('/shipments/...')` after TX-07 is fixed, update Shipment.status from updates.
- Requires: UI, Backend
- Boundary: Safe-to-implement-now (removing/redirecting the mock page and fixing the fetch path to existing data); backend status sync Approval-required

### TX-16
**Buyer order APIs expose supplier ids**
- Area / page / workflow: Buyer orders, buyer invoices
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: `GET /orders/my-orders` selects `product.supplierId` per item; `GET /orders/:id` (buyer) includes `product.supplier.name`; `GET /invoices/my` includes the raw order (`submittedTerms.lines[].supplierId`, `fulfillment.groups[].supplierId`). The price-privacy interceptor strips only `supplierUnitPrice`/basePrice.
- Expected behavior: buyers never see supplier ids (CLAUDE.md).
- Evidence: `backend/src/orders/orders.service.ts:617, 679`; `backend/src/invoices/invoice.service.ts:117-123`; `backend/src/common/price-privacy.ts:55-66`.
- Impact: breaks the supplier-anonymity rule; lets buyers bypass the marketplace.
- Recommended future task: remove `supplierId`/`supplier` from buyer selects; select-limit invoice `order`.
- Requires: Backend
- Boundary: Approval-required

### TX-17
**Supplier earnings & payouts don't exist (and would leak the buyer total)**
- Area / page / workflow: `/supplier/earnings`, `/payments/my-earnings`, `/finance/reports/supplier-earnings`
- Category: Missing backend/system
- Severity: Medium
- Status: Confirmed
- Current behavior: `/payments/my-earnings` filters escrow by `order.supplierId`, which is never set → empty; it would return `order.totalAmount` (buyer total) and `platformFee`; `/finance/reports/supplier-earnings` computes from buyer prices × (1 − fee) and `paymentStatus='PAID'` (never). `releaseEscrow` never called; no payout records. Page promises automatic escrow release.
- Expected behavior: supplier statement from `supplierUnitPrice` × qty per delivered/accepted line, payout records with status.
- Evidence: `backend/src/payments/payments.service.ts:80-113`; `backend/src/finance/finance.service.ts:208-233`; `backend/src/payments/escrow.service.ts:58-117`; `frontend/src/app/supplier/earnings/page.tsx:30, 55-59, 146-148`; schema.prisma:362.
- Impact: suppliers have no reliable earnings view; latent margin disclosure.
- Recommended future task: supplier statement endpoint from `supplierLineValue`; Payout model; remove escrow copy.
- Requires: Backend, DB, UI, Policy decision
- Boundary: Approval-required

### TX-18
**Financial figures in admin/finance are formula guesses, not the real margin**
- Area / page / workflow: Admin orders list, finance reports, billing, weekly reports
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: `adminProfit = totalAmount × platformFee%`, `supplierProfit = Σ buyer price × qty`; finance `platformRevenue = total × PLATFORM_FEE_PERCENT` (env, default 5) while pricing uses tier markups; `getOrderStats.totalRevenue` includes unapproved requests ("EGP" comment); two different fee sources (AppConfig vs env).
- Expected behavior: margin = buyer line total − supplier line total from stored `supplierUnitPrice`; revenue only for approved/paid/delivered orders.
- Evidence: `backend/src/orders/orders.service.ts:543-577, 1243-1268`; `backend/src/finance/finance.service.ts:152-205, 235-257`; `backend/src/payments/escrow.service.ts:15-22`; `backend/src/payments/payments.service.ts:305-316`.
- Impact: wrong business reporting.
- Recommended future task: one margin helper from stored prices; revenue definitions documented.
- Requires: Backend
- Boundary: Approval-required

### TX-19
**Stripe webhook not idempotent; FinancialAuditLog not written for payments**
- Area / page / workflow: Payments
- Category: Incomplete integration
- Severity: Medium
- Status: Confirmed
- Current behavior: `ProcessedWebhookEvent` and FinancialAuditLog event types PAYMENT_*/ESCROW_*/PAYOUT_SENT/REFUND_ISSUED exist but are unused; webhook re-deliveries resend emails/notifications.
- Expected behavior: dedupe by event id; append-only audit for every money event.
- Evidence: `backend/prisma/schema.prisma:866-902`; `backend/src/payments/stripe-webhook.controller.ts:25-66`; only writer `backend/src/invoices/invoice.service.ts:70-76`.
- Impact: duplicate side-effects; no audit trail.
- Recommended future task: part of payments rewrite.
- Requires: Backend, Integration
- Boundary: Approval-required

### TX-20
**No deposit / pro forma / credit-term usage**
- Area / page / workflow: Payment terms
- Category: Missing backend/system
- Severity: Medium
- Status: Confirmed
- Current behavior: no deposit field or flow; `CreditTerm.usedCredit` never incremented; credit check unused at order time; payment terms not on the order.
- Expected behavior: per-order payment terms (prepay / deposit % / Net N) captured in `termsSnapshot` and invoices.
- Evidence: grep `deposit|proforma` (none); `backend/src/finance/finance.service.ts:44-63` (no callers of `useCredit`); `backend/prisma/schema.prisma:710-721`.
- Impact: B2B payment terms are handled off-system.
- Requires: Backend, DB, UI, Policy decision
- Boundary: Approval-required

### TX-21
**No best-before date / lot captured per order line**
- Area / page / workflow: OrderItem, inspection, buyer order page
- Category: Data-model limitation
- Severity: Medium
- Status: Confirmed
- Current behavior: BBD lives as free text on Product (`shelfLife`) and Offer (`bbd`); `OrderItem` snapshots name/tier/variants but not BBD; buyer order page shows the product's current shelf life (HEAD labelled it "BBD"); inspection DATE findings have nothing to compare to; returns policy lists "Expired goods delivered" as eligible.
- Expected behavior: supplier confirms BBD (min BBD) per line at acceptance; snapshot on the line; inspection compares.
- Evidence: `backend/prisma/schema.prisma:518-567`; `backend/src/offers/offers.service.ts:23, 133, 178`; `frontend/src/app/dashboard/customer/orders/[id]/page.tsx:378-384` (HEAD 567-571); `backend/src/orders/orders.service.ts:1173`; `frontend/src/locales/en.ts:999`.
- Impact: FMCG-critical term not part of the agreed terms.
- Requires: DB (additive), Backend, UI
- Boundary: Approval-required

### TX-22
**Inspection outcome has no effect on the order or money**
- Area / page / workflow: Inspections / goods-inspection policy
- Category: Policy-only behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: `resolution` ACCEPTED_WITH_DISCOUNT / PARTIALLY_ACCEPTED / REJECTED is stored and shown only; no line cancel, price adjustment, invoice deduction or refund; FAILED inspection doesn't block shipping/delivery. Policy says "pay only for those", "deducted on the invoice".
- Evidence: `backend/src/orders/orders.service.ts:1186-1234`; `frontend/src/app/goods-inspection/GoodsInspectionClient.tsx:124-132, 170`; `frontend/src/app/protected-payments/ProtectedPaymentsClient.tsx:60`.
- Requires: Backend, Policy decision
- Boundary: Approval-required

### TX-23
**Stock stays reserved forever on expired/unanswered requests; other non-restocking cancel paths**
- Area / page / workflow: Stock reservation
- Category: Missing backend/system
- Severity: Medium
- Status: Confirmed
- Current behavior: hourly cron only marks confirmations EXPIRED; the order stays PENDING with stock decremented until staff act. Webhook cancellation and admin hard delete don't restock; mixed loads remain ORDERED after cancel.
- Evidence: `backend/src/orders/orders.service.ts:1123-1131, 1729-1740`; `backend/src/orders/order-workflow.cron.ts:11-19`; `backend/src/payments/stripe-webhook.controller.ts:255-258`.
- Recommended future task: auto-cancel (with restock) after N hours past expiry, configurable; soft delete for orders.
- Requires: Backend, Policy decision
- Boundary: Approval-required

### TX-24
**Admin hard delete destroys financial records**
- Area / page / workflow: Admin orders
- Category: Data-model limitation
- Severity: Medium
- Status: Confirmed
- Current behavior: `DELETE /orders/:id` and `/orders/bulk` hard-delete; cascades delete Invoice, Dispute, EscrowTransaction, history, confirmations, inspections; invoice numbering (`count()+1`) then collides.
- Evidence: `backend/src/orders/orders.controller.ts:364-374`; `backend/src/orders/orders.service.ts:1729-1740`; `backend/prisma/schema.prisma:694, 835, 944`; `backend/src/invoices/invoice.service.ts:15-20`.
- Recommended future task: soft-delete/archival; invoice sequence table.
- Requires: Backend, DB (additive)
- Boundary: Approval-required

### TX-25
**Order-created emails call a request "Order Confirmed" and show a USD goods total**
- Area / page / workflow: Emails
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: subject "✅ Order Confirmed #…", body "placed successfully", "Total: $x" (goods only); refs use the first 8 chars of the id while the UI uses the last 8; status email for PAID says "payment has been received"; "arriving today" email has no data basis.
- Expected behavior: "Order request received", EUR, same reference format, workflow wording from `partyStatus`.
- Evidence: `backend/src/email/email.service.ts:321-335, 351-372, 616-624`; `backend/src/orders/orders.service.ts:433-440`; `frontend/src/lib/buyer-orders.ts:35`.
- Requires: Backend
- Boundary: Approval-required (backend copy change, low risk)

### TX-26
**Support order conversations can't be deep-linked to an order**
- Area / page / workflow: Support center ↔ order page
- Category: Missing UI
- Severity: Low
- Status: Confirmed
- Current behavior: SupportCenter reads only `?tab=orders`; active thread is local state; the order page links to `/dashboard/customer/support?tab=orders` without the order id.
- Expected behavior: `?tab=orders&order=<id>` opens that thread (supplier side too).
- Evidence: `frontend/src/components/support/SupportCenter.tsx:21-33`; `frontend/src/components/support/OrderThreads.tsx:72-73, 125`; `frontend/src/app/dashboard/customer/orders/[id]/page.tsx:238`.
- Requires: UI
- Boundary: Safe-to-implement-now

### TX-27
**Dispute stats keys mismatch on admin dashboard/support**
- Area / page / workflow: `/admin`, `/admin/support`
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: `/disputes/stats` returns lowercase keys; admin home reads `OPEN`, support reads `OPEN`/`openDisputes` → 0 or list-length fallback.
- Evidence: `backend/src/disputes/disputes.service.ts:141-149`; `frontend/src/app/admin/page.tsx:135`; `frontend/src/app/admin/support/page.tsx:266, 278, 618`.
- Requires: UI
- Boundary: Safe-to-implement-now

### TX-28
**Coupons: whole-cart, unlimited, up to 100 %, not tied to their placement**
- Area / page / workflow: Checkout pricing
- Category: Incomplete integration
- Severity: Medium
- Status: Confirmed
- Current behavior: any active, unexpired code applies 0-100 % to the full subtotal; no usage cap/per-buyer limit/min order; coupon's `placementId` is ignored at pricing.
- Evidence: `backend/src/orders/orders.service.ts:279-288`; `backend/prisma/schema.prisma:615-627`; `backend/src/coupons/coupons.service.ts:48-53`.
- Requires: Backend, DB (additive), Policy decision
- Boundary: Approval-required

### TX-29
**Discounts module endpoints unguarded (any user can create tiers/groups and join a group)**
- Area / page / workflow: `/discounts/*`
- Category: Security or permissions gap
- Severity: Low (no effect on order totals today — not used by `priceCart`)
- Status: Confirmed
- Evidence: `backend/src/discounts/discounts.controller.ts:14-92`; no references from `backend/src/orders`.
- Recommended future task: add roles or remove the dead module.
- Requires: Backend
- Boundary: Approval-required

### TX-30
**LOGISTICS role over-reach: any order view/cancel, fuzzy carrier matching exposes buyer contact data**
- Area / page / workflow: Logistics portal, order status
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: LOGISTICS gets the admin view of any order (`GET /orders/:id`), can PATCH status (incl. CANCELLED) of any order via the staff bypass, upload/delete supplier invoices, resolve disputes; assigned orders are found by two-way substring match of free-text carrier names, returning customer name/email/phone.
- Evidence: `backend/src/orders/orders.controller.ts:60, 93, 207-209, 228`; `backend/src/auth/policy.guard.ts:28`; `backend/src/orders/orders.service.ts:479-515`; `backend/src/disputes/disputes.controller.ts:72, 83`.
- Recommended future task: carrier FK on Order/Shipment, scope logistics to assigned orders, limit transitions to SHIPPED/DELIVERED.
- Requires: Backend, DB (additive)
- Boundary: Approval-required

### TX-31
**Buyers can't cancel a request; no proof-of-delivery / delivered-at; approval possible without a freight figure**
- Area / page / workflow: Lifecycle
- Category: Missing backend/system
- Severity: Low
- Status: Confirmed
- Current behavior: no buyer cancel endpoint; DELIVERED is set by staff or buyer confirm with no POD; `approvalBlocker` doesn't require freight when `quote_required`, so the buyer may never see a delivery charge before shipping.
- Evidence: `backend/src/orders/orders.controller.ts:227-258, 345-350`; `backend/src/orders/order-workflow.ts:83-92`; `frontend/src/app/shipping/ShippingClient.tsx:116, 183-184`.
- Requires: Backend, UI, Policy decision
- Boundary: Approval-required

### TX-32
**Hard-coded English in transactional emails and legacy pages**
- Area / page / workflow: Emails, `/checkout/payment`, `/dashboard/track`, track mock, admin disputes, supplier earnings
- Category: Localization/accessibility gap
- Severity: Low
- Status: Confirmed
- Current behavior: emails are English-only HTML; listed pages are not on the i18n system (the buyer order page is being migrated in the working tree).
- Evidence: `backend/src/email/email.service.ts:321-825`; `frontend/src/app/checkout/payment/*.tsx`; `frontend/src/app/dashboard/track/page.tsx`; `frontend/src/app/admin/disputes/page.tsx`; `frontend/src/app/supplier/earnings/page.tsx`.
- Requires: UI, Backend
- Boundary: Safe-to-implement-now for frontend strings

### TX-33
**Threat detection flags every large B2B order as fraud every 5 minutes**
- Area / page / workflow: Security cron
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Suspected (logging confirmed; downstream automatic action not verified)
- Evidence: `backend/src/security/threat-detection.service.ts:16, 141-162`; TX-05.
- Requires: Backend
- Boundary: Approval-required

---

# PART 3 — SYSTEMS INVENTORY

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

## PLT — Platform, admin, authentication, security, data model (46)

### PLT-01
**The 2FA "partial token" works as a full access token (two-step verification bypass)**
- Area / page / workflow: Sign-in with 2FA (`POST /auth/login` → `POST /auth/2fa/login-verify`)
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: When a 2FA user signs in with the right password, `loginStep1` returns a `partialToken`. It is a JWT signed with the same secret as normal access tokens and carries `sub`, `email`, `role` and `twoFactorPending: true` with a 5-minute expiry (`b/auth/auth.service.ts:536-550`). `JwtStrategy.validate` never checks `twoFactorPending`. A token without `sid` passes once it is past `tokensValidAfter` (`b/auth/jwt.strategy.ts:28-53`), and the token is read from a Bearer header (`:21`). `JwtAuthGuard` is plain `AuthGuard('jwt')` (`b/auth/jwt-auth.guard.ts`). The chat WebSocket also accepts any validly signed token (`b/chat/chat.gateway.ts:44-50`).
- Expected behavior: A partial token is accepted only by `/auth/2fa/login-verify`. It should be signed with a different secret or audience, or be rejected in `validate()`.
- Evidence: `b/auth/auth.service.ts:544-545`, `:561` (the only place that checks the flag), `b/auth/jwt.strategy.ts:28-53`.
- Impact: Anyone who has the password gets 5 minutes of full API access with the account's role, including OWNER/ADMIN. This defeats 2FA, and step-up checks become the only remaining barrier.
- Dependencies & risks: Every guarded controller. The fix must not break the existing login-verify flow.
- Recommended future task: Reject `payload.twoFactorPending` in `JwtStrategy.validate` and in the gateway. Prefer a separate signing secret or `aud: '2fa'` for partial tokens. Add a test.
- Requires: Backend
- Boundary: Safe-now

### PLT-02
**ADMIN or DEVELOPER can create an OWNER (or any role) through team invite**
- Area / page / workflow: `/admin/team` → `POST /admin/team/invite` (also proxied by `f/app/api/admin/team/route.ts:46`)
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: `inviteTeamMember` maps a few labels. For anything else it falls back to `data.role.toUpperCase()`, so `OWNER`, `ADMIN`, `DEVELOPER` or `SUPPLIER` are all accepted. It creates an ACTIVE, email-verified account with caller-supplied `permissions` and emails a temporary password (`b/admin/admin.service.ts:16-59`, role fallback `:34`). The route is open to `ADMIN, OWNER, DEVELOPER` (`b/admin/team.controller.ts:11,23-26`). The owner-only role endpoint explicitly forbids assigning OWNER (`b/owner/owner.controller.ts:58-69`); this path skips that check.
- Expected behavior: Only OWNER can create privileged staff, the role allow-list excludes OWNER, and invites use single-use tokens instead of emailed passwords.
- Evidence: `b/admin/admin.service.ts:27-45`; `b/admin/team.controller.ts:11`.
- Impact: Privilege escalation from any ADMIN/DEVELOPER (or a stolen session) to platform OWNER. It chains with PLT-03 and PLT-01.
- Dependencies & risks: `InviteToken` model exists but is unused (`backend/prisma/schema.prisma:1176`).
- Recommended future task: Allow-list `ADMIN|MODERATOR|SUPPORT|EDITOR|LOGISTICS`, restrict invites to OWNER (and possibly ADMIN for non-admin roles), switch to `InviteToken` links, and log to `AdminActionLog`.
- Requires: Backend
- Boundary: Safe-now (the role allow-list); invite-flow redesign is Approval-required

### PLT-03
**Committed seed credentials and forced re-activation of staff accounts on every deploy**
- Area / page / workflow: Deploy / boot (`start:prod` runs `prisma db seed`)
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed (code); whether production accounts still use the seeded passwords is Unverified
- Current behavior: `start:prod` runs the seed on every start (`backend/package.json:15`). `prisma/seed.ts` forces the founder account to `role: OWNER, status: ACTIVE, kycStatus: VERIFIED` (`backend/prisma/seed.ts:17-27`). It forces a third-party agency account to `DEVELOPER, ACTIVE` (`:72-81`). On first creation it uses a password literal committed in the repo (`:68`). For the owner it falls back to `OWNER_PASSWORD`, then the SMTP password `EMAIL_PASS`, then a committed literal (`:30`). Other tracked scripts also hold password literals: `backend/prisma/seed-founder.ts:27,32`, `backend/prisma/seed-tech-team.ts:19`, `backend/update_admin.ts:9`, `backend/fix-pass.ts:7-8`. Values are not reproduced here.
- Expected behavior: No credentials in git. Seeds do not run on every production boot and never un-block or re-privilege accounts.
- Evidence: as above.
- Impact: Blocking or demoting these accounts is silently undone on the next deploy. The DEVELOPER role can create an OWNER (PLT-02). Anyone with repo access knows the default passwords.
- Dependencies & risks: Removing the seed from `start:prod` changes first-boot behaviour.
- Recommended future task: Remove literals, rotate the affected passwords (the operator must do this), move seeding to a manual one-off command, and drop forced role/status updates.
- Requires: Backend, Policy
- Boundary: Approval-required (credential rotation and deploy-script change)

### PLT-04
**Public AI pricing chat leaks supplier base price and the Atlantis margin**
- Area / page / workflow: Product page AI pricing assistant (`f/components/product/PricingAssistant.tsx:64`, used by `f/app/products/[id]/ProductDetailClient.tsx`) → `POST /ai-agent/pricing-chat`
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: The endpoint is unauthenticated (`b/ai-agent/ai-agent.controller.ts:43-56`). For any `productId`, whatever its status, it loads `basePrice` and `price` plus the markup config. It builds a system prompt with the per-piece base, each markup multiplier and percentage, and step-by-step "base × pieces × markup = total" strings. It instructs the model to "ALWAYS show the step-by-step calculation" (`b/ai-agent/ai-agent.service.ts:563-655`). Rule 6, "never mention internal base prices", contradicts the prompt's own rules 1-2. Client-supplied `history` is passed through without role validation (`:668-672`). The response bypasses the price-privacy interceptor because the prices are free text. Anonymous visitors also get buyer tier prices, against the "prices for signed-in accounts" rule (`b/products/products.controller.ts:271-279`).
- Expected behavior: Suppliers never see buyer price or margin; nobody outside Atlantis sees the margin; anonymous visitors see no wholesale prices.
- Evidence: `b/ai-agent/ai-agent.service.ts:596-655`.
- Impact: Direct breach of the core pricing-privacy rule. Also unbounded OpenRouter usage on a public endpoint.
- Dependencies & risks: The prompt must give the model only buyer-facing totals.
- Recommended future task: Require auth, never put `basePrice` or markups in the prompt (pass computed buyer prices only), validate `history` roles, and only allow APPROVED products.
- Requires: Backend
- Boundary: Safe-now

### PLT-05
**Invoices: any signed-in user can list, read, generate and mark-paid any invoice**
- Area / page / workflow: `/invoices/*` (admin finance page calls `/invoices`, `/invoices/:id/pay` — `f/app/admin/finance/page.tsx`)
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: The controller has only `AuthGuard('jwt')`, with no roles or ownership checks (`b/invoices/invoice.controller.ts:5-33`). `GET /invoices` returns every invoice with customer name, email and company (`b/invoices/invoice.service.ts:125-133`). `GET /invoices/:id` returns any invoice with order items (`:156-164`). `POST /invoices/:id/pay` sets status PAID and reduces the customer's used credit (`:135-154`). `POST /invoices/generate/:orderId` works for any order (`:25`).
- Expected behavior: Staff-only list, generate and mark-paid. Buyers see only their own invoices (`/invoices/my` already exists).
- Evidence: as above.
- Impact: Cross-tenant data exposure (buyers' identities and amounts), possible supplier price exposure through order items, and buyers able to "pay" their own invoices and restore credit.
- Dependencies & risks: The finance UI relies on these routes.
- Recommended future task: Add `RolesGuard` with staff roles on list, generate and pay, and an ownership check on `:id`.
- Requires: Backend
- Boundary: Safe-now

### PLT-06
**Finance controller: most routes have no role restriction**
- Area / page / workflow: `/finance/*` (admin Finance & Billing pages)
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: The class uses `JwtAuthGuard, RolesGuard` but has no class-level `@Roles`. `RolesGuard` returns true when no roles are set (`b/auth/roles.guard.ts:14-16`). Only `export/statement` and `manual-invoice` carry `@Roles`. The open routes, available to any signed-in buyer or supplier, are listed below.
  - Read: `GET report`, `credit-terms`, `credit-terms/:userId`, `credit-check/:userId`, `tax-exemptions`, `warehouses`, `audit/order/:orderId`, `audit/user/:userId`, `audit/recent`, `reports/revenue`.
  - Write: `POST report/send`, `credit-terms` (set any user's credit limit), `DELETE credit-terms/:id`, `POST tax-exemptions`, `tax-exemptions/:id/review` (approve own exemption), and `POST/PUT/DELETE warehouses`.
  - All of these are at `b/finance/finance.controller.ts:45-170`.
- Expected behavior: Staff-only, with supplier-scoped exceptions (for example supplier earnings).
- Evidence: `b/finance/finance.controller.ts:15-16,45-170`; `b/auth/roles.guard.ts:14-16`.
- Impact: A buyer can grant themselves credit, approve their own tax exemption, read platform revenue and the financial audit trail, and edit or delete warehouses.
- Dependencies & risks: The "fail-open when no @Roles" design also affects other controllers (PLT-07, PLT-12).
- Recommended future task: Add class-level `@Roles(ADMIN, OWNER)` and widen per route only where needed. Consider making `RolesGuard` fail-closed under a `@Public`/`@AnyAuthenticated` opt-out.
- Requires: Backend
- Boundary: Safe-now

### PLT-07
**Discount tiers and customer groups: any signed-in user can create, delete or join**
- Area / page / workflow: `/admin/discounts` → `/discounts/*`
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: Only `AuthGuard('jwt')` is applied (`b/discounts/discounts.controller.ts:14-93`). Any user can create or delete `TieredPrice` rows on any product, create or delete groups with any `discountPercent`, and add themselves to a group. `GET discounts/calculate?customerId=` shows other customers' group discounts. The service is not used by order pricing (no references outside `b/discounts/`), so the current money impact is limited. `TieredPrice` is read by products (`b/products/products.service.ts`).
- Expected behavior: Staff-only management. Each customer sees only their own calculated price.
- Evidence: `b/discounts/discounts.controller.ts:15`.
- Impact: Data integrity, and future pricing abuse if these tables are wired into checkout.
- Recommended future task: Add roles, and decide whether this subsystem stays (see PLT-40).
- Requires: Backend
- Boundary: Safe-now

### PLT-08
**Notifications IDOR: buyers and suppliers can read anyone's notifications**
- Area / page / workflow: `GET /users/:id/notifications`, `POST /users/:id/notifications/:notifId/read`
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: Open to `ADMIN, SUPPLIER, CUSTOMER`, and uses `:id` from the URL without comparing it to `req.user.sub` (`b/users/users.controller.ts:253-263`). The service filters only by that id (`b/users/users.service.ts:258-271`). Mark-read updates any notification by id. Notifications carry order references, messages and links (for example `b/chat/chat.service.ts:242-255`).
- Expected behavior: Own notifications only. The correct `/notifications` controller already scopes to `req.user.sub` (`b/notifications/notifications.controller.ts:10-28`).
- Impact: Cross-tenant information leak, for example supplier↔buyer order activity.
- Recommended future task: Delete the legacy routes or enforce `id === req.user.sub`.
- Requires: Backend
- Boundary: Safe-now

### PLT-09
**Blocking, suspending, role changes and password resets do not end existing sessions**
- Area / page / workflow: User status (`/admin/users`), owner suspend/role (`/admin/owner`), password reset
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: The role is embedded in the JWT (`b/auth/auth.service.ts:427-441`) and trusted by `RolesGuard` and `PolicyGuard`. Access JWTs live 30 days (`b/auth/auth.module.ts:35-38`). `JwtStrategy` checks only session revocation and `tokensValidAfter`, never `status` or the current role (`b/auth/jwt.strategy.ts:28-53`). None of the following revoke sessions or set `tokensValidAfter`:
  - `users.service.updateStatus` / `bulkUpdateStatus` / `deleteUser` (`b/users/users.service.ts:163-242`)
  - `owner.service.changeRole` / `suspendMember` (`b/owner/owner.service.ts:174-213`)
  - `resetPassword` (it deletes refresh tokens only, `b/auth/auth.service.ts:786-789`)
  - Only "sign out other devices" sets `tokensValidAfter` (`:477-483`).
- Expected behavior: Blocking, demoting or resetting a password ends that user's sessions within seconds.
- Impact: A blocked or demoted staff member keeps their old powers for up to 30 days (7 days through the Vercel cookie). After a compromise, a password reset does not evict the attacker.
- Recommended future task: Add `revokeAllSessions(userId)` (revoke `UserSession` rows, set `tokensValidAfter`, clear caches) and call it from every status, role and password change. Optionally re-load role and status in `validate()` using the existing 20 s cache.
- Requires: Backend
- Boundary: Safe-now

### PLT-10
**Staff accounts are exempt from login lockout; login has no endpoint-specific throttle**
- Area / page / workflow: `POST /auth/login`
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: Lockout is skipped for OWNER, ADMIN, MODERATOR, SUPPORT, DEVELOPER, LOGISTICS and EDITOR (`b/auth/auth.service.ts:99-111`). `/auth/login` has no `@Throttle` (`b/auth/auth.controller.ts:22`), so only the global 100 requests per minute per IP applies (`b/app.module.ts:48-51`). The IP auto-block is never enforced (PLT-17).
- Expected behavior: Staff accounts get the strongest protection, for example a stricter throttle, CAPTCHA/backoff, and mandatory 2FA.
- Impact: The most valuable accounts are the easiest to brute-force.
- Recommended future task: Remove the exemption or replace it with exponential backoff, add `@Throttle` on login, and require 2FA for staff roles.
- Requires: Backend, Policy
- Boundary: Approval-required (operator decision noted in the code comment)

### PLT-11
**Emergency reset and seed-admin can take over any account given one shared secret**
- Area / page / workflow: `POST /auth/emergency-reset` (public UI at `f/app/auth/emergency-reset/`, proxied as public `f/app/api/proxy/[...path]/route.ts:33`), `POST /auth/seed-admin`
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: With `SEED_ADMIN_SECRET`, emergency-reset overwrites any user's password and forces ACTIVE, or creates a user with any role, including OWNER (`b/auth/auth.service.ts:657-720`). Details:
  - There is no minimum secret length. `seed-admin` requires 16+ characters (`b/auth/auth.controller.ts:301`); emergency-reset only requires it to be non-empty (`b/auth/auth.service.ts:664-670`).
  - The comparison is a plain `!==`.
  - There is no `@Throttle` (`b/auth/auth.controller.ts:132`).
  - The password policy is bypassed (8 characters, `:675`).
  - The target's sessions and 2FA are not touched.
  - `seed-admin` promotes any existing email to ADMIN/ACTIVE (`b/auth/auth.service.ts:59-66`, `b/auth/auth.controller.ts:305-310`).
  - No audit log is written.
- Expected behavior: Disabled by default in production, constant-time compare, strict throttle, audited, cannot create OWNER, revokes sessions.
- Impact: A leaked or weak secret means full platform takeover.
- Recommended future task: Gate with `EMERGENCY_RESET_ENABLED`, use `crypto.timingSafeEqual`, enforce a minimum length, throttle to 3/hour, write `AdminActionLog`, and revoke sessions.
- Requires: Backend, Policy
- Boundary: Approval-required

### PLT-12
**Shipment data exposed: public tracking returns order and customer email; any user can read any order's shipment**
- Area / page / workflow: `GET /shipments/track?number=`, `GET /shipments/order/:orderId`
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: `track` has no guard (`b/shipping/shipment.controller.ts:12-15`). It returns the shipment, updates, the whole `order` row (totals, supplierId, address fields) and the customer's name and email (`b/shipping/shipment.service.ts:38-51`). `order/:orderId` needs only a JWT, with no ownership check (`b/shipping/shipment.controller.ts:17-21`, service `:69-74`). Tracking ids for stub carriers are predictable (`DHL-<last 8 of orderId>`, `b/shipping/shipping.provider.ts:107,115`).
- Expected behavior: Public tracking returns only status and events. Order shipment is visible to the buyer, the order's suppliers and staff.
- Impact: PII and order-data leak; buyers can see supplier ids (product rule violation).
- Recommended future task: Use a select whitelist for public tracking and add a buyer/supplier/staff ownership check.
- Requires: Backend
- Boundary: Safe-now

### PLT-13
**2FA can be silently switched off by calling "setup" — no code required**
- Area / page / workflow: Security settings → `POST /auth/2fa/setup`
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: `generateTotpSetup` always writes a new secret and sets `twoFactorEnabled: false`, even when 2FA is already on (`b/auth/twofa.service.ts:17-32`). The endpoint needs only a JWT and has no step-up (`b/auth/auth.controller.ts:199-201`). By contrast, `disable` requires a valid code (`b/auth/twofa.service.ts:55-66`).
- Expected behavior: When 2FA is enabled, setup requires step-up and stores a pending secret without disabling the current one.
- Impact: Combined with PLT-01, a password alone is enough to remove 2FA permanently.
- Recommended future task: Refuse setup while enabled (or require a TOTP/backup code), and use a separate `twoFactorPendingSecret` field (additive).
- Requires: Backend, DB (additive)
- Boundary: Safe-now

### PLT-14
**Team permissions are stored but never enforced; team-KYC guard is never applied**
- Area / page / workflow: Owner Dashboard (`/admin/owner`: permission checkboxes, team KYC approve/reject)
- Category: Policy-only behavior
- Severity: High
- Status: Confirmed
- Current behavior: The owner sets `permissions` (`b/owner/owner.controller.ts:44-56`, `b/owner/owner.service.ts:142`). `PermissionsGuard` reads `user.permissions` (`b/auth/permissions.guard.ts:31-33`), but nothing uses `@RequirePermissions` or `PermissionsGuard`. `JwtStrategy` does not load permissions either (`b/auth/jwt.strategy.ts:52`). `TeamKycGuard` (`b/auth/team-kyc.guard.ts`) is unused, so staff KYC status gates nothing. Its hard-coded exempt email list is at `:14`.
- Expected behavior: Either enforce permissions and team KYC server-side, or remove the controls and say clearly that role is the only gate.
- Impact: The owner believes they are restricting staff, but nothing is restricted. Access is role-only, and role lists are broad (PLT-21).
- Recommended future task: Decide the model. If enforced, load permissions in `validate()` (cached), annotate admin routes, and apply `TeamKycGuard` globally for staff.
- Requires: Backend, Policy
- Boundary: Approval-required (owner dashboard behaviour; this audit documents it only)

### PLT-15
**Production deploy uses `prisma db push --accept-data-loss`**
- Area / page / workflow: Deployment (Railway `start:prod`; Render config also present)
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed
- Current behavior: `start:prod` = `prisma generate && prisma db push --accept-data-loss && prisma db seed && node dist/main` (`backend/package.json:15`). It runs on every boot (`backend/Procfile` runs `node dist/main`, but the Render/Railway start command is `npm run start:prod`, `render.yaml:14`). `render.yaml:13` also runs `prisma migrate deploy` against 28 committed migrations, mixing two schema-management strategies.
- Expected behavior: Per CLAUDE.md, schema changes are additive. With `--accept-data-loss`, a non-additive edit (renaming or retyping a column) silently drops production data at boot.
- Impact: One careless schema edit means irreversible data loss on deploy.
- Recommended future task: Remove `--accept-data-loss` (fail the deploy instead), pick one strategy (`db push` or migrations), and add a CI check for destructive diffs.
- Requires: Backend, Policy
- Boundary: Approval-required (deploy pipeline)

### PLT-16
**Hourly AI-agent job sends repeated, inaccurate notifications to buyers and suppliers**
- Area / page / workflow: Background job `AiAgentService.runScheduledScan` (`@Cron(EVERY_HOUR)`)
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed
- Current behavior: Every hour, for up to 20 orders still `PENDING` after 24 h, it notifies the buyer: "Your order … is still pending. Please complete payment or contact support." (`b/ai-agent/ai-agent.service.ts:110-142`). There is no de-duplication, so it repeats 24 times a day. Orders are requests awaiting supplier acceptance and Atlantis approval, not unpaid (CLAUDE.md; `b/orders/order-workflow.ts`). It also re-sends low-stock alerts to suppliers every hour (`:249-284`). Reports are kept only in memory (`:60-104`).
- Expected behavior: No buyer-facing messages that contradict the order workflow, plus de-duplication or rate limits.
- Impact: Notification spam, a wrong "complete payment" instruction, and erosion of trust.
- Recommended future task: Remove the buyer notification or align it with the workflow state, de-dupe by `(entity, type, day)`, and persist reports if needed.
- Requires: Backend
- Boundary: Safe-now

### PLT-17
**IP blocking, emergency lockdown and the "auto-healer" are display-only**
- Area / page / workflow: `/admin/security` (Security Reports)
- Category: Policy-only behavior
- Severity: High
- Status: Confirmed
- Current behavior:
  - Threat detection writes `BlockedIp` rows (`b/security/threat-detection.service.ts:47,76`), but `SecurityService.isIpBlocked` is never called (only the definition exists, `b/security/security.service.ts:41-55`).
  - "Emergency Lockdown" only stores `EMERGENCY_LOCKDOWN` (`b/security/threat-detection.service.ts:82-100`). Nothing reads it except the status endpoint (`b/security/security.controller.ts:24`).
  - The "Auto-Healer agent" is a timed state machine with no real checks: `detectAnomalies` returns immediately, and `forceScanAndFix` cycles ANALYZING → PATCHING → RESOLVED on timers (`b/security/auto-healer.service.ts:19-59`).
  - The vulnerability scanner probes `/admin/users`, which does not exist (`b/security/vulnerability-scanner.service.ts:37`).
  - The UI shows a "security score" and a lockdown button (`f/app/admin/security/page.tsx:97-200`).
- Expected behavior: Enforce the controls (a global guard or middleware for blocked IPs and lockdown) or present them honestly as logs.
- Impact: Operators believe they can block attackers or lock the platform, but they cannot. This violates the content/honesty rules.
- Dependencies & risks: Behind the Vercel proxy, `req.ip` is likely a Vercel egress IP (PLT-24). Enforcing IP blocks naively could block every user.
- Recommended future task: Use `x-client-ip` only from a trusted proxy (shared secret header), then enforce. Implement lockdown as a global guard that allows staff only. Remove or relabel the auto-healer.
- Requires: Backend, UI
- Boundary: Approval-required

### PLT-18
**Stripe webhook has no idempotency, although the model for it exists**
- Area / page / workflow: `POST /api/payments/webhook`
- Category: Incomplete integration
- Severity: Medium
- Status: Confirmed
- Current behavior: The signature is verified (`b/payments/stripe-webhook.controller.ts:31-40`), but no event-id de-duplication is done (no `event.id` / `processedWebhookEvent` use). `ProcessedWebhookEvent` (`backend/prisma/schema.prisma:861-871`) is unused.
- Expected behavior: Skip already-processed `event.id`s, as the schema comment describes.
- Impact: Stripe retries can re-run state transitions, notifications and emails.
- Recommended future task: Insert the `eventId` (unique) first and skip on conflict.
- Requires: Backend
- Boundary: Safe-now

### PLT-19
**Email click tracker is an open redirect**
- Area / page / workflow: `GET /email/track/click/:trackingId?u=`
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: It redirects to any `http(s)` URL in `u`, for any tracking id, including unknown ones, with throttling skipped (`b/email-tracking/email-tracking.controller.ts:50-63`).
- Expected behavior: Redirect only to the URL recorded for that tracking id, or to an allow-listed host, or sign the URL.
- Impact: Phishing links that appear to come from the Atlantis backend domain.
- Recommended future task: Look up `EmailEvent`/campaign link by id, or HMAC-sign `u`.
- Requires: Backend
- Boundary: Safe-now

### PLT-20
**NextAuth exposes the backend JWT to page JavaScript; hard-coded fallback secrets**
- Area / page / workflow: Google sign-in (`f/lib/auth-options.ts`), auth secrets
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: The `session` callback copies `backendToken` into the client-readable session (`f/lib/auth-options.ts:45-52`), readable through `/api/auth/session`. `/auth/socket-token` returns the httpOnly cookie token to JS (`b/auth/auth.controller.ts:186-192`). Fallback secrets are used when env vars are missing:
  - `NEXTAUTH_SECRET` → literal (`f/lib/auth-options.ts:58`)
  - `JWT_SECRET` → `'secretKey'` (`b/auth/auth.module.ts:36`, `b/auth/jwt.strategy.ts:24`)
  - `ENCRYPTION_KEY` → literals (`b/security/crypto.service.ts:12`, `b/security/encryption.service.ts:10`)
- Expected behavior: The access token stays server-side (the proxy can read it from the session). Boot fails when secrets are missing in production.
- Impact: Any XSS gives a 30-day API token. A misconfigured env means forgeable JWTs and decryptable IBANs.
- Recommended future task: Remove `backendToken` from the `session` callback (keep it in the JWT), assert required secrets at bootstrap when `NODE_ENV=production`, and issue a short-lived socket token.
- Requires: Backend, UI
- Boundary: Safe-now

### PLT-21
**Margin, currency and product approval editable by EDITOR/MODERATOR; staff role lists are broad and inconsistent**
- Area / page / workflow: `/admin/pricing`, `/admin/settings`, `/admin/config/*`
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior:
  - `AppConfigController` allows `OWNER, ADMIN, MODERATOR, EDITOR` on every route, including `POST markup` (the Atlantis margin), `POST currency`, and product approve/reject (`b/admin/app-config.controller.ts:18-131`).
  - `PolicyGuard` lets ADMIN, OWNER, MODERATOR, SUPPORT and LOGISTICS bypass ownership on order and product writes (`b/auth/policy.guard.ts:27-30`).
  - MODERATOR can set any status (including BLOCKED) on any user, staff included, with no protection for OWNER or ADMIN targets (`b/users/users.controller.ts:199-203`, `b/users/users.service.ts:163-181`).
  - ADMIN can hard-delete any user, including OWNER (`b/users/users.controller.ts:239-244`).
- Expected behavior: Margin and currency are OWNER/ADMIN only. Moderators cannot act on staff.
- Impact: Lower-trust roles can change platform economics or lock out admins.
- Recommended future task: Define a role matrix (Part 2f) and apply it consistently. Protect staff targets in `updateStatus`/`deleteUser`.
- Requires: Backend, Policy
- Boundary: Approval-required (role policy)

### PLT-22
**Audit trail records only `ADMIN` actions and redacts only `password`**
- Area / page / workflow: Global `AuditInterceptor` → `AdminActionLog` (`/admin/owner` audit log)
- Category: Data-model limitation
- Severity: Medium
- Status: Confirmed
- Current behavior: Logs mutating requests only when `user.role === 'ADMIN'` (`b/common/interceptors/audit.interceptor.ts:15-28`). OWNER, MODERATOR, SUPPORT, EDITOR, DEVELOPER and LOGISTICS actions are not logged. Only `password` is removed from the body (`:53-57`), so `newPassword`, `currentPassword` and `secret` would be stored if an ADMIN calls those routes.
- Expected behavior: All staff mutations are logged, with secrets redacted.
- Impact: Incomplete accountability (for example, a moderator blocking users leaves no trace).
- Recommended future task: Log every staff role and redact a key list (`/pass|secret|token|code|iban|swift/i`).
- Requires: Backend
- Boundary: Safe-now

### PLT-23
**Legacy `/uploads` served publicly; product image upload accepts any `image/*` including SVG**
- Area / page / workflow: Static files and uploads
- Category: Security or permissions gap
- Severity: Medium
- Status: Suspected (whether a production `uploads/` folder with KYC files exists is Unverified)
- Current behavior: If `./uploads` exists, it is served without auth at `/uploads` (`b/main.ts:49-54`). The comment says legacy KYC files may be there. `POST /products/upload-image` accepts any `image/*` mimetype (client-declared) up to 15 MB, which allows SVG with script, into a public Supabase bucket (`b/products/products.controller.ts:414-440`). The upload is allowed for EDITOR and MODERATOR too (`:416`). Avatar and KYC uploads are properly allow-listed (`b/users/users.controller.ts:139`, `b/kyc/kyc.controller.ts:24-30`).
- Expected behavior: No public serving of identity documents. Image uploads allow-list png/jpeg/webp and sniff content.
- Impact: Possible exposure of legacy KYC documents; stored-XSS-capable files on the storage domain.
- Recommended future task: Remove static serving (or require staff auth), migrate legacy files, and allow-list mimetypes with magic-byte checks.
- Requires: Backend
- Boundary: Safe-now (upload allow-list); legacy file migration is Approval-required

### PLT-24
**Rate limits key on the Vercel proxy IP, not the real client**
- Area / page / workflow: Global `ThrottlerGuard`, all `@Throttle` limits
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Suspected
- Current behavior: Browser traffic goes through Next routes (`f/app/api/proxy/[...path]/route.ts`, `f/app/api/auth/login/route.ts`), so Railway sees Vercel's server as the client. The backend sets `trust proxy 1` (`b/main.ts:37`) and the throttler keys on `req.ip`. The real IP is forwarded only as `x-client-ip` (`f/lib/client-headers.ts:2-9`), which is used just for session labels (`b/auth/request-context.ts:8-13`). Limits such as register 5/min (`b/auth/auth.controller.ts:57`) and 2FA verify 10/min are therefore shared by everyone behind the same Vercel egress, while a direct caller gets a private bucket.
- Expected behavior: Per-client limits, using a trusted forwarded IP authenticated with a shared proxy secret.
- Impact: Legitimate users get 429s at busy moments; attackers bypass the proxy.
- Recommended future task: Add a proxy→backend HMAC header and a custom `ThrottlerGuard.getTracker` that uses `x-client-ip` only when the header verifies.
- Requires: Backend, Integration
- Boundary: Safe-now

### PLT-25
**Refresh tokens are never used through the proxy; session lifetimes are inconsistent**
- Area / page / workflow: Session lifecycle
- Category: Incomplete integration
- Severity: Medium
- Status: Confirmed
- Current behavior: The Next login route sets `token` and `refreshToken` cookies for 7 days (`f/app/api/auth/login/route.ts:103-124`). No frontend code calls `/auth/refresh` (search finds only the proxy allow-list), and the proxy forwards only `token` (`f/app/api/proxy/[...path]/route.ts:80-83`). The backend issues a 30-day JWT (`b/auth/auth.module.ts:37`), sets its own cookies to 30/90 days (`b/auth/auth.controller.ts:50-51`), and stores refresh tokens for 7 days (`b/auth/auth.service.ts:39`). The cookie policy page says the refresh token lasts 7 days (`f/app/cookie-policy/CookieClient.tsx:14`).
- Expected behavior: One clear session policy, for example a 15–60 min access token with working refresh rotation via the proxy.
- Impact: The long-lived access token is the only credential (raises the impact of PLT-09 and PLT-20); refresh-token rotation is dead code.
- Recommended future task: Implement refresh in the proxy on 401 and shorten the access JWT.
- Requires: Backend, UI
- Boundary: Approval-required (session length was an operator choice, see `b/auth/auth.module.ts:21-34`)

### PLT-26
**Google sign-in: ACTIVE without approval, and the middleware blocks Google users from protected pages**
- Area / page / workflow: Google OAuth (`f/components/auth/GoogleButton.tsx:27` → `/auth/google-sync`)
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed (approval bypass) / Suspected (redirect loop)
- Current behavior: New Google users are created `CUSTOMER` + `ACTIVE` (`b/auth/auth.service.ts:600-612`), while email sign-ups are `PENDING_APPROVAL` (`:242-243`). Wholesale prices are therefore visible to any Google account. The Next middleware only checks the `token` cookie (`f/middleware.ts:15-24`). Google sessions hold `next-auth.session-token` plus `backendToken`, and no `token` cookie is set (cookies are set only in `f/app/api/auth/login/route.ts:119` and `.../2fa/login-verify/route.ts:51`). Protected paths (`/dashboard`, `/checkout`, `/supplier`…) would therefore redirect Google users to login.
- Expected behavior: The same approval policy for every sign-up path, and middleware that recognises both sessions.
- Recommended future task: Product decision on Google approval; set a `token` cookie in google-sync (server route) or check the NextAuth cookie in middleware.
- Requires: Backend, UI, Policy
- Boundary: Approval-required

### PLT-27
**Admin pages call backend endpoints that don't exist**
- Area / page / workflow: Several `/admin/*` pages
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior and evidence (no matching backend route in the Part 2b list):
  - `GET /admin/users` — `f/app/admin/finance/page.tsx:81`, `discounts/page.tsx:73`, `offers/new/page.tsx:30`. The backend route is `/users`.
  - `GET /admin/products?supplierId=` — `f/app/admin/offers/new/page.tsx:42`
  - `GET /admin/buyers` — `f/app/admin/newsletter/campaign/page.tsx:292`
  - `POST /admin/roles` — `f/app/admin/settings/page.tsx:203`
  - `GET /kyc/pending` — `f/app/admin/support/page.tsx:143`. The backend route is `/kyc/admin/pending`.
  - `GET /api/shipments/admin/all` (axios, bypassing the proxy) — `f/app/admin/logistics/page.tsx:18`. No such Next route exists.
- Impact: User pickers in Finance, Discounts and Offers are empty, the newsletter "buyers" audience fails, the role editor in Settings does nothing, the support KYC tile is empty, and Logistics is empty.
- Recommended future task: Point the calls at existing routes (`/users?role=…`, `/kyc/admin/pending`, `/api/proxy/shipments/admin/all`) or remove the dead controls.
- Requires: UI
- Boundary: Safe-now

### PLT-28
**Admin "Tech" and home pages show fabricated metrics**
- Area / page / workflow: `/admin/tech`, `/admin` (home)
- Category: Policy-only behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: `/admin/tech` renders hard-coded response times, error rates, deployments, security alerts (fake IPs and logins) and errors (`f/app/admin/tech/page.tsx:21-60`, used at `:167,249`). The admin home sparkline uses `Math.random()` (`f/app/admin/page.tsx:81`). Security "score" is simply 100 − 5×critical logs (`b/security/security.controller.ts:32-36`).
- Expected behavior: Real data or a clearly labelled empty state (DESIGN_SYSTEM honesty rules).
- Recommended future task: Wire to `/health/*` and `SecurityLog`, or remove.
- Requires: UI
- Boundary: Safe-now

### PLT-29
**Fabricated carrier quotes (DB Schenker, LKW Walter, Raben) at checkout**
- Area / page / workflow: Checkout → `POST /shipping/agent-rates`, `GET /shipping/rates`
- Category: Policy-only behavior
- Severity: High
- Status: Confirmed
- Current behavior: Public endpoints (`b/shipping/shipping.controller.ts:33-63`) return three named carriers. Prices come from formulas (`45 + kg×1.8`…), weight is estimated from product price (`price × 0.005 kg`), and the delivery-day ranges are hard-coded (`b/shipping/shipping.service.ts:64-74,170-208`). The carrier providers are stubs (`b/shipping/shipping.provider.ts:39-116`). Checkout shows them and submits `shippingCompany` (`f/app/checkout/page.tsx:81-114,400-437,230`).
- Expected behavior: Per CLAUDE.md, delivery charges come only from `backend/src/fulfillment`, and missing rates mean "quoted after the order". No partners or delivery dates are claimed.
- Impact: The site implies partnerships and delivery times that don't exist, and the shown price differs from the real calculation.
- Recommended future task: Remove the agent-rates UI and endpoints, or route checkout to the fulfillment preview. (Likely overlaps with the transactions audit.)
- Requires: Backend, UI
- Boundary: Safe-now

### PLT-30
**Public LLM endpoints with in-memory cache: cost and memory abuse**
- Area / page / workflow: `POST /i18n/translate` (public), `POST /products/ean-lookup` and `GET /products/ean/:ean` (public), `POST /ai-agent/pricing-chat` (public)
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: Translate accepts 400 strings × 1,000 characters per call at 60 calls/min/IP (`b/i18n/i18n.controller.ts:17-28`). It caches every (locale, text) pair in an unbounded `Map` (`b/i18n/i18n.service.ts:24,57-58`) and calls OpenRouter for misses (`:89-124`). The EAN lookup is public and triggers external fetches plus OpenRouter (`b/products/products.controller.ts:225-269`). All LLM calls use `google/gemini-2.0-flash-exp:free` (for example `b/ai-agent/ai-agent.service.ts:299`).
- Impact: Memory growth on the API process, OpenRouter quota exhaustion (translations then silently fall back to English), and a free proxy for third-party lookups.
- Recommended future task: Use an LRU cache with a size cap, restrict targetLocale to the 7 supported locales, require auth (or a tighter throttle) for EAN, and use a configurable model id.
- Requires: Backend, Integration
- Boundary: Safe-now

### PLT-31
**Error responses leak internal messages**
- Area / page / workflow: Global `SecurityExceptionFilter`, `/health/database`, `/health/payments`
- Category: Security or permissions gap
- Severity: Low
- Status: Confirmed
- Current behavior: For non-HTTP exceptions the filter returns `exception.message` to the client (`b/security/security.exception-filter.ts:78-80`), which includes Prisma and driver errors. Examples: `seed-admin` wraps its error (`b/auth/auth.controller.ts:325`), and the public health endpoints return `err.message` (`b/health/health.controller.ts:34-39,57-63`).
- Recommended future task: Return a generic 500 message in production and log the detail.
- Requires: Backend
- Boundary: Safe-now

### PLT-32
**Security interceptor stores full request bodies (including passwords) when a pattern matches**
- Area / page / workflow: Global `SecurityInterceptor`
- Category: Security or permissions gap
- Severity: Low
- Status: Confirmed
- Current behavior: On an "injection" regex hit it logs `payload: body` to `SecurityLog` (`b/security/security.interceptor.ts:50-63`), which can include login or register passwords. It also strips `<…>` from every string field except a short skip list (`:86-108`), passwords included. Login and register do this consistently, so it does not break them, but it alters user content silently.
- Recommended future task: Redact sensitive keys before logging, and move to output encoding instead of input mutation.
- Requires: Backend
- Boundary: Safe-now

### PLT-33
**Route shadowing: `DELETE /users/me` and `GET /users/repair-data-secure-2026` are unreachable**
- Area / page / workflow: GDPR self-delete; data-repair tool
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: `@Delete(':id')` (OWNER/ADMIN, `b/users/users.controller.ts:239`) is registered before `@Delete('me')` (`:279`), so a buyer's `DELETE /users/me` hits the admin route and gets 403. `@Get(':id')` (`:246`) shadows `repair-data-secure-2026` (`:285`). No frontend calls `DELETE /users/me` or `GET /users/me/data-export`, so the GDPR export and delete exist in the backend without any UI.
- Expected behavior: Self-service export and delete reachable from account settings, or removed if not offered.
- Recommended future task: Move the `me` routes above the `:id` routes and add UI in settings. Remove the repair endpoint.
- Requires: Backend, UI
- Boundary: Safe-now

### PLT-34
**Newsletter: bulk import bypasses double opt-in; anyone can unsubscribe any address**
- Area / page / workflow: `/admin/newsletter` bulk upload; `POST /newsletter/unsubscribe`
- Category: Policy-only behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: Admin CSV import creates subscribers `ACTIVE` with `consentSource: 'admin import'` (`b/newsletter/newsletter.service.ts:285-293`), while self sign-up requires double opt-in (`:25-77`). Unsubscribe accepts a bare email with no token (`:85-101`), and the default `List-Unsubscribe` URL uses `?email=` (`b/email/email.service.ts:103,171`).
- Expected behavior: Imported contacts get a confirmation email or are stored with documented consent proof. Unsubscribe by email should send a confirmation link (or accept the consequence knowingly).
- Recommended future task: Mark imports as `PENDING` and send a confirmation email; use token links in all mail.
- Requires: Backend, Policy
- Boundary: Approval-required (marketing/compliance policy)

### PLT-35
**Team invite emails a plaintext temporary password; send-invite trusts a caller-supplied link**
- Area / page / workflow: `/admin/invite`, `/admin/team`
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: Generates a 16-hex temporary password and emails it (`b/admin/admin.service.ts:22-24,50`). The account is ACTIVE immediately and there is no forced change on first login. `send-invite` emails any `inviteLink` provided in the body (`b/admin/team.controller.ts:39-57`).
- Recommended future task: Single-use `InviteToken` set-password links (the model exists, unused), and server-generated links only.
- Requires: Backend
- Boundary: Safe-now

### PLT-36
**TOTP secrets stored in plaintext**
- Area / page / workflow: 2FA
- Category: Data-model limitation
- Severity: Low
- Status: Confirmed
- Current behavior: `twoFactorSecret` is written raw (`b/auth/twofa.service.ts:26-29`), while `.env.example` says `ENCRYPTION_KEY` is used for "IBAN, Swift, 2FA secrets" (`backend/.env.example`). Only IBAN, Swift, taxId and VAT go through `CryptoService` (`b/users/users.service.ts:35-38`).
- Recommended future task: Encrypt with `CryptoService` (migrate on read).
- Requires: Backend
- Boundary: Safe-now

### PLT-37
**Duplicate and dead security/admin code**
- Area / page / workflow: Codebase hygiene
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior:
  - `b/admin/security.controller.ts` and `b/admin/security.service.ts` declare a second `admin/security` controller. It is imported but not registered (`b/admin/admin.module.ts:14-15,23`); the live one is `b/security/security.controller.ts`.
  - `admin/security.service.ts:49-54` simulates fixes with nested `setTimeout`s.
  - `GET /products/dev/fixup` mutates data through a GET request (`b/products/products.controller.ts:880-885`).
  - Role enum values `PAIR` and `SUBLAYER` are unused (`backend/prisma/schema.prisma:13-26`).
- Recommended future task: Delete the dead files, and make the fixup a POST or remove it.
- Requires: Backend
- Boundary: Safe-now

### PLT-38
**Admin sidebar shows everything to every staff role; DEVELOPER filter matches nothing**
- Area / page / workflow: `f/app/admin/layout.tsx`
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: Every staff role sees every link, even where the backend returns 403 (for example SUPPORT on Finance, EDITOR on `/dashboard/admin`, which excludes EDITOR: `b/admin/dashboard.controller.ts:13-21`). The DEVELOPER filter looks for group titles `Dashboard`, `Support` and `System` (`f/app/admin/layout.tsx:366-371`), but the real titles are `Control Panel`, `GROWTH & CAMPAIGNS`, `SUPPORT & KYC`, `ADMINISTRATION` and `REPORTS & SYSTEM` (`:85,102,123,134,144`), so developers get an empty sidebar. `/admin` access control is client-side only (`:347-361`); the backend is the real gate. A second, legacy admin UI exists at `/dashboard/admin` (`f/app/dashboard/admin/page.tsx`), with no role check.
- Recommended future task: Use one role→nav matrix shared with backend role lists, and retire `/dashboard/admin`.
- Requires: UI
- Boundary: Safe-now

### PLT-39
**CORS allow-list is hard-coded; step-up headers are not allowed cross-origin**
- Area / page / workflow: `b/main.ts` CORS and helmet
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: Allowed origins are `FRONTEND_URL`, a hard-coded `marketpl7ce.vercel.app` and localhost (`b/main.ts:70-88`). `ALLOWED_ORIGINS` in `.env.example` is unused. `allowedHeaders` omits `x-2fa-code` and `x-email-code` (`:91-100`), so direct cross-origin step-up calls would fail. Today these go through the same-origin proxy, which forwards them (`f/app/api/proxy/[...path]/route.ts:87`). The CSP `connectSrc` hard-codes one Railway host (`b/main.ts:115-122`). The socket gateway allows only `FRONTEND_URL` (`b/chat/chat.gateway.ts:15-20`). The JSON body limit is 50 MB globally (`b/main.ts:64-65`).
- Recommended future task: Read origins from `ALLOWED_ORIGINS`, add the step-up headers, and lower the default body limit (raise it per route).
- Requires: Backend
- Boundary: Safe-now

### PLT-40
**Parallel legacy finance subsystems with no product owner (escrow, credit terms, tax exemptions, warehouses, discounts)**
- Area / page / workflow: Data model / finance
- Category: Data-model limitation
- Severity: Medium
- Status: Confirmed
- Current behavior:
  - `EscrowTransaction` plus `Order.escrowStatus/escrowHeldAt/escrowReleasedAt` (`backend/prisma/schema.prisma:933-956`, Order block `:324-406`) are written by the webhook and escrow service. The Stripe gateway uses manual capture "for escrow" (`b/payments/stripe.gateway.ts:20-30`), while CLAUDE.md forbids claiming escrow or held funds.
  - `CreditTerm`, `TaxExemption` and `Warehouse` are reachable only through the unguarded finance routes (PLT-06).
  - `CustomerPriceGroup` and `TieredPrice` are managed through the unguarded discounts routes (PLT-07).
  - The `Warehouse` model is separate from `AtlantisHub` (the fulfillment hubs).
- Expected behavior: One source of truth per concept, and no escrow semantics unless the business provides escrow.
- Recommended future task: Product decision per subsystem (keep, or hide plus deprecate). Mark the Order escrow fields as deprecated, and keep schema changes additive.
- Requires: DB, Policy
- Boundary: Approval-required

### PLT-41
**`OrdersController.findMyOrders` and `findOne` ignore staff roles outside a fixed list**
- Area / page / workflow: `GET /orders/my-orders`, `GET /orders/:id`
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: `my-orders` returns `undefined` (empty 200) for staff roles (`b/orders/orders.controller.ts:162-177`). `GET /orders/:id` throws 403 for SUPPLIER, DEVELOPER and EDITOR (`:201-212`), so suppliers have no single-order read here and must use other routes. Pagination params from the admin UI (`/orders?page=1&limit=30`, `f/app/admin/support/page.tsx`) are ignored: `findAll()` returns all orders (`b/orders/orders.controller.ts:194-199`).
- Recommended future task: Paginate the admin list and decide the supplier single-order read path. (Overlaps with the transactions audit.)
- Requires: Backend
- Boundary: Safe-now

### PLT-42
**WebSocket gateway skips session revocation; its mark-read event does nothing**
- Area / page / workflow: `/chat` namespace
- Category: Security or permissions gap
- Severity: Low
- Status: Confirmed
- Current behavior: Only `jwtService.verify` is used, with no `sid` or revocation check and no `twoFactorPending` check (`b/chat/chat.gateway.ts:33-64`). `mark_read` calls `markAsRead(data.ids)` without a user id (`:123-129`). The service therefore filters on `receiverId: '__none__'` (`b/chat/chat.service.ts:191-196`), so the socket event never marks anything read; only the HTTP `PATCH /chat/read` works. OWNER is not added to `support-room` (`b/chat/chat.gateway.ts:56-60`).
- Recommended future task: Reuse `JwtStrategy.validate`, pass the user id to `markAsRead`, and add OWNER to the room.
- Requires: Backend
- Boundary: Safe-now

### PLT-43
**Product rating endpoint allows unlimited anonymous-style ratings**
- Area / page / workflow: `POST /products/:id/rate`
- Category: Security or permissions gap
- Severity: Low
- Status: Confirmed
- Current behavior: Any signed-in user, a supplier included, can post a 1–5 rating any number of times, with no purchase check and no user binding (`b/products/products.controller.ts:871-878`). A separate verified-review flow exists (`b/products/reviews.controller.ts:18-41`).
- Recommended future task: Remove it, or bind it to `Review` (one per buyer per product).
- Requires: Backend
- Boundary: Safe-now

### PLT-44
**CI deploys the Next app to GitHub Pages; no tests or type checks in CI**
- Area / page / workflow: `.github/workflows/deploy.yml`, `.github/workflows/nextjs.yml`
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: Both workflows build the frontend and upload `frontend/out` / `./out` to GitHub Pages on every push to `main`. The app uses API routes, middleware and NextAuth, and `next.config.mjs` has no `output: 'export'`, so the static artifact cannot work (or the build fails). The nextjs.yml workflow even runs from the repo root. Neither workflow runs `tsc`, `jest` or `check:i18n`, which CLAUDE.md requires before finishing. The real hosting is Vercel (`frontend/vercel.json`) and Railway (`render.yaml` is a Render template with placeholder values, `render.yaml:33`).
- Recommended future task: Replace with a CI workflow running `tsc --noEmit`, `npm run build` (frontend) and `tsc` plus `jest` (backend). Delete the Pages workflows.
- Requires: Integration
- Boundary: Approval-required (repo CI)

### PLT-45
**Vercel "keep-warm" cron runs once a day**
- Area / page / workflow: `frontend/vercel.json`
- Category: Incomplete integration
- Severity: Low
- Status: Confirmed
- Current behavior: Schedule `0 0 * * *`, once daily, cannot keep Railway warm, yet the login proxy retries for cold starts (`f/app/api/auth/login/route.ts:36-50`). `CRON_SECRET` is referenced in the route.
- Recommended future task: Use Railway always-on, or a more frequent external pinger.
- Requires: Integration
- Boundary: Approval-required (hosting plan)

### PLT-46
**Supabase misconfiguration likely crashes boot; startup bucket creation runs twice**
- Area / page / workflow: Storage
- Category: Incomplete integration
- Severity: Low
- Status: Suspected
- Current behavior: With `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` missing, the service only warns, then calls `createClient(url ?? '', key ?? '')` in the constructor (`b/storage/supabase-storage.service.ts:24-31`). supabase-js normally throws on an empty URL, which would stop Nest from bootstrapping. Buckets are ensured both in `onModuleInit` (`:33-39`) and in `main.ts:143-149`.
- Recommended future task: Lazy client creation and a clear "storage disabled" mode.
- Requires: Backend
- Boundary: Safe-now

---

## BUY — Buyer experience (31)

### BUY-01
**Public product APIs expose supplier identity, including supplier email**
- Area / page / workflow: catalog listing, search suggestions, sponsored placements (`/categories`, navbar search, `/sponsored-highlights`, home)
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed (static analysis)
- Current behavior: `GET /products` adds `supplier: { id, name, email, companyName, role }` to every product (`backend/src/products/products.service.ts:506`, used at :533 and :539). The controller returns those rows unchanged to signed-in users, and to anonymous users after `stripPriceList` only (`backend/src/products/products.controller.ts:105-123`). `stripPrices` removes price fields only (`backend/src/products/price-visibility.ts:6-14`). `GET /products/search` adds `supplier { id, name, companyName }` (`products.service.ts:1639-1645`) and is public (`products.controller.ts:125-131`). `GET /ads?placement=` adds `supplier { name, companyName, id }` (`backend/src/ads/ads.service.ts:21-24`) and is public (`ads.controller.ts:15-21`). `ProductDto` also exposes `supplierId` on purpose (`backend/src/common/dtos/base.dto.ts:121-129`). The global `PricePrivacyInterceptor` removes prices only (`backend/src/common/price-privacy.ts:33-49`). The Next proxy forwards anonymous GETs to `products*` and `ads*` (`frontend/src/app/api/proxy/[...path]/route.ts:70-73`).
- Expected behavior: per CLAUDE.md, buyers never see supplier ids, and nobody should receive supplier email addresses. Public and buyer product payloads should carry no supplier relation, or at most an anonymised label (as `offer-compare.service.ts:58-67` already does).
- Evidence: see above. The frontend never displays these fields (grep of `supplier?.companyName|supplier?.email` in buyer code finds nothing), so this is a pure API leak.
- Impact: anyone can list supplier names and emails from the public catalog and go around Atlantis. This breaks the principal model and the margin privacy.
- Dependencies & risks: the PDP uses `supplierId` to detect a supplier viewing its own listing (`ProductDetailClient.tsx:112-120`). Replace that with a server-computed `isOwnListing` flag before removing the id.
- Recommended future task: strip `supplier` and `supplierId` from product, search, ads and recommendation responses for non-staff and non-owners (a shared serializer or an extension of `applyPricePrivacy`). Add a server `isOwn` boolean. Add an e2e test that asserts no `email` key appears in anonymous `/products`.
- Requires: Backend
- Boundary: Approval-required

### BUY-02
**`/dashboard/kyc` is a simulated identity check (random pass/fail); the real KYC API has no UI**
- Area / page / workflow: KYC / onboarding (`/dashboard/kyc`, linked from the supplier layout, the supplier payout and payment-methods pages, and the admin layout; any signed-in buyer can open it)
- Category: Broken or inconsistent behavior (fake data presented as real)
- Severity: Critical
- Status: Confirmed
- Current behavior: `handleSubmit` waits 4 s and then calls `Math.random() > 0.2` to decide SUCCESS or FAILURE (`frontend/src/app/dashboard/kyc/page.tsx:186-196`). The page then says "Our AI system is cross-referencing your documents with your biometric data" (:210). The file makes no network call at all (0 matches for `apiFetch|fetch(|axios`). It opens the camera for a "face" step (:172-180). Backend `POST /kyc/submit` and `POST /kyc/upload` exist (`backend/src/kyc/kyc.controller.ts:41,60`) but nothing in the frontend calls them. Only `/kyc/status` is read (`app/supplier/payment-methods/page.tsx:50`).
- Expected behavior: upload documents to `/kyc/upload` and `/kyc/submit`, show the real `/kyc/status` (PENDING, VERIFIED or REJECTED), and make no biometric or AI claims.
- Evidence: as above. `app/supplier/layout.tsx:274` and `app/supplier/settings/payout/page.tsx:320` link to it.
- Impact: users believe they are verified when nothing was submitted. The page captures camera images it never uses, which raises privacy and trust exposure.
- Dependencies & risks: KYC document storage and signed URLs already exist for admin (`/kyc/admin/signed-url`).
- Recommended future task: rebuild `/dashboard/kyc` on the real KYC endpoints. Until then, replace it with an honest "Submit documents" form or a "contact us" state.
- Requires: UI, Integration
- Boundary: Approval-required (removing the fake success path itself is safe UI)

### BUY-03
**Per-order tracking page is entirely hardcoded**
- Area / page / workflow: `/dashboard/customer/orders/[id]/track`
- Category: Broken or inconsistent behavior (fake data)
- Severity: High
- Status: Confirmed
- Current behavior: static steps and a static timeline: "Arrived at Cairo Distribution Hub", "Picked up by Atlantic Logistics from Alexandria Port", "Delivery ETA", "Download Commercial Invoice". The order id defaults to `'ORD-88294-XP'` (`app/dashboard/customer/orders/[id]/track/page.tsx:17,29,37,185,222,248`). It makes no API calls (0 fetches). Nothing links to it, but the URL works for any order id.
- Expected behavior: show real `Shipment` and `ShipmentUpdate` data, or "Tracking will appear once shipped" (`docs/buyer-journey-design.md:44`).
- Evidence: as above.
- Impact: invents carriers, hubs and an ETA. This is a direct breach of the content and honesty rules (never claim partners, warehouses or delivery dates).
- Recommended future task: delete the page or redirect it to `/dashboard/customer/orders/[id]`, which already renders real tracking.
- Requires: UI
- Boundary: Safe-to-implement-now (redirect/delete)

### BUY-04
**`/dashboard/track` is broken, and the backend tracking endpoint leaks buyer data without auth**
- Area / page / workflow: public tracking lookup; linked as "Track orders" on How it works (`app/how-it-works/HowItWorksClient.tsx:20`)
- Category: Broken or inconsistent behavior + Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: the page calls `axios.get('/api/shipments/track?number=…')` (`app/dashboard/track/page.tsx:24`). No Next route exists at `app/api/shipments` (the route list has no `shipments`), so every lookup returns "Delivery not found". The backend `GET /shipments/track` has **no guard** (`backend/src/shipping/shipment.controller.ts:12-15`) and returns the shipment with `order` and `customer { name, email }` (`backend/src/shipping/shipment.service.ts:38-53`). Separately, `GET /shipments/order/:orderId` only requires a JWT and does no ownership check (`shipment.controller.ts:17-21`, `shipment.service.ts:69-74`).
- Expected behavior: tracking appears inside the buyer's own order. A public lookup should not return PII or the order.
- Impact: dead feature in a marketed flow. Anyone holding a tracking number gets the customer's name, email and order contents. There is also an IDOR on shipments by order id.
- Recommended future task: (a) point the How it works CTA to `/dashboard/customer/orders` and remove or redirect `/dashboard/track`; (b) guard `/shipments/track` (owner or staff) and limit its select; (c) add an ownership check to `/shipments/order/:orderId`.
- Requires: UI (a), Backend (b, c)
- Boundary: (a) Safe-to-implement-now; (b, c) Approval-required

### BUY-05
**Checkout "Preferred logistics partner" shows three hardcoded carriers with invented costs and ETAs**
- Area / page / workflow: `/checkout` step 1
- Category: Policy-only behavior / fake data presented as real
- Severity: High
- Status: Confirmed
- Current behavior: checkout calls the public `POST /shipping/agent-rates` (`app/checkout/page.tsx:89-99`; controller `backend/src/shipping/shipping.controller.ts:50-63`, no guard). That endpoint always returns "DB SCHENKER", "LKW WALTER" and "Raben Group" with a `cost` and `estimatedDays` computed from a weight guess. The guess is `price × 0.005` (`backend/src/shipping/shipping.service.ts:56-78,174-207`). The UI lists them under "Preferred logistics partner" (`checkout/page.tsx:392-445`), and the chosen name is saved on the order as `shippingCompany` (`checkout/page.tsx:~232`). When no country is chosen yet, the first fetch defaults to Romania (`:95,:106,:118-120`).
- Expected behavior: no named carriers unless Atlantis has real agreements (CLAUDE.md: "never claim … partners"). Delivery comes only from the server fulfillment quote (`quote.fulfillment`).
- Impact: implies partnerships that may not exist. Buyers record a "preferred carrier" with no operational meaning. The API returns made-up prices to anyone.
- Recommended future task: remove the carrier picker from checkout. Retire `/shipping/agent-rates` and `/shipping/rates`, or restrict them to staff.
- Requires: UI, Backend, Policy decision
- Boundary: hiding the picker is Safe-to-implement-now (UI only, `shippingCompany` is optional); endpoint retirement is Approval-required

### BUY-06
**Delivery and total figures disagree between cart, checkout review and checkout sidebar**
- Area / page / workflow: cart, then checkout review, then order detail
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed
- Current behavior:
  - The cart never sends a destination (`quoteCart(items)`, `app/cart/page.tsx:199`). It always says "Delivery: Quoted after you order" (:463).
  - The checkout quote includes the destination. When a rate is configured, the review step shows "Delivery €X" and "Order total = grandTotal + freight" (`app/checkout/page.tsx:575-590`).
  - On the same screen, the sidebar shows "Logistics Allocation: TBD" and a "Grand Total" **without** freight (`:669-681`), and "Charged in EUR: formatEUR(grandTotal)" (:684).
  - Step 1 says "✓ We deliver to X. Freight is quoted after you place the order" (:387), while the info box below says the charge is shown on the next step when a rate is configured (:450).
  - Order detail shows `totalAmount + shippingCost` (HEAD `app/dashboard/customer/orders/[id]/page.tsx:388,629`), which matches the review step but not the sidebar.
- Expected behavior: one total everywhere, taken from `quote.total + quote.fulfillment.freightTotal` when priced, and otherwise labelled "excl. delivery (quoted after order)". The cart should either quote with the saved destination or say "may be calculated at checkout".
- Impact: buyers see two different totals on the same screen. This erodes trust in the price.
- Recommended future task: make the checkout sidebar use the same `freight` and `grandTotal + freight` logic as the review step. Align the copy on lines 387 and 450 and the cart line 463.
- Requires: UI
- Boundary: Safe-to-implement-now (presentation of existing quote fields)

### BUY-07
**Checkout line prices come from the browser cart (€0.00 for list-added items); contradictory payment copy**
- Area / page / workflow: `/checkout` step 2, after "Add all to cart" from My Lists
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: My Lists adds lines with `price: 0` (`app/dashboard/customer/lists/page.tsx:110,124`). The checkout review renders `formatPrice(item.price * item.quantity)` per line (`app/checkout/page.tsx:567`), so those lines show €0.00 while the subtotal (`quote.subtotal`) is correct. In legacy-pricing mode the whole total falls back to these client prices (`:44,:55`). The copy is also contradictory: "Placing the order sends a request — nothing is charged" (:597) versus "Charged in EUR …" (:684) and "Full tax manifests will be generated post-authorization" (:693).
- Expected behavior: line amounts come from `quote.lines[i].lineTotal`, as the cart already does (`cart/page.tsx`, the `lineFor` helper). The copy should say "Amounts in EUR; nothing is charged now."
- Impact: buyers see zero-priced lines and conflicting statements about charging.
- Recommended future task: map `quote.lines` onto the review rows and rewrite the three copy lines.
- Requires: UI
- Boundary: Safe-to-implement-now

### BUY-08
**Checkout success bypasses `/checkout/confirmation`; `/checkout/payment` is orphaned**
- Area / page / workflow: order placed, then confirmation
- Category: Incomplete integration / duplicate page
- Severity: Medium
- Status: Confirmed
- Current behavior: after `POST /orders`, checkout shows its own step 3 ("Order Received!", "Continue Shopping" to `/`, `app/checkout/page.tsx:246,305-345`). This step has no link to the order and no save-to-list. The redesigned `/checkout/confirmation` (with save-to-list and a "View order" link, `app/checkout/confirmation/page.tsx:32-44`) is reachable only from `/checkout/payment` (`app/checkout/payment/PaymentForm.tsx:90,102`). Nothing links to `/checkout/payment` (grep finds only its own back-link, `payment/page.tsx:155`).
- Expected behavior: after placing the order, `router.push('/checkout/confirmation?orderId=…')`.
- Impact: the "save these items to a list" step from the design doc (§5) is lost, and the buyer gets no direct link to the new order.
- Recommended future task: replace step 3 with a redirect to `/checkout/confirmation`. That page already clears the cart; check whether a full `clearCart` is wanted for scoped checkouts. Ask the payments owner what to do with the orphaned `/checkout/payment`.
- Requires: UI
- Boundary: Safe-to-implement-now (redirect to an existing page); the `/checkout/payment` decision is Approval-required

### BUY-09
**After `PRICE_CHANGED`, checkout re-quotes without the destination**
- Area / page / workflow: `/checkout` place order
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: the error path calls `quoteCart(items, couponApplied || undefined)` with no destination (`app/checkout/page.tsx:254`). The main quote passes `destCheck.code` (:194). After a price change the delivery breakdown and the freight figure disappear.
- Expected behavior: pass the same destination argument.
- Recommended future task: add `destCheck?.supported ? destCheck.code : undefined` as the third argument.
- Requires: UI
- Boundary: Safe-to-implement-now

### BUY-10
**Delivery address: three browser-only stores, and the address page corrupts its own data**
- Area / page / workflow: `/account/address`, navbar location picker, cart/requests header, checkout
- Category: Broken or inconsistent behavior / Data-model limitation
- Severity: Medium
- Status: Confirmed
- Current behavior:
  - `/account/address` writes `localStorage['atl_delivery_address'] = JSON.stringify(form)` and then immediately overwrites it with the formatted string (`app/account/address/page.tsx:128-130`). On the next visit, `parseStored` falls back to comma splitting: the first part becomes `city` and the second becomes `country` (:38-47). Re-opening a saved "Street, Bldg, City, …" address therefore shows Street as the city and Bldg as the country.
  - The navbar writes the same key (`components/layout/Navbar.tsx:270,305`).
  - Checkout uses a different key, `bev-checkout-address` (`app/checkout/page.tsx:27,57-66,160`), so the address saved in Settings never pre-fills checkout.
  - There is no `Address` model (`backend/prisma/schema.prisma`, model list).
  - Both GPS buttons send precise coordinates to `nominatim.openstreetmap.org` (`checkout/page.tsx:475`, `account/address/page.tsx:91-94`). This third-party transfer is not mentioned in the privacy page (unverified).
- Expected behavior: one address store, pre-filled at checkout. A server `Address` model is the design target (`docs/buyer-journey-design.md:57,163`).
- Impact: addresses are lost across devices and corrupted on re-edit. Buyers retype them at checkout.
- Recommended future task: (now) remove the second `setItem`, keep the JSON, and give the navbar its own display key. Pre-fill checkout from `atl_delivery_address`. (later) add an `Address` model with CRUD.
- Requires: UI (now), Backend + DB (later)
- Boundary: the localStorage fix is Safe-to-implement-now; the Address model is Approval-required (additive schema)

### BUY-11
**The cart lives only in localStorage per user; a guest cart is dropped at sign-in**
- Area / page / workflow: `lib/cart.tsx`
- Category: Data-model limitation / Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: the storage key is `bev-cart-${sessionStorage.bev-uid}` or `bev-cart-guest` (`frontend/src/lib/cart.tsx:84-93`). On `bev-auth-changed` the provider switches to the user's key and loads it (:103-120). The guest cart is never merged, so items added before sign-in disappear from view. A signed-out visitor is told to sign in to price (`cart/page.tsx` 'auth' state), and after sign-in the cart is empty. Because the key comes from sessionStorage, a new tab shows the guest cart until `/auth/me` resolves (`lib/auth.tsx:92`). There is no server cart, so carts don't follow the user across devices.
- Expected behavior: merge the guest cart into the user cart on login (at minimum). A server cart is optional.
- Impact: lost carts in the main signed-out-to-signed-in conversion path.
- Recommended future task: on `bev-auth-changed`, when the key changes from guest to a user, merge the guest lines (same id adds quantity) and clear the guest key.
- Requires: UI
- Boundary: Safe-to-implement-now

### BUY-12
**`/deals` can never show promo codes to buyers**
- Area / page / workflow: `/deals` (navbar and footer)
- Category: Incomplete integration
- Severity: Medium
- Status: Confirmed
- Current behavior: the page calls `GET /coupons` (`app/deals/page.tsx:58`), which is `@Roles(Role.ADMIN)` (`backend/src/coupons/coupons.controller.ts:32-37`). Buyers get 403, which is treated as an empty list. `price-ticker` returns `[]` for anonymous users (`products.controller.ts:280-285`), so signed-out visitors see "No active deals right now" with no sign-in prompt. The empty state says "Subscribe below" (:124), but the page has no subscribe form (the footer may; unverified).
- Expected behavior: a public or buyer endpoint for active, non-expired coupons, or remove the coupons section. A signed-out state of "Sign in to see price drops".
- Recommended future task: add `GET /coupons/active` (code, %, expiry only), or drop coupons from the page. Add the signed-out state now.
- Requires: Backend (coupons), UI (signed-out state)
- Boundary: the signed-out state and copy are Safe-to-implement-now; the endpoint is Approval-required

### BUY-13
**`/wholesale` describes a pricing model the platform doesn't have**
- Area / page / workflow: `/wholesale` (footer link)
- Category: Policy-only behavior / fake data
- Severity: High
- Status: Confirmed
- Current behavior: an "Example" table with **per-piece** tiers and invented prices ("10 – 49 pcs (MOQ) €12.50", "500+ pcs €7.50 — 40% off") (`app/wholesale/WholesaleClient.tsx:103-116`), and "Pricing tiers are set individually by each supplier" (:122). It also makes these claims: "Every product … sourced and quality-checked by the Atlantis team", "sold and shipped by Atlantis across Europe and the Gulf", "Download invoices automatically for every order", and "Repeat your most common orders with a single click from your order history" (:8-13). All category tiles link to plain `/categories` (:65). The page still uses the legacy styling (`font-black`, `rounded-3xl`, `bg-primary`).
- Actual model: case, pallet and truck tiers from Atlantis markups (`docs/pricing-and-packaging.md:20-29`). There is no invoice PDF generator (`docs/buyer-journey-design.md:18`). Reorder works through Lists and the cart, not one click.
- Impact: misleading commercial claims on an indexed SEO page.
- Recommended future task: rewrite the page around case, pallet and truck tiers using the worked example in `pricing-and-packaging.md:61-71` (labelled as an example). Remove the unverified claims and link the categories to `/categories?dept=…`.
- Requires: UI, Policy decision (coverage, QC, invoices claims)
- Boundary: copy and data corrections are Safe-to-implement-now; new claims are Approval-required

### BUY-14
**Home page marketing claims and a hardcoded brand wall are not backed by data**
- Area / page / workflow: `/` (HomeClient)
- Category: Policy-only behavior / Unverified
- Severity: Medium
- Status: Suspected
- Current behavior: hero copy says "one trusted partner … from a single supplier" (`app/HomeClient.tsx:43-44`), which contradicts the multi-supplier marketplace. It also says "shipped by Atlantis" (:39) and "Consolidated logistics across Europe … documentation handled for you" (:49). A static wall of 25 brand logos (Coca-Cola, Red Bull, Nutella …) is captioned "Global FMCG brands we source" (:89-113, :315) and is not checked against catalog brands. `categories/page.tsx:8` says "Browse thousands of wholesale products" and `:13` says "across Europe and the Gulf".
- Expected behavior: claims only for what the business provides. Brand logos only for brands with approved listings, and only if trademark use is cleared.
- Recommended future task: get a business decision on each claim. Drive the brand wall from `facets.brands` of `/products`, or keep it only for brands that have listings.
- Requires: Policy decision, UI
- Boundary: Approval-required

### BUY-15
**Product ratings can be inflated through the legacy `POST /products/:id/rate`**
- Area / page / workflow: PDP rating summary
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: any authenticated user, with no limit, can call `POST /products/:id/rate`. It increments `reviewsCount` and blends the rating (`backend/src/products/products.controller.ts:871-878`; `products.service.ts:1488-1505`). No UI calls it. The PDP reads `product.rating` and `reviewsCount` (`ProductDetailClient.tsx:418-419,874`). Separately, real reviews have no purchase requirement (`backend/src/products/reviews.service.ts:48-53`), though the "verified purchase" badge itself is computed honestly (:44-45).
- Expected behavior: a single review per user (already enforced by `Review` productId_userId), with ratings computed only from `Review`.
- Recommended future task: remove or staff-guard `/products/:id/rate`. Decide whether only buyers with a delivered order may review.
- Requires: Backend, Policy decision
- Boundary: Approval-required

### BUY-16
**Sourcing requests (RFQ) are emails only, and the public contact endpoint can post into any user's support thread**
- Area / page / workflow: `/requests`, `/contact`
- Category: Missing backend/system + Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: `/requests` builds a text message and POSTs `/contact` (`app/requests/RequestsClient.tsx:659-682`). The reference `ATL-REQ-…` is generated in the browser (:659), and the history is stored only in localStorage (:61, :698). There is no RFQ or sourcing-request model (schema model list), so staff cannot track status and the buyer has no record across devices. The public `POST /contact` (no guard) looks up a user **by the email typed in the form** and creates a `SupportMessage` with `senderId = that user` (`backend/src/app.controller.ts:109,140-158`). Anyone can therefore put a message into another user's support thread that appears to come from them. User fields are also interpolated into the email HTML (:113-130); the global `SecurityInterceptor` strips HTML tags (`security.interceptor.ts` sanitizeObject), which partly mitigates this.
- Expected behavior: a `SourcingRequest` record for signed-in buyers, visible in the account. Contact submissions should attach to a user only when the request is authenticated as that user.
- Recommended future task: (1) in `/contact`, link to `user.id` only when `req.user?.email === dto.email`; otherwise file it as anonymous. (2) Add an RFQ model with status and show it under the buyer account.
- Requires: Backend, DB (additive), UI
- Boundary: Approval-required

### BUY-17
**Buyer notifications: no way to reach the page, no loading/error state, and real-time never authenticates**
- Area / page / workflow: `/dashboard/customer/notifications`
- Category: Missing UI / Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: the buyer account tabs leave Notifications out (HEAD `app/dashboard/customer/layout.tsx:10-17`). The navbar has no bell (grep `notifications` in `components/layout/*` finds nothing). The only link is in `components/dashboard/Sidebar.tsx:46`, which is used only by `app/dashboard/supplier/layout.tsx:3`. The page shows "All clear!" while loading and on error (`app/dashboard/customer/notifications/page.tsx:39`, because `useNotifications` swallows errors at `hooks/useNotifications.ts:29-38`). The socket sends `auth: { token: getToken() }` (`hooks/useNotifications.ts:50-53`), and `getToken` is a stub that returns `undefined` (`lib/api.ts:68`), so real-time notifications never authenticate.
- Expected behavior: a Notifications tab (or a bell with an unread count) plus loading and error states.
- Recommended future task: add a tab entry and an i18n key in all 7 locales. Add `loading` and `error` to the hook. Move socket auth to `/api/auth/socket-token`, which `SupportChat` already uses (`components/chat/SupportChat.tsx:109`).
- Requires: UI (tab, states), Integration (socket)
- Boundary: tab and states are Safe-to-implement-now; socket auth is Approval-required

### BUY-18
**Wishlist is a legacy duplicate of Saved / Lists, with a fake "Premium" brand and a wrong add-to-cart**
- Area / page / workflow: `/wishlist`, `/saved`, account menu "Saved items"
- Category: Broken or inconsistent behavior / duplicate page
- Severity: Low
- Status: Confirmed
- Current behavior: the menu links to `/saved` (`components/layout/Navbar.tsx:622`), which redirects to `/wishlist` (`app/saved/page.tsx:4`). The middleware protects `/saved` but not `/wishlist` (`frontend/src/middleware.ts:4-7`). The page uses the pre-design-system layout (`pt-24`, `bg-primary`, uppercase). Add-to-cart sets `brand: item.brand || 'Premium'` (an invented label) and always `unit: 'Case', tier: 'carton'`, qty 1, with no `productId` and no tier-clash check (`app/wishlist/page.tsx:63-74`). The signed-out link has no `redirect` (:82). The design doc says the wishlist should appear as the built-in "Saved products" list inside My Lists (`docs/buyer-journey-design.md:51`); no list code references the wishlist.
- Recommended future task: show the wishlist inside `/dashboard/customer/lists` as "Saved products", or at least add the account shell, set `productId`, drop 'Premium', and add `?redirect=/wishlist`.
- Requires: UI
- Boundary: Safe-to-implement-now

### BUY-19
**Products with no brand are shown as brand "Atlantis"**
- Area / page / workflow: every product card and list (`mapProduct`)
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: `brand: item.brandDisplay || item.brand || 'Atlantis'` (`frontend/src/lib/api.ts:74`).
- Expected behavior: show no brand (the PDP already says "not provided by supplier" for missing fields, `ProductDetailClient.tsx:864`).
- Requires: UI
- Boundary: Safe-to-implement-now (check consumers that assume a non-empty string)

### BUY-20
**PDP shows buyers the label "Mixing markup (×1.0xx)"**
- Area / page / workflow: PDP mix composer summary
- Category: Policy-only behavior
- Severity: Low
- Status: Confirmed
- Current behavior: `Mixing markup (×{markups.mix.toFixed(3)})` plus the delta amount (`app/products/[id]/ProductDetailClient.tsx:1296-1297`). Non-staff receive only tier ratios (`backend/src/app.controller.ts:54-60`, `common/price-privacy.ts:25-30`), so the real margin is not leaked. The label still tells buyers there is a markup and quantifies the mix surcharge relative to the case tier.
- Expected behavior: a neutral label such as "Mixed-load price adjustment", or show only the total.
- Requires: UI, Policy decision on wording
- Boundary: Safe-to-implement-now (relabel)

### BUY-21
**Card "from" prices depend on a hardcoded markup fallback that is cached for the session**
- Area / page / workflow: product cards (`lib/card-pricing.ts`) on categories, home, targets, mix discovery
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Suspected
- Current behavior: the module-level `getAdminMarkups()` falls back to `DEFAULT_MARKUPS = {piece 1.10, pallet 1.05, container 1.02}` on any failure and keeps the result in memory (`frontend/src/lib/card-pricing.ts:7,32-50`). For non-staff the server already returns the buyer case price, with `piece` as the ratio 1 (`price-privacy.ts:25-30,41`). If the fallback is used (network error, or `/config/markup` is not public in the proxy, see BUY-23), the cards apply absolute markups to an already marked-up price, so cards and PDP/cart disagree. A failure while signed out stays cached after sign-in until reload.
- Expected behavior: no client markup defaults. If no ratios are available, show the server case price.
- Recommended future task: drop `DEFAULT_MARKUPS` for buyers (use ratios of 1), and reset the cache on `bev-auth-changed`.
- Requires: UI
- Boundary: Safe-to-implement-now

### BUY-22
**Signed-out PDP says the catalog is "members-only", but the catalog is public**
- Area / page / workflow: PDP not-found state; categories 'auth' error state
- Category: Broken or inconsistent behavior (stale copy)
- Severity: Low
- Status: Confirmed
- Current behavior: the comment says "The catalog proxy only serves signed-in members", and the page shows "Sign in to view this product … members-only wholesale marketplace" (`ProductDetailClient.tsx:559-566`). In fact the proxy forwards anonymous `GET products*` (`api/proxy/[...path]/route.ts:70-73`), the backend serves approved products anonymously without prices (`products.controller.ts:289-301`), and the SSR page fetches anonymously (`app/products/[id]/page.tsx:30`). A missing product shown to a signed-out visitor is therefore really "not found".
- Recommended future task: show "Product not found" for everyone, and add a sign-in hint for prices only.
- Requires: UI
- Boundary: Safe-to-implement-now

### BUY-23
**The proxy rejects anonymous `/config/*`, so the platform currency and markup ratios never reach visitors**
- Area / page / workflow: `providers.tsx` currency default, `card-pricing.ts`, PDP markup fetch
- Category: Incomplete integration
- Severity: Low
- Status: Confirmed
- Current behavior: `PUBLIC_PATHS` does not include `config/currency`, `config/markup` or `config/default-unit` (`frontend/src/app/api/proxy/[...path]/route.ts:24-51`). `providers.tsx:23` fetches `/api/proxy/config/currency` and gets 401 for visitors. `card-pricing.ts:18` calls `${NEXT_PUBLIC_API_URL}/config/default-unit` directly, bypassing the proxy and so working inconsistently. A separate `app/api/config/currency/route.ts` exists and is not used here.
- Recommended future task: add `config/currency` and `config/default-unit` (both public on the backend, `app.controller.ts:37-46`) to `PUBLIC_PATHS`. `config/markup` is already safe for anonymous callers (ratios only) and could be added as well.
- Requires: UI (proxy allow-list)
- Boundary: Safe-to-implement-now (the backend endpoints are already public)

### BUY-24
**Legacy or orphan buyer pages**
- Area / page / workflow: `/auth/onboarding`, `/dashboard/payment-methods`, `/dashboard/support`, `/auth/partner`
- Category: Broken or inconsistent behavior (duplicates)
- Severity: Low
- Status: Confirmed
- Current behavior: nothing links to `/auth/onboarding`. It is superseded by `/auth/complete-profile` (linked from `auth/google-sync/page.tsx:36` and `ProfileReminderBanner.tsx:28`), defaults the country to "United Arab Emirates" (`auth/onboarding/page.tsx` form init) and posts to the legacy `POST /users/:id`. Nothing links to `/dashboard/payment-methods` either; its header says "Customers currently only need bank info for refunds; card tokenization coming in Phase 2" (`app/dashboard/payment-methods/page.tsx:3-4`), which is a refund claim (hand to the payments auditor). `/dashboard/support` is a correct redirect (`app/dashboard/support/page.tsx:8-17`). `/auth/partner` redirects to register.
- Recommended future task: redirect `/auth/onboarding` to `/auth/complete-profile`. Remove or redirect `/dashboard/payment-methods` once the payments owner agrees.
- Requires: UI
- Boundary: the onboarding redirect is Safe-to-implement-now; payment-methods is Approval-required

### BUY-25
**Order history is capped at 100 with no pagination; "Bought before" matches only the 40 newest products**
- Area / page / workflow: `/dashboard/customer`, `/dashboard/customer/orders`
- Category: Data-model limitation / Incomplete integration
- Severity: Medium
- Status: Confirmed (HEAD; the orders page is being reworked in the working tree)
- Current behavior: `fetchMyOrders(100)` is used on the orders page (HEAD `orders/page.tsx:319`) and the overview (`app/dashboard/customer/page.tsx:22`). The backend paginates (`orders.controller.ts:162-173`), but the UI never requests page 2. The overview's "Bought before" cards match past items against `fetchProductPage({ limit: 40, sort: 'newest' })` (:24, :31). Older purchases show only as name chips with no price or add-to-cart (:71-77). The empty "New to you" text "Nothing new since your last order" (:89) is not what the code computes.
- Recommended future task: add "Load more" or pagination. Fetch bought products by id; a `/products?ids=` endpoint would be needed (backend).
- Requires: UI, Backend (ids filter)
- Boundary: pagination is Safe-to-implement-now; the ids endpoint is Approval-required

### BUY-26
**The offer comparison shows "In stock" and exact case counts**
- Area / page / workflow: PDP OfferComparison
- Category: Policy-only behavior
- Severity: Low
- Status: Confirmed
- Current behavior: "In stock" or "Out of stock" with `stockCases` (`components/product/OfferComparison.tsx:65-66`; `backend/src/products/offer-compare.service.ts:74`). The design rule says catalog stock is "listed by supplier", never "in stock" (`docs/buyer-journey-design.md:98`), and there is no `stockUpdatedAt` (schema).
- Recommended future task: relabel to "Listed by supplier: N cases".
- Requires: UI
- Boundary: Safe-to-implement-now

### BUY-27
**`docs/buyer-journey-design.md` describes the past**
- Area / page / workflow: docs
- Category: Broken or inconsistent behavior (documentation)
- Severity: Low
- Status: Confirmed
- Current behavior: it says there is no list model and no sessions endpoints (`docs/buyer-journey-design.md:19,23,60,141`). Both now exist: `ShoppingList`/`ShoppingListItem`/`UserSession` models (schema lines 1216, 1232, 1252), `lists.controller.ts`, `auth.controller.ts:239-251`, and supplier confirmations (`OrderSupplierConfirmation`, schema line 407).
- Recommended future task: update the status column and audit table.
- Requires: Docs
- Boundary: Safe-to-implement-now

### BUY-28
**Cart, checkout, deals and wholesale are English-only and partly off the design system; checkout has keyboard-access gaps**
- Area / page / workflow: `/cart`, `/checkout`, `/deals`, `/wholesale`, `/wishlist`, notifications
- Category: Localization/accessibility gap
- Severity: Medium
- Status: Confirmed
- Current behavior: the interface ships in 7 languages (commit b3ddb7a), but cart and checkout copy is hardcoded English. Checkout uses `t()` only for `cart.tbd` and `cart.manualQuote` (`checkout/page.tsx:437,580,670`). Checkout validation uses `alert()` (:151-155, :262, :493-497) instead of inline field errors. The carrier cards are clickable `<div>`s without role, tabIndex or key handling (:401-405). Checkout and wishlist use legacy styles (`rounded-[40px]`, `premium-shadow`, `text-4xl` headings, "Logistics Procurement", "Ledger Overview", "Batch Value") that `docs/DESIGN_SYSTEM.md` replaced.
- Recommended future task: move the checkout to design-system primitives with inline errors, and extract strings to `locales/*`.
- Requires: UI
- Boundary: Safe-to-implement-now (presentation only; must pass `check:i18n`)

### BUY-29
**Google sign-up activates buyers immediately; email sign-up waits for approval**
- Area / page / workflow: registration and approval
- Category: Policy-only behavior
- Severity: Low
- Status: Confirmed
- Current behavior: email registration creates `status: 'PENDING_APPROVAL'` (`backend/src/auth/auth.service.ts:243`). Google creates `status: 'ACTIVE' // existing operator decision for Google buyers` (:608). The pending page says "Our team reviews every new business account before trading starts" (`app/auth/pending/page.tsx:19`), which is untrue for Google sign-ups.
- Recommended future task: a business decision, then align the code or the copy.
- Requires: Policy decision
- Boundary: Approval-required

### BUY-30
**`/targets` ("Buyer Targets") is a supplier-facing demand page whose name clashes with buyer "Target prices", and its CTA loses the product**
- Area / page / workflow: `/targets` versus `/dashboard/customer/targets`
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: `/targets` ranks products by wishlist count ("buyers watching") for suppliers (`app/targets/TargetsClient.tsx:14-32,106`), while the buyer tab "Target prices" lists the buyer's own price proposals. The page CTA links to `/contact?product=<id>` (:71), but `ContactClient` never reads search params (only `useState` init, `app/contact/ContactClient.tsx:52`), so the product context is lost.
- Recommended future task: rename the public page (for example "Buyer demand"), and pre-fill the contact topic or message from `?product=`.
- Requires: UI
- Boundary: Safe-to-implement-now

### BUY-31
**The buyer account area has no role gate**
- Area / page / workflow: `/dashboard/customer/*`
- Category: Security or permissions gap (UX)
- Severity: Low
- Status: Suspected
- Current behavior: the layout renders for any signed-in role (HEAD `app/dashboard/customer/layout.tsx:20-58`). `ClientLayout` checks only login and status (`components/layout/ClientLayout.tsx:23-50`). A supplier opening it calls `/orders/my-orders`, which returns its **supplier** orders (`orders.controller.ts:174-176`), inside the buyer UI. The data is masked server-side, but the totals shown may not be the supplier view (unverified).
- Recommended future task: redirect non-CUSTOMER roles to their own dashboard (as `app/dashboard/page.tsx:35-46` does).
- Requires: UI
- Boundary: Safe-to-implement-now

---

## SUP — Supplier experience (25)

### SUP-01
**Two supplier dashboards; `/dashboard` and many links send suppliers to the broken old one**
- Area / page / workflow: Sign-in entry point, `/dashboard/supplier` vs `/supplier`
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed
- Current behavior: The login page sends suppliers to `/supplier` (`frontend/src/app/auth/login/page.tsx:41`). The `/dashboard` redirector sends them to the old `/dashboard/supplier` (`frontend/src/app/dashboard/page.tsx:40-41`). The Footer "Supplier sign-in" link goes to `/auth/login?redirect=/dashboard/supplier` (`frontend/src/components/layout/Footer.tsx:34`). Help articles and the help CTA also point to the old dashboard (`frontend/src/content/help/articles/suppliers.ts:13`, `account.ts:84`, `frontend/src/components/help/AccountCta.tsx:8`). The old dashboard has its own layout and the old `Sidebar` (`frontend/src/app/dashboard/supplier/layout.tsx:1-39`). Its stat cards read keys the API never returns (`totalRevenue`, `activePlacements`, `openOrders` at `dashboard/supplier/page.tsx:241-243`; the API returns `stats.revenue/products/orders`, see `backend/src/common/dashboard.service.ts:122-127`), so they always show 0. It also shows "Revenue generated" from buyer prices (SUP-04). Editing a product calls `PUT /products/:id` (`dashboard/supplier/page.tsx:132-133`), but only `PATCH` exists (`backend/src/products/products.controller.ts:685`), so edits fail. The old "Add product" page fakes an AI description (`dashboard/supplier/products/new/page.tsx:47-57`) that claims "verified certifications", and its "Import via Excel" and "Scan Barcodes" buttons have no handlers (`:462-467`). The old sidebar links to `/supplier/placements`, which does not exist (`frontend/src/components/dashboard/Sidebar.tsx:35`). Project instructions (CLAUDE.md) still call `/dashboard/supplier` the entry point.
- Expected behavior: One supplier workspace (`/supplier`). Every entry point and link lands there.
- Evidence: as above; route folders `frontend/src/app/dashboard/supplier/` and `frontend/src/app/supplier/`.
- Impact: Suppliers who come in through `/dashboard`, the footer or help land on a dashboard that shows zeros, leaks the margin and can't save edits.
- Dependencies & risks: Help content and NotificationBell also reference the old paths. CLAUDE.md needs updating at the same time.
- Recommended future task: Turn `/dashboard/supplier` (and `/dashboard/supplier/products/new`) into redirects to `/supplier` (and `/supplier/products/new`). Point every link at `/supplier`. Update CLAUDE.md. Delete the old page, modal and `Sidebar` supplier items.
- Requires: UI
- Boundary: Safe-to-implement-now (redirects and links). Deleting the legacy code: approval-required.

### SUP-02
**Earnings page shows buyer totals and the platform fee, and claims escrow that doesn't exist**
- Area / page / workflow: `/supplier/earnings`, `GET /payments/my-earnings`
- Category: Security or permissions gap + Policy-only behavior
- Severity: Critical
- Status: Confirmed
- Current behavior: `getSupplierEarnings` returns raw `EscrowTransaction` rows (`backend/src/payments/payments.service.ts:80-112`). `amount` is `order.totalAmount`, the buyer's total (`:226-235`), and the response also includes `order.totalAmount` (`:85-92`). `platformFee` is a flat % of the buyer total (`:157-159`), so supplier payout = buyer total − fee%. That contradicts the supplier-net-price model (`OrderItem.supplierUnitPrice`). The interceptor doesn't strip these fields because they aren't product-like. The page shows "Gross Amount", "Platform Fee" and "Your Payout" (`frontend/src/app/supplier/earnings/page.tsx:171-212`), so the supplier can read the buyer price and the Atlantis margin directly. It also says "Funds held in secure escrow" and "funds are automatically released … once the order is marked DELIVERED" (`:55-60`, `:144-149`). `releaseEscrow` is never called anywhere (`backend/src/payments/escrow.service.ts:58`; the only calls are void/refund at `orders.service.ts:1459-1461`), and the public Protected Payments page says "Atlantis doesn't hold buyer funds in escrow" (`frontend/src/app/protected-payments/ProtectedPaymentsClient.tsx:237`). "Export CSV" and "Filter" have no handlers (`earnings/page.tsx:85-87`, `:159-161`). The filter `order: { supplierId }` (`payments.service.ts:83`) misses multi-supplier orders.
- Expected behavior: Earnings are based on the supplier's own net prices (`supplierUnitPrice`, as on the Business Overview). No buyer totals, no fee split, no escrow claims.
- Evidence: as above; schema `EscrowTransaction` (`backend/prisma/schema.prisma:941-957`).
- Impact: Breaks the core product rule (suppliers never see buyer price or margin). Makes false financial claims.
- Dependencies & risks: Payout and settlement are not actually built (SUP-03). The page is not in the nav but can be reached by URL.
- Recommended future task: Remove the escrow and fee copy now. Restrict `/payments/my-earnings` to supplier-net figures, or retire the page until real settlement exists.
- Requires: Backend, UI, Policy decision
- Boundary: Copy removal and hiding the dead buttons: Safe-to-implement-now. API change: Approval-required.

### SUP-03
**Payout and bank details can't be saved on either page, and the UI claims they were**
- Area / page / workflow: `/supplier/settings/payout`, `/supplier/payment-methods`
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed
- Current behavior: `/supplier/payment-methods` sends IBAN, SWIFT and bank address to `POST /users/:id` (`frontend/src/app/supplier/payment-methods/page.tsx:83-86`). That endpoint only keeps whitelisted profile fields (`backend/src/users/users.controller.ts:231-236`, `backend/src/users/profile-fields.ts:1-42`, "banking fields are never accepted here"). The bank fields are silently dropped, but the page shows "Bank account saved securely. Data is encrypted at rest." (`:97`). `/supplier/settings/payout` calls `PATCH /payments/payout-settings` → `updatePayoutSettings`, which writes `bankName` and `accountHolderName` (`backend/src/users/users.service.ts:364-365`). Neither column exists on `User` (`backend/prisma/schema.prisma:74-170`), so Prisma throws. That path also requires KYC `VERIFIED` (`users.service.ts:356-358`), which the KYC UI can't produce (SUP-05). Even if it worked, it would return the full user row including the password hash (`:368-371`). The DTO also makes `vatNumber` mandatory (`backend/src/payments/dto/update-payout-settings.dto.ts:34-36`). The UI hardcodes "Platform takes 5% commission" (`settings/payout/page.tsx:183-184`), while the fee is configurable (`payments.service.ts:305-311`) and Atlantis earns a markup, not a commission. Stripe Connect onboarding falls back to the `AE` country for unsupported countries (`payments.service.ts:37-39`).
- Expected behavior: One payout page backed by a working endpoint. Copy that matches the real settlement model.
- Evidence: as above.
- Impact: Suppliers believe their bank details are saved when nothing was stored. No payout path actually works.
- Dependencies & risks: Settlement process (Policy). KYC flow (SUP-05). Both pages are hidden from the nav (`frontend/src/app/supplier/layout.tsx:39-50`).
- Recommended future task: Decide the payout model. Then build one endpoint with an allow-list and encryption, a response DTO that leaves out secrets, and one UI. Until then, show a truthful "Atlantis collects bank details during onboarding" notice.
- Requires: Backend, DB (if bank columns are wanted), UI, Policy decision
- Boundary: Removing the false success and 5% copy: Safe-to-implement-now. Everything else: Approval-required.

### SUP-04
**`GET /dashboard/supplier` returns buyer-price revenue, whole-order totals and buyer countries; polled every 60 s**
- Area / page / workflow: `/supplier` layout header poll; old `/dashboard/supplier`
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: `getSupplierSnapshot` sums `OrderItem.price`, the marked-up buyer price (`backend/src/common/dashboard.service.ts:47-50`, `:64-84`), across every status including cancelled. `revenueTrend` sums `order.totalAmount` for whole orders, including other suppliers' lines, freight and margin (`:103-120`). It also returns buyer country demographics (`:88-101`). None of these are product-like, so the interceptor passes them through. The current `/supplier` layout fetches this every 60 s and never uses the result (`frontend/src/app/supplier/layout.tsx:64`, `:121-134`). The old dashboard shows `topProducts.totalRevenue` (`frontend/src/app/dashboard/supplier/page.tsx:405`).
- Expected behavior: No supplier endpoint returns buyer-priced aggregates.
- Evidence: as above; endpoint `backend/src/admin/dashboard.controller.ts:25-29`.
- Impact: Margin leak to every signed-in supplier (visible in browser devtools); wasted polling.
- Dependencies & risks: The old dashboard depends on it (SUP-01).
- Recommended future task: Remove the unused poll from the layout (UI). Re-base or retire `getSupplierSnapshot` on `supplierLineValue` (Backend).
- Requires: UI, Backend
- Boundary: Removing the poll at `supplier/layout.tsx:121-134`: Safe-to-implement-now. Backend: Approval-required.

### SUP-05
**Supplier KYC page is a simulation: it never submits and shows random success or failure**
- Area / page / workflow: `/dashboard/kyc` (linked from the supplier header badge and payout pages)
- Category: Missing UI / Policy-only behavior
- Severity: Critical
- Status: Confirmed
- Current behavior: `handleSubmit` waits 4 s and then `Math.random() > 0.2` decides "You are now verified!" or failure (`frontend/src/app/dashboard/kyc/page.tsx:186-198`, success screen `:224-246`). No `apiFetch` call exists in the file. The "biometric scan" is a timer that toasts "Identity verified successfully" (`:155-167`, `:189-199` effect, mesh "simulation" `:580`). The backend `POST /kyc/upload` and `/kyc/submit` (`backend/src/kyc/kyc.controller.ts:41-101`) have no UI caller (no frontend reference to `/kyc/upload` or `/kyc/submit`). The supplier header badge links here (`frontend/src/app/supplier/layout.tsx:274-279`). The copy asks for "company" details but collects a personal ID only (schema `KYCDocument.documentType` "NATIONAL_ID"/"PASSPORT", `backend/prisma/schema.prisma:172-188`), while the header says "Company verification comes from the KYC review" (`layout.tsx:273`).
- Expected behavior: A real upload to `/kyc/upload`, a status read from `/kyc/status`, and no fake verified screens.
- Evidence: as above.
- Impact: Suppliers are told they are verified when nothing was sent. `User.kycStatus` never changes, so payouts stay blocked (SUP-03).
- Dependencies & risks: Policy: what "verified supplier" means (person vs company), and whether AI auto-approve is allowed (SUP-06).
- Recommended future task: Replace the simulation with a real upload form wired to `/kyc/upload` and `/kyc/status`. Remove the fake success and "biometric" UI now.
- Requires: UI, Policy decision
- Boundary: Removing the fake success/random result and showing an honest "submit documents" state: Safe-to-implement-now. Wiring a new submission flow: Approval-required.

### SUP-06
**KYC backend: AI can auto-approve; client-set liveness score; review notes exposed to the user; REJECTED never reaches the user**
- Area / page / workflow: `backend/src/kyc`
- Category: Policy-only behavior / Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: Gemini `AUTO_APPROVE` sets the user to VERIFIED with no human review (`backend/src/kyc/kyc.service.ts:197-201`). `livenessScore` is accepted from the client (`kyc.controller.ts:41-54`, `:97`), and `/kyc/submit` accepts arbitrary image URLs. `GET /kyc/status` returns the whole latest document, including `adminNotes` (the AI report, "Name on doc", reviewer notes) (`kyc.service.ts:216-228`). `rejectKyc` sets the user to `UNVERIFIED`, not `REJECTED` (`kyc.service.ts:388-391`), so the header's "Verification declined" state (`supplier/layout.tsx:279`) can never show. KYC is not enforced for listing products or Stripe Connect ("KYC enforcement DISABLED", `backend/src/products/products.service.ts:153-166`, `backend/src/payments/payments.service.ts:26-31`), but it is enforced for payout settings (`users.service.ts:356`). That is inconsistent.
- Expected behavior: A policy-defined review (human or AI threshold). A server-computed liveness score. A user-facing DTO without internal notes. A visible REJECTED state with a reason.
- Evidence: as above.
- Impact: Verification can be gamed or skipped, and internal review text leaks to the user.
- Dependencies & risks: Policy decision on KYC scope and gates.
- Recommended future task: Define KYC policy. Return `{kycStatus, document: {status, createdAt, reasonForUser}}`. Ignore client `livenessScore`.
- Requires: Backend, Policy decision
- Boundary: Approval-required

### SUP-07
**Admin KYC review page calls a non-existent `/api/kyc/*` route; the queue always looks empty**
- Area / page / workflow: `/admin/kyc`
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed
- Current behavior: `API_URL = '/api'`, `headers = {}` (`frontend/src/app/admin/kyc/page.tsx:67-69`). Requests go to `/api/kyc/admin/all`, `/api/kyc/admin/stats` and `/api/kyc/admin/:id/verify|reject` (`:84-85`, `:106`, `:121`). There is no `frontend/src/app/api/kyc` route (only `/api/proxy/[...path]` and others), so they 404. Errors are swallowed silently (`:88-90`). The signed-URL call on the same page correctly uses `/api/proxy/...` (`:28`). Separately, `/admin/support` calls `/kyc/pending`, which doesn't exist (`frontend/src/app/admin/support/page.tsx:143`; the real route is `/kyc/admin/pending`).
- Expected behavior: Use `apiFetch('/kyc/admin/...')` (the proxy).
- Evidence: as above; `frontend/src/lib/api.ts:18-36`.
- Impact: Staff can't review supplier KYC from the UI.
- Dependencies & risks: Admin area (overlaps another audit).
- Recommended future task: Switch the page to `apiFetch` and add an error state.
- Requires: UI
- Boundary: Safe-to-implement-now (client-side URL fix to existing endpoints).

### SUP-08
**Mixed-load orders are invisible to suppliers, who can't confirm them, so the orders stall**
- Area / page / workflow: `/supplier/orders`, `orders.service.findBySupplier`, `supplierAccept/Reject`
- Category: Broken or inconsistent behavior
- Severity: High
- Status: Confirmed (static); runtime Unverified
- Current behavior: A mixed pallet/truck line is stored with `productId: null, mixedLoadId` (`backend/src/orders/orders.service.ts:226-235`). A confirmation row is created for `q.supplierId` (`:412-413`). `findBySupplier` filters on `items.some.product.supplierId` (`:714-722`), so these orders never appear. `supplierAccept` and `supplierReject` throw "Order not found" for the same reason (`:875-876`, `:899-900`). If the load mixes suppliers, `q.supplierId` is null (`backend/src/orders/pricing.ts:397`), so no supplier gets a confirmation, and `confirmationState` requires at least one ACCEPTED (`order-workflow.ts:66`).
- Expected behavior: Suppliers see and answer their part of mixed loads (lines carried in `mixComposition`).
- Evidence: as above; schema `MixedLoad` (`schema.prisma:1193-1209`).
- Impact: Mixed-load orders can't get past supplier confirmation without manual admin action.
- Dependencies & risks: Supplier-net value of mixed lines isn't recorded (`stock-ledger.ts:92` returns 0 for mixed loads), and SUP-09 applies.
- Recommended future task: Match supplier orders by confirmation rows plus `mixComposition` products. Expose per-supplier mixed lines at supplier-net prices.
- Requires: Backend
- Boundary: Approval-required

### SUP-09
**`mixComposition` sent to suppliers carries buyer (marked-up) unit prices**
- Area / page / workflow: `GET /orders/my-orders` (supplier)
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: `priceLoad` returns buyer-priced lines (`casePrice × mix markup`, `backend/src/orders/pricing.ts:394-397`). These are stored on the order line as `mixComposition[].unitPrice` / `lineSubtotal` (`orders.service.ts:230`, legacy variant mix `:250`). `findBySupplier` forwards `mixComposition` unchanged (`:818`). The interceptor doesn't strip it (not product-like). The UI only prints quantity and variant (`frontend/src/app/supplier/orders/page.tsx:192`), but the API response contains buyer prices.
- Expected behavior: Strip `unitPrice` / `lineSubtotal` from `mixComposition` in supplier views, or replace them with supplier-net values.
- Evidence: as above.
- Impact: Margin is visible in the supplier's network responses for variant-mix lines (and for mixed loads once SUP-08 is fixed).
- Dependencies & risks: SUP-08.
- Recommended future task: Map `mixComposition` to `{signature|variant|name, quantity, cases}` in `findBySupplier`.
- Requires: Backend
- Boundary: Approval-required

### SUP-10
**Masked buyer email still reveals the buyer's company domain**
- Area / page / workflow: `findBySupplier`
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: `maskedEmail` keeps the first 2 characters and the full domain (`ab***@retailer.com`) (`backend/src/orders/orders.service.ts:741-742`). It is returned as both `buyer.email` and `customer.email` (`:783-790`). For B2B, the domain identifies the buyer. The name is masked to initials (`:739-740`). Free-text timeline notes from history (`:778`, `timeline`) can also carry buyer text.
- Expected behavior: No buyer email for suppliers; an opaque label ("Buyer A" / order ref).
- Evidence: as above. The UI shows only the name (`supplier/orders/page.tsx:153`).
- Impact: Buyer identity leaks to suppliers.
- Dependencies & risks: Policy (what "masked" means).
- Recommended future task: Drop `email` from supplier views and return a stable pseudonym.
- Requires: Backend, Policy decision
- Boundary: Approval-required

### SUP-11
**Supplier invoices go to the buyer and sit in a public bucket; one slot per order**
- Area / page / workflow: `/supplier/orders` invoice attachment
- Category: Security or permissions gap / Data-model limitation
- Severity: High
- Status: Confirmed
- Current behavior: The upload uses `uploadProductImage`, a public bucket with a permanent public URL (`backend/src/orders/orders.controller.ts:59-90`, `backend/src/storage/supabase-storage.service.ts:46-87`). It is stored in the single `Order.supplierInvoiceUrl` (`schema.prisma:355`), so on multi-supplier orders each supplier overwrites the others. It is shown to the buyer (`frontend/src/app/dashboard/customer/orders/[id]/page.tsx:674-696`). The UI says "Invoice attached — the buyer can see it." (`supplier/orders/page.tsx:280`), and the help article says the same (`frontend/src/content/help/articles/payment-invoicing.ts:78`). A supplier's own invoice normally names the supplier and its net price. With Atlantis as principal, that breaks "buyers never see supplier ids or supplier net prices".
- Expected behavior: Supplier invoices go to Atlantis only (private storage, signed URLs), one per supplier per order. The buyer gets Atlantis's invoice.
- Evidence: as above.
- Impact: Supplier identity and net price can reach buyers. Invoices are world-readable by URL.
- Dependencies & risks: Policy decision; additive schema (per-supplier documents).
- Recommended future task: Add an `OrderSupplierDocument` model (additive) and private storage. Hide supplier invoices from buyer views.
- Requires: Backend, DB, UI, Policy decision
- Boundary: Approval-required (changing the "buyer can see it" copy only after the policy is decided)

### SUP-12
**Any supplier can read any wholesale offer (IDOR)**
- Area / page / workflow: `GET /offers/:id`
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: `@Roles(SUPPLIER, ADMIN, OWNER, MODERATOR)` with no ownership check (`backend/src/offers/offers.controller.ts:59-63`). `findById` includes the other supplier's `name`, `email`, `companyName` and the offer price (`backend/src/offers/offers.service.ts:330-338`).
- Expected behavior: Suppliers get only their own offers.
- Evidence: as above.
- Impact: Competitor supplier identity and prices are exposed.
- Dependencies & risks: None.
- Recommended future task: Add an ownership check (`offer.supplierId === req.user.sub` unless staff).
- Requires: Backend
- Boundary: Approval-required

### SUP-13
**`/finance/*` endpoints have no role restriction (warehouses, credit terms, audit, reports)**
- Area / page / workflow: `backend/src/finance/finance.controller.ts`
- Category: Security or permissions gap
- Severity: Critical
- Status: Confirmed
- Current behavior: The class has `@UseGuards(JwtAuthGuard, RolesGuard)` but no class-level `@Roles` (`:15-16`). `RolesGuard` allows any authenticated user when no roles are set (`backend/src/auth/roles.guard.ts:14-16`). So any buyer or supplier can list every supplier's warehouse addresses and create, update or delete any warehouse (`:122-141`; service `finance.service.ts:118-148` has no ownership checks). They can also read credit terms, credit checks, audit trails and revenue reports, and trigger report emails (`:45-56`, `:59-170`). `reports/supplier-earnings` computes "net" from buyer `OrderItem.price × (1 − 5%)` (`finance.service.ts:208-233`), a third earnings formula alongside SUP-02 and the Overview.
- Expected behavior: Staff-only by default, with supplier-scoped warehouse endpoints.
- Evidence: as above.
- Impact: Data exposure and tampering across all suppliers.
- Dependencies & risks: Admin pages that call these endpoints need staff roles (audit-tx area).
- Recommended future task: Add class-level `@Roles(ADMIN, OWNER, …)`, then add supplier-scoped warehouse CRUD.
- Requires: Backend
- Boundary: Approval-required

### SUP-14
**Supplier can link a product to any warehouse; the link counts as a "verified" dispatch site; no warehouse UI**
- Area / page / workflow: Product editor / mixed-load origin
- Category: Security or permissions gap / Missing UI
- Severity: Medium
- Status: Confirmed
- Current behavior: `warehouseId` is on the supplier edit allow-list (`backend/src/products/products.service.ts:1682-1684`) and is written without an ownership check (`:1167`). `loadOrigin` treats any linked warehouse as a known site (`backend/src/orders/pricing.ts:276-279`, VERIFIED per `:267`). `Warehouse` has no verified flag (`schema.prisma:737-751`). No supplier UI manages warehouses (only the open `/finance/warehouses`, SUP-13).
- Expected behavior: Suppliers manage only their own warehouses. "Verified" requires an Atlantis check.
- Evidence: as above.
- Impact: Mixed-load origin checks can be spoofed.
- Dependencies & risks: SUP-13; additive `verified` field.
- Recommended future task: Validate warehouse ownership. Add a verified flag (additive) and a supplier warehouse page.
- Requires: Backend, DB, UI
- Boundary: Approval-required

### SUP-15
**Placements API: hardcoded placeholder prices and no product ownership check**
- Area / page / workflow: `POST /placements/request`
- Category: Security or permissions gap / Missing backend/system
- Severity: Medium
- Status: Confirmed
- Current behavior: Price comes from the hardcoded placeholder `PricingService` ("Placeholder: base price is $10", HERO $50/day …) (`backend/src/pricing/strategies.ts:3-32`, `pricing.service.ts:13-32`). Any supplier can request a placement for any `productId` (`backend/src/products/placement.controller.ts:22-30`). The history row is written with `changedById: 'SYSTEM'` (`placement.service.ts:28`). There is no supplier UI (`/supplier/offers` is "Coming soon", `frontend/src/app/supplier/offers/page.tsx:1-58`). Dead links point at `/supplier/placements`: old `Sidebar.tsx:35` and `frontend/src/app/marketing/page.tsx:157`. `pricing.strategies.ts` is a second unused set of placeholder rates.
- Expected behavior: Endpoint disabled or ownership-checked until ads billing exists. No dead links.
- Evidence: as above.
- Impact: Fake prices stored on records; cross-supplier writes.
- Dependencies & risks: Ads/billing decision.
- Recommended future task: Guard the endpoint (ownership + feature flag). Remove the dead links.
- Requires: Backend, UI, Policy decision
- Boundary: Link removal: Safe-to-implement-now. Endpoint: Approval-required.

### SUP-16
**Supplier order notifications aren't clickable; the NEW_ORDER mapping is dead and points to a 404**
- Area / page / workflow: Notification bell (supplier)
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: Notifications are stored with type `INFO|SUCCESS|WARNING|ERROR` only (`backend/src/notifications/notifications.service.ts:5`). New-order notifications go out as `'INFO'` with `{orderId}` (`backend/src/orders/orders.service.ts:446-452`, `:1040`, `:1104`, `:1410-1416`). `getNotificationLink` returns `null` for INFO (`frontend/src/components/ui/NotificationBell.tsx:13-42`). Its `NEW_ORDER` branch links to `/dashboard/supplier/orders`, which doesn't exist (`:20-21`). Low-stock warnings link to `/supplier/products?highlight=<id>` (`:28`), but the products page ignores `highlight` (`frontend/src/app/supplier/products/page.tsx:37-43`).
- Expected behavior: For a supplier, `data.orderId` → `/supplier/orders?view=all&q=<ref>`; `data.productId` → `/supplier/products/<id>/edit`.
- Evidence: as above.
- Impact: "New order — please confirm" can't be acted on from the bell.
- Dependencies & risks: The bell is shared by all roles. Branch on `user.role`.
- Recommended future task: Role-aware link mapping using `data.orderId` / `data.productId`.
- Requires: UI
- Boundary: Safe-to-implement-now

### SUP-17
**Dead link on the Fulfilment page**
- Area / page / workflow: `/supplier/fulfillment` preview
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: "Edit product" goes to `/supplier/products/${id}` (`frontend/src/app/supplier/fulfillment/page.tsx:236`). Only `/supplier/products/[id]/edit` exists.
- Expected behavior: Link to `/supplier/products/${id}/edit`.
- Evidence: `frontend/src/app/supplier/products/[id]/` contains only `edit/`.
- Impact: 404.
- Dependencies & risks: none.
- Recommended future task: Fix the href.
- Requires: UI
- Boundary: Safe-to-implement-now

### SUP-18
**Analytics page: mislabelled and unordered figures, a different currency basis from the Overview, errors shown as "no data"**
- Area / page / workflow: `/supplier/analytics` (hidden from the nav, reachable by URL)
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: "Conversion Rate" is delivered ÷ non-cancelled orders (`backend/src/orders/orders.service.ts:1537-1547`), labelled "placed → delivered" (`frontend/src/app/supplier/analytics/page.tsx:72-77`). "Orders Placed" counts every status, including PENDING, while revenue counts only confirmed orders (`orders.service.ts:1500-1503`, `:1537`). Monthly buckets keep the order in which orders were iterated, and the `findMany` has no `orderBy` (`:1479-1491`, `:1521-1528`), so months can plot out of order. Each top product's `orders` is the sum of unit quantities (pallets/trucks), displayed as "pcs" (`analytics/page.tsx:263`). Amounts use `formatPrice` (converted to the display currency), while the Overview states EUR (`frontend/src/app/supplier/page.tsx:68`). The page claims "Real-time" (`:100`). The always-green `ArrowUpRight` suggests growth (`:155`). Fetch errors show "No analytics data yet" (`:50`, `:132-136`).
- Expected behavior: The same definitions as the Business Overview (which already covers these metrics). Otherwise retire the page.
- Evidence: as above.
- Impact: Numbers disagree between pages.
- Dependencies & risks: none.
- Recommended future task: Redirect `/supplier/analytics` to `/supplier`, or fix labels and add an error state.
- Requires: UI (Backend only to sort the months)
- Boundary: Safe-to-implement-now (redirect or labels). Backend sort: Approval-required.

### SUP-19
**Orphan legacy pages are reachable by URL but not in the nav, and duplicate or contradict the new workspace**
- Area / page / workflow: `/supplier/earnings`, `/supplier/analytics`, `/supplier/payment-methods`, `/supplier/settings/payout`, `/supplier/wholesale-offers`, `/supplier/offers`
- Category: Broken or inconsistent behavior
- Severity: Medium
- Status: Confirmed
- Current behavior: Removed from the menu on purpose ("pages and APIs still exist, so old links keep working", `frontend/src/app/supplier/layout.tsx:39-50`). They use an older visual style, aren't localized, and carry the false claims listed in SUP-02, SUP-03 and SUP-18. Two payout UIs (`payment-methods`, `settings/payout`) overlap. The payment-methods page shows a greyed "Credit / Debit Card — Tokenized via Stripe / Fawry — Coming Soon" card (`payment-methods/page.tsx:355-368`). Wholesale offers works against real endpoints (`wholesale-offers/page.tsx:74-75`, `:208`, `:232`, `:253`; `backend/src/offers/offers.controller.ts:19-80`) but is not linked anywhere except from the `/supplier/offers` "Coming soon" page (`offers/page.tsx:47-53`).
- Expected behavior: Either linked and correct, or redirected to the right current page.
- Evidence: as above.
- Impact: Confusing, inconsistent and partly false information.
- Dependencies & risks: Product decision on wholesale offers.
- Recommended future task: Redirect earnings, analytics, payment-methods and payout to `/supplier` or `/supplier/settings` until payouts exist. Decide whether wholesale offers belong in the nav.
- Requires: UI, Policy decision
- Boundary: Redirects: Safe-to-implement-now. Re-linking wholesale offers: Approval-required.

### SUP-20
**`/auth/partner` drops the supplier role; `/auth/onboarding` is unreachable and drops its fields**
- Area / page / workflow: Supplier registration
- Category: Broken or inconsistent behavior
- Severity: Low
- Status: Confirmed
- Current behavior: `/auth/partner` redirects to `/auth/register` with no `?role=supplier` (`frontend/src/app/auth/partner/page.tsx:5`), even though the register page supports it (`frontend/src/app/auth/register/page.tsx:54-63`) and the footer uses it (`Footer.tsx:33`). `/auth/onboarding` posts `address` to `POST /users/:id` (`frontend/src/app/auth/onboarding/page.tsx:52-55`); `address` isn't in the allow-list, so it is dropped (`backend/src/users/profile-fields.ts:18-42`). Pending users are pushed off `/auth/*` pages other than pending/complete-profile (`frontend/src/components/layout/ClientLayout.tsx:29-33`). Login is blocked while `PENDING_APPROVAL` (`backend/src/auth/auth.service.ts:146-150`). Nothing links to `/auth/onboarding`.
- Expected behavior: Partner link pre-selects Supplier. The onboarding page is removed or redirected to `/auth/complete-profile`.
- Evidence: as above.
- Impact: Small funnel friction; a dead page.
- Dependencies & risks: none.
- Recommended future task: Use `redirect('/auth/register?role=supplier')`. Redirect `/auth/onboarding` → `/auth/complete-profile`.
- Requires: UI
- Boundary: Safe-to-implement-now

### SUP-21
**Supplier workspace is English-only, although it offers a language picker**
- Area / page / workflow: All `/supplier/*` pages
- Category: Localization/accessibility gap
- Severity: Medium
- Status: Confirmed
- Current behavior: `useLanguage` is used only by the language picker in the layout (`frontend/src/app/supplier/layout.tsx:388-389`). Navigation labels, page copy, toasts and the tour are hardcoded English (`layout.tsx:43-50`, `:108-118`, `:244`, `:268`; `frontend/src/app/supplier/page.tsx` has no `t()` calls). Choosing Arabic flips to RTL, but the mobile drawer is pinned with `left-0` and animates from `x:-260` (`layout.tsx:338-341`). The layout renders an `<h1>Business Hub</h1>` (`:268`) as well as each page's own heading. The guided-tour targets `tour-inventory` / `tour-revenue` (`:108-118`) exist nowhere in the DOM. The fallback user name is the placeholder 'Monjez Vendor' (`:305`). The UserMenu labels every supplier "Sold by Atlantis" (`verifiedSupplier` key; `frontend/src/components/dashboard/UserMenu.tsx:57`, `frontend/src/locales/en.ts:661`).
- Expected behavior: Locale keys in `en.ts`/`ar.ts`, logical RTL positioning, one h1 per page, a working or removed tour.
- Evidence: as above.
- Impact: The non-English and RTL supplier experience is broken or inconsistent.
- Dependencies & risks: `check:i18n` requires `ar.ts` parity.
- Recommended future task: Localize the supplier shell first (nav, header, tour), then the pages.
- Requires: UI
- Boundary: Safe-to-implement-now (presentation and strings; must add keys to every locale)

### SUP-22
**Variant stock is a separate counter: not decremented by orders, not logged, signatures not validated**
- Area / page / workflow: `/supplier/inventory` variant +/-
- Category: Data-model limitation
- Severity: Medium
- Status: Confirmed
- Current behavior: `setVariantStock` writes `Product.variantStock[signature]` with no check that the signature exists, no `ProductChangeLog` entry and no sync with `Product.stock` (`backend/src/products/products.service.ts:1465-1486`). Orders decrement `Product.stock` only. The schema comment says variant-aware decrement is a follow-up (`backend/prisma/schema.prisma:216-229`). The UI presents variant counts as real stock (`frontend/src/app/supplier/inventory/page.tsx:42-50`, `:128-138`).
- Expected behavior: One stock truth. Variant stock either drives availability or is labelled informational.
- Evidence: as above.
- Impact: Buyers can order variants the supplier set to 0, and inventory figures disagree.
- Dependencies & risks: Order/stock code (`stock-ledger.ts`).
- Recommended future task: Label variant stock "for your reference — orders use total stock", then build variant-aware reservation.
- Requires: UI (label), Backend
- Boundary: Label: Safe-to-implement-now. Logic: Approval-required.

### SUP-23
**Revoked or blocked suppliers keep API access until their token expires**
- Area / page / workflow: Auth (all supplier endpoints)
- Category: Security or permissions gap
- Severity: Medium
- Status: Confirmed
- Current behavior: `JwtStrategy.validate` checks sessions and `tokensValidAfter` but not `User.status` (`backend/src/auth/jwt.strategy.ts:28-51`). Status is enforced only at login (`auth.service.ts:146-160`) and by the client-side redirect (`ClientLayout.tsx:43-50`).
- Expected behavior: BLOCKED, REJECTED or DELETED status (or a role change) invalidates access.
- Evidence: as above.
- Impact: A blocked supplier can keep editing listings or answering orders.
- Dependencies & risks: Caching in the strategy; cross-cutting.
- Recommended future task: Include status in the cached user lookup and reject non-ACTIVE users, or revoke sessions on block.
- Requires: Backend
- Boundary: Approval-required

### SUP-24
**Catalog responses expose supplier identity to buyers (cross-area note)**
- Area / page / workflow: `GET /products`, `GET /products/:id`
- Category: Security or permissions gap
- Severity: High
- Status: Confirmed
- Current behavior: `findAll` includes `supplier {id,name,email,companyName,role}` on every product for any signed-in caller (`backend/src/products/products.service.ts:506`, `:536-540`). `ProductDto` exposes `supplierId` publicly (`backend/src/common/dtos/base.dto.ts:120-128`). The interceptor rewrites prices for buyers correctly (`price-privacy.ts:40-47`) but leaves supplier identity alone. Supplier owners correctly get their own `basePrice` (`price-privacy.ts:33-38`).
- Expected behavior: Buyers never see supplier ids or contacts (CLAUDE.md).
- Evidence: as above.
- Impact: Suppliers can be contacted directly, bypassing Atlantis. Belongs to the buyer audit, but it is a supplier-protection issue.
- Dependencies & risks: The PDP owner check relies on `supplierId` (`base.dto.ts:120-126`). Replace it with a server-computed `isMine` flag.
- Recommended future task: Strip `supplier`/`supplierId` for non-staff, non-owner viewers in the interceptor. Add `viewerOwns`.
- Requires: Backend
- Boundary: Approval-required

### SUP-25
**Orders list is unbounded; no supplier order detail route**
- Area / page / workflow: `/supplier/orders`
- Category: Incomplete integration
- Severity: Low
- Status: Confirmed
- Current behavior: `findBySupplier` loads every order with no pagination (`backend/src/orders/orders.service.ts:713-727`; controller ignores `page`/`limit` for suppliers at `orders.controller.ts:174-176`). `GET /orders/:id` returns 403 for suppliers (`orders.controller.ts:201-211`), so Overview "recent order" links do a client-side search instead (`frontend/src/app/supplier/page.tsx:186`).
- Expected behavior: Paginated list and a supplier-scoped detail endpoint.
- Evidence: as above.
- Impact: Slows down as order volume grows.
- Dependencies & risks: none.
- Recommended future task: Pagination plus `GET /orders/:id/supplier-view`.
- Requires: Backend, UI
- Boundary: Approval-required

---

## CNT — Support, notifications, content and policies (31)

### CNT-01
**The Terms of Service promise Stripe escrow, but the rest of the site says there is none**
- Area / page / workflow: `/terms` (legal). Payment and settlement.
- Category: Policy-only behavior
- Severity: Critical. Status: Confirmed.
- Current behavior: The Terms describe a Stripe escrow that holds funds until the buyer confirms delivery:
  - FE `app/terms/TermsClient.tsx:21` "Secure order placement and payment via Stripe escrow"
  - `:68` "confirming delivery triggers the release of escrow funds to the Supplier"
  - `:76` "payment is held in escrow (Stripe manual capture) until the buyer confirms delivery"
  - `:78` "Upon delivery confirmation, Atlantis releases payment to the Supplier minus the Platform Commission fee"
  - `:100` "…or release of escrow to the Supplier"
  - `:136` "Outstanding orders and escrow transactions…"
  - `:55` suppliers must "Maintain a connected Stripe account"

  Other pages say the opposite:
  - FE `app/protected-payments/ProtectedPaymentsClient.tsx:11-12` (code comment) "Atlantis does not hold buyer funds"
  - `:68` "Atlantis doesn't hold funds"
  - `:237` "No. Atlantis doesn't hold buyer funds in escrow or a holding account."
  - `:238` "The Atlantis team sends payment details… Placing an order charges nothing."
  - FE `locales/en.ts:974-975` "No escrow — Atlantis doesn't hold payments in escrow."

  In code, an escrow path partly exists:
  - BE `payments/payments.service.ts:197-202` (`capture_method: 'manual'`)
  - `payments/escrow.service.ts:58` `releaseEscrow`

  However, `releaseEscrow` has **no callers** (grep). `confirmDelivery` (BE `orders/orders.service.ts:1682-1696`) only sets DELIVERED. The card flow at FE `app/checkout/payment/page.tsx` is not linked from checkout. Checkout itself says "nothing is charged" (FE `app/checkout/page.tsx:597`).
- Expected behavior: Terms, Privacy and the payment pages state one payment model that matches the code. Per CLAUDE.md, the site must not claim escrow or held funds.
- Evidence: see above.
- Impact: This is a legal contradiction. The binding document promises fund-holding and automatic release, which the business does not provide. It creates regulatory exposure (holding client funds) and gives a basis for disputes.
- Dependencies & risks: The decision on whether the Stripe manual-capture flow stays (audit-tx owns payments). Stripe authorizations expire after about 7 days, so "held until delivery" could not be honored anyway.
- Recommended future task: Rewrite Terms §2, §5, §6, §7, §9 and §12 around "confirmed terms, then payment details sent by Atlantis". Remove the escrow and commission-release language. Re-date the Terms and notify users per §14.
- Requires: Policy decision + UI (copy). Legal review.
- Boundary: Policy decision required.

### CNT-02
**The Privacy Policy misstates token lifetime, escrow and processors**
- Area: `/privacy-policy`
- Category: Policy-only behavior
- Severity: High. Status: Confirmed.
- Current behavior:
  - FE `app/privacy-policy/PrivacyClient.tsx:35` "process orders, payments and escrow transactions".
  - `:88` "short-lived access tokens (15 minutes)". The real lifetime is 30 days for the JWT and 30d/90d for the cookies: BE `auth/auth.module.ts:37` `expiresIn: '30d'`, `auth/auth.controller.ts:50-51,67-68,169-170`.
  - The processor list `:45-49` names only Stripe, Supabase ("for KYC documents"), Hostinger, Railway and Vercel. It leaves out:
    - Resend, the primary mail provider: BE `email/email.service.ts:105-110`.
    - OpenRouter / Google models, which receive account facts, chat history and user screenshots: BE `support/support-assistant.service.ts:11,137-173` and `chat/bot.service.ts:8,68-82`. Page text is also sent to the LLM translator: FE `lib/auto-translate.ts:1-6`.
    - Google sign-in (the auth Google flow).
    - Email open and click tracking in offer emails: BE `offers/offers.service.ts:425-433` (tracking pixel and wrapped links).
  - Supabase also stores support screenshots and review photos (BE `support/support-assistant.service.ts:78`, `products/reviews.service.ts:57`), not only KYC files.
  - `:19` mentions a "selfie/liveness check". No liveness implementation exists in BE (grep finds "liveness" only in FE copy and admin screens).
  - `:10,118` give the platform domain as `marketpl7ce.vercel.app`, while emails use `atlantisfmcg.com` (BE `email/email.service.ts:105`).
- Expected behavior: The policy lists every processor and AI data flow, gives the correct session lifetimes and the canonical domain, and drops escrow.
- Impact: GDPR transparency gap. Personal data and screenshots go to an undisclosed AI processor.
- Recommended future task: Update §2, §3, §4, §7 and §11. Decide the DPA/SCC position for OpenRouter. Add AI-assistant disclosure text in the Support UI.
- Requires: Policy decision (legal) + UI copy.
- Boundary: Policy decision required.

### CNT-03
**The Cookie Policy table doesn't match the cookies and storage actually used**
- Area: `/cookie-policy`, cookie banner
- Category: Policy-only behavior
- Severity: Medium. Status: Confirmed.
- Current behavior: FE `app/cookie-policy/CookieClient.tsx` says:
  - `:13` `token` lasts "15 minutes". It is actually 30 days (BE `auth/auth.controller.ts:50`).
  - `:14` `refreshToken` lasts "7 days". It is actually 90 days (`:51`).
  - `:23` `atlantis-locale` "(English/Arabic)". The locale is actually kept in localStorage under `app-locale` (FE `contexts/LanguageContext.tsx:9,68`), and the UI has seven languages.
  - `:25` `atlantis-cookie-consent` is listed as a cookie. It is actually localStorage (FE `components/CookieConsent.tsx:8,19,24`).

  Undisclosed storage: the auto-translate cache in localStorage (FE `lib/auto-translate.ts:28`). The consent choice is not read by anything. No analytics code is gated on it (grep for `atlantis-cookie-consent` outside the banner and policy returns nothing).
- Expected behavior: The table reflects the real cookies and storage keys, and declining has a defined effect.
- Recommended future task: Regenerate the cookie table from the code. If no non-essential storage exists, say so plainly.
- Requires: UI copy (plus a decision on whether analytics will exist).
- Boundary: Safe-now (copy) for the factual table. Policy decision for consent semantics.

### CNT-04
**The "order placed" email calls a request "Order Confirmed" and shows "$"**
- Area: Transactional email at order submission
- Category: Broken or inconsistent behavior
- Severity: High. Status: Confirmed.
- Current behavior: BE `orders/orders.service.ts:433-440` sends `sendOrderConfirmationEmail` immediately on submit. BE `email/email.service.ts`:
  - `:324` subject "✅ Order Confirmed #…"
  - `:332` "Order Confirmed ✅"
  - `:335` "Total: $${total}". The marketplace is EUR.
  - `:324/:334` use `orderId.slice(0, 8)`. The UI and notifications use `slice(-8)` (e.g. `orders.service.ts:449`), so the email reference doesn't match the order number the buyer sees.

  This contradicts the workflow: an order is only a request until every supplier accepts and Atlantis approves (CLAUDE.md; FE `ProtectedPaymentsClient.tsx:239`).
- Expected behavior: "Order request received #<last 8>", total in EUR excluding VAT, and an explanation that nothing is charged and the order is not yet confirmed.
- Recommended future task: Rewrite the template. Use one shared `orderRef()` helper for emails.
- Requires: Backend (template copy).
- Boundary: Safe-now (copy).

### CNT-05
**Status emails and Stripe-webhook messages claim payment, confirmation and escrow**
- Area: Status-change emails; payment webhook
- Category: Policy-only behavior
- Severity: High. Status: Confirmed (copy). The webhook path is reachable only if the card flow is used.
- Current behavior:
  - BE `email/email.service.ts:353`: PAID means "Your payment has been received and your order is now confirmed. The supplier is preparing your shipment." This goes out from any status change (`orders/orders.service.ts:1369`).
  - BE `payments/stripe-webhook.controller.ts:157-160` tells the buyer "has been confirmed and payment received."
  - `:180` tells the supplier "The funds are held securely in escrow."
  - BE `email/email.service.ts:645`: after DELIVERED (including after the buyer confirmed it), the feedback email asks the buyer to "confirm delivery and rate your experience". That is already done, and there is no rating flow in the dashboard link.
- Expected behavior: Status copy follows the order-workflow states. No escrow wording.
- Recommended future task: Rewrite the status-email map against `backend/src/orders/order-workflow.ts` labels. Send the feedback email only once, linking to the product review section.
- Requires: Backend copy.
- Boundary: Safe-now (copy). Escrow removal follows CNT-01.

### CNT-06
**Supplier notification and email reveal the buyer's total (Stripe webhook)**
- Area: Payment webhook notifications
- Category: Security or permissions gap
- Severity: High. Status: Confirmed in code. Reachable whenever a Stripe `payment_intent` webhook fires.
- Current behavior: BE `payments/stripe-webhook.controller.ts:145-150` builds `amount` from `intent.amount`, which is the buyer total including the Atlantis margin. It sends this in the supplier's in-app notification "Order #… — {amount}" and in the supplier email (`:178` "(${amount})").
- Expected behavior: Suppliers never see the buyer price (CLAUDE.md product rule). Show only the supplier's own lines and net value, or no amount.
- Recommended future task: Remove `amount` from the supplier messages, or replace it with the supplier net sum. Add a test.
- Requires: Backend.
- Boundary: Safe-now (code). Coordinate with audit-tx.

### CNT-07
**The public contact form can inject messages into any user's support thread, and its email HTML is unescaped**
- Area: `/contact` → BE `POST /contact`
- Category: Security or permissions gap
- Severity: High. Status: Confirmed.
- Current behavior:
  - Unauthenticated. The email address comes from the request body. If it matches a registered user, the message is stored with `senderId = that user` in their support thread (BE `app.controller.ts:144-160`). Anyone can therefore plant text that appears in a user's Support Assistant tab as if they wrote it, and that text is fed to the AI as history (`support/support-assistant.service.ts:39-46,160-164`).
  - Unknown senders are stored with `senderId = the first OWNER/ADMIN` (`app.controller.ts:161-174`). This pollutes that admin's own assistant thread and makes the admin appear as a "user conversation" in `/admin/support`.
  - `name`, `email`, `company`, `topic` and `message` are interpolated raw into the HTML email (`:115-131`), allowing HTML/link injection into staff inboxes.
  - No `@MaxLength` (`:9-15`). Only the global throttler applies.
  - The form does deliver: it emails `EMAIL_USER`/Info@ (`:135-139`) and creates staff notifications (`:179-190`).
- Expected behavior: Public submissions go to a separate "contact inquiry" store, or are attached to a user only when the user is signed in (OptionalJwt). Fields are escaped and length-capped.
- Recommended future task: Use the authenticated user id when present, otherwise a separate inquiry record. Add HTML escaping and `MaxLength`. Add a stricter `@Throttle`.
- Requires: Backend (+ an additive DB model if a separate inquiry store is chosen).
- Boundary: Safe-now (escaping, limits). Approval-required if a new model is added (additive schema).

### CNT-08
**The contact page promises "within 24 business hours", which nothing enforces**
- Area: `/contact`
- Category: Policy-only behavior
- Severity: Low. Status: Confirmed.
- Current behavior: FE `app/contact/ContactClient.tsx:33` "Response Time: Within 24 business hours" and `:140` "We'll get back to you… within 24 business hours." There is no SLA tracking, no assignment and no auto-acknowledgement email to the sender.
- Recommended future task: Use "We'll reply by email" unless the business commits to an SLA.
- Requires: Policy decision.
- Boundary: Policy decision required.

### CNT-09
**The staff support console mixes order-thread messages into general support conversations**
- Area: `/admin/support` (general conversations), BE chat service
- Category: Broken or inconsistent behavior
- Severity: Medium. Status: Confirmed.
- Current behavior: Order messages are stored with `receiverId: null` (BE `chat/chat.service.ts:237`). The general-support queries filter only on `receiverId: null`, without `orderId: null`:
  - `getConversationsWithStatus` (`:401,407-414,420-421`)
  - `getMessagesForUser` (`:174-179`, used by `GET /chat/messages` and `GET /chat/admin/messages/:userId`)
  - `switchToHuman`/`switchToAI` (`:354-357,377-380`)

  As a result:
  - buyers and suppliers who only wrote in an order thread appear in the general queue;
  - staff members who replied in order threads appear as "users";
  - unread counts include order messages;
  - the staff view of a user's general conversation shows their order messages inline.

  The assistant itself filters correctly (`support/support-assistant.service.ts:41`).
- Expected behavior: General support = `orderId: null`. Order threads stay in "Order conversations".
- Recommended future task: Add `orderId: null` to those queries. Add a test.
- Requires: Backend.
- Boundary: Safe-now (code).

### CNT-10
**"Ask the Atlantis team" doesn't reach a visible staff queue and doesn't pause the AI**
- Area: Support escalation to humans
- Category: Incomplete integration
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - `escalate` sets `assignedTeam: 'SUPPORT'` on the user's messages and creates in-app notifications for up to 20 ADMIN/SUPPORT/OWNER users (BE `support/support-assistant.service.ts:120-132`).
  - The staff console list (`chat/chat.service.ts:439-446`) returns neither `assignedTeam` nor an "escalated" flag. FE `app/admin/support/page.tsx` and `components/chat/SupportChat.tsx` never read it, so escalated conversations look like every other one.
  - `isHandedOver` is not set on escalation, so the AI keeps answering until a staff member clicks "switch to human".
  - Staff notifications are written with raw `prisma.notification.create` (`:131`), which bypasses the socket push (`notifications/notifications.service.ts:21-26`). Staff learn about it only on their next poll or page load.
  - No email goes to staff, and none goes to the user when staff reply.
  - The UI promises "A person will reply in this conversation, and you'll get a notification" (FE `components/support/AssistantPanel.tsx:161`). The in-app notification part is true (`chat/chat.service.ts:48-55`).
- Expected behavior: Escalated threads are flagged and sorted first in the console, the AI pauses (or clearly says a person was asked), and staff are notified in real time.
- Recommended future task: Expose `escalated`/`assignedTeam` in `getConversationsWithStatus` and add a filter or badge in the admin UI. Route `notifyStaff` through `NotificationsService.create`. Optionally email the support inbox.
- Requires: Backend + UI.
- Boundary: Safe-now.

### CNT-11
**The legacy chat endpoints are still open to every user: inline images, no context limits, OWNER missing from the support room**
- Area: BE `POST /chat/send`, socket `send_message`, socket `mark_read`
- Category: Security or permissions gap
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - Any signed-in user can still post to the legacy path. FE no longer uses it for buyers or suppliers, only for admins (FE `components/chat/SupportChat.tsx:201,259`).
  - It triggers the old `BotService`. That service sends the last 5 orders, including `totalAmount`, to OpenRouter with no permission-checked context (BE `chat/chat.service.ts:59-81`, `chat/bot.service.ts:16-18,62-82`). Its replies land in the same thread as the new assistant's replies.
  - `imageUrl` is accepted as an arbitrary string or data URL and stored inline in the DB. There is no type, size or ownership check (`chat/chat.service.ts:31-37`; the new assistant enforces these at `support/support-assistant.service.ts:94-98`).
  - The socket path has no throttle (`chat/chat.gateway.ts:76-87`).
  - `mark_read` calls `markAsRead(ids)` without a user id, so it never matches anything (`:128`; `chat.service.ts:191-196`).
  - OWNER is not joined to `support-room` (`:57`).
  - Staff images from `SupportChat` are sent as data URLs (FE `components/chat/SupportChat.tsx:219-224`).
- Expected behavior: Non-staff traffic goes only through `/support-assistant/*`. Staff images use the attachment upload.
- Recommended future task: Restrict `/chat/send` and the socket `send_message` to staff, or route non-staff to `SupportAssistantService.message`. Validate `imageUrl`. Fix `mark_read`. Add OWNER to the support room.
- Requires: Backend (+ small admin UI change for uploads).
- Boundary: Safe-now (code).

### CNT-12
**Handover system messages are hard-coded in Arabic**
- Area: Staff "switch to human/AI"
- Category: Localization/accessibility gap
- Severity: Low. Status: Confirmed.
- Current behavior: BE `chat/chat.service.ts:364` "✅ تم تحويل المحادثة إلى أحد أعضاء فريق الدعم…" and `:387` "🤖 تم إعادة تفعيل مساعد الذكاء الاصطناعي…" are sent to every user regardless of language.
- Recommended future task: Use the user's locale, or neutral English plus a UI-rendered system event.
- Requires: Backend (+ i18n keys).
- Boundary: Safe-now.

### CNT-13
**The notification bell never navigates for real notifications**
- Area: `NotificationBell`, `/dashboard/customer/notifications`
- Category: Broken or inconsistent behavior
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - `getNotificationLink` switches on `n.type` with NEW_ORDER/NEW_REVIEW/KYC_SUBMITTED/NEW_REGISTRATION (FE `components/ui/NotificationBell.tsx:13-33`). The backend only ever stores INFO/SUCCESS/WARNING/ERROR (BE `notifications/notifications.service.ts:5`), so those branches never fire.
  - The link that services do put in `data.link` is ignored, e.g. BE `chat/chat.service.ts:248`, `lists/list-reminders.service.ts:38`, `products/reviews.service.ts:87`.
  - `data.orderId` is ignored as well.
  - The NEW_ORDER target `/dashboard/supplier/orders` doesn't exist (FE `NotificationBell.tsx:21`).
  - The customer notifications page has no click-through at all, hard-coded English, and an `en-US` date format (FE `app/dashboard/customer/notifications/page.tsx:25-26,45-46,70`).
- Expected behavior: Clicking a notification opens `data.link`, or a role-appropriate order page from `data.orderId`.
- Recommended future task: Rewrite `getNotificationLink` to prefer `data.link`, then `data.orderId` (by role), then `data.productId`. Localize the notifications page.
- Requires: UI.
- Boundary: Safe-now.

### CNT-14
**Many notifications are written straight to the DB and skip the real-time push**
- Area: Notifications delivery
- Category: Incomplete integration
- Severity: Low. Status: Confirmed.
- Current behavior: These call sites use `prisma.notification.create` directly, so no `new_notification` socket event fires (only `NotificationsService.create` pushes, BE `notifications/notifications.service.ts:21-26`):
  - BE `chat/chat.service.ts:48,111,242,254`
  - `support/support-assistant.service.ts:131`
  - `app.controller.ts:184`
- Recommended future task: Inject `NotificationsService` into ChatModule/SupportModule/AppController. Watch for a circular dependency, since NotificationsService depends on ChatGateway.
- Requires: Backend.
- Boundary: Safe-now.

### CNT-15
**Server notifications, emails and the support UI are English-only in a seven-language interface**
- Area: Notification and email content; Support Center
- Category: Localization/accessibility gap
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - All notification titles and messages and all transactional emails are English strings built on the server, e.g. BE `orders/orders.service.ts:446-452,1013-1015` and `email/email.service.ts:321-660`. Only `sendRegistrationConfirmationEmail` takes a locale (`:837`), and it has no callers.
  - The support UI is hard-coded English: FE `components/support/SupportCenter.tsx:40-56`, `components/support/AssistantPanel.tsx:161,228-229,304-311` (`t(` is used only 1–2 times per file).
- Recommended future task: Store notification keys + params and render them on the client, or localize on the server using the user's saved locale. Move the support copy into `locales/*.ts`.
- Requires: Backend + UI + i18n.
- Boundary: Safe-now (UI keys). Approval-required for the notification storage shape (additive).

### CNT-16
**Unsubscribe: every email (including security codes) carries a one-click header that doesn't work, and email-only unsubscribe is unauthenticated**
- Area: Email headers, `/unsubscribe`, newsletter
- Category: Broken or inconsistent behavior
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - `sendMailDetailed` adds `List-Unsubscribe: <FRONTEND/unsubscribe?email=…>` plus `List-Unsubscribe-Post: One-Click` to every message (BE `email/email.service.ts:105,125-126,180-181`). This includes password resets and codes.
  - RFC 8058 one-click sends a POST to that URL. The URL is a client-side Next page (FE `app/unsubscribe/page.tsx`) with no route handler, so the POST unsubscribes nobody.
  - `POST /newsletter/unsubscribe` with only `email` unsubscribes, or pre-creates as UNSUBSCRIBED, any address (BE `newsletter/newsletter.service.ts:85-96`).
  - `docs/email-notifications.md:79-84` already records the header issue.
  - That doc (`:3,52`) also says marketplace notifications are "a design only… nothing… built". In fact approved offers are emailed to subscribers and opted-in users, with open/click tracking (BE `offers/offers.service.ts:384-440`). Target-price answers (`products/target-prices.service.ts:174`) and review emails (`products/reviews.service.ts:91`) are also live.
- Expected behavior: No unsubscribe header on transactional mail. A working signed-token POST endpoint. Docs that match reality.
- Recommended future task: Add an `unsubscribeUrl: null` option for transactional sends. Add a Next `route.ts` (or a backend URL) that accepts the POST with a token. Update `docs/email-notifications.md`.
- Requires: Backend + UI route + docs.
- Boundary: Safe-now (docs). Code change is Approval-required, because it affects all outgoing mail (as the doc notes).

### CNT-17
**Reviews are real, but anyone signed in can review and reviewer identities are public**
- Area: `ReviewSection`, BE `/products/:id/reviews`, `/admin/reviews`
- Category: Data-model limitation / Policy-only behavior
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - Ratings are genuine aggregates of `Review` rows (BE `products/reviews.service.ts:135-141`; FE `components/product/ReviewSection.tsx:177`).
  - "Verified purchase" is computed from DELIVERED orders (`:40-45`).
  - However, no purchase is required, and suppliers (other than the product owner) and staff can review (`:15-17,48-52`).
  - Reviews publish immediately with no moderation queue (`:20-21`). Admin deletion exists (`reviews.controller.ts:55-77`).
  - `GET /products/:id/reviews` is public and returns each reviewer's `id`, `name`, `companyName` and `avatar` (`reviews.service.ts:8,33-37`). Suppliers, competitors and anonymous visitors can therefore identify buyer companies.
  - The NEW_REVIEW bell link never fires (CNT-13).
- Expected behavior: A business decision on review eligibility, and on whether buyer identities are shown to suppliers and the public. At minimum, don't expose user ids.
- Recommended future task: Drop `id` from the public select. Decide display-name rules (e.g. "Verified buyer, RO"). Optionally require a delivered purchase or add moderation.
- Requires: Policy decision + Backend.
- Boundary: Safe-now (remove `id`). Policy decision for eligibility and identity.

### CNT-18
**The Returns page's "Orders & tracking" link opens Support instead**
- Area: `/returns`
- Category: Broken or inconsistent behavior
- Severity: Low. Status: Confirmed.
- Current behavior: Step 2 text "In <link>Orders & tracking</link>, open the order and choose 'Open a dispute'" (FE `locales/en.ts:984`) is rendered with `SUPPORT_ORDERS = '/dashboard/customer/support?tab=orders'` (FE `app/returns/ReturnsClient.tsx:18,59`). The dispute button lives on the order page.
- Expected behavior: The link goes to `/dashboard/customer/orders`.
- Requires: UI. Boundary: Safe-now. See PART 3.

### CNT-19
**Dispute and refund promises on Returns/Shipping/Terms aren't enforced by the code**
- Area: `/returns`, `/shipping`, `/terms`, dispute workflow
- Category: Policy-only behavior
- Severity: High. Status: Confirmed.
- Current behavior:
  - **7-day window:** Promised at FE `locales/en.ts:984,1004`, `app/shipping/ShippingClient.tsx:171`, `app/terms/TermsClient.tsx:69,96`. It is not enforced: `disputes.service.ts:15-30` has no date check. The anchor also differs between pages: "7 days of the expected delivery date" (en.ts:984) vs "after delivery confirmation" (en.ts:1004; Terms :96).
  - **Photos:** "Add photos" (en.ts:986; Shipping :171 "with photos"). The dispute form sends only reason + description (FE `app/dashboard/customer/orders/[id]/page.tsx:228-231`), although the API accepts `evidence` (BE `disputes/disputes.controller.ts:20`).
  - **Supplier contact:** "The supplier is contacted as well" (en.ts:986). Only admins are notified (BE `disputes/disputes.service.ts:33-40`).
  - **When a dispute can open:** "Disputes can be opened once the order has shipped" (en.ts:984). The backend allows any status except PENDING/CANCELLED (`disputes.service.ts:19`).
  - **Timelines:** "48–72 hours" review, "1–3 business days" refund processing, "5–10 business days" (en.ts:988,1009-1016). None is tracked.
  - **Fees:** "Stripe processing fees (typically 1.4%–2.9% + €0.25) may be non-refundable" (en.ts:1017). This conflicts with the no-card / payment-details model (CNT-01).
  - **Automatic refunds:** "Refunds are arranged by the team… not automatically" (en.ts:975; FE `app/goods-inspection/GoodsInspectionClient.tsx:244`). A REFUND resolution actually auto-calls `refundEscrow` when an escrow row exists (BE `disputes/disputes.service.ts:116-118`; also `orders/orders.service.ts:1453-1462` on cancel).
- Impact: Buyers rely on rules the system doesn't apply. The legal text conflicts with the policy pages.
- Recommended future task: Pick one rule set (anchor date, window, evidence), then implement it: a server-side window check, photo upload in the dispute form, supplier notification. Or soften the copy. Remove the Stripe-fee paragraph unless card payments are live.
- Requires: Policy decision + Backend + UI.
- Boundary: Policy decision required.

### CNT-20
**About / Wholesale / How-it-works make product and operations claims the code doesn't support**
- Area: `/about`, `/wholesale`, `/how-it-works`
- Category: Policy-only behavior
- Severity: Medium. Status: Confirmed (Suspected where marked).
- Current behavior:
  - **Quality-checked sourcing:** "Every product in our catalog is sourced and quality-checked by the Atlantis team before listing" (FE `app/about/AboutClient.tsx:24`; `app/wholesale/WholesaleClient.tsx:9`). In reality suppliers submit listings and admins approve them (BE `products/products.service.ts:365,1073,1107`). There is no QC step. The footer's "Every listing is reviewed by Atlantis" (FE `locales/en.ts:245`) is the accurate version.
  - **Multi-warehouse stock:** "Managing thousands of SKUs, multi-warehouse stock…" (About :36). A `Warehouse` model exists (BE `prisma/schema.prisma:737`), but the Warehouses page says there are no verified hubs yet (FE `app/warehouses/WarehousesClient.tsx:155`). Suspected.
  - **Tiered pricing everywhere:** "Every product… offers quantity-based pricing tiers… automatically applied at checkout" (Wholesale :8) and "Every listing shows per-case pricing for case, pallet and truck volumes" (FE `app/how-it-works/HowItWorksClient.tsx:17`). Tiers are optional per product. Suspected.
  - **Supplier-set tiers:** "Pricing tiers are set individually by each supplier" (Wholesale :122). This conflicts with "sold by Atlantis directly" (`HowItWorksClient.tsx:24`; About :10).
  - **One-click reorder:** "Repeat your most common orders with a single click from your order history" (Wholesale :13). Reorder exists only in Lists (FE `app/dashboard/customer/lists/page.tsx:183,197`), not in order history.
  - **Invoices:** "Download invoices automatically for every order" (Wholesale :12). Invoices are created only when an order is DELIVERED (BE `orders/orders.service.ts:1445-1447`).
  - **PCI payments:** "AES-256 encryption, 2FA, PCI DSS payments" (About :18). PCI depends on a card flow that isn't the default (CNT-01).
  - **"Wire transfers with no protection"** (About :98): this implies Atlantis offers payment protection.
- Recommended future task: Copy pass to match reality: "reviewed by Atlantis before it goes live", "where a product has volume tiers", "reorder from Lists", "invoice available once delivered".
- Requires: UI copy.
- Boundary: Safe-now (copy).

### CNT-21
**Pages disagree on which regions Atlantis serves**
- Area: About, Wholesale, Privacy, Contact, Shipping, Marketing vs Warehouses
- Category: Policy-only behavior
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - "Europe and the Gulf": FE `about/AboutClient.tsx:75`, `wholesale/WholesaleClient.tsx:10`, `privacy-policy/PrivacyClient.tsx:10`, `contact/ContactClient.tsx:27`, `marketing/page.tsx:86`.
  - Shipping zones list "Gulf (UAE, KSA, Kuwait, Qatar)" (`shipping/ShippingClient.tsx:18`).
  - The Warehouses page says "across Europe, the UK and North America" (`warehouses/WarehousesClient.tsx:70,81`) and shows only North America and Europe on the map.
  - Delivery countries actually come from the server (`getPublicHubs` → `deliveryCountries`, `WarehousesClient.tsx:46-49`).
- Recommended future task: The business confirms its target markets. All pages then derive "where we deliver" from the server list.
- Requires: Policy decision + UI copy.
- Boundary: Policy decision required.

### CNT-22
**The Shipping policy names carriers and a processing SLA that only exist as stubs**
- Area: `/shipping`
- Category: Policy-only behavior
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - "Atlantis books a carrier for each order — for example DB Schenker, LKW Walter, Raben or DHL" (FE `app/shipping/ShippingClient.tsx:125`). The carrier integrations are stubs (BE `shipping/shipping.provider.ts:39-47,60-61`: "API not configured — using ShippingService pricing"). There is no evidence of contracts.
  - "Atlantis has up to 48 business hours to begin processing" (`:149`) is an SLA with no tracking.
  - The transit zones (`:13-19`) are labeled as estimates (OK).
  - "you get an email" when shipped (`:150`) is true (BE `orders/orders.service.ts:1369`).
- Recommended future task: Replace the carrier names with "a carrier booked by Atlantis" unless partnerships are confirmed. Remove or confirm the 48h SLA.
- Requires: Policy decision.
- Boundary: Policy decision required (partner names); Safe-now (copy) to genericize.

### CNT-23
**The Marketing page sells placement tools that suppliers can't reach**
- Area: `/marketing`, supplier dashboard sidebar
- Category: Missing UI
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - The CTA "Manage Placements" points to `/supplier/placements` (FE `app/marketing/page.tsx:157`), as does the sidebar (FE `components/dashboard/Sidebar.tsx:35`, rendered by `app/dashboard/supplier/layout.tsx`). No such route exists.
  - The page claims an "Analytics dashboard to track placement performance", "Available to all KYC-verified suppliers" and "Admin reviews within 24h" (`:45-46,142`). It also says "Supplier Dashboard → Placements → Create New Placement" (`:141`).
  - The backend has `GET /ads/supplier/my-ads` and `POST /ads/supplier/request` with fixed prices (BE `ads/ads.controller.ts:25-43`; `ads/ads.service.ts:61-66`), and FE helpers exist (`lib/api.ts:288,299`). There is no page, no analytics, and no 24h SLA.
  - The "Featured / Category boost / Sponsored" placement descriptions (`:10-39`) are partly backed by admin placements.
- Recommended future task: Hide the CTA and sidebar item until a `/supplier/placements` page exists, or build the request page on the existing API. Remove the analytics and 24h claims.
- Requires: UI (+ a policy decision on pricing).
- Boundary: Safe-now (hide links/copy).

### CNT-24
**Admin-edited Terms are never shown, and the Terms carry the wrong domain and a liveness claim**
- Area: `/terms`, `/admin/terms`
- Category: Incomplete integration
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - `/admin/terms` saves `TERMS_CONTENT`/`TERMS_VERSION` (FE `app/admin/terms/page.tsx:30,48`), served by BE `GET /config/terms` (`app.controller.ts:94-106`). The storefront never calls it. `/terms` renders the static `SECTIONS` array (FE `app/terms/TermsClient.tsx:7-155`), so admin edits and version numbers have no public effect.
  - The Terms say "Platform: marketpl7ce.vercel.app" (`:154`).
  - §4.2 requires a "liveness check" (`:42`), which doesn't exist (CNT-02).
  - "last updated in April 2026" (`:12`) predates the October 2026 Returns policy (en.ts:969).
- Recommended future task: Pick one source of truth. Either render `/config/terms` (with version and date), or remove the admin editor.
- Requires: UI + policy.
- Boundary: Approval-required (changes the legal text source).

### CNT-25
**Legal pages are machine-translated at runtime by an LLM, with no "English prevails" clause**
- Area: `/terms`, `/privacy-policy`, `/cookie-policy`, and all hard-coded pages
- Category: Localization/accessibility gap
- Severity: Medium. Status: Confirmed.
- Current behavior:
  - FE `lib/auto-translate.ts:1-16` translates every visible English string through BE `/i18n/translate` (OpenRouter) and caches the result in localStorage.
  - The Terms, Privacy, Cookie, About, Shipping, Protected-payments and Marketing pages are hard-coded English (`t(` count is 0), so non-English visitors read unreviewed machine translations of legal text.
  - The Footer opts out of translation (`components/layout/Footer.tsx:47` `data-no-translate`). The legal pages don't.
- Recommended future task: Mark legal pages `data-no-translate` and show a notice that English is binding, or ship reviewed translations through `locales/*`.
- Requires: Policy decision + UI.
- Boundary: Policy decision required.

### CNT-26
**The carrier portal (`/logistics/orders`) gets full order data matched by a fuzzy name**
- Area: `/logistics/orders`, BE `GET /orders/logistics/assigned`
- Category: Security or permissions gap
- Severity: High. Status: Confirmed.
- Current behavior:
  - The service loads up to 500 orders that have any `shippingCompany`. It includes the full `items` (with prices) and order totals, plus the customer's name, email and phone.
  - It then filters with a two-way substring match between the carrier's name and `shippingCompany` (BE `orders/orders.service.ts:491-513`). A short company name like "DHL" matches every DHL-variant order, and a one-letter `shippingCompany` matches any carrier.
  - The data includes buyer prices and totals. Whether the supplier id is included depends on the order fields.
  - `/logistics` is not in the middleware's `PROTECTED_PATHS` (FE `middleware.ts:4-6`). The API is role-guarded (`orders.controller.ts:141-145`), so the page just loads empty or errors for guests.
- Expected behavior: Carriers get only shipment-relevant fields for orders explicitly assigned to their account id.
- Recommended future task: Assign carriers by user or company id (additive field). Select only the delivery fields. Add `/logistics` to `PROTECTED_PATHS`.
- Requires: Backend + DB (additive) + UI.
- Boundary: Approval-required (schema).

### CNT-27
**Buyers see the supplier's own invoice, which reveals supplier identity and net prices**
- Area: Buyer order page; Help article "Invoices"
- Category: Security or permissions gap / Policy decision
- Severity: High. Status: Confirmed.
- Current behavior:
  - The help article says "Attach your own invoice… The buyer can see it" (FE `content/help/articles/payment-invoicing.ts:74,78`).
  - The buyer order page renders `order.supplierInvoiceUrl` (FE `app/dashboard/customer/orders/[id]/page.tsx:536-537`). The URL is set by the supplier (BE `orders/orders.controller.ts:59-83`) and is not stripped from the buyer view (`orders.service.ts:698` strips other fields only).
  - A supplier invoice normally carries the supplier's legal identity and net prices. That conflicts with "buyers never see supplier ids or supplier net prices" and with "Sold & shipped by Atlantis" (`HowItWorksClient.tsx:24`).
- Recommended future task: Decide whether the supplier invoice is for Atlantis only (the likely answer under the seller-of-record model). Hide it from buyers and fix the help article.
- Requires: Policy decision + Backend/UI.
- Boundary: Policy decision required.

### CNT-28
**Dead components contain fabricated statistics and broken links**
- Area: Unused components
- Category: Broken or inconsistent behavior
- Severity: Low. Status: Confirmed (not rendered today).
- Current behavior:
  - FE `components/ui/Hero.tsx:8-11` "500+ Active Suppliers", "10K+ Products", "50K+ Orders", "99.5% Satisfaction".
  - FE `components/ui/TrustBadges.tsx:59` "Trusted by over 500+ businesses worldwide".
  - FE `components/ui/OffersHero.tsx:42` `ctaHref: "/suppliers"` (no route).
  - FE `lib/rbac-utils.ts:22` `/dashboard/buyer` (no route).
  - None of these is imported anywhere (grep), but they are one import away from going live.
- Recommended future task: Delete them.
- Requires: UI. Boundary: Safe-now.

### CNT-29
**The newsletter promises "weekly" updates, but campaigns are sent manually**
- Area: Footer newsletter, double opt-in
- Category: Policy-only behavior
- Severity: Low. Status: Confirmed.
- Current behavior:
  - FE `locales/en.ts:830,834` "Get weekly updates…", "send me the weekly Atlantis newsletter". Sending is manual through admin `POST /newsletter/send-campaign` (BE `newsletter/newsletter.controller.ts:106`). No newsletter cron exists (the crons are at `lists/`, `security/`, `users/`, `finance/`, `orders/`, `ai-agent/`).
  - Double opt-in is real (BE `newsletter/newsletter.service.ts:53`; FE `app/newsletter/confirm/page.tsx`).
  - Separately, approved offers are auto-emailed to all ACTIVE subscribers (BE `offers/offers.service.ts:209,357`). That is more than "weekly".
- Recommended future task: Say "occasional updates and new offers", or schedule a weekly digest.
- Requires: Policy decision / copy.
- Boundary: Safe-now (copy).

### CNT-30
**The help-content checker is good but narrow, and it isn't in the build**
- Area: FE `scripts/check-help-content.ts`
- Category: Incomplete integration
- Severity: Low. Status: Confirmed.
- Current behavior: The script checks:
  - unique `category/slug`;
  - known category;
  - non-empty articles;
  - `related` refs resolve and aren't self-references;
  - unique heading ids per article;
  - inline markdown links (`](…)`) are internal, resolve to help refs, or exist as `src/app` routes (it understands `[param]` and `(group)` folders);
  - Help-home learning-path refs (`app/help/page.tsx` `_PATH = [`);
  - every category is non-empty.

  Today it passes ("72 articles in 11 categories; 8 popular. ✓").

  What it doesn't do:
  - It isn't wired into `npm run build` (FE `package.json:7-8` runs only `check:i18n`).
  - It doesn't scan `href=` in pages, Footer, Navbar, sidebars or notification targets, which is how the broken links in PART 3 slipped through.
  - It accepts any `/help/<x>/<y>` and any route without checking query parameters or anchors.
  - It doesn't validate article prose against product rules.
- Recommended future task: Add `check:help` to `build`. Add a generic internal-href scan (the scratchpad `linkcheck2.js` approach) over `src/app` and `src/components`.
- Requires: Tooling.
- Boundary: Safe-now.

### CNT-31
**The Protected Payments page is accurate, but its "settlement" step implies a mechanism that doesn't exist**
- Area: `/protected-payments`
- Category: Policy-only behavior
- Severity: Low. Status: Suspected.
- Current behavior: Most claims match the workflow (72h supplier deadline, versions, buyer acceptance). However, step 6 "Settlement under the terms… Payment is settled according to the confirmed terms and any inspection outcome, such as a price adjustment or partial acceptance" (FE `ProtectedPaymentsClient.tsx:60`) and the hero "Settled under the confirmed terms" (`:42`) suggest a settlement process. There is no settlement or payout logic for the non-card flow (manual; finance module not verified here). The page title "Protected payments" may itself read as a payment-protection claim under CLAUDE.md.
- Recommended future task: The business confirms the naming. Consider "Confirmed-terms ordering".
- Requires: Policy decision. Boundary: Policy decision required.

---

## L10N — Localization, RTL and accessibility (16)

### L10N-01
**Almost the whole product still depends on the runtime machine translator**
- Area: Platform-wide / Category: Localization gap / Severity: **Critical** / Status: Open
- Current: 111 of 126 routes contain no dictionary calls; their text is English in JSX and is translated only at runtime by `src/lib/auto-translate.ts`, which POSTs every visible string to `/i18n/translate` (`auto-translate.ts:175-190`). On any failure (no AI key on the server, network, throttling — the endpoint is limited to 60 req/min per client, `backend/src/i18n/i18n.controller.ts:18`) it "silently falls back to English" (`auto-translate.ts:188-189`).
- Expected: per `docs/DESIGN_SYSTEM.md` §"Languages and direction": "All visible text comes from the dictionaries … Never write English in JSX."
- Evidence: PART 2 table; `auto-translate.ts:1-26` (design comment calls it a stop-gap for "hundreds of hardcoded English strings").
- Impact: In an Arabic/French/… session, buyers see mixed-language pages (dictionary chrome + English or machine-translated body). Machine translation is non-deterministic, ignores `locales/GLOSSARY.md`, and can mistranslate commercial terms (MOQ, case/pallet, "request" vs "order"), which collides with the honesty rules in `CLAUDE.md`.
- Recommended future task: migrate pages to dictionaries in the order of PART 3; add each file to `scripts/check-i18n.ts` SCOPE as it is migrated; retire the translator once buyer and supplier flows are covered.
- Requires: copy review per locale (7 languages), glossary terms. Boundary: Safe-now (UI-only).

### L10N-02
**Native `alert/confirm/prompt` dialogs can never be translated**
- Area: Checkout, product page, cart, admin / Category: Broken behavior / Severity: **High** / Status: Open
- Current: 72 native dialogs with English literals. The DOM translator cannot reach them, so they are English in every language even when the AI key works.
- Evidence: `app/checkout/page.tsx:151-155` (address validation), `:203` (empty cart), `:262` (connection error), `:495-499` (geolocation errors); `app/cart/page.tsx:273` (`confirm('Empty your cart? …')`); `app/products/[id]/ProductDetailClient.tsx:1055,1064` (`window.confirm` when switching mix type); `app/contact/ContactClient.tsx:69`; `app/dashboard/admin/page.tsx:85-177` (13 dialogs).
- Expected: inline errors / ds dialog with dictionary text.
- Impact: The checkout's address validation — the most critical buyer path — speaks English to Arabic buyers in a modal they must dismiss.
- Recommended future task: replace checkout/cart/PDP dialogs with inline field errors and a confirm dialog primitive in `components/ds`; key the text. Requires: a ds `ConfirmDialog`. Boundary: Safe-now.

### L10N-03
**Printed invoice is English-only with hard-coded `€`**
- Area: Buyer order detail → "Print invoice" / Category: Localization gap / Severity: **High** / Status: Open (code just moved to an uncommitted file)
- Current: `src/lib/invoice-print.ts:11,36,41,51-53` builds the invoice HTML with English labels ("Issued", "Due Date", "Subtotal", "Tax", "Total", "Mixed load"), `€${n.toFixed(2)}`, and `toLocaleDateString()` without a locale. It opens in a new window (Blob URL), outside the React tree and outside the runtime translator.
- Expected: invoice labels from dictionaries, `formatPrice(n,'EUR',meta.intl)`, `fmt.date`, `<html lang dir>` set on the printed document.
- Impact: A localized order page (now in SCOPE) produces an English, LTR invoice; for Arabic buyers numbers/columns are mis-aligned.
- Recommended future task: pass `t`, `meta.intl`, `dir` into the print builder. Boundary: Safe-now.

### L10N-04
**Partially keyed components are not protected from the translator (double translation in Latin locales)**
- Area: Product page, wishlist, categories, sidebar / Category: Inconsistent behavior / Severity: Medium / Status: Open
- Current: `shouldTranslate()` only requires a Latin letter (`auto-translate.ts:88-98`); dictionary output in fr/ro/it/es/pt is Latin text, so any keyed region without `data-no-translate` is sent again to the AI translator. Files using `t()` without `data-no-translate`: `app/wishlist/page.tsx` (11 t), `components/product/ReviewSection.tsx` (15), `components/product/ProductFilters.tsx` (12), `components/dashboard/Sidebar.tsx`, `components/dashboard/UserMenu.tsx`, `components/ui/OffersHero.tsx`, `components/marketplace/AdPlacements.tsx`, `components/cart/RecommendationsSidebar.tsx`, `app/categories/CategoriesClient.tsx`, `app/admin/layout.tsx`. Only 6 files carry `data-no-translate` (Navbar, Footer, ProfileReminderBanner, customer layout, customer orders, ReturnsClient).
- Expected: DESIGN_SYSTEM: "Regions rendered from dictionaries carry `data-no-translate`".
- Impact: Reviewed translations can be rewritten by the machine translator (glossary drift), extra API calls, flicker. Wishlist is keyed but not in the validator SCOPE, so regressions go unnoticed.
- Recommended future task: add `data-no-translate` to every keyed root; add wishlist, ReviewSection, ProductFilters, Sidebar, UserMenu to SCOPE (after removing their remaining literals). Boundary: Safe-now.

### L10N-05
**hreflang alternates point to routes that do not exist, and only 4 of 7 languages**
- Area: SEO / root layout / Category: Broken behavior / Severity: Medium / Status: Open
- Current: `src/app/layout.tsx:76-83` declares `alternates.languages` `/en`, `/ar`, `/fr`, `/ro`. There is no `[locale]` segment or rewrite (`src/app` has no `en/ar/fr/ro` dirs; `middleware.ts` has no locale handling). it/es/pt are missing. Language is client-side only (localStorage `app-locale`), so crawlers always get English.
- Expected: either no `languages` alternates (single-URL, client-switched site) or real per-locale URLs for all 7 languages.
- Impact: Search engines are told about 404 alternates; no localized pages can be indexed. Also all 23 `metadata` blocks (e.g. `app/returns/page.tsx:7-13`, `app/privacy-policy/page.tsx:7-8`) are English, so `<title>`/description stay English for users too.
- Recommended future task: remove the bogus alternates now; decide on locale routing later. Requires: product/SEO decision for real localized URLs. Boundary: Safe-now (removal); locale routing is not UI-only.

### L10N-06
**SSR document is always `lang="en" dir="ltr"` until a pre-paint script runs**
- Area: Root layout / Category: Localization/accessibility gap / Severity: Low / Status: Open
- Current: `src/app/layout.tsx:152` renders `<html lang="en" dir="ltr">`; `:204` patches it from localStorage with a hard-coded copy of the locale list (`['ar','fr','ro','it','es','pt']`) that duplicates `src/locales/config.ts:8`.
- Impact: Screen readers/crawlers get `en` on first response; the duplicated list will drift if a locale is added. Recommended: generate the inline list from `LOCALES`. Boundary: Safe-now.

### L10N-07
**Prices are formatted in the currency's locale, not the UI language**
- Area: Cart, checkout, PDP, cards, supplier / Category: Inconsistent behavior / Severity: **High** / Status: Open
- Current: `formatPrice(amount, currency?, intlLocale?)` (`src/lib/currency.ts:155-167`) falls back to the currency's own locale or `en-IE`. 111 of 114 call sites omit the third argument; only `dashboard/customer/orders/page.tsx:47`, `components/orders/DeliveryBreakdown.tsx:29` and `dashboard/customer/payments/page.tsx:88` pass `meta.intl`. Examples: `app/cart/page.tsx:304,339,350,388,420,425,462,468`; `app/checkout/page.tsx:567,584,589,660`; `dashboard/customer/targets/page.tsx:58`; `components/product/TargetPriceDialog.tsx:62`.
- Expected: DESIGN_SYSTEM: "For prices, use `formatPrice(amount, undefined, meta.intl)`."
- Impact: The same order total reads "€1,234.50" in the cart and "1.234,50 €" on the order list for a Portuguese buyer — inconsistent figures in a money flow.
- Recommended future task: add a `usePrice()` hook (as in orders page) and replace call sites; consider making `formatPrice` read the UI locale by default. Boundary: Safe-now.

### L10N-08
**Hard-coded English locales in shared money/number formatters**
- Area: Supplier UI kit, fulfillment, admin / Category: Inconsistent behavior / Severity: Medium / Status: Open
- Evidence: `components/supplier/ui.tsx:258` (`Intl.NumberFormat('en-IE', EUR)`) and `:259` (`int()` → `'en-US'`) — used by 20 supplier files and by the buyer cart (`app/cart/page.tsx` imports `components/supplier/ui.tsx`) and `components/product/TargetPriceDialog.tsx`; `lib/fulfillment.ts:49-50` (`eur()` → `en-IE`, used by `components/orders/AdminWorkflowPanel.tsx:7`, `app/supplier/fulfillment/page.tsx`); `app/supplier/fulfillment/page.tsx:18`; `app/admin/orders/[id]/page.tsx:128` (`'en-EU'`, not a real locale); `lib/utils.ts:14-19` `formatCurrency` formats **USD** with `en-US` (unused today — remove before someone uses it in a EUR-only marketplace); `components/dashboard/WorldClock.tsx:31`.
- Recommended future task: make `money()/int()/eur()` accept the UI locale (or read it from context). Boundary: Safe-now.

### L10N-09
**Dates and quantities ignore the UI language**
- Area: All roles / Category: Inconsistent behavior / Severity: Medium / Status: Open
- Current: 101 `toLocale*String()` calls with no locale (browser locale wins), 26 with hard-coded `en-GB/en-US`, 10 with `undefined/[]`; `fmt.date/fmt.number` is used in only 5 files.
- Evidence (buyer/supplier): `app/cart/page.tsx:29,242,336,338,351,426`; `components/cart/MinimumOrder.tsx:11,13,170`; `components/product/ProductCard.tsx:113` (`en-GB` MOQ on every card); `components/product/PriceHistorySection.tsx:11` (`en-GB` chart dates); `components/product/OfferComparison.tsx:63`; `components/product/ReviewSection.tsx:255`; `components/product/MixBuilder.tsx:162,209`; `app/products/[id]/ProductDetailClient.tsx:709,728-731`; `app/dashboard/customer/page.tsx:114`; `app/dashboard/customer/notifications/page.tsx:74` (`en-US`); `app/dashboard/customer/targets/page.tsx:56`; `components/support/messages.tsx:10,17,21` (`en-GB` in the support thread timestamps); `app/deals/page.tsx:43`; `app/categories/CategoriesClient.tsx:559`; `app/supplier/page.tsx:29-31`; `app/supplier/orders/page.tsx:166,211`; `components/orders/AdminWorkflowPanel.tsx:61,74`.
- Recommended future task: replace with `fmt.date`/`fmt.number`; for module-level helpers (`messages.tsx`, `MinimumOrder.tsx`) pass `meta.intl`. Boundary: Safe-now.

### L10N-10
**English pluralisation by string concatenation**
- Area: Cart, PDP, cards / Category: Localization gap / Severity: Medium / Status: Open
- Current: 56 `n === 1 ? '' : 's'`-style plurals — impossible to translate (Arabic has 6 plural forms, Romanian 3).
- Evidence: `app/cart/page.tsx:338,462`; `components/product/ProductCard.tsx:113`; `app/products/[id]/ProductDetailClient.tsx:677,1208,1322`; `components/product/RatingSummary.tsx:42`; `components/product/TargetPriceDialog.tsx:39`; `components/product/OfferComparison.tsx:20`; `app/requests/RequestsClient.tsx:146`; `app/dashboard/customer/lists/page.tsx:65`.
- Expected: ICU plural keys (`{count, plural, one {# case} other {# cases}}`), per DESIGN_SYSTEM. Boundary: Safe-now.

### L10N-11
**Hard-coded `€` concatenation and `toFixed(2)` money**
- Area: Buyer support/chat, supplier, admin / Category: Inconsistent behavior / Severity: Medium / Status: Open
- Evidence: `components/chat/OrderChatModal.tsx:131`; `app/supplier/page.tsx:122` (chart axis `€${v}`); `components/product/PriceHistorySection.tsx:134` (PDP chart axis); `app/supplier/wholesale-offers/page.tsx:366,610-611`; `app/requests/RequestsClient.tsx:668` (generated request text "target €…/case"); `app/admin/support/page.tsx:442`; `app/admin/orders/[id]/page.tsx:764`; `app/admin/orders/page.tsx:368`; `app/admin/wholesale-offers/page.tsx:318`; `app/admin/settings/page.tsx:978`; `app/admin/coupons/new/page.tsx:272`; `app/admin/pricing/page.tsx:234`; `lib/invoice-print.ts:11,51-53`. 38 `toFixed(2)` renderings in total.
- Impact: Wrong symbol position/decimal separator for fr/ro/it/es/pt/ar; ignores the buyer's display currency. Boundary: Safe-now.

### L10N-12
**Physical direction utilities break Arabic layouts**
- Area: All roles / Category: Localization/accessibility gap (RTL) / Severity: **High** (buyer/supplier), Medium (admin) / Status: Open
- Current: ≈280 physical utilities in 62 files; Tailwind 3.3 (`package.json`) does not auto-flip them. Worst non-admin files:
  - `app/auth/onboarding/page.tsx` (12): `:76-78,114,123,133,142,153` search-icon `left-4` + `pl-12 pr-4` inputs → icon overlaps Arabic text.
  - `app/supplier/wholesale-offers/page.tsx` (10): `:311,337-341,366-367,376,511` table headers `text-left/text-right`.
  - `components/ImageLightbox.tsx` (9, used by PDP): `:74,82,91,102,124` close/prev/next buttons `right-4/left-4` (prev/next do not swap).
  - `app/cookie-policy/CookieClient.tsx` (8): `:92-94,100-101,118`.
  - `app/wholesale/WholesaleClient.tsx` (7): `:101-103,114-115`.
  - `components/chat/SupportChat.tsx` (6): `:293,431,433-434,459,463` chat bubble tails `rounded-tl-none/rounded-tr-none` on the wrong side.
  - `components/support/messages.tsx:92,113`, `components/product/PricingAssistant.tsx:194-195,208`, `components/chat/OrderChatModal.tsx:136,205-208` — same bubble-tail problem in the buyer support workspace and PDP assistant.
  - `app/supplier/payment-methods/page.tsx:229,232,250,253,365`; `app/dashboard/payment-methods/page.tsx:133,135,161`; `app/account/address/page.tsx:180,262,308,315`; `components/CookieConsent.tsx:36,56` (banner `md:right-6`); `app/dashboard/supplier/ProductEditorModal.tsx:336,466,480`; `app/dashboard/customer/orders/[id]/track/page.tsx:75,141,176`; `app/checkout/payment/PaymentForm.tsx:137`; `app/products/[id]/ProductDetailClient.tsx:1162`; `components/product/ReviewSection.tsx:224`; `app/supplier/layout.tsx:341`.
  - Admin worst: `app/admin/settings/page.tsx` (16: `:387,441,447,458,462`), `app/admin/coupons/page.tsx` (16: `:127,131,198,207,257`), `components/products/ProductEditorForm.tsx` (16: `:246,364,649,698,1548`), `app/admin/users/page.tsx` (12), `app/admin/email-analytics/page.tsx` (10), `app/admin/newsletter/page.tsx` (10), `components/product/AddProductDrawer.tsx` (10).
  - Inline styles: chart margins `{left/right}` in `app/supplier/page.tsx:119`, `app/supplier/analytics/page.tsx:182`, `components/product/PriceHistorySection.tsx:125` (recharts axes are not mirrored for RTL).
- Expected: logical utilities (`ms/me/ps/pe/start/end/text-start/rounded-s*/border-s`).
- Recommended future task: mechanical codemod for buyer/supplier/public files first (≈127 hits), then admin; add a lint rule (eslint `no-restricted-syntax` on className regex) or extend `check-i18n.ts` to fail on physical utilities in SCOPE files. Boundary: Safe-now.

### L10N-13
**Directional icons do not mirror (153 instances)**
- Area: All roles / Category: RTL gap / Severity: Medium / Status: Open
- Current: only 4 icons in the codebase have `rtl:rotate-180`. 153 `ArrowRight/ArrowLeft/ChevronRight/ChevronLeft/ArrowUpRight` without it in 88 files, including a **design-system primitive**: `components/ds/index.tsx:161` (`TrustNav` card arrow; the sibling `Button` at `:93` is correct).
- Evidence (buyer): `app/HomeClient.tsx:151,283,375,382,408,416,439,503`; `app/categories/CategoriesClient.tsx:458,461,463,549,551,565,576` (breadcrumb + pagination); `app/products/[id]/ProductDetailClient.tsx:758,761,764` (breadcrumb); `app/checkout/page.tsx:275,531,607`; `app/checkout/payment/page.tsx:154,158`; `app/checkout/confirmation/page.tsx:42`; `app/cart/page.tsx:260`; `components/cart/MinimumOrder.tsx:138`; `components/product/ProductRail.tsx:83-84` (carousel arrows, scroll direction also physical); `components/ImageLightbox.tsx:94,105`; `components/support/OrderThreads.tsx:220`; `components/support/messages.tsx:101`; `components/help/HelpShell.tsx:23`; `app/wishlist/page.tsx:93`; supplier: `app/supplier/products/import/page.tsx:152,225-235`, `components/supplier/import/ReviewStep.tsx:14,60,66,156,158,195`, `components/supplier/ProductEditor.tsx:194,203,433,436`, `app/supplier/page.tsx:148,159,179`.
- Also 10 `group-hover:translate-x-*` nudges move the arrow the wrong way in RTL (`components/ds/index.tsx:161`, `components/ui/Hero.tsx:92`, `app/admin/orders/page.tsx:659`, `components/dashboard/UserMenu.tsx:170`). Correct pattern exists at `app/returns/ReturnsClient.tsx:196`.
- Recommended future task: fix the ds primitive first; add `rtl:rotate-180` (and `rtl:group-hover:-translate-x-1`) to forward/back icons; carousels need `scrollBy` sign flipped in RTL. Boundary: Safe-now.

### L10N-14
**Order ids, EANs and emails not isolated with `<bdi dir="ltr">` outside the localized pages**
- Area: Buyer/supplier / Category: RTL gap / Severity: Low / Status: Open
- Current: `<bdi>` exists only in `app/returns/ReturnsClient.tsx` and `components/orders/order-ui.tsx`. Ids/EANs rendered raw in e.g. `components/support/OrderThreads.tsx:103`, `app/supplier/orders/page.tsx`, `components/product/OfferComparison.tsx`, `app/products/[id]/ProductDetailClient.tsx` (EAN rows) and `app/dashboard/customer/orders/[id]/track/page.tsx`.
- Impact: "#A1B2-3" style references and "EAN 5449000…" reorder visually in Arabic. Recommended: reuse the `Ltr` helper from `order-ui.tsx`. Boundary: Safe-now.

### L10N-15
**Validator blind spots**
- Area: `scripts/check-i18n.ts` / Category: Inconsistent behavior / Severity: Medium / Status: Open
- Current: the SCOPE scan (`check-i18n.ts:127-160`) only catches literal JSX text on one line, `attr="..."` literals and `confirm/alert('…')`. It skips JSX text containing `? ` or `: ` (`:147`), so `{x ? 'Saving…' : 'Save'}` passes; it ignores `aria-label={\`…\`}`, object-literal copy (`label: 'Pending'`), `toast/setError('…')`, `toLocale*String()`, `formatPrice()` without intl, and physical direction classes. All 15 current SCOPE files pass a stricter scan today, but the gaps will let regressions in as more pages are added.
- Recommended future task: extend the check with the ternary/template/object-literal patterns, a `toLocale*String(` without-locale rule and a physical-utility rule for SCOPE files. Boundary: Safe-now (tooling).

### L10N-16
**Server and API error messages displayed verbatim**
- Area: Checkout, support, cart / Category: Localization gap / Severity: Medium / Status: Open
- Current: UI shows `err.message` from the API with an English fallback, e.g. `app/checkout/page.tsx:258` (`… : 'Failed to place order. Please try again.'`), `app/cart/page.tsx:224`, `components/support/AssistantPanel.tsx:102,104,140,151,159`.
- Impact: Even after page migration, error text will be English unless the backend returns codes. Recommended: map known error codes to keys; keep raw message only as a detail. Requires: backend error codes for the main flows (not UI-only).

### A11Y-01 Icon-only buttons without an accessible name (buyer flows)
- Area: Checkout, PDP, cart, product assistant, reviews / Category: Accessibility gap / Severity: Medium / Status: Open
- Evidence: `app/checkout/page.tsx:631` (remove-coupon `<X/>`); `app/products/[id]/ProductDetailClient.tsx:1175` and `:1198` (mix-builder −/+ buttons); `components/cart/RecommendationsSidebar.tsx:167` (quick-add `<Plus/>`, also only revealed on hover → unreachable for keyboard/touch); `components/product/PricingAssistant.tsx:164` (close `<X/>`); `components/product/ReviewSection.tsx:25` (rating star buttons, no "N stars" label, no radiogroup semantics). Admin: `components/product/AddProductDrawer.tsx:55,315`.
- Note: where labels exist they are English literals (e.g. `app/cart/page.tsx:58,60,64,113`, `ProductDetailClient.tsx:774,780,801,825,991`, `components/product/MixBuilder.tsx:148,150,153,157`, `components/support/Composer.tsx:52,67`) and rely on the translator's attribute pass.
- Boundary: Safe-now.

### A11Y-02 Clickable `<div>`s and a modal without dialog semantics
- Area: Checkout, PDP / Severity: Medium / Status: Open
- Evidence: `app/checkout/page.tsx:401-409` shipping-rate cards are `<div onClick>` with no role, `tabIndex` or key handler — keyboard users cannot choose a shipping option; `app/products/[id]/ProductDetailClient.tsx:1459-1470` "Mixed … added to your cart" overlay has no `role="dialog"`, `aria-modal`, focus trap or Escape handling (backdrop `div onClick` at `:1460`). Admin: `components/product/AddProductDrawer.tsx:595`.
- Expected: radio group (`role="radiogroup"` / native radios) for rates; ds dialog primitive. Boundary: Safe-now.

### A11Y-03 Form fields labelled only by placeholder
- Area: Checkout, PDP, Navbar, product assistant, buyer order detail / Severity: Medium / Status: Open
- Evidence: `app/checkout/page.tsx:637-644` (coupon input, placeholder "PROMO CODE"); `app/products/[id]/ProductDetailClient.tsx:1183` (mix quantity number input); `components/layout/Navbar.tsx:466-470` (delivery-location input, placeholder only — this file is in SCOPE, so text is keyed but the label is missing); `components/product/PricingAssistant.tsx:235-240` (assistant textarea); `components/product/ProductFilters.tsx:165,176` (min/max price — placeholder `t('categories','min')` only). Admin: `components/orders/AdminWorkflowPanel.tsx:214-270`, `components/product/AddProductDrawer.tsx` (16 fields).
- Boundary: Safe-now.

### A11Y-04 `outline-none` without a replacement focus style
- Area: Buyer search/filter controls / Severity: Medium / Status: Open
- Current: 392 `outline-none` vs 61 `focus-visible:` in the codebase; 53 lines remove the outline with no `focus:`/`focus-visible:` ring on the same element. Some are inputs inside a `focus-within` wrapper (OK, e.g. `app/cart/page.tsx:61`, `components/support/Composer.tsx:59`), but real gaps include `components/product/MixBuilder.tsx:153,157` (brand/department selects), `components/product/MixBuilder.tsx:229`, `components/product/MixDiscovery.tsx:189`, `app/categories/CategoriesClient.tsx:138,354,414`, `app/requests/RequestsClient.tsx:238,301,416`, `components/layout/Navbar.tsx:360`, admin `app/admin/products/page.tsx` (8).
- Expected: ds rule `focus-visible:ring-2 focus-visible:ring-[#2EC4B6]` (as in `components/ds/index.tsx:85,117,160`). Boundary: Safe-now.

### A11Y-05 Images
- Severity: Low / Status: Mostly OK in buyer flows (PDP main image has `alt={product.name}`, `ProductDetailClient.tsx:807`; thumbnails are decorative inside labelled buttons, `:825-830`).
- Gaps: `components/product/AddProductDrawer.tsx:29` (no alt); admin `app/admin/page.tsx:415`, `app/admin/products/page.tsx:988,1016,1119`, `app/admin/settings/page.tsx:373`, `app/admin/layout.tsx:437` have no `alt`. Hard-coded `alt="Atlantis"` in `components/dashboard/Sidebar.tsx:146`. Boundary: Safe-now.

### RESP-01 Tables without horizontal scroll at 375 px
- Area: Supplier, admin / Category: Responsive / Severity: Medium (supplier), Low (admin) / Status: Open
- Evidence: `app/supplier/wholesale-offers/page.tsx:334` — 7-column `<table className="w-full">` with no `overflow-x-auto` wrapper (supplier-facing). Admin pages with tables and no overflow wrapper: `admin/email-analytics`, `admin/settings`, `admin/kyc`, `admin/disputes`, `admin/users`, `admin/finance`, `admin/newsletter/campaign`, `admin/newsletter/history`, `admin/logistics`, `admin/reviews`.
- Buyer pages are fine: `OfferComparison.tsx:44-45`, `GoodsInspectionClient.tsx:253-254`, `ProtectedPaymentsClient.tsx:137-138,178-179`, `dashboard/customer/payments/page.tsx:146-147` all wrap `min-w-[…]` tables in `overflow-x-auto`.
- Other fixed widths checked and safe: `components/ui/NotificationBell.tsx:139` (`w-[380px] max-w-[calc(100vw-24px)]`), `components/ui/Hero.tsx:18-19` (decorative, inside `overflow-hidden`), `components/ads/SponsoredBrandBanner.tsx:14` (`flex-col` on mobile; but `border-e pe-6` still applies on mobile — cosmetic). No buyer/supplier `w-[NNNpx] > 360` without a responsive guard was found.
- Boundary: Safe-now.

---
