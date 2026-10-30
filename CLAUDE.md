# Atlantis — project instructions

Atlantis is a B2B FMCG wholesale marketplace: NestJS + Prisma backend (`backend/`), Next.js 14 frontend (`frontend/`).

## Design system (mandatory)

Before creating or modifying any page or UI component, read **`docs/DESIGN_SYSTEM.md`** and follow it:
tokens and the named type scale from `frontend/tailwind.config.ts`, the primitives in
`frontend/src/components/ds`, the motion and reduced-motion rules, the accessibility and
responsive checklist, and the content/honesty rules. If a requirement needs a rule change,
update `docs/DESIGN_SYSTEM.md` in the same change and say why — don't add silent exceptions.

## Product rules that the UI must respect

- Never claim escrow, held funds, payment protection, refund guarantees, warehouses, partners,
  coverage, delivery dates or prices that the code and the business don't actually provide.
- Suppliers never see the buyer price or the Atlantis margin; buyers never see supplier ids or supplier net prices.
- Orders are requests until every supplier accepts and Atlantis approves (server-enforced, `backend/src/orders/order-workflow.ts`).
- Special offers (`Promotion`, not the reviewed wholesale `Offer`) take a % off the supplier net price; the buyer price follows
  through the markup. One discount per line (the deeper of offer / special offer). Applied only in `backend/src/promotions/promotion-lookup.ts`
  at request time; rules in `promotion-rules.ts`. Managed at `/supplier/promotions` and `/admin/promotions`; times are UTC.
- Delivery charges come only from the server calculation (`backend/src/fulfillment`); missing rates mean "quoted after the order".

## Known gaps

Before changing orders, payments, refunds, permissions or policy pages, read the Word documents in `docs/marketplace-audit/`
(Marketplace_Gap_Register, Design_vs_Systems_Boundary, Implementation_Roadmap). Transactional changes there need explicit owner approval.

## Routes worth knowing

- Supplier entry point after sign-in: `/supplier` (business overview); the supplier tools live under `/supplier/*`.
  The old `/dashboard/supplier` and `/dashboard/supplier/*` URLs permanently redirect (308) to `/supplier` in `frontend/src/middleware.ts`.
- Buyer area: `/dashboard/customer/*`. Staff: `/admin/*`.
- Admin Products is a sidebar parent with two routes: `/admin/products/catalog` (Atlantis Catalog — products owned by staff
  accounts) and `/admin/products/submissions` (Supplier Submissions — everything else); the rule is
  `backend/src/products/catalog-scope.ts`, never a display name. `/admin/products` redirects. Review view: `/admin/products/[id]`.
  Staff may edit Atlantis Catalog products only: edits, status overrides, resubmission, variant stock and creating under a
  supplier account return 403 `SUPPLIER_OWNED` for supplier products (products.controller.ts `assertStaffMayEdit`).
  Supplier products are approved, rejected or sent back with feedback; every step is a `ProductReviewEvent`
  (`product-review.service.ts`) and the supplier reads it at `/supplier/products/[id]/edit#feedback`.
- Catalog import (`/admin/products/catalog/import`, API `/admin-catalog/import/*`) is the supplier import wizard
  (`components/supplier/import/ImportWizard.tsx`, `supplier-import.service.ts` with `mode.catalog`): rows owned by the platform
  account, duplicates matched against staff-owned products only, complete rows published, incomplete rows drafts.
- Founder Overview figures are defined in `backend/src/admin/admin-overview.ts`. Atlantis revenue = buyer price − supplier net on
  lines with a recorded supplier price; net profit is unavailable (no cost records); payments = Stripe escrow records.
- Admin Users is one list (`/admin/users`, `?role=SUPPLIER|CUSTOMER`) with a role-adapted detail page `/admin/users/[id]`;
  `/admin/buyers` and `/admin/suppliers` redirect there. Security reports, Terms and the AI monitor left the sidebar but keep their
  pages (linked from `/admin/settings`).
- Admin Order Management: `/admin/orders` and `/admin/orders/[id]`, read models in `backend/src/orders/admin-orders.ts`
  (`GET /orders/admin/list|export|:id/detail`). No returns/refunds card: nothing records a return. Supplier net and markup only for OWNER/ADMIN.
- Product photos by barcode: `backend/src/products/image-discovery.service.ts` (background search after a save without a photo; Open Food Facts API v3,
  shared rate-limited queue) ranks photos with `image-quality.ts`: identity first (a record that contradicts brand, variant or size is never
  offered), then pixels (tier 1 white background, 2 plain background, 3 other photo). Nothing is applied automatically and a found photo never
  replaces one; credits (CC BY-SA, origin, approver) live in `Product.imageCredits`. Staff list: `/admin/products/photos` (Atlantis Catalog photos
  applied by OWNER/ADMIN only; supplier products show status only).
  "Make background white" (`photoroom.service.ts`, key `PHOTOROOM_API_KEY` on the server only) keeps its result on the found photo; a `sandbox_` key
  gives a watermarked preview that `apply` refuses to save, so a watermark can't reach a product page.
- Product bulk actions: `POST /products/admin/bulk`, per-row rules in `backend/src/products/admin-bulk.ts`; every skip is reported.
- Notifications: persisted per user; `data.kind` + `data.params` let the bell (`components/ui/NotificationBell.tsx`,
  `lib/notifications.ts`) render them in the reader's language (keys in `locales/sections/notificationsCenter.ts`);
  `data.dedupeKey` stores an event once; links are derived for the recipient's role in `backend/src/notifications/notification-links.ts`.
  Supplier notifications never carry a buyer, a target price or a buyer price.
- Admin access by role: `frontend/src/lib/admin-access.ts` (sidebar, direct-URL guard, `canDo` for buttons) mirrors the backend
  `@Roles` (`backend/src/admin/staff-access.ts`); the server is the authority and re-reads the role from the database on each request.
  Team Members (`/admin/team`) holds invitations (hashed single-use links, `/auth/team-invite`); `/admin/invite` redirects there.
- Support HQ (`/admin/support`) also holds Disputes and KYC review; `/admin/disputes` and `/admin/kyc` redirect there. Dispute
  refund decisions are OWNER/ADMIN only; supplier net prices are stripped from dispute responses for everyone else.
- Offers is a sidebar parent: `/admin/offers/supplier` (wholesale offers to review) and `/admin/offers/special` (Promotions).
- Coupons: rules in `backend/src/coupons/coupon-rules.ts`, applied only in `OrdersService.priceCart`; one order-level discount on
  eligible lines after line discounts, funded by the Atlantis margin; redemptions recorded per order (`CouponRedemption`).
- Marketing email: every marketing send goes through `backend/src/newsletter/marketing-consent.service.ts` (recorded consent,
  no suppression); unsubscribes live in `MarketingSuppression` and survive re-import. Transactional email is separate.
- Target prices: buyer ↔ Atlantis sourcing desk negotiation (`target-prices.service.ts`); suppliers never see targets or buyers;
  an agreed price is not applied at checkout yet (needs owner approval).
- Unauthenticated requests to protected routes are sent to `/auth/login?redirect=<path>` (see `frontend/src/middleware.ts`).

## Before you finish

- `frontend`: `npx tsc --noEmit` and `npm run build` (runs `check:i18n` — every key added to `locales/en.ts` must be translated in all seven locale files; see `locales/GLOSSARY.md`).
- `backend`: `npx tsc --noEmit` and `npx jest`.
- Schema changes must be additive (production runs `prisma db push`).
- Production start (`start:prod`) runs `prisma db push` without `--accept-data-loss` and never runs the seed. `prisma/seed.ts` is a
  first-run bootstrap only (`ALLOW_SEED=1`, passwords from the environment), creates missing accounts and never changes existing ones.
