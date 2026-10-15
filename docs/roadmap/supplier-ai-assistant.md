# Supplier AI assistant: roadmap and safeguards

Status: **roadmap only.** No general-purpose assistant is implemented in this phase.

## 1. What it would do (in order of risk)

| Capability | Risk | Mode |
|---|---|---|
| Explain a price, pack or minimum-order calculation | Read-only | Answers from the same functions the server uses (`pricing.ts`, at supplier prices only) |
| Find products ("my products with no barcode", "out of stock in Germany") | Read-only | Uses the supplier's own catalog endpoints |
| Summarise stock, orders and reviews for a period | Read-only | Uses the overview and ledger services |
| Point out missing product data | Read-only | `missingForPublish` / `invalidValues` |
| Prepare a spreadsheet import or a price & stock update file | Draft | Produces a file the supplier uploads through the existing preview (before/after) |
| Change prices, stock or listings | **Write** | Proposes a change set, and the supplier approves each change (§3) |
| Connect outside data sources or AI tools | Integration | Only through approved connectors (see `supplier-integrations.md`) |

## 2. Permissions and data boundaries

* The assistant acts **as the signed-in supplier**, using that supplier's token and the same API routes. It gets no service account and no database access.
* Tools are limited to the supplier-scoped routes (`/supplier-catalog/*`, `/products/my-products`, `/orders/supplier/*`). Admin, buyer and other suppliers' data can't be reached: the server enforces it by ownership checks, not by prompts.
* Margin privacy: tools return supplier prices only. Buyer prices, markups and other suppliers' data are never in the assistant's context.
* Model provider: only a provider with a no-training, limited-retention agreement. Prompts and outputs are not used to train models.

## 3. Write actions need approval

* Every write is shown as a **change set**: field, before, after and reason. Nothing applies until the supplier confirms it. Bulk changes reuse the price & stock update preview.
* Changes go through the same validation, completeness gate and review triggers as manual edits (for example, an identity change sends a live listing back to review).
* Sensitive actions (accepting or declining orders, editing many products at once) also need step-up 2FA when the account has 2FA.
* Rate limits and size limits: one change set per request, and at most 500 rows (the import limit).

## 4. Audit and safety

* Every tool call is logged: supplier, tool, parameters (secrets redacted), result and change-set ID. Applied changes appear in `ProductChangeLog` with the reason "via assistant".
* The assistant cannot change business rules (markups, MOQs of other suppliers, delivery policy, review status).
* Prompt-injection guard: text from product descriptions, files or emails is treated as data. Instructions found in it are never executed as commands.
* Answers about prices and calculations must come from tool results. If a tool can't answer, the assistant says so and doesn't estimate.

## 5. Prerequisites and phasing

1. Read-only "explain and find" (no writes): measure the questions suppliers ask and how accurate the answers are.
2. Draft files (import or update) through the existing preview screens.
3. Approved change sets for price and stock.
4. Connectors, only after the integration work in `supplier-integrations.md`.

**Go criteria:** at least 15 active suppliers using the hub weekly; recurring support questions about pricing, imports or missing data that the read-only phase would answer; and a confirmed budget for model costs. **Success measures:** fewer support tickets on those topics, time to complete an import, and how often suggested change sets are accepted. A low acceptance rate means the assistant is guessing.
