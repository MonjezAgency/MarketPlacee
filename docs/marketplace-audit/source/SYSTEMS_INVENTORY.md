# Systems inventory

What Atlantis has today: frontend pages, backend modules and endpoints, data models, integrations, roles, background jobs, and the order, payment, refund, delivery, notification and support capabilities. Each system is marked **Implemented**, **Partial**, **Missing** or **Unverified**. The evidence (file:line) is in the area sections below and in [MARKETPLACE_GAP_REGISTER.md](MARKETPLACE_GAP_REGISTER.md).

Configured status of external services was read from code only (which environment variables are used and what happens when they are absent). No production configuration or secret was read.

## Overview

| System | Status | Notes (gap IDs) |
|---|---|---|
| Catalogue, search, departments, product pages | Implemented | Supplier identity is exposed on public product APIs (BUY-01) |
| Cart and checkout (order request) | Implemented, with gaps | Totals differ between steps (BUY-06); carrier quotes are invented (PLT-29, BUY-05); guest cart isn't merged at sign-in |
| Order confirmation workflow (supplier accept → Atlantis approve → buyer accepts changed terms) | Implemented | Server-enforced (`orders/order-workflow.ts`); bypassed by the Stripe webhook (TX-03); mixed loads can't be confirmed by suppliers (SUP-08) |
| Delivery-charge calculation (rates, hubs, quote-required) | Implemented | `backend/src/fulfillment`; no real hubs or rates configured yet |
| Payment collection | **Partial / disconnected** | Stripe intent and webhook code exist; the payment page is not linked; the normal flow is "the team sends payment details" |
| Payment recording (`paymentStatus`, `paidAt`) | **Missing** | Never written (TX-05) |
| Escrow | **Missing** (fields only) | Fields exist; release is never called; the Terms still promise it (CNT-01) |
| Deposits | **Missing** | Not modelled |
| Refunds | **Missing / broken** | Stripe refund call can't succeed (TX-06); no manual refund record |
| Disputes | Partial | Buyer form and admin queue work; no window, SLA, evidence upload or supplier notification (TX-13) |
| Returns (physical) | Missing | Policy text only |
| Shipments and tracking | Partial | Staff can set carrier and tracking; public tracking leaks data (TX-07); `/dashboard/track` is broken; the mock page was replaced by a redirect in this phase |
| Inspections | Implemented (staff-recorded) | Reports visible to buyers; no hub inspections without verified hubs |
| Invoices | Partial / inconsistent | Generated on delivery in USD with 5% tax and no freight (TX-09, DES-08); endpoints lack access control (TX-02) |
| Finance, commissions, supplier earnings and payouts | Partial / unsafe | Open endpoints (TX-01); earnings leak buyer totals (SUP-02); payout details can't be saved (SUP-03) |
| KYC | **Partial**: API exists, no working UI | The simulation was replaced with an honest notice in this phase (BUY-02, SUP-05); the admin queue calls a wrong route (SUP-07) |
| Support assistant and order conversations | Implemented | Private per-party order threads; the AI depends on a server key; escalations aren't flagged (CNT-09 … CNT-11) |
| Notifications (in-app, email) | Implemented, with gaps | An IDOR on notifications (PLT-08); misleading email copy (CNT-04, CNT-05) |
| Reviews | Implemented | Any signed-in user can post or rate (CNT-17) |
| Authentication (JWT, refresh, Google, 2FA, reset) | Implemented, with critical gaps | 2FA bypass (PLT-01); sessions survive blocks (PLT-09) |
| Roles and permissions | Partial | Many controllers lack role guards (R1); team permissions not enforced (PLT-14) |
| Localization (7 languages) | Partial | The dictionaries cover the shared chrome, Returns, the buyer order list and order page, Payments and the KYC notice; 111 routes rely on the machine translator (L10N-01) |
| Security module (IP blocking, lockdown, auto-healer) | Display-only | PLT-17 |
| Background jobs | Implemented | Some send inaccurate notifications (PLT-16); fraud flags every unpaid order over 10,000 |

## Design work completed in this phase

- **Buyer order page:** redesigned and fully localized in 7 languages.
- **Payments & invoices:** a new read-only page.
- **Returns & Refunds and order cards:** built in round 10, corrected in this phase.
- **KYC:** the simulation was replaced by an honest notice.
- **Order tracking:** the mock was replaced by a redirect to the order page.
- **Supplier pages:** false escrow, commission and encryption claims removed; dead buttons removed; an unused data poll removed.
- **Notifications:** the bell follows the stored links.
- **Links:** dead links fixed.
- **Invoice print:** user text is now escaped (an XSS fix).

## Platform: backend modules, endpoints, data model, integrations, jobs, roles, admin pages

#### (a) Backend modules

Modules are registered in `b/app.module.ts:46-85`. Global providers: `ThrottlerGuard` (100 requests per 60 s), `TransformInterceptor`, `SecurityInterceptor`, `AuditInterceptor` and `PricePrivacyInterceptor` (`:87-110`). Global pipes and filters: `ValidationPipe({whitelist, transform, forbidNonWhitelisted in prod})` and `SecurityExceptionFilter` (`b/main.ts:132-138`). Many handlers type their body as `any`, so the ValidationPipe validates nothing for them (for example `auth.controller.ts:23,58`).

| Module | Controllers (endpoints) | Status | Notes |
|---|---|---|---|
| admin | AppConfigController (19), AuditController (1), DashboardController (3), TeamController (5); dead `admin/SecurityController` (5, not registered) | Working; gaps | PLT-02, PLT-21, PLT-37 |
| ads | AdsController (8) | Partial | Public `GET /ads`; admin UI at legacy `/dashboard/admin`; `/admin/placements` is flagged `soon` |
| ai-agent | AiAgentController (5) | Partial | Hourly scan (PLT-16); public pricing chat (PLT-04); in-memory reports |
| app (root) | AppController (8) | Working | Public config, terms, contact |
| auth | AuthController (29) | Working; serious gaps | PLT-01, 10, 11, 13, 20, 25, 26 |
| chat | ChatController (11) + ChatGateway (WS `/chat`) | Working | Ownership checked for order threads (`b/chat/chat.service.ts:209-223`); PLT-42 |
| coupons | CouponsController (5) | Working | Admin-only CRUD |
| discounts | DiscountsController (9) | Unguarded / unused by pricing | PLT-07, PLT-40 |
| disputes | DisputesController (7) | Working | Ownership check `b/disputes/disputes.controller.ts:62-67` |
| email | EmailAdminController (4) | Working | Resend primary, SMTP fallback |
| email-tracking | EmailTrackingController (4) | Working; open redirect | PLT-19 |
| finance | FinanceController (22) | Unguarded | PLT-06; weekly and monthly report crons |
| fulfillment | Public (1), Supplier (4), Admin (5) | Working | Delivery-charge source of truth |
| health | HealthController (3) | Working | Public; leaks error text (PLT-31) |
| i18n | I18nController (1) | Working; abuse risk | PLT-30 |
| invoices | InvoiceController (5) | Unguarded | PLT-05 |
| kyc | KycController (13) | Working | Private Supabase bucket and signed URLs |
| lists | ListsController (8) | Working | Scoped by `req.user.sub`; reminder cron |
| newsletter | NewsletterController (11) | Working | PLT-34 |
| notifications | NotificationsController (4) | Working | Correctly scoped |
| offers | OffersController (9) | Working | Approval blasts email to consented recipients only (`b/offers/offers.service.ts:390-414`) |
| orders | OrdersController (32), MixedLoadsController (8) | Working | PolicyGuard on 3 routes; workflow cron |
| owner | OwnerController (12) | Working (documented only) | OwnerGuard; permissions not enforced (PLT-14) |
| payments | PaymentsController (6), StripeWebhookController (1) | Partial | Escrow semantics; no webhook idempotency (PLT-18) |
| pricing | (no controller) | Library | |
| products | ProductsController (35), PriceHistoryController (2), TargetPricesController (5), PlacementController (4), ReviewsController (3), AdminReviewsController (2), SupplierCatalogController (19) | Working | PLT-23, PLT-43 |
| security | SecurityController (6) | Display-only controls | PLT-17 |
| shipping | DeliveryPolicyController (2), AdminDeliveryPolicyController (2), ShipmentController (5), ShippingController (4) | Partial / stubs | PLT-12, PLT-29 |
| storage | (service) | Working if configured | PLT-46 |
| support | SupportAssistantController (6) | Working | Attachment ownership check (`b/support/support-assistant.service.ts:83-87`) |
| users | UsersController (21) | Working; gaps | PLT-08, 21, 33 |
| wishlist | WishlistController (4) | Working | Scoped to user |

Total: 384 HTTP route handlers (379 registered; the 5 in the dead admin SecurityController are excluded), plus 1 WebSocket gateway.

#### (b) Endpoint list by controller

Legend:
- `JWT` = JwtAuthGuard / AuthGuard('jwt'); `R` = RolesGuard; `optJWT` = OptionalJwtAuthGuard; `Policy` = PolicyGuard ownership check; `OwnerOnly` = OwnerGuard.
- `[…]` = allowed roles. OWNER always passes RolesGuard (`b/auth/roles.guard.ts:20-21`).
- `PUBLIC` = no auth.
- "(no roles → any signed-in)" = RolesGuard is present but no `@Roles`, so the route is open to any signed-in user.
- `thr` = route throttle; otherwise the global 100/min applies.
- `:N` = line in the controller file.
- Role abbreviations: OWN, ADM, MOD, SUP(port), DEV, LOG, EDT, SUPPLIER, CUST.

#### AppConfigController (`admin/app-config.controller.ts`) — `/admin/config`; JWT+R [OWN,ADM,MOD,EDT] on all
- GET/POST /admin/config/markup :23/:29 · GET /admin/config/all-products :37 · GET /admin/config/pending-products :42
- PUT /admin/config/products/:id/approve :47 · PUT …/reject :52
- GET/POST /admin/config/homepage-categories :57/:63 · GET/POST /admin/config/allowed-brands :70/:75
- POST /admin/config/currency :84 · GET/POST /admin/config/default-unit :89/:94
- GET/POST /admin/config/placements :100/:105 · GET/POST /admin/config/terms :112/:117
- GET/POST /admin/config/homepage-banners :123/:128

#### AuditController — `/admin/audit`
- GET /admin/audit — JWT+R [ADM] :15

#### DashboardController — `/dashboard`
- GET /dashboard/admin — JWT+R [ADM,SUP,MOD,DEV,LOG,OWN] :15
- GET /dashboard/admin/notifications — same :21
- GET /dashboard/supplier — JWT+R [SUPPLIER] :27

#### TeamController — `/admin/team`; JWT+R [ADM,OWN,DEV]
- GET /admin/team :19 · POST /admin/team/invite :24 · DELETE /admin/team/:id :29 · POST /admin/team/:id/verify-kyc :35 · POST /admin/team/send-invite :40

#### (dead) admin SecurityController (`admin/security.controller.ts`) — not registered
- GET status, GET agent-status, POST agent-fix, POST lockdown, POST unblock (all [ADM])

#### AdsController — `/ads`
- GET /ads — optJWT :17
- GET /ads/supplier/my-ads, POST /ads/supplier/request, DELETE /ads/supplier/:id — JWT+R [SUPPLIER] :28/:36/:44
- GET /ads/admin/all, POST /ads/admin/create, PUT /ads/admin/:id/status, DELETE /ads/admin/:id — JWT+R [ADM] :55/:62/:69/:77

#### AiAgentController — `/ai-agent`
- POST /ai-agent/scan, GET /ai-agent/reports, GET /ai-agent/reports/latest — JWT+R [ADM,OWN] :16/:24/:32
- POST /ai-agent/analyze-complaint — JWT (any signed-in) :39
- **POST /ai-agent/pricing-chat — PUBLIC** :45 (PLT-04)

#### AppController — `/`
- GET / · GET /config/homepage-categories · GET /config/currency · GET /config/default-unit · GET /config/homepage-banners · GET /config/terms — PUBLIC
- GET /config/markup — optJWT (relative markups for non-staff) :56
- POST /contact — PUBLIC (global throttle only) :111

#### AuthController — `/auth`
- POST login — PUBLIC (no route throttle) :23
- POST register (thr 5/min) :58 · POST verify-email (10) :75 · POST resend-verification (5) :81 · POST reset-password/check (20) :87 — PUBLIC
- POST change-email (5), POST change-email/confirm (10), DELETE change-email — JWT :94/:102/:108
- POST forgot-password (5) — PUBLIC :114
- **POST emergency-reset — PUBLIC, secret-gated, no route throttle** :133
- POST reset-password — PUBLIC :144
- POST change-password — JWT (+ step-up if 2FA) :150
- POST refresh — PUBLIC, SkipThrottle :157
- GET me, GET socket-token — JWT :177/:188
- GET 2fa/status, POST 2fa/setup, POST 2fa/enable (10), POST 2fa/disable (10) — JWT :197/:201/:206/:211
- POST 2fa/login-verify (10) — PUBLIC :215
- POST email-otp/send (3), POST email-otp/verify (10) — JWT :227/:232
- GET sessions, DELETE sessions/:id, POST sessions/revoke-others — JWT :240/:246/:252
- POST logout — PUBLIC :257
- POST google-login (20) — PUBLIC :277
- **POST seed-admin — PUBLIC, secret-gated** :293

#### ChatController — `/chat`; JWT+R
- POST send, GET messages, PATCH read — any signed-in :16/:23/:52
- GET admin/conversations, PATCH admin/switch/:userId, PATCH admin/switch-ai/:userId — [ADM,SUP,DEV,LOG,OWN] :29/:35/:41
- GET admin/messages/:userId — [ADM,SUP,DEV,LOG] :47
- POST order/:orderId/send, GET order/:orderId/messages, GET my-order-chats — any signed-in (service checks the order party) :60/:67/:74
- GET admin/order-chats — [ADM,SUP,OWN,LOG] :83

#### CouponsController — `/coupons`
- GET validate/:code — JWT :14
- POST /, GET /, POST :id/toggle, DELETE :id — JWT+R [ADM] :21/:35/:42/:49

#### DiscountsController — `/discounts`; JWT only (any signed-in) — PLT-07
- GET tiers/:productId · POST tiers · DELETE tiers/:id · GET calculate · GET groups · POST groups · DELETE groups/:id · POST groups/:id/members · DELETE groups/:groupId/members/:userId

#### DisputesController — `/disputes`; JWT+R
- POST / [CUST] :19 · GET my [CUST] :35
- GET / , GET stats, PATCH :id/resolve, PATCH :id/status — [ADM,SUP,MOD,DEV,LOG,OWN]
- GET :id — any signed-in (ownership check in handler) :63

#### EmailTrackingController — `/email`
- GET track/open/:trackingId.png, GET track/click/:trackingId — PUBLIC, SkipThrottle :32/:52 (PLT-19)
- GET analytics/overview (60/min), GET analytics/campaigns/:id — JWT+R [OWN,ADM,MOD] :72/:81

#### EmailAdminController — `/admin/email`; JWT+R [OWN,ADM]
- GET status · GET preview · GET consent · POST test-send (3/hour)

#### FinanceController — `/finance`; JWT+R, **no class roles**
- GET export/statement — [ADM,OWN,SUP] :28
- POST manual-invoice — [ADM] :174
- **Any signed-in user:** GET report · POST report/send · GET/POST credit-terms · GET credit-terms/:userId · DELETE credit-terms/:id · GET credit-check/:userId · GET/POST tax-exemptions · POST tax-exemptions/:id/review · GET/POST warehouses · PUT/DELETE warehouses/:id · GET audit/order/:orderId · GET audit/user/:userId · GET audit/recent · GET reports/revenue · GET reports/supplier-earnings (`:45-170`)

#### Fulfillment — `fulfillment/fulfillment.controller.ts`
- GET /fulfillment/hubs — PUBLIC (60/min) :16
- GET/PUT /fulfillment/supplier/settings, PATCH …/products/:id/method, POST …/preview (60/min) — JWT+R [SUPPLIER]
- GET /fulfillment/admin — [ADM,OWN,LOG] :50
- POST/PATCH /fulfillment/admin/hubs(/:id) — [ADM,OWN] :54/:58
- POST/PATCH /fulfillment/admin/rates(/:id) — [ADM,OWN,LOG] :62/:66

#### HealthController — `/health`
- GET /health, GET /health/database, GET /health/payments — PUBLIC

#### I18nController — `/i18n`
- POST /i18n/translate — PUBLIC (60/min) :19

#### InvoiceController — `/invoices`; JWT only (any signed-in) — PLT-05
- GET / · GET my · GET :id · POST generate/:orderId · POST :id/pay

#### KycController — `/kyc`; JWT
- POST submit · POST upload (3 files × 10 MB, jpeg/png/webp) · GET status — any signed-in
- GET admin/signed-url · GET admin/pending · GET admin/all · GET admin/stats · GET admin/:id · PATCH admin/:id/verify · PATCH admin/:id/reject · PATCH admin/:id/revoke · PATCH admin/users/:userId/resync — +R [OWN,ADM,MOD]
- POST admin/quick-verify — [ADM]

#### ListsController — `/lists`; JWT (scoped to the user)
- GET / · POST / · POST from-order/:orderId · PATCH :id · DELETE :id · POST :id/items · PATCH :id/items/:itemId · DELETE :id/items/:itemId

#### NewsletterController — `/newsletter`
- POST subscribe (optJWT, 5/min) · POST confirm (20/min) · POST unsubscribe (20/min) — PUBLIC
- GET export · GET / · DELETE :id · POST bulk-action · POST bulk-upload · POST send-campaign · POST test-email · GET campaigns · GET campaigns/:id · DELETE campaigns/:id — JWT+R [ADM,OWN]

#### NotificationsController — `/notifications`; JWT (scoped)
- GET / · GET unread-count · PATCH :id/read · PATCH read-all

#### OffersController — `/offers`; JWT+R
- POST / and POST bulk-upload — [SUPPLIER,ADM,OWN]
- GET mine — [SUPPLIER]
- GET / — [ADM,OWN,MOD]
- GET :id — [SUPPLIER,ADM,OWN,MOD]
- PATCH :id/approve, PATCH :id/reject — [ADM,OWN]
- DELETE :id — [SUPPLIER,ADM,OWN]
- POST send-test-email — [ADM,OWN]

#### MixedLoadsController — `/mixed-loads`; JWT (service scoped to the user)
- POST quote · POST / · GET / · GET :id/candidates · GET :id · POST lines · PUT :id · DELETE :id

#### OrdersController — `/orders`; JWT+R
- POST :id/supplier-invoice, DELETE :id/supplier-invoice — [SUPPLIER,ADM,OWN,MOD,SUP,LOG] + Policy(ORDER) :62/:95
- POST / and POST quote — [CUST,ADM,OWN,SUPPLIER] :106/:124
- GET stats — [ADM,OWN,SUP,MOD,DEV,LOG] :131
- GET logistics/assigned — [LOG,ADM,OWN]
- GET admin-analytics — [ADM,OWN]
- GET supplier/analytics — [SUPPLIER]
- GET my-orders — any signed-in (role-branched) :163
- GET export/excel, GET / — [ADM]
- GET :id — any signed-in (CUSTOMER scoped; staff list; others 403) :202
- POST :id/supplier-accept, POST :id/supplier-decline — [SUPPLIER]
- PATCH :id/status — [SUPPLIER,ADM,OWN,MOD,SUP,LOG] + Policy :231
- PATCH :id/shipping — [ADM,LOG,OWN]
- POST :id/approve, POST :id/reject, POST :id/request-confirmation, POST :id/amend — [ADM,OWN]
- GET :id/workflow — [ADM,OWN,SUP,MOD,LOG]
- POST :id/accept-terms, POST :id/confirm-delivery, DELETE :id/customer-hide — [CUST]
- POST :id/inspections, PATCH :id/inspections/:inspectionId — [ADM,OWN,LOG]
- PATCH bulk-status, DELETE bulk, DELETE :id — [ADM]
- POST :id/notify-delivery-day — [ADM,LOG]

#### OwnerController — `/owner`; JWT + OwnerOnly
- GET dashboard · GET team · GET team/:userId · PATCH team/:userId/permissions · PATCH team/:userId/role · PATCH team/:userId/suspend · PATCH team/:userId/activate · GET team/kyc/pending · PATCH team/:userId/kyc/approve · PATCH team/:userId/kyc/reject · GET audit-log · GET permissions/list

#### PaymentsController — `/payments`; JWT (+R per route)
- POST create-intent — [CUST,ADM,OWN,SUPPLIER]
- POST connect/onboard — [SUPPLIER,ADM,OWN,DEV]
- GET my-earnings, PATCH payout-settings, GET connect/status — [SUPPLIER]
- GET admin/revenue — [ADM]

#### StripeWebhookController
- POST /api/payments/webhook — PUBLIC (Stripe signature) :25

#### PriceHistoryController (`products/market.controller.ts`) — `/products`
- GET :id/compare, GET :id/price-history — optJWT

#### TargetPricesController — `/target-prices`; JWT+R
- POST / (10/min), GET mine, PATCH :id/withdraw — [CUST,SUPPLIER]
- GET /, PATCH :id/respond — [TP_STAFF]

#### PlacementController — `/placements`; JWT+R
- POST request — [SUPPLIER,ADM]
- GET / — [ADM]
- GET my-placements — [SUPPLIER]
- PUT :id/approve — [ADM]

#### ProductsController — `/products`
- GET / · GET search · GET cart/recommendations · GET targets · GET price-ticker · GET :id · GET :id/similar — optJWT
- GET ean/:ean, POST ean-lookup — **PUBLIC** :225/:245
- GET my-products, GET inventory — [SUPPLIER]
- PATCH :id/variant-stock — [SUPPLIER,ADM,OWN] (ownership in handler)
- GET admin/all — [ADM]
- PATCH :id/approve, PATCH :id/reject, PATCH :id/comment, POST bulk-reject — [OWN,ADM,MOD]
- PATCH :id/resend — [SUPPLIER,ADM,OWN]
- POST / — [SUPPLIER,ADM,OWN]
- POST upload-image — [SUPPLIER,ADM,OWN,MOD,EDT]
- POST upload-video, POST bulk-upload-preview, POST bulk-upload — [SUPPLIER,ADM]
- PATCH :id/status — [ADM]
- PATCH :id — [SUPPLIER,ADM] + Policy(PRODUCT)
- DELETE :id, POST bulk-delete — [ADM,OWN,MOD,SUPPLIER] (ownership in handler)
- POST bulk-approve — [ADM]
- POST admin/reattribute-to-platform — [OWN]
- POST admin/fix-currency, POST admin/recompute-prices — [ADM]
- POST :id/rate — JWT any :872
- GET dev/fixup — [ADM,OWN]

#### ReviewsController — `/products/:productId/reviews`
- GET / — PUBLIC
- POST /, DELETE :reviewId — JWT

#### AdminReviewsController — `/admin/reviews`; JWT+R [ADM,MOD]
- GET / · DELETE :reviewId

#### SupplierCatalogController — `/supplier-catalog`; JWT+R [SUPPLIER]
- GET overview · GET products · GET products/:id · GET products/:id/history · GET/PATCH preferences · GET reputation · GET import/schema · GET import/template · POST import/analyse · POST import/parse · POST import/validate · POST import/commit (40/min) · GET updates/template · POST updates/preview · POST updates/commit (10/min) · POST image-lookup (30/min) · POST image-lookup/accept (30/min)

#### SecurityController (`security/security.controller.ts`) — `/admin/security`; JWT+R [ADM]
- GET status · POST lockdown · POST unblock · GET agent-status · POST agent-fix · GET fraud-analysis

#### DeliveryPolicyController / AdminDeliveryPolicyController
- GET /shipping/destinations — PUBLIC
- POST /shipping/check-destination — PUBLIC (60/min)
- GET/PUT /admin/delivery-policy — JWT+R [OWN,ADM]

#### ShipmentController — `/shipments`
- **GET track — PUBLIC** :12
- **GET order/:orderId — JWT any (no ownership check)** :17
- POST /, POST :id/updates, GET admin/all — JWT+R [ADM]

#### ShippingController — `/shipping`
- GET rates · POST agent-rates · GET carrier-rates (returns `[]`) · GET track/:trackingId — PUBLIC

#### SupportAssistantController — `/support-assistant`; JWT
- GET session · POST message (20/min) · POST message/:id/retry (20/min) · POST escalate (5/min) · POST attachments (15/min) · GET attachments/:owner/:file (ownership check)

#### UsersController — `/users`; JWT+R
- PATCH me, GET me/profile-status, GET/PATCH me/brand-preferences, GET/PATCH me/notification-prefs, POST me/avatar — [ADM,SUPPLIER,CUST,MOD,SUP,LOG,OWN] (EDT and DEV excluded)
- GET counts, GET / — [OWN,ADM,MOD,SUP]
- POST approve-all, POST :id/status, POST bulk-approve — [OWN,ADM,MOD]
- POST bulk-block, POST bulk-delete — [OWN,ADM]
- POST :id — [ADM,SUPPLIER,CUST,OWN] (self only) :231
- DELETE :id — [OWN,ADM] :239
- GET :id — [ADM,SUP,DEV,LOG,OWN] :246
- **GET :id/notifications, POST :id/notifications/:notifId/read — [ADM,SUPPLIER,CUST], IDOR** :253/:259
- GET me/data-export — [ADM,SUPPLIER,CUST] :267
- DELETE me — shadowed by `DELETE :id` :279
- GET repair-data-secure-2026 — shadowed by `GET :id` :285

#### WishlistController — `/wishlist`; JWT (scoped)
- GET / · POST :productId · DELETE :productId · GET check/:productId

#### WebSocket `ChatGateway` (namespace `/chat`)
- Events `send_message` and `mark_read`. Auth is a JWT in the handshake (`b/chat/chat.gateway.ts:33-64`).

#### Next.js API routes (`f/app/api/*`)
- `proxy/[...path]` is the authenticated pass-through. It treats a fixed list of paths as public, plus anonymous `GET products|ads` (`route.ts:24-73`).
- `auth/login`, `auth/2fa/login-verify`, `auth/logout`, `auth/socket-token` and `auth/[...nextauth]` handle sign-in.
- `admin/team(/[id])` → backend `/admin/team`.
- `fx` provides exchange rates (open.er-api.com, falls back to frankfurter.app).
- Other routes: `newsletter/subscribe`, `payment`, `products/bulk-upload`, `reviews(/[productId])`, `shipping/rates`, `wishlist(/[productId])`, `config/currency`, `internal/keep-warm`.
- Debug routes: `test` and `deployment-verify`, which is public and returns the environment.

#### (c) Prisma models (`backend/prisma/schema.prisma`)

"Used?" = referenced through `prisma.<model>` in `backend/src` (counted by grep).

| Model (line) | Purpose | Key relations | Used? |
|---|---|---|---|
| User :74 | Every account: buyer, supplier, staff, with auth, 2FA, verification and profile fields | products, offers, customer/supplier orders, notifications, sentMessages, reviews, wishlist, disputes, invoices, kycDocuments | Yes (182 refs). Duplicates: legacy `verificationToken` next to `emailVerifyCodeHash`; `kycStatus` next to KYCDocument; `stripeOnboarded` next to `stripeAccountId`; `permissions` stored but unenforced (PLT-14); Role `PAIR`/`SUBLAYER` unused |
| KYCDocument :172 | Identity documents (Supabase paths) | user | Yes |
| Product :190 | Catalog item with variants, packaging, buyer and supplier prices | supplier, warehouse?, placements, offers, orderItems, tieredPrices, reviews, wishlist, changeLog, targetPrices, priceObservations | Yes. Price fields overlap: `price`, `basePrice`, `supplierPrice`/`supplierCurrency`, `previousPrice`, plus `variantPrices` |
| ProductPlacement :291 | Paid or featured placement requests | product, history, coupons | Yes |
| ProductPlacementHistory :311 | Placement status history | placement | **Unused** |
| Order :324 | Order request with workflow, review, terms, shipping, payment and escrow fields | customer, supplier?, items, history, invoices, shipment, disputes, chatMessages, confirmations, inspections, escrow | Yes. `escrowStatus/escrowHeldAt/escrowReleasedAt` duplicate EscrowTransaction (PLT-40) |
| OrderSupplierConfirmation :407 | Per-supplier accept/decline with a deadline | order | Yes (cron expiry) |
| OrderInspection :426 | Inspection records | order | Yes (`b/orders/orders.service.ts:1223-1228`) |
| AtlantisHub :451 | Verified Atlantis hubs | — | Yes (fulfillment) |
| FreightRate :472 | Hub-to-country freight rates | — | Yes |
| SupplierFulfillment :495 | Supplier fulfillment settings | — | Yes |
| OrderStatusHistory :505 | Order status log | order | Yes |
| OrderItem :518 | Order lines with snapshots | order, product? | Yes |
| AdminActionLog :569 | Staff action audit | admin(User) | Yes (ADMIN-only writes, PLT-22) |
| SecurityLog :582 | Security events | — | Yes |
| BlockedIp :597 | IP blocks | — | Written, **never enforced** (PLT-17) |
| SecurityConfig :607 | Key/value (lockdown flag) | — | Written, never enforced |
| Coupon :615 | Discount codes | placement | Yes |
| AppConfig :629 | Global settings: markups, currency, banners, terms, categories, placements | — | Yes |
| Notification :637 | In-app notifications | user | Yes |
| TieredPrice :651 | Quantity discount tiers | product | Yes (unguarded management) |
| CustomerPriceGroup :666 | Customer discount groups | members | Only via `/discounts` |
| CustomerGroupMember :678 | Group membership | group | Only via `/discounts` |
| Invoice :690 | Invoices | order?, customer | Yes (unguarded) |
| CreditTerm :710 | Buyer credit limits | — | Only finance/invoices |
| TaxExemption :723 | Tax exemption certificates | — | Only finance |
| Warehouse :737 | Supplier warehouses (legacy, separate from AtlantisHub) | products | Yes |
| SupportMessage :753 | Support and order-thread chat | sender, orderContext? | Yes |
| Shipment :782 | Shipment and tracking | order | Yes |
| ShipmentUpdate :797 | Tracking events | shipment | Yes |
| Review :807 | Verified product reviews | product, user | Yes |
| Dispute :832 | Buyer disputes | order, customer | Yes |
| WishlistItem :849 | Wishlist | user, product | Yes |
| ProcessedWebhookEvent :866 | Stripe idempotency | — | **Unused** (PLT-18) |
| FinancialAuditLog :880 | Append-only money log | — | Yes |
| RefreshToken :904 | Hashed refresh tokens | — | Yes (but refresh never called through the proxy, PLT-25) |
| LoginAttempt :920 | Lockout counter | — | Yes |
| EscrowTransaction :941 | "Escrow" record per order | order | Yes (policy conflict, PLT-40) |
| Offer :973 | Supplier offers on products | supplier, product | Yes |
| Campaign :1032 | Newsletter campaigns | — | Yes |
| EmailEvent :1063 | Open and click tracking | — | Yes |
| NewsletterSubscriber :1084 | Subscribers with consent and double opt-in | — | Yes |
| TargetPriceRequest :1127 | Buyer and supplier target price asks | product, buyer | Yes |
| PriceObservation :1163 | Price history points | product | Yes |
| InviteToken :1176 | Invite links | — | **Unused** (PLT-02, PLT-35) |
| MixedLoad :1193 | Mixed pallet or truck draft | — | Yes |
| ShoppingList :1216 / ShoppingListItem :1232 | Reorder lists with reminders | items / list | Yes |
| UserSession :1252 | Device sessions for revocation | — | Yes |
| ProductChangeLog :1267 | Product change history | product | Yes |

There are 53 `@@index` declarations. Hot paths such as `Order(customerId|supplierId|status|createdAt|paymentStatus|reviewStatus)` and `Product(supplierId|status|category|createdAt)` are indexed. No obvious missing index was found for the queries reviewed. A possible exception is `LoginAttempt(email, success, createdAt)`, which is filtered on each login (`b/auth/auth.service.ts:75-81`; Unverified).

#### (d) Integrations

| Integration | Env vars | Behavior when missing | Status |
|---|---|---|---|
| Postgres / Prisma | `DATABASE_URL` | Boot fails | Required |
| JWT auth | `JWT_SECRET` (`JWT_REFRESH_SECRET` and `JWT_COOKIE_NAME` in `.env.example` are unused) | Falls back to a literal secret (`b/auth/auth.module.ts:36`); the socket gateway's verify fails (`b/chat/chat.gateway.ts:45`) | Configured by env; unsafe fallback |
| Field encryption | `ENCRYPTION_KEY` | Literal fallback keys (`b/security/crypto.service.ts:12`) | Unsafe fallback |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; FE `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `new Stripe(undefined)` at construction (`b/payments/stripe.gateway.ts:14-16`); `/health/payments` reports "not configured" (`b/health/health.controller.ts:47-49`); webhook verification fails | Partial (manual-capture "escrow") |
| Supabase Storage | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Warn, then likely a constructor throw (PLT-46); uploads throw 500 (`b/storage/supabase-storage.service.ts:55-58,163`); avatars fall back to inline data URLs under 500 KB (`b/users/users.controller.ts:142-150`) | Required for images, KYC and support attachments |
| OpenRouter (LLM) | `OPENROUTER_API_KEY`, `SUPPORT_AI_MODEL` | AI summary, complaint analysis, categorize, KYC check and column-mapping return null or a fallback; pricing chat uses a rule-based reply; translate returns the original text | Optional; free experimental model hard-coded |
| Email: Resend (primary) | `RESEND_API_KEY`, `RESEND_FROM` | Falls back to SMTP (`b/email/email.service.ts:97-161`); sender defaults to `onboarding@resend.dev` | Configured by env |
| Email: SMTP (fallback) | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, `ADMIN_EMAIL` | Send fails (boolean false); admin signup alert skipped when `ADMIN_EMAIL` is unset (`:894-896`) | Fallback |
| Google OAuth | FE `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`; BE `GOOGLE_CLIENT_IDS`/`GOOGLE_CLIENT_ID` (built-in default client ids, `b/auth/google-token.ts:11`) | NextAuth provider fails; NextAuth secret uses a literal fallback | Working (PLT-26) |
| Google token verification | — (calls `oauth2.googleapis.com/tokeninfo`) | Sign-in fails | Working |
| EAN lookup | `EAN_SEARCH_TOKEN` | Falls back to Open Food/Beauty/Products Facts and Bing scraping (`backend/.env.example`) | Optional |
| Exchange rates | none (FE `f/app/api/fx/route.ts:24,37`: open.er-api.com → frankfurter.app) | Second source, then the caller's fallback | Working, keyless |
| Nominatim (OSM) reverse geocoding | none (called from the browser: `f/app/checkout/page.tsx:475`, `f/app/account/address/page.tsx:93`, `f/components/layout/Navbar.tsx:261`) | Address autofill unavailable | Working; no User-Agent/attribution control from the browser and subject to the OSM usage policy (Unverified) |
| Carrier APIs (DHL, Aramex, DB Schenker, LKW Walter, Raben) | `DHL_API_KEY`, `ARAMEX_*` (render.yaml only; not read in code) | Stubs return `[]` or `UNKNOWN`; quotes are formulas (PLT-29) | Not integrated |
| UPCitemdb / OpenFoodFacts | none (browser calls in `f/app/admin/offers/page.tsx`) | Lookup fails | Ad-hoc |
| Platform settings | `PLATFORM_FEE_PERCENT` (default 5), `DEFAULT_CURRENCY`, `FRONTEND_URL`, `BACKEND_URL`, `BACKEND_PUBLIC_URL`, `PLATFORM_OWNER_EMAIL`, `OWNER_PASSWORD`, `SEED_ADMIN_SECRET`, `PROFILE_REMINDERS_ENABLED`, `SOCIAL_*`; FE `NEXT_PUBLIC_*`, `CRON_SECRET` | Various defaults; emergency-reset disabled if `SEED_ADMIN_SECRET` is unset | — |

#### (e) Background jobs

| Job | Schedule | What it does | Evidence |
|---|---|---|---|
| `OrderWorkflowCron.expire` | hourly | Expires overdue supplier confirmations and notifies Atlantis | `b/orders/order-workflow.cron.ts:11-19` |
| `ListRemindersService.tick` | every 10 min | Reorder reminder notifications, claimed with a conditional update | `b/lists/list-reminders.service.ts:26-44` |
| `ProfileRemindersService.tick` | every 5 min | Incomplete-profile reminder emails (up to 2; disable with `PROFILE_REMINDERS_ENABLED=false`) | `b/users/profile-reminders.service.ts:20-40` |
| `ReportsService.sendWeeklyReport` | Mon 08:00 | Financial report email to admins | `b/finance/reports.service.ts:18-28` |
| `ReportsService.sendMonthlyReport` | 1st 08:00 | Monthly report email | `b/finance/reports.service.ts:32-42` |
| `AiAgentService.runScheduledScan` | hourly | Scan plus buyer and supplier notifications (PLT-16) | `b/ai-agent/ai-agent.service.ts:68-104` |
| `VulnerabilityScannerService.runScheduledScan` | daily 00:00 | HTTP self-probes (mostly meaningless) | `b/security/vulnerability-scanner.service.ts:18-31` |
| `AutoHealerService.detectAnomalies` | every 30 s | No-op | `b/security/auto-healer.service.ts:19-24` |
| `ThreatDetectionService.analyzeThreats` | `setInterval` every 5 min | Order-fraud heuristics; writes BlockedIp (not enforced) | `b/security/threat-detection.service.ts:14-80` |
| Vercel cron `/api/internal/keep-warm` | daily | Ping (PLT-45) | `frontend/vercel.json` |

There is no queue system (no Bull or Redis). All jobs run in the single API process. Running more than one replica would duplicate the cron jobs, except the list reminders, which use a claim pattern.

#### (f) Roles and permission matrix (summary)

Roles: OWNER, ADMIN, MODERATOR, SUPPORT, EDITOR, DEVELOPER, LOGISTICS (staff), SUPPLIER, CUSTOMER, plus unused PAIR and SUBLAYER (`backend/prisma/schema.prisma:13-26`).

- **Guard model.** The role in the JWT is trusted; it is not re-read from the DB (PLT-09). OWNER bypasses every `@Roles` (`b/auth/roles.guard.ts:20-21`). RolesGuard fails open when a route has no `@Roles` (`:14-16`; PLT-06). `PolicyGuard` checks ownership only on order PATCH status, supplier-invoice and product PATCH, and staff bypass it (`b/auth/policy.guard.ts:27-30`). `PermissionsGuard` and `TeamKycGuard` are unused (PLT-14).

| Capability | OWN | ADM | MOD | SUP | EDT | DEV | LOG | SUPPLIER | CUST |
|---|---|---|---|---|---|---|---|---|---|
| Owner dashboard, role and permission changes | ✓ | – | – | – | – | – | – | – | – |
| Create staff (team invite; can mint OWNER, PLT-02) | ✓ | ✓ | – | – | – | ✓ | – | – | – |
| Markup, currency, terms, banners, product approve (`/admin/config`) | ✓ | ✓ | ✓ | – | ✓ | – | – | – | – |
| User list and approve | ✓ | ✓ | ✓ | list | – | – | – | – | – |
| Block or delete users | ✓ | ✓ | status | – | – | – | – | – | – |
| KYC review | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| Orders (admin view, status) | ✓ | ✓ | ✓ | ✓ | – | stats | ✓ | own lines | own |
| Order approve, reject, amend | ✓ | ✓ | – | – | – | – | – | – | – |
| Fulfillment hubs / rates | ✓ | ✓ | – | – | – | – | rates | settings | – |
| Security console | ✓ | ✓ | – | – | – | – | – | – | – |
| Newsletter and campaigns | ✓ | ✓ | analytics | – | – | – | – | – | – |
| Support chat (staff) | ✓ | ✓ | – | ✓ | – | ✓ | ✓ | – | – |
| Finance routes without `@Roles` (PLT-06) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Invoices (PLT-05) and discounts (PLT-07) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

- **Frontend.** `f/middleware.ts` only checks that a `token` cookie exists on protected prefixes. Role routing is client-side in `f/app/admin/layout.tsx:347-361` and `f/app/dashboard/page.tsx:35-42`, so the backend is the only real gate.

#### (g) Admin pages (`f/app/admin/*`)

| Page | What it does / backend calls | Notes |
|---|---|---|
| `/admin` | KPIs: `/orders/admin-analytics`, `/orders/stats`, `/disputes/stats`, `/products?limit=1`, `/users?status=PENDING_APPROVAL` | Random sparkline (PLT-28) |
| `/admin/owner` | Owner dashboard: `/owner/dashboard`, `/owner/team`, audit-log, permissions, role, suspend/activate, team KYC | Documented only; permissions not enforced (PLT-14) |
| `/admin/products` (+ `new`, `[id]/edit`) | Catalog moderation, edit, bulk upload, EAN lookup, fix-currency | Large page (2,245 lines) |
| `/admin/wholesale-offers` | Approve or reject supplier offers (`/offers/:id/approve|reject`) | |
| `/admin/offers` (+ `new`) | Offer and placement tooling; `new` calls missing `/admin/users`, `/admin/products` | PLT-27; browser calls to UPCitemdb/OFF |
| `/admin/orders` (+ `[id]`) | Order list, status, bulk, shipments, delivery-day notify | Backend list not paginated |
| `/admin/target-prices` | Respond to target-price requests | |
| `/admin/delivery` | Delivery countries policy (`/admin/delivery-policy`) | |
| `/admin/fulfillment` | Hubs and freight rates (`/fulfillment/admin*`) | |
| `/admin/suppliers`, `/admin/buyers` | Directories (`/users?role=…`, `/users/:id`, `/users/counts`) | |
| `/admin/finance` | Credit terms, tax exemptions, warehouses, invoices, manual invoice | Calls missing `/admin/users`; backend unguarded (PLT-05, PLT-06) |
| `/admin/billing` | Revenue, tax exemptions, Excel export | |
| `/admin/discounts` | Tiers and groups | Calls missing `/admin/users`; backend unguarded |
| `/admin/newsletter` (+ `campaign`, `history`) | Subscribers, import, export, campaigns | `campaign` calls missing `/admin/buyers` |
| `/admin/email-analytics` | `/email/analytics/overview`, offer test email | |
| `/admin/email-setup` | `/admin/email/status|preview|consent|test-send` | |
| `/admin/coupons` (+ `new`) | Coupon CRUD | |
| `/admin/banners` (+ `[section]`), `/admin/homepage`, `/admin/categories` | Homepage banners, categories (AppConfig), product categories | |
| `/admin/placements` | Ad slots stored in AppConfig plus localStorage (`getAdPlacements`) | Nav marks "soon" |
| `/admin/support` | Chat, order chats, disputes, KYC tile | Calls missing `/kyc/pending` |
| `/admin/disputes` | Dispute resolution | |
| `/admin/kyc` | KYC queue with signed URLs | |
| `/admin/users` | User directory, status, delete, bulk | |
| `/admin/team` | Team via Next `/api/admin/team` → `/admin/team`; permissions list from `/owner/permissions/list` | PLT-02 |
| `/admin/invite` | Bulk invite emails (`/admin/team/send-invite`) | PLT-35 |
| `/admin/security` | Security status, lockdown, unblock, "agent" | Display-only (PLT-17) |
| `/admin/settings` | Currency, default unit, markup, change password; role editor calls missing `/admin/roles` | PLT-27 |
| `/admin/pricing` | Markup tiers (`/admin/config/markup`) | Editable by EDITOR/MOD (PLT-21) |
| `/admin/terms` | Terms and conditions (`/admin/config/terms`) | |
| `/admin/ai-agent` | AI scan reports (`/ai-agent/reports`, `/scan`) | In-memory reports |
| `/admin/reviews` | Review moderation (`/admin/reviews`) | Not in sidebar |
| `/admin/logistics` | Shipments via `/api/shipments/admin/all` (no such route) | Broken, orphan (PLT-27) |
| `/admin/tech` | Tech dashboard with hard-coded data; `/health` | PLT-28 |

Legacy duplicate: `/dashboard/admin` (`f/app/dashboard/admin/page.tsx`) — users and ads console with no client role check.

## Buyer experience

| System | Status | Evidence | Notes |
|---|---|---|---|
| Home page | Implemented (content partly unverified) | `app/HomeClient.tsx:180` `/products?sort=popular` (backend `products.service.ts:474`) | Claims and brand wall (BUY-14) |
| Catalog / categories / departments | Implemented | `app/categories/CategoriesClient.tsx:52-67,206-212`; `products.controller.ts:105-123` | Facets (brands, origins, price for signed-in), listed=new, page size, export |
| Search (suggestions + relevance) | Implemented | `lib/api.ts:187-199` → `GET /products/search`; relevance ranking `products.service.ts:510-535` | Leaks supplier (BUY-01) |
| Filters & sorting | Implemented | `CategoriesClient.tsx:54,487`; price sort and filter hidden for anonymous users (`products.controller.ts:109-113`) | |
| Product detail page | Implemented | `app/products/[id]/ProductDetailClient.tsx`; SSR metadata and JSON-LD `page.tsx:44-121` | Copy issues BUY-20/22 |
| Offer comparison / price history | Implemented | `products/market.controller.ts:19-29`; `components/product/OfferComparison.tsx`, `PriceHistorySection.tsx` | Anonymised suppliers; "In stock" BUY-26 |
| Reviews | Implemented | `products/reviews.controller.ts`; `components/product/ReviewSection.tsx` | Not purchase-gated; legacy `/rate` abuse (BUY-15) |
| Price visibility (signed-out) | Implemented | `products/price-visibility.ts`; `products.controller.ts:122,130,276,285,300` | Supplier data still leaks (BUY-01) |
| Margin privacy (markups) | Implemented | `common/price-privacy.ts`; `app.controller.ts:54-60` | Wording on PDP (BUY-20) |
| Currency conversion | Implemented | `app/api/fx/route.ts` (live ER-API, ECB fallback); `lib/currency.ts` (no invented rates); checkout EUR note `checkout/page.tsx:682-686` | Platform default currency blocked for anonymous users (BUY-23) |
| Delivery-country eligibility | Implemented (checkout only) | `shipping/delivery-policy.controller.ts:15-31`; `checkout/page.tsx:132-149` | Not checked in cart, PDP or registration |
| Delivery charge (server) | Partial | `orders.service.ts:384` stores `shippingCost` from `quote.fulfillment`; `DeliveryBreakdown` | Inconsistent display (BUY-06); fake carrier list (BUY-05) |
| Deals (price drops + coupons) | Partial | `app/deals/page.tsx:57-58` | Coupons admin-only (BUY-12) |
| Wholesale info page | Partial (inaccurate) | `app/wholesale/WholesaleClient.tsx` | BUY-13 |
| Sponsored placements | Implemented | `/ads?placement=` `ads.controller.ts:15-21`; `components/marketplace/AdPlacements.tsx` | Supplier data in payload (BUY-01) |
| Buyer target prices | Implemented | `market.controller.ts:33-69`; `components/product/TargetPriceDialog.tsx`; `dashboard/customer/targets/page.tsx` | |
| Public buyer-demand page (/targets) | Implemented | `products.controller.ts:271-277`; `app/targets/TargetsClient.tsx` | Naming and CTA (BUY-30) |
| Sourcing requests / RFQ | Partial | `app/requests/RequestsClient.tsx:651-700` → `POST /contact` | Email plus localStorage only; no model (BUY-16) |
| Cart | Implemented (client-side) | `lib/cart.tsx`; `app/cart/page.tsx`; server quote `POST /orders/quote` (`lib/wholesale.ts:82`) | No guest merge (BUY-11) |
| Mixed loads | Implemented | `orders/mixed-loads.controller.ts`; `lib/wholesale.ts:99-132` | |
| Coupons at checkout | Implemented | `GET /coupons/validate/:code` (`coupons.controller.ts:12-16`); quote applies the coupon | |
| Checkout UI | Partial | `app/checkout/page.tsx` | BUY-05/06/07/08/09/28 |
| Order confirmation page | Partial (orphaned) | `app/checkout/confirmation/page.tsx` | Only reached through payment (BUY-08) |
| Wishlist / saved | Implemented (legacy UI) | `wishlist.controller.ts`; `app/wishlist/page.tsx`; `/saved` redirect | BUY-18 |
| Shopping lists + reminders + save-from-order | Implemented | `lists/lists.controller.ts`, `lists/list-reminders.service.ts:30-34`; `dashboard/customer/lists/page.tsx`; `SaveToListDialog` | Adds price 0 (BUY-07) |
| Buyer overview | Implemented | `dashboard/customer/page.tsx` | Limits (BUY-25) |
| Orders list / detail | Implemented (being reworked in WIP) | `orders.controller.ts:162-212`; `dashboard/customer/orders/*` | |
| Per-order tracking page | Missing (fake) | `orders/[id]/track/page.tsx` | BUY-03 |
| Public tracking lookup | Missing (broken) | `app/dashboard/track/page.tsx:24` | BUY-04 |
| Notifications | Partial | `notifications.controller.ts`; `hooks/useNotifications.ts` | No nav entry; socket broken (BUY-17) |
| Settings: profile, avatar, password, notification prefs, brand prefs | Implemented | `dashboard/customer/settings/page.tsx:63-119`; `users.controller.ts:37-134` | |
| Sessions / change email / 2FA | Implemented | `components/account/SessionsCard.tsx`, `ChangeEmailCard.tsx`, `TwoStepCard.tsx`; `auth.controller.ts:92-251` | |
| Delivery addresses | Partial (browser-only, buggy) | `app/account/address/page.tsx`; no `Address` model | BUY-10 |
| Registration / verify email / pending approval | Implemented | `app/auth/register/page.tsx`; `auth.service.ts:243`; `app/auth/pending/page.tsx` | Google exception (BUY-29) |
| Complete profile | Implemented | `app/auth/complete-profile/page.tsx` → `PATCH /users/me`; `GET /users/me/profile-status` | Legacy `/auth/onboarding` duplicate (BUY-24) |
| KYC (submission UI) | Missing (fake UI) | `app/dashboard/kyc/page.tsx:186-196`; backend `kyc.controller.ts:41-110` unused | BUY-02 |
| Buyer support (assistant + order threads) | Implemented | `dashboard/customer/support/page.tsx`; `support-assistant` and `chat` controllers | |
| Disputes from order | Implemented | `disputes.controller.ts:17-38`; order detail | |
| Backend endpoints with no buyer UI | — | `POST /products/:id/rate` (abuse, BUY-15); `POST /kyc/submit`, `/kyc/upload` (BUY-02); `GET /shipping/carrier-rates` (returns `[]`, `shipping.controller.ts:66-74`); `GET /shipping/track/:id` (DHL/Aramex); `/discounts/*` price-group tiers (`discounts.controller.ts`, unused in pricing per `buyer-journey-design.md:21`); `GET /orders/export/excel` (buyer export not wired); `GET /users/me/data-export`, `DELETE /users/me` (GDPR, no buyer UI found by grep) | Verify GDPR need |

#### Buyer pages (one line each)
- `/`: hero, brand wall, popular products rail, departments, RFQ and registration CTAs.
- `/categories`: catalog with department, brand, origin, price (signed-in) and "listed" filters, sorting, pagination, sponsored rows, Excel export.
- `/products/[id]`: PDP with case/pallet/truck tiers, variants, mix composer, target price, quote request, offer comparison, price history, reviews, similar products.
- `/deals`: price drops (signed-in only) and promo codes (empty for buyers).
- `/wholesale`: static explainer (inaccurate, BUY-13).
- `/sponsored-highlights`: active SPONSORED_PRODUCT placements.
- `/targets`: public "buyers watching" demand page for suppliers.
- `/requests`: sourcing-request builder (emails Atlantis; local history).
- `/cart`: standard order card plus server-saved mixed loads, MOQ progress, server quote.
- `/checkout`: two steps (destination/address/carrier, then review) and an inline success step.
- `/checkout/confirmation`: "Order received" with save-to-list (reached only after payment).
- `/checkout/payment`: Stripe payment for an order (orphaned; payments auditor).
- `/wishlist` (`/saved` redirects here): saved products, legacy styling.
- `/dashboard`: role router.
- `/dashboard/customer`: overview (bought before, new to you, recent orders).
- `/dashboard/customer/orders`, `/orders/[id]`: order list with filters/search; detail with workflow, tracking, invoice, dispute (WIP rework).
- `/dashboard/customer/orders/[id]/track`: fake tracking (BUY-03).
- `/dashboard/customer/lists`: shopping lists, reminders, add to cart.
- `/dashboard/customer/targets`: the buyer's target-price requests (withdraw).
- `/dashboard/customer/support`: assistant and per-order threads.
- `/dashboard/customer/settings`: profile, avatar, password, 2FA, sessions, email, notification and brand preferences, address link.
- `/dashboard/customer/notifications`: notifications list (no way to reach it).
- `/dashboard/customer/payments`: new in the working tree (not audited, uncommitted).
- `/dashboard/track`: public tracking lookup (broken).
- `/dashboard/support`: redirect to the role's support page.
- `/dashboard/security`: 2FA setup.
- `/dashboard/payment-methods`: legacy buyer IBAN page (orphan).
- `/dashboard/kyc`: simulated KYC (BUY-02).
- `/account/address`: browser-stored delivery address.
- `/auth/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `/emergency-reset`, `/google-sync`, `/complete-profile`, `/pending`: account lifecycle. `/auth/onboarding` (legacy orphan) and `/auth/partner` (redirect).

---

## Supplier experience

| System | Status | Evidence | Notes |
|---|---|---|---|
| Supplier registration (role picker, `?role=supplier`) | Implemented | `frontend/src/app/auth/register/page.tsx:54-63,168-177`; `backend/src/auth/auth.service.ts:194-243` | Company name required; account starts `PENDING_APPROVAL` |
| `/auth/partner` | Partial | `frontend/src/app/auth/partner/page.tsx:5` | Drops the supplier role (SUP-20) |
| Onboarding `/auth/onboarding` | Missing (dead) | `auth/onboarding/page.tsx:52-62` | Unreachable; `address` dropped |
| Pending approval `/auth/pending` | Implemented | `auth/pending/page.tsx`; `ClientLayout.tsx:43-50`; login block `auth.service.ts:146` | No server-side status check on tokens (SUP-23) |
| Admin account approval | Implemented (other area) | `frontend/src/app/admin/suppliers`, `/admin/users` | — |
| KYC submission UI | Missing (simulated) | `dashboard/kyc/page.tsx:186-198` | SUP-05 |
| KYC backend (upload, AI check, admin verify/reject) | Partial | `backend/src/kyc/*` | AI auto-approve; notes leak (SUP-06) |
| Admin KYC review UI | Partial (broken calls) | `admin/kyc/page.tsx:67-121` | SUP-07 |
| KYC gates | Partial / inconsistent | `products.service.ts:153-166`; `payments.service.ts:26-31`; `users.service.ts:356` | Only payout settings require it |
| Supplier workspace shell `/supplier` | Implemented | `supplier/layout.tsx` | English-only; unused poll (SUP-04, SUP-21) |
| Legacy dashboard `/dashboard/supplier` | Partial (broken) | `dashboard/supplier/*` | SUP-01 |
| Business Overview | Implemented | `supplier/page.tsx`; `backend/src/products/supplier-overview.service.ts` | Supplier-net prices, real data, empty/error/loading states |
| Catalog list, filters, bulk delete | Implemented | `supplier/products/page.tsx`; `supplier-catalog.controller.ts:40-55` | `?highlight` ignored |
| Product editor (draft → pending → approved / needs changes / rejected) | Implemented | `components/supplier/ProductEditor.tsx`; `products.service.ts:1675-1742`; `catalog-rules.ts:118-175` | Identity edits re-trigger review; price edits go live immediately (by design) |
| Bulk import (analyse / validate / commit, photos) | Implemented | `supplier/products/import/page.tsx`; `supplier-catalog.controller.ts:79-143` | — |
| Price & stock update file | Implemented | `components/supplier/PriceStockUpdateDialog.tsx`; `supplier-catalog.controller.ts:145-168` | — |
| Barcode image lookup | Implemented | `supplier-catalog.controller.ts:171-190`; `BarcodeImageFinder.tsx` | — |
| Admin product review (approve / comment / reject) | Implemented | `frontend/src/app/admin/products/page.tsx:373-429`; `products.controller.ts:317-366` | Supplier is notified (`products.service.ts:749`) |
| Stock & reservations (ledger) | Implemented | `supplier/inventory/page.tsx`; `backend/src/products/stock-ledger.ts`; `GET /products/inventory` | — |
| Variant stock | Partial | `products.service.ts:1465-1486` | Not used by orders (SUP-22) |
| Stock change history | Implemented | `ProductChangeLog` (`schema.prisma:1267`); `supplier-catalog .../history` | Variant changes not logged |
| Supplier currency and net price | Implemented | `catalog-rules.ts:29-58`; `supplier-catalog preferences` | — |
| Buyer pricing tiers (carton / pallet / truck) and markups | Implemented | `backend/src/orders/pricing.ts` | Server-side single source |
| Mixed loads (pricing) | Implemented | `pricing.ts:330-398`; `mixed-loads.service.ts` | Supplier side missing (SUP-08, SUP-09) |
| Price privacy interceptor | Partial | `common/price-privacy.ts` | Product-shaped objects only (SUP-02, 04, 09) |
| `backend/src/pricing` module | Placeholder | `pricing/strategies.ts`, `pricing.strategies.ts` | Only used by placements (SUP-15) |
| Wholesale offers | Partial (hidden) | `supplier/wholesale-offers`; `offers.controller.ts` | IDOR (SUP-12); not in nav |
| Ads / placements | Missing (Coming soon) | `supplier/offers/page.tsx`; `placement.controller.ts` | SUP-15 |
| Fulfilment settings + preview | Implemented | `supplier/fulfillment/page.tsx`; `fulfillment.controller.ts:22-40` | One dead link (SUP-17) |
| Order confirmation workflow (accept / reject terms) | Implemented | `orders.service.ts:874-920`; `order-workflow.ts`; `supplier/orders/page.tsx:128-260` | Mixed loads excluded (SUP-08) |
| Shipping by supplier | Not applicable / by design | `orders.controller.ts:227-265` | Suppliers can only PENDING→PROCESSING; Atlantis ships |
| Supplier invoice upload | Partial | `orders.controller.ts:59-101` | Public bucket, buyer-visible, single slot (SUP-11) |
| Buyer masking in supplier orders | Partial | `orders.service.ts:739-790` | Email domain leaks (SUP-10) |
| Earnings / settlements | Missing (page shows misleading data) | `supplier/earnings`; `payments.service.ts:80-112` | SUP-02 |
| Payout settings / bank details | Missing (broken) | `supplier/settings/payout`; `supplier/payment-methods`; `users.service.ts:352-372` | SUP-03 |
| Stripe Connect onboarding / status | Partial | `payments.service.ts:22-75,264-300` | No settlement uses it (release never called) |
| Analytics | Partial (hidden) | `supplier/analytics`; `orders.service.ts:1475-1550` | SUP-18 |
| Supplier support (assistant + order threads) | Implemented | `supplier/support/page.tsx`; `support-assistant.controller.ts`; `chat.controller.ts:59-80`; `support-context.service.ts:96-143` | Uses supplier-net prices |
| Settings (profile, avatar, notifications, currency, reputation) | Implemented | `supplier/settings/page.tsx:50-126` | — |
| Supplier notifications (in-app) | Partial | `notifications.service.ts`; `NotificationBell.tsx:13-42` | Not clickable (SUP-16) |
| Supplier emails (new order) | Implemented | `orders.service.ts:851-871` | No buyer identity, respects prefs |
| Supplier warehouses | Missing (UI) / insecure (API) | `finance.controller.ts:122-141` | SUP-13, SUP-14 |

#### Supplier pages
- `/supplier`: Business Overview. Real KPIs at supplier prices, sales chart, attention list, top products, stock alerts, recent orders.
- `/supplier/products`: Catalog list with status and stock filters, bulk delete, price/stock update file.
- `/supplier/products/new`: ProductEditor; save a draft or submit for review.
- `/supplier/products/[id]/edit`: ProductEditor for an existing listing (draft, review and live rules).
- `/supplier/products/import`: Bulk spreadsheet import (analyse → validate → commit, with photos).
- `/supplier/inventory`: Stock & Reservations (reserved, in transit, delivered), stock adjust, variant +/- (SUP-22).
- `/supplier/orders`: Orders to confirm or reject (terms workflow), timeline, invoice attachment.
- `/supplier/fulfillment`: Default fulfilment method, hub freight, per-product override, price preview.
- `/supplier/settings`: Profile, avatar, notification preferences, default currency, listing status, reputation, link to security.
- `/supplier/settings/payout` (not in nav): Stripe Connect + bank form; save is broken (SUP-03).
- `/supplier/payment-methods` (not in nav): Second bank/IBAN form; silently doesn't save (SUP-03).
- `/supplier/earnings` (not in nav): Escrow-based earnings; leaks margin; false escrow copy (SUP-02).
- `/supplier/analytics` (not in nav): Older analytics; inconsistent metrics (SUP-18).
- `/supplier/wholesale-offers` (not in nav): Create, bulk-upload and delete discount offers (works).
- `/supplier/offers` (not in nav): "Offers & Ads — Coming soon" placeholder.
- `/supplier/support`: SupportCenter (assistant + per-order threads with Atlantis).
- `/dashboard/supplier` (legacy): Old overview; zero stats, buyer-price revenue, broken edit (SUP-01).
- `/dashboard/supplier/products/new` (legacy): Old add-product form with fake AI text.
- `/dashboard/kyc`: Simulated identity verification (SUP-05).
- `/auth/register?role=supplier`, `/auth/partner`, `/auth/onboarding`, `/auth/pending`: Registration funnel (SUP-20).
- Staff: `/admin/kyc` (broken calls, SUP-07), `/admin/products` (review works), `/admin/suppliers`, `/admin/wholesale-offers`, `/admin/offers`.

---

## Support, notifications, email, reviews and content

| System | Status | Evidence | Notes |
|---|---|---|---|
| Support Center UI (buyer and supplier) | Working | FE `components/support/SupportCenter.tsx`; `app/supplier/support/page.tsx`; `app/dashboard/customer/support/page.tsx`; `/dashboard/support` redirects by role (`app/dashboard/support/page.tsx:12-15`) | English-only (CNT-15) |
| AI support assistant | Working when `OPENROUTER_API_KEY` is set | BE `support/support-assistant.service.ts:37,158-185`; model fallback list `:11` | Permission-checked context (`support-context.service.ts`). Buyer prices only (`:206-209`). Not disclosed in Privacy (CNT-02) |
| Legacy chat bot (`/chat/send`, socket) | Live, unused by buyer/supplier UI | BE `chat/chat.service.ts:14-125`, `chat/bot.service.ts` | Bypasses safeguards (CNT-11) |
| Attachments (support screenshots) | Working | BE `support-assistant.service.ts:74-87` (JPEG/PNG/WebP, 6 MB, owner or staff only) | Staff console still sends data URLs |
| Escalation to humans | Partial | BE `support-assistant.service.ts:120-132`; staff "switch to human" `chat.service.ts:352-373` | Not flagged in console; AI not paused (CNT-10) |
| Order conversations (partyId threads) | Working | BE `chat/chat.service.ts:209-346`; FE `components/support/OrderThreads.tsx` | Per-party isolation correct. Leaks into the general queue (CNT-09) |
| Staff support console | Working, with defects | FE `app/admin/support/page.tsx`, `components/chat/SupportChat.tsx` | CNT-09, CNT-10, CNT-12 |
| In-app notifications | Working (store + socket) | BE `notifications/*`; FE `hooks/useNotifications.ts`, `components/ui/NotificationBell.tsx` | Links broken (CNT-13). Some skip the push (CNT-14) |
| Transactional email | Working (Resend → SMTP fallback) | BE `email/email.service.ts:97-195` | Copy errors (CNT-04/05). Unsubscribe header on everything (CNT-16) |
| Auth emails | Working | BE `email/auth-email-templates.ts`; `docs/email-notifications.md` §2 | — |
| Marketplace/offer emails | Working (doc says "design only") | BE `offers/offers.service.ts:384-440` | Open/click tracking (CNT-02, CNT-16) |
| Reviews | Working, real data | BE `products/reviews.service.ts`, `reviews.controller.ts`; FE `components/product/ReviewSection.tsx`; admin `/admin/reviews` | No purchase required; identities public (CNT-17) |
| Newsletter | Working (double opt-in, manual campaigns) | BE `newsletter/*`; FE `app/newsletter/confirm`, `app/unsubscribe` | "Weekly" claim (CNT-29); unsubscribe gaps (CNT-16) |
| Contact form | Working (emails Info@, mirrors to support) | FE `app/contact/ContactClient.tsx:58-73`; BE `app.controller.ts:109-197` | Security issues (CNT-07) |
| Disputes | Partial | BE `disputes/*`; FE order detail dispute form | Policy promises not enforced (CNT-19) |
| Inspections | Working (staff-recorded) | BE `orders/orders.service.ts:1169-1240`; schema `OrderInspection` | Buyer notified on save |
| Hubs / warehouses | Working (no verified hubs shown) | FE `app/warehouses/WarehousesClient.tsx`; schema `AtlantisHub` | Honest empty state |
| Terms (admin-managed) | Not connected | BE `app.controller.ts:94-106`; FE `/terms` static | CNT-24 |
| Help Center content | Working, validated | FE `content/help/*`; `scripts/check-help-content.ts` passes | Not in build (CNT-30) |
| Supplier placements (ads) | Backend only | BE `ads/*`; no `/supplier/placements` page | CNT-23 |

#### Events that send email (code-verified callers)
| Event | Method | Caller |
|---|---|---|
| Sign-up / resend code, verified, existing-account attempt, change-email | auth templates | BE `auth/*` (per docs §2) |
| Forgot password | `sendPasswordResetEmail` | BE `auth/auth.service.ts:747` |
| Email OTP (2FA) | `sendEmailOtp` | BE `auth/auth.controller.ts:227` (via twoFaService) |
| New sign-up alert to admins | `sendAdminSignupAlert` | BE `auth/auth.service.ts:317` |
| Account approved / rejected | `sendWelcomeEmail` / `sendRejectionEmail` | BE `users/users.service.ts:172,177` |
| Team invite | `sendTeamInvitation`, `sendInviteEmail` | BE `admin/admin.service.ts:50`; `admin/team.controller.ts:52` |
| KYC submitted / verified / rejected | `sendKycStatusEmail` | BE `kyc/kyc.service.ts:115,291,334,396` |
| Order submitted (buyer) — mislabelled "Confirmed" | `sendOrderConfirmationEmail` | BE `orders/orders.service.ts:434` |
| Order submitted (each supplier, unless `orderUpdates=false`) | `sendMailDetailed` | BE `orders/orders.service.ts:849-870` |
| Any order status change (buyer) | `sendOrderStatusUpdateEmail` | BE `orders/orders.service.ts:1369` |
| Order DELIVERED (buyer feedback) | `sendFeedbackPromptEmail` | BE `orders/orders.service.ts:1379` |
| Delivery-day notice (manual) | `sendArrivingTodayEmail` | BE `orders/orders.service.ts:1707` |
| Stripe payment authorized (buyer invoice + supplier "paid/escrow") | `sendShippingConfirmationWithInvoice`, `sendMail` | BE `payments/stripe-webhook.controller.ts:120,167` |
| Offer approved → subscribers + opted-in users | `sendMailDetailed` (tracked) | BE `offers/offers.service.ts:438` (and test send `:536`) |
| Product comment / status to supplier | `sendMail` | BE `products/products.service.ts:759` |
| Target-price answered (buyer) | `sendMailDetailed` | BE `products/target-prices.service.ts:174` |
| New review (supplier, unless `productComments=false`) | `sendMailDetailed` | BE `products/reviews.service.ts:91` |
| Newsletter confirm / campaign | `sendMailDetailed` | BE `newsletter/newsletter.service.ts:53,649,714` |
| Weekly / monthly finance report to admins | `sendRawEmail` | BE `finance/reports.service.ts:109` (crons `:18,:32`) |
| Contact form → Info@ | `sendMail` | BE `app.controller.ts:135` |
| Defined but never called | `sendVerificationEmail`, `sendRegistrationPendingEmail`, `sendPendingReviewEmail`, `sendAdminNewUserNotification`, `sendInvoiceEmail`, `sendRegistrationConfirmationEmail` | grep: no callers |

Not emailed at all:
- support replies or escalations;
- order-thread messages;
- dispute opened or resolved (in-app only, BE `disputes/disputes.service.ts:35,122`);
- inspection saved (in-app only);
- order approval or terms changes (in-app only, BE `orders/orders.service.ts:1013,1104`).

#### Events that create in-app notifications (BE)
- **Orders:**
  - submitted: suppliers + admins (`orders.service.ts:446,461`);
  - low / out of stock: supplier (`:842,844`);
  - all suppliers accepted: admins (`:885`);
  - supplier declined or rejected: admins (`:903,914`);
  - approved: buyer (`:1013`);
  - re-confirm requested: suppliers (`:1040`);
  - amended: suppliers + buyer (`:1104-1105`);
  - buyer accepted terms: admins (`:1118`);
  - confirmation expired: admins (`:1128`);
  - delivery charge quoted: buyer (`:133`);
  - status change: buyer + suppliers + admins (`:1393,1410,1436`);
  - inspection saved: buyer (`saveInspection`).
- **Payments webhook:** supplier, buyer and admins (`payments/stripe-webhook.controller.ts:147,157,202`).
- **Disputes:** opened → admins (`disputes.service.ts:35`); resolved → buyer (`:122`).
- **KYC:** submitted / verified / rejected (`kyc/kyc.service.ts:98,106,295,342,400`).
- **Auth:** registration pending and Google sign-up → admins (`auth/auth.service.ts:318,618`).
- **Products:**
  - submitted / resent / bulk → admins (`products.service.ts:365,802,1739`; `products.controller.ts:656`; `supplier-import.service.ts:360`);
  - comment / approved / rejected / status → supplier (`products.service.ts:750,841,1073,1107`);
  - price-update failures → supplier (`supplier-updates.service.ts:178`).
- **Offers:** submitted → admins (`offers/offers.service.ts:225`).
- **Target prices:** new → admins (`target-prices.service.ts:108`); answered → buyer (`:168`); price reached → buyer (`price-history.service.ts:47`).
- **Reviews:** new → supplier (`reviews.service.ts:87`).
- **Lists:** reorder reminder (`lists/list-reminders.service.ts:36`).
- **AI agent:** order updates (`ai-agent/ai-agent.service.ts:130,196,234,271`).
- **Support / chat:** staff reply → user (`chat.service.ts:48`); legacy bot inquiry → staff (`:111`); order-thread messages (`:242,254`); assistant escalation / team-mode messages → staff (`support-assistant.service.ts:131`); contact form → staff (`app.controller.ts:184`).

---

## Orders, payments and refunds

See [ORDER_PAYMENT_REFUND_GAPS.md — Part 3](ORDER_PAYMENT_REFUND_GAPS.md#part-3--transactional-systems-inventory).

## Localization: page by page

Status legend: **Fully** = dictionary-driven, ≤4 residual literals (usually `metadata`); **Partially** = some `t()` calls but English copy remains; **Not localized** = no `t()` calls (relies entirely on the runtime translator).
"t() calls" counts dictionary lookups in the page and the components it imports (shared keyed components such as `DeliveryBreakdown`/`InspectionReport` lift a page into "Partially").
Counts are heuristic (±20 %); shared components appear in every page that imports them.

#### Buyer / public (sorted by importance)

| Page (route) | Status | ~Hard-coded strings | t() calls | Notes / main contributors |
|---|---|---|---|---|
| `/` | Not localized | 47 | 0 | HomeClient.tsx (39), ProductCard.tsx (8) |
| `/categories` | Partially | 76 | 2 | 2 t() calls; sort/filter labels English; CategoriesClient.tsx (57), ProductCard.tsx (8), page.tsx (6) |
| `/products/[id]` | Partially | 223 | 16 | only ReviewSection/ProductFilters keyed; no data-no-translate; ProductDetailClient.tsx (79), MixBuilder.tsx (26), TargetPriceDialog.tsx (24) |
| `/cart` | Not localized | 85 | 0 | page.tsx (48), MinimumOrder.tsx (21), ui.tsx (16) |
| `/checkout` | Partially | 70 | 15 | page.tsx has 3 t(); only the shared DeliveryBreakdown is keyed; 10 alert() still English (page.tsx:151-155,203,262,495-499); page.tsx (62), StepUp.tsx (8) |
| `/checkout/payment` | Not localized | 35 | 0 | OrderSummary.tsx (13), page.tsx (11), PaymentForm.tsx (11) |
| `/checkout/confirmation` | Not localized | 18 | 0 | SaveToListDialog.tsx (12), page.tsx (6) |
| `/dashboard/customer/orders` | Fully | 0 | 62 | In SCOPE; data-no-translate; fmt + formatPrice(intl);  |
| `/dashboard/customer/orders/[id]` | Partially | 12 | 151 | Localized in the current working tree (uncommitted, in SCOPE); remaining: SaveToListDialog.tsx; SaveToListDialog.tsx (12) |
| `/dashboard/customer/orders/[id]/track` | Not localized | 31 | 0 | page.tsx (31) |
| `/dashboard/customer/payments` | Fully | 0 | 30 | New page (uncommitted), in SCOPE;  |
| `/dashboard/customer/support` | Not localized | 96 | 0 | AssistantPanel.tsx (45), OrderThreads.tsx (27), SupportCenter.tsx (11) |
| `/dashboard/customer` | Not localized | 27 | 0 | page.tsx (15), ProductCard.tsx (8), ProductRail.tsx (4) |
| `/returns` | Fully | 4 | 41 | ReturnsClient in SCOPE; only `metadata` title/description English (page.tsx:7-13); page.tsx (4) |
| `/wishlist` | Fully | 1 | 11 | Uses t() but NOT in SCOPE and no data-no-translate; page.tsx (1) |
| `/saved` | n/a (redirect) | 0 | 0 | redirect → /wishlist;  |
| `/dashboard/customer/lists` | Not localized | 43 | 0 | page.tsx (25), ListExtras.tsx (18) |
| `/requests` | Not localized | 54 | 0 | RequestsClient.tsx (50), page.tsx (4) |
| `/deals` | Not localized | 10 | 0 | page.tsx (10) |
| `/dashboard/customer/targets` | Not localized | 11 | 0 | page.tsx (11) |
| `/targets` | Not localized | 12 | 0 | TargetsClient.tsx (10), page.tsx (2) |
| `/dashboard/customer/settings` | Not localized | 112 | 0 | AccountCards.tsx (37), page.tsx (24), AuthShell.tsx (18) |
| `/dashboard/customer/notifications` | Not localized | 5 | 0 | page.tsx (5) |
| `/account/address` | Not localized | 28 | 0 | page.tsx (28) |
| `/dashboard/kyc` | Not localized | 66 | 0 | page.tsx (66) |
| `/dashboard/payment-methods` | Not localized | 17 | 0 | page.tsx (17) |
| `/dashboard/security` | Not localized | 22 | 0 | page.tsx (22) |
| `/dashboard/track` | Not localized | 10 | 0 | page.tsx (9), ShipmentTimeline.tsx (1) |
| `/dashboard/support` | n/a (redirect) | 0 | 0 | redirect by role;  |
| `/dashboard` | Not localized | 4 | 0 | role router; error state English; page.tsx (4) |
| `/help` | Not localized | 27 | 0 | page.tsx (16), HelpUI.tsx (11) |
| `/help/[category]` | Not localized | 15 | 0 | HelpUI.tsx (11), page.tsx (2), HelpShell.tsx (2) |
| `/help/[category]/[slug]` | Not localized | 30 | 0 | + ~1,700 lines of English article content in src/content/help/articles/*; HelpUI.tsx (11), page.tsx (10), AccountCta.tsx (6) |
| `/help/all` | Not localized | 18 | 0 | HelpUI.tsx (11), page.tsx (5), HelpShell.tsx (2) |
| `/help/search` | Not localized | 20 | 0 | HelpUI.tsx (11), page.tsx (7), HelpShell.tsx (2) |
| `/contact` | Not localized | 29 | 0 | ContactClient.tsx (23), page.tsx (6) |
| `/shipping` | Not localized | 67 | 0 | ShippingClient.tsx (63), page.tsx (4) |
| `/warehouses` | Not localized | 64 | 0 | WarehousesClient.tsx (55), AtlanticMap.tsx (5), page.tsx (4) |
| `/goods-inspection` | Partially | 67 | 12 | only the shared InspectionReport (12 t()) is keyed; page copy English; GoodsInspectionClient.tsx (63), page.tsx (4) |
| `/protected-payments` | Not localized | 80 | 0 | ProtectedPaymentsClient.tsx (76), page.tsx (4) |
| `/how-it-works` | Not localized | 35 | 0 | HowItWorksClient.tsx (31), page.tsx (4) |
| `/wholesale` | Not localized | 34 | 0 | WholesaleClient.tsx (30), page.tsx (4) |
| `/about` | Not localized | 39 | 0 | AboutClient.tsx (33), page.tsx (6) |
| `/terms` | Not localized | 13 | 0 | Long legal prose in arrays (count understates volume); TermsClient.tsx (11), page.tsx (2) |
| `/privacy-policy` | Not localized | 13 | 0 | Long legal prose in arrays (count understates volume); PrivacyClient.tsx (11), page.tsx (2) |
| `/cookie-policy` | Not localized | 31 | 0 | CookieClient.tsx (29), page.tsx (2) |
| `/sponsored-highlights` | Partially | 5 | 4 | AdPlacements keyed; page.tsx (3), AdPlacements.tsx (2) |
| `/marketing` | Not localized | 27 | 0 | page.tsx (27) |
| `/newsletter/confirm` | Not localized | 4 | 0 | page.tsx (4) |
| `/unsubscribe` | Not localized | 5 | 0 | page.tsx (5) |
| `/unauthorized` | Not localized | 5 | 0 | page.tsx (5) |

#### Auth

| Page (route) | Status | ~Hard-coded strings | t() calls | Notes / main contributors |
|---|---|---|---|---|
| `/auth/login` | Not localized | 44 | 0 | page.tsx (26), AuthShell.tsx (18) |
| `/auth/register` | Not localized | 60 | 0 | page.tsx (42), AuthShell.tsx (18) |
| `/auth/verify-email` | Not localized | 38 | 0 | page.tsx (20), AuthShell.tsx (18) |
| `/auth/forgot-password` | Not localized | 32 | 0 | AuthShell.tsx (18), page.tsx (14) |
| `/auth/reset-password` | Not localized | 37 | 0 | page.tsx (19), AuthShell.tsx (18) |
| `/auth/complete-profile` | Not localized | 41 | 0 | page.tsx (23), AuthShell.tsx (18) |
| `/auth/pending` | Not localized | 22 | 0 | AuthShell.tsx (18), page.tsx (4) |
| `/auth/onboarding` | Not localized | 12 | 0 | page.tsx (12) |
| `/auth/emergency-reset` | Not localized | 24 | 0 | page.tsx (24) |
| `/auth/google-sync` | Not localized | 4 | 0 | page.tsx (4) |
| `/auth/partner` | n/a (redirect) | 0 | 0 | redirect → /auth/register;  |

#### Supplier

| Page (route) | Status | ~Hard-coded strings | t() calls | Notes / main contributors |
|---|---|---|---|---|
| `/dashboard/supplier` | Not localized | 59 | 0 | page.tsx (32), ProductEditorModal.tsx (27) |
| `/supplier` | Not localized | 57 | 0 | page.tsx (41), ui.tsx (16) |
| `/supplier/orders` | Not localized | 65 | 0 | page.tsx (49), ui.tsx (16) |
| `/supplier/products` | Not localized | 120 | 0 | page.tsx (66), PriceStockUpdateDialog.tsx (27), ui.tsx (16) |
| `/supplier/products/new` | Not localized | 122 | 0 | ProductEditor.tsx (88), BarcodeImageFinder.tsx (18), ui.tsx (16) |
| `/supplier/products/[id]/edit` | Not localized | 122 | 0 | ProductEditor.tsx (88), BarcodeImageFinder.tsx (18), ui.tsx (16) |
| `/supplier/products/import` | Not localized | 135 | 0 | MapStep.tsx (49), page.tsx (32), ReviewStep.tsx (26) |
| `/supplier/inventory` | Not localized | 68 | 0 | page.tsx (43), ui.tsx (16), StockAdjustDialog.tsx (9) |
| `/supplier/fulfillment` | Not localized | 65 | 0 | page.tsx (49), ui.tsx (16) |
| `/supplier/support` | Not localized | 96 | 0 | AssistantPanel.tsx (45), OrderThreads.tsx (27), SupportCenter.tsx (11) |
| `/supplier/settings` | Not localized | 145 | 0 | AccountCards.tsx (37), page.tsx (27), AuthShell.tsx (18) |
| `/supplier/settings/payout` | Not localized | 27 | 0 | page.tsx (27) |
| `/supplier/payment-methods` | Not localized | 29 | 0 | page.tsx (29) |
| `/supplier/earnings` | Not localized | 22 | 0 | page.tsx (22) |
| `/supplier/analytics` | Not localized | 12 | 0 | page.tsx (12) |
| `/supplier/wholesale-offers` | Not localized | 103 | 0 | page.tsx (103) |
| `/supplier/offers` | Not localized | 6 | 0 | page.tsx (6) |
| `/dashboard/supplier/products/new` | Not localized | 42 | 0 | page.tsx (42) |

#### Admin / staff (sorted by string count)

| Page (route) | Status | ~Hard-coded strings | t() calls | Notes / main contributors |
|---|---|---|---|---|
| `/admin/products` | Not localized | 264 | 0 | page.tsx (193), AddProductDrawer.tsx (68), ImageLightbox.tsx (3) |
| `/admin/settings` | Not localized | 169 | 0 | page.tsx (169) |
| `/admin/products/[id]/edit` | Not localized | 165 | 0 | ProductEditorForm.tsx (165) |
| `/admin/orders/[id]` | Partially | 150 | 24 | page.tsx (103), AdminWorkflowPanel.tsx (43), OrderChatModal.tsx (4) |
| `/admin/products/new` | Not localized | 125 | 0 | page.tsx (110), BulkUploadSchemaPreview.tsx (15) |
| `/admin/orders` | Not localized | 102 | 0 | page.tsx (102) |
| `/admin` | Not localized | 82 | 0 | page.tsx (47), DeveloperDashboard.tsx (35) |
| `/admin/fulfillment` | Not localized | 74 | 0 | page.tsx (58), ui.tsx (16) |
| `/admin/finance` | Partially | 69 | 3 | 3 t() calls; page.tsx (69) |
| `/admin/support` | Not localized | 67 | 0 | page.tsx (45), SupportChat.tsx (18), OrderChatModal.tsx (4) |
| `/admin/newsletter/campaign` | Not localized | 63 | 0 | page.tsx (63) |
| `/admin/offers` | Not localized | 58 | 0 | page.tsx (58) |
| `/dashboard/admin` | Not localized | 55 | 0 | page.tsx (55) |
| `/admin/newsletter` | Not localized | 54 | 0 | page.tsx (54) |
| `/admin/suppliers` | Not localized | 54 | 0 | page.tsx (54) |
| `/admin/coupons` | Not localized | 52 | 0 | page.tsx (52) |
| `/admin/tech` | Not localized | 50 | 0 | page.tsx (50) |
| `/admin/email-setup` | Not localized | 47 | 0 | page.tsx (31), ui.tsx (16) |
| `/admin/buyers` | Not localized | 43 | 0 | page.tsx (43) |
| `/admin/users` | Not localized | 42 | 0 | page.tsx (42) |
| `/admin/placements` | Not localized | 40 | 0 | page.tsx (40) |
| `/admin/team` | Not localized | 38 | 0 | page.tsx (38) |
| `/admin/discounts` | Not localized | 36 | 0 | page.tsx (36) |
| `/admin/target-prices` | Not localized | 35 | 0 | page.tsx (19), ui.tsx (16) |
| `/admin/email-analytics` | Not localized | 31 | 0 | page.tsx (31) |
| `/admin/homepage` | Not localized | 30 | 0 | page.tsx (30) |
| `/admin/wholesale-offers` | Not localized | 30 | 0 | page.tsx (30) |
| `/admin/banners/[section]` | Not localized | 27 | 0 | page.tsx (27) |
| `/admin/billing` | Not localized | 27 | 0 | page.tsx (27) |
| `/admin/delivery` | Not localized | 25 | 0 | ui.tsx (16), page.tsx (9) |
| `/admin/pricing` | Not localized | 25 | 0 | page.tsx (25) |
| `/admin/kyc` | Not localized | 23 | 0 | page.tsx (23) |
| `/admin/logistics` | Not localized | 23 | 0 | page.tsx (22), ShipmentTimeline.tsx (1) |
| `/admin/ai-agent` | Not localized | 20 | 0 | page.tsx (20) |
| `/admin/newsletter/history` | Not localized | 20 | 0 | page.tsx (20) |
| `/admin/invite` | Not localized | 19 | 0 | page.tsx (19) |
| `/admin/security` | Not localized | 18 | 0 | page.tsx (18) |
| `/admin/offers/new` | Not localized | 14 | 0 | page.tsx (14) |
| `/admin/terms` | Not localized | 13 | 0 | page.tsx (13) |
| `/admin/categories` | Not localized | 12 | 0 | page.tsx (12) |
| `/admin/banners` | Not localized | 11 | 0 | page.tsx (11) |
| `/admin/coupons/new` | Not localized | 11 | 0 | page.tsx (11) |
| `/admin/disputes` | Not localized | 11 | 0 | page.tsx (11) |
| `/admin/reviews` | Not localized | 10 | 0 | page.tsx (10) |
| `/logistics/orders` | Not localized | 7 | 0 | page.tsx (7) |
| `/admin/owner` | Not localized | 4 | 0 | page.tsx (4) |
---
