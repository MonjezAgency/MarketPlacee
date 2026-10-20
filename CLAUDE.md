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
- Unauthenticated requests to protected routes are sent to `/auth/login?redirect=<path>` (see `frontend/src/middleware.ts`).

## Before you finish

- `frontend`: `npx tsc --noEmit` and `npm run build` (runs `check:i18n` — every key added to `locales/en.ts` must be translated in all seven locale files; see `locales/GLOSSARY.md`).
- `backend`: `npx tsc --noEmit` and `npx jest`.
- Schema changes must be additive (production runs `prisma db push`).
