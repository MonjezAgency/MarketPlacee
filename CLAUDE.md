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
- Delivery charges come only from the server calculation (`backend/src/fulfillment`); missing rates mean "quoted after the order".

## Known gaps

Before changing orders, payments, refunds, permissions or policy pages, read `docs/marketplace-audit/`
(gap register, boundary and roadmap). Transactional changes there need explicit owner approval.

## Routes worth knowing

- Supplier entry point after sign-in: `/dashboard/supplier`; the supplier tools live under `/supplier/*`.
- Buyer area: `/dashboard/customer/*`. Staff: `/admin/*`.
- Unauthenticated requests to protected routes are sent to `/auth/login?redirect=<path>` (see `frontend/src/middleware.ts`).

## Before you finish

- `frontend`: `npx tsc --noEmit` and `npm run build` (runs `check:i18n` — every key added to `locales/en.ts` must be translated in all seven locale files; see `locales/GLOSSARY.md`).
- `backend`: `npx tsc --noEmit` and `npx jest`.
- Schema changes must be additive (production runs `prisma db push`).
