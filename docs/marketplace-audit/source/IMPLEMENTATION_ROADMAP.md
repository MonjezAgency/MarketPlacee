# Implementation roadmap

This roadmap turns the [gap register](MARKETPLACE_GAP_REGISTER.md) into tasks. They are ordered by risk first (security and data leaks), then by money integrity, workflow completeness and experience. The root causes R1–R9 are defined at the top of the register.

**Nothing in Phases 0–2 has been started.** Every task marked *Owner approval: yes* changes business logic, permissions, data or money flows, and waits for an explicit go-ahead (see [DESIGN_VS_SYSTEMS_BOUNDARY.md](DESIGN_VS_SYSTEMS_BOUNDARY.md)). Phase 3 is safe UI work that can continue without approval.

Scope key: **FE** frontend · **BE** backend · **DB** schema/migration · **INT** external integration · **POL** policy/business decision.

---

## Phase 0 — Close security and privacy holes (do first)

### T1 · Lock down transactional endpoints (R1)
- **Gaps:** TX-01, TX-02, PLT-05, PLT-06, SUP-13, PLT-07, PLT-08, PLT-12, TX-07, SUP-12, BUY-04
- **Outcome:**
  - `finance`, `invoices`, `discounts`, `notifications`, `shipments` and `wholesale-offers` require an explicit role on every route.
  - Every read by id checks ownership.
  - Public tracking returns only status, carrier and dates.
- **Acceptance criteria:**
  - A buyer token gets 403 on `/finance/*`, `GET /invoices`, `POST /invoices/:id/pay` and other users' `GET /invoices/:id`, `/notifications/:userId` and `/shipments/order/:id`.
  - `GET /shipments/track` returns no email, address or terms.
  - `RolesGuard` refuses requests on routes without `@Roles` (deny by default) or a lint check flags such routes.
- **Scope:** BE. **Dependencies:** none. **Risk:** Medium. Admin pages that call these routes must keep working, so list the callers first (`admin/finance`, `admin/billing`, `admin/logistics`).
- **Tests:** controller e2e tests per role (buyer, supplier, admin, owner) for every route listed; a regression test that every controller route carries `@Roles` or `@Public`.
- **Owner approval:** yes (permission change).

### T2 · Fix authentication and account control (R2)
- **Gaps:** PLT-01, PLT-02, PLT-09, PLT-10, PLT-11, PLT-13, PLT-14
- **Outcome:**
  - The 2FA partial token can only call the 2FA-verify route.
  - Invites can't create OWNER, and only OWNER can grant ADMIN.
  - Blocking, role changes and password resets revoke sessions (token version or deny-list).
  - Staff lockout and a per-route login throttle apply.
  - 2FA setup can't disable 2FA without a code.
  - The emergency and seed-admin routes are removed or limited to localhost.
- **Acceptance criteria:**
  - A partial token on any other route gets 401.
  - A blocked user's existing token gets 401 on the next request.
  - An invite with `role=OWNER` gets 403.
  - Each fix has a test.
- **Scope:** BE (+ FE login messages). **Dependencies:** none. **Risk:** High (sign-in paths). Roll out behind tests and verify the owner can still sign in. The owner account and its dashboard are not modified.
- **Tests:** auth service unit tests and e2e for login, 2FA, refresh, block and reset.
- **Owner approval:** yes.

### T3 · Remove committed credentials and destructive deploy steps
- **Gaps:** PLT-03, PLT-15
- **Outcome:**
  - The seed no longer runs on every production start and never re-activates or re-privileges accounts.
  - Password literals are removed from git history going forward, and the affected passwords are rotated.
  - `prisma db push --accept-data-loss` is replaced by reviewed migrations, or at least drops the data-loss flag.
- **Acceptance criteria:** the production start script has no seed and no `--accept-data-loss`; affected accounts are rotated (confirmed by the owner).
- **Scope:** BE, deploy config. **Dependencies:** owner rotates credentials. **Risk:** Medium (deploy pipeline).
- **Tests:** deploy dry-run against a staging copy of the schema.
- **Owner approval:** yes.

### T4 · Stop price and identity leaks across the buyer/supplier wall (R3)
- **Gaps:** DES-07, BUY-01, SUP-24, PLT-04, SUP-02, SUP-04, SUP-09, CNT-06, CNT-27, SUP-11, TX-16
- **Outcome:**
  - Buyer responses (`/invoices/my`, catalogue, search, ads, `my-orders`) carry no supplier ids, emails or net prices.
  - Supplier responses (earnings, `/dashboard/supplier`, mixed-load composition, webhook notifications) carry no buyer totals or margins.
  - The AI pricing chat gets only buyer-visible prices.
  - Supplier invoices go to a private bucket and are not shown to buyers.
- **Acceptance criteria:** privacy tests (like `order-workflow.spec.ts` "never carries supplier ids") for each endpoint pass; a JSON scan of each response finds no `supplierId`, `supplierUnitPrice`, margin or buyer totals in the wrong direction.
- **Scope:** BE, FE (supplier earnings page), storage. **Dependencies:** T1 helps. **Risk:** Medium (some admin views rely on the full payloads, so keep them behind staff roles).
- **Tests:** a response-shape test per endpoint.
- **Owner approval:** yes.

---

## Phase 1 — Money integrity (requires business decisions)

### T5 · Decide the payment model and align every document (R5)
- **Gaps:** CNT-01, TX-08, CNT-02, CNT-05, SUP-02, CNT-19
- **Outcome:** a written decision covering how buyers pay (bank transfer on payment details vs. card through Stripe vs. both), whether Atlantis ever holds funds, when payment is due (after approval) and how refunds are made. Then the Terms, Privacy, Protected Payments, Returns, emails and the supplier earnings copy all say the same thing.
- **Acceptance criteria:** one source of truth for the policy; a copy check finds no "escrow", "held funds" or "released on delivery" wording unless the decision introduces it.
- **Scope:** POL, then FE copy, emails (BE templates), legal review. **Dependencies:** none. **Risk:** Legal.
- **Tests:** a content check (extend `check-help-content.ts`) for banned phrases.
- **Owner approval:** yes (policy).

### T6 · Record payments
- **Gaps:** TX-05, TX-03, TX-04
- **Outcome:**
  - A staff action, "Record payment" (amount, date, method, reference, by whom), writes `paymentStatus` and `paidAt` with an audit entry.
  - If card payments are kept, the Stripe webhook records payment without changing the order status, and only for approved orders.
  - A failed card attempt no longer cancels the order.
- **Acceptance criteria:** recording a payment shows "Paid" on the buyer's order card, order page and Payments page; the webhook can't move a PENDING_REVIEW order; a failed payment leaves the order and its stock unchanged.
- **Scope:** BE, DB (a payment record table: additive), FE (admin action). **Dependencies:** T5, T1. **Risk:** High.
- **Tests:** workflow spec extended with payment recording; webhook tests with signed fixtures.
- **Owner approval:** yes.

### T7 · Refunds that can actually happen
- **Gaps:** TX-06, CNT-19
- **Outcome:**
  - A staff "Record refund" action (amount, reason, method, reference) linked to a dispute or cancellation.
  - If card refunds are kept, valid Stripe reason codes are sent and errors are surfaced to staff.
  - The buyer sees refund status on the Payments page.
- **Acceptance criteria:** a refund record appears for the buyer; Stripe errors are visible to staff; no silent swallow.
- **Scope:** BE, DB (additive), FE. **Dependencies:** T5, T6. **Risk:** High.
- **Tests:** unit tests for the refund service; e2e for a dispute resolved with a refund.
- **Owner approval:** yes.

### T8 · One definition of the order total (R7)
- **Gaps:** BUY-06, TX-09, TX-10, DES-08
- **Outcome:** a documented formula (goods after discount + delivery + VAT where applicable), computed on the server and returned as one field. Cart, checkout, order pages, emails, invoices and finance reports use it.
- **Acceptance criteria:** for a fixture order, every surface shows the same total; invoices use EUR and include freight.
- **Scope:** BE, FE, POL (VAT treatment). **Dependencies:** T5. **Risk:** Medium.
- **Tests:** snapshot tests of totals across endpoints for fixture orders.
- **Owner approval:** yes.

### T9 · Correct invoices
- **Gaps:** TX-02, TX-09, DES-08, L10N-03
- **Outcome:**
  - Invoices are generated from the approved terms (goods + freight), in EUR, with VAT by destination.
  - Issued at the agreed moment (on approval or on delivery: a policy choice).
  - Rendered as a server PDF in the buyer's language.
- **Acceptance criteria:** the invoice for the local test order equals its confirmed terms; the currency is EUR; the PDF is downloadable by its owner only.
- **Scope:** BE, DB default (`currency`), FE, POL (tax). **Dependencies:** T1, T8. **Risk:** Medium (accounting).
- **Tests:** invoice service unit tests; access tests.
- **Owner approval:** yes.

---

## Phase 2 — Workflow completeness

### T10 · Dispute rules
- **Gaps:** TX-13, CNT-19, DES-05
- **Outcome:**
  - The policy window (anchor date and length), checked on the server.
  - Evidence upload in the dispute form (the API already accepts `evidence`).
  - Supplier notification.
  - A visible SLA (or none).
  - Resolution limited to staff roles, once.
- **Acceptance criteria:** a dispute after the window gets 400 with a clear message; photos attach and show to staff; the supplier gets a notification.
- **Scope:** BE, FE, POL. **Dependencies:** T5. **Risk:** Medium.
- **Tests:** dispute service tests (window, roles, repeat resolution).
- **Owner approval:** yes.

### T11 · Mixed-load orders for suppliers
- **Gaps:** SUP-08, SUP-09
- **Outcome:** suppliers see and confirm mixed pallet and truck lines with net prices only.
- **Acceptance criteria:** a mixed-load order can be approved end to end; the supplier payload has no buyer prices.
- **Scope:** BE, FE. **Dependencies:** T4. **Risk:** Medium.
- **Tests:** the workflow spec with a mixed-load fixture.
- **Owner approval:** yes.

### T12 · Tracking
- **Gaps:** TX-07, TX-15, BUY-04, CNT-26
- **Outcome:**
  - A secure tracking endpoint for the order owner.
  - `/dashboard/track` uses it, or is removed.
  - The carrier portal matches carriers by id, not by fuzzy name, and gets minimal data.
- **Acceptance criteria:** a buyer can look up only their own shipments; carriers see only their assigned shipments.
- **Scope:** BE, FE. **Dependencies:** T1. **Risk:** Low–Medium.
- **Tests:** access tests per role.
- **Owner approval:** yes.

### T13 · Real KYC
- **Gaps:** BUY-02, SUP-05, SUP-07, PLT-14
- **Outcome:**
  - A document upload UI on the existing `/kyc/submit` and `/kyc/upload` endpoints.
  - The admin review queue on the correct routes.
  - Status shown to the user.
  - (This phase only replaced the simulation with an honest notice.)
- **Acceptance criteria:** a submission appears in the admin queue; approval updates the user's status; no client-side "verified" without the server.
- **Scope:** FE, BE (validation), storage. **Dependencies:** T1. **Risk:** Medium (personal documents, so a private bucket and retention policy are needed).
- **Tests:** e2e for the upload → review → status flow.
- **Owner approval:** yes.

### T14 · Supplier payouts
- **Gaps:** SUP-03, SUP-02
- **Outcome:** payout bank details are saved to real columns (encrypted if promised), with a clear payout schedule from the T5 decision.
- **Acceptance criteria:** saved details persist and show masked; no success message unless the server confirms.
- **Scope:** BE, DB (additive), FE. **Dependencies:** T5. **Risk:** Medium.
- **Tests:** settings service tests.
- **Owner approval:** yes.

### T15 · One supplier entry point
- **Gaps:** DES-06, SUP-01
- **Outcome:** the owner chooses `/dashboard/supplier` or `/supplier`; the other redirects; all links point to the choice.
- **Acceptance criteria:** every supplier link (sign-in, footer, help, notifications) lands on the chosen dashboard.
- **Scope:** FE, POL. **Dependencies:** owner decision. **Risk:** Low.
- **Tests:** a link check.
- **Owner approval:** yes. The owner previously instructed `/dashboard/supplier`.

### T16 · Deposits and per-delivery best-before dates (only if the business wants them)
- **Gaps:** TX register (deposits), DES-04
- **Outcome:** additive fields for the deposit amount and due date, and for the best-before date per line captured at dispatch or inspection, shown on order cards. The cards already have room for them.
- **Acceptance criteria:** the values are set by staff or the supplier, are visible to the buyer, and are absent (not guessed) when unknown.
- **Scope:** DB, BE, FE, POL. **Dependencies:** T5, T6. **Risk:** Medium.
- **Tests:** workflow spec fields; UI states.
- **Owner approval:** yes.

### T17 · Notifications and emails that match reality
- **Gaps:** CNT-04, CNT-05, PLT-16, CNT-07
- **Outcome:**
  - Order-request emails don't say "confirmed" and use EUR.
  - The hourly agent stops "complete payment" messages for unapproved orders.
  - The contact form can't post into other users' threads, and its email HTML is escaped.
- **Acceptance criteria:** email template snapshots; the job sends nothing for PENDING_REVIEW orders.
- **Scope:** BE. **Dependencies:** T5. **Risk:** Low.
- **Tests:** template and job tests.
- **Owner approval:** yes (behaviour of jobs and emails).

---

## Phase 3 — Safe UI work (can continue without approval)

### T18 · Localize the next buyer pages
- **Gaps:** L10N-01, L10N-02, L10N-07
- **Outcome:** checkout (about 135 keys), cart (about 95), product page (about 230), Support (about 105), catalogue and home on the dictionaries in 7 languages; native alerts replaced with in-page messages; prices formatted with `meta.intl`.
- **Acceptance criteria:** `npm run check:i18n` passes with each file added to its scope; the browser audit shows no English UI strings in the other six languages.
- **Scope:** FE. **Dependencies:** none. **Risk:** Low.
- **Tests:** check-i18n; a browser audit per language at 375 and 1280 px.
- **Owner approval:** no.

### T19 · RTL and accessibility pass
- **Gaps:** L10N-12 and the accessibility findings in the L10N section
- **Outcome:**
  - Physical `left`/`right` classes replaced with logical ones; directional icons flipped.
  - Icon-only buttons labelled; clickable divs become buttons; the add-to-cart popup becomes an accessible dialog.
- **Acceptance criteria:** the RTL lint (to be added to `check-i18n`) reports 0 physical classes in buyer flows; a keyboard-only checkout run works.
- **Scope:** FE. **Risk:** Low. **Owner approval:** no.

### T20 · Copy corrections that need no business decision
- **Gaps:** CNT-20 (QC claim, reorder, invoices wording), CNT-03 (cookie durations), BUY-13 (only after T5 confirms the pricing model)
- **Outcome:** marketing and policy copy describes what the platform does today.
- **Acceptance criteria:** each sentence traced to code or to an owner decision.
- **Scope:** FE. **Risk:** Low. **Owner approval:** no for pure corrections; yes where a policy is being decided (CNT-21 regions, CNT-22 carriers and SLA).

---

## Recommended order

1. **Phase 0, in parallel:** T1, T2, T3, T4.
2. **T5:** the payment-model decision. This is a business meeting, not code.
3. **Money integrity:** T6 → T7 → T8 → T9.
4. **Workflow:** T10, T11, T12 and T13 in parallel, then T14, T15 and T17.
5. **T16:** only if deposits or batch best-before dates are wanted.
6. **Phase 3 (T18–T20):** continuously, alongside everything else.
