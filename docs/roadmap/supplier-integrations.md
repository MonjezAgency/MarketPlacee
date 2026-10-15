# Supplier integrations and ERP readiness

Status: **design only.** No external integration is active. The only supplier data exchange that exists today is spreadsheet import and export (bulk product import, and the price & stock update file in Inventory & Products).

## 1. What we know, and what we don't

* **Known:** suppliers maintain catalogs in Excel/CSV. The import accepts English and Arabic headers, manual column mapping, row-by-row results, and an update-only price/stock file matched by Atlantis ID or EAN.
* **Unknown, and needed before building anything:** which inventory, accounting or ERP tools current suppliers use, and which of them want a connection. There is no such data in the platform. Suggested step: a three-question survey in the supplier hub (tool used, records they'd sync, how often), plus a call with the five largest suppliers by listed SKUs.

Do not build a connector until at least two suppliers ask for the same system, or one supplier's volume justifies it.

## 2. Architecture: one canonical record, many adapters

```
External system ──► Adapter (per system) ──► Integration inbox (events) ──► Existing services
                                                                              (SupplierUpdatesService, ProductsService.supplierUpdate,
                                                                               OrdersService transitions)
```

* **No second copy of the catalog.** Adapters translate external events into the same calls the supplier hub already uses. That means the same validation, completeness rules, audit log (`ProductChangeLog`) and margin privacy.
* **Smallest schema addition**, when the first connector is approved:
  * `IntegrationConnection`: `supplierId`, `system`, `status`, `scopes`, an encrypted credential reference, `lastSyncAt`, `lastError`.
  * `ExternalRef`: `connectionId`, `entity` (`PRODUCT` | `ORDER`), `externalId`, `atlantisId`, unique on `(connectionId, entity, externalId)`.
  * `IntegrationEvent`: `connectionId`, `idempotencyKey` (unique), `payload hash`, `status` (`RECEIVED` | `APPLIED` | `REJECTED` | `FAILED`), `attempts`, `error`.

## 3. Per record: direction and system of record

| Record | Direction | Authoritative system | Notes |
|---|---|---|---|
| Stock (cases) | Supplier → Atlantis | Supplier system | Atlantis subtracts its own open reservations; it never overwrites the supplier's figure with its own. |
| Supplier price per case | Supplier → Atlantis | Supplier system | Goes through `supplierUpdate`: buyer price = markup applied server-side; price history recorded. |
| Product identity (name, EAN, pack sizes, images) | Supplier → Atlantis, **reviewed** | Atlantis after review | Identity changes on live listings go back to review, as today. |
| Orders | Atlantis → Supplier | Atlantis | Supplier-priced lines only (never buyer prices or margin). |
| Order status (accepted / declined / shipped) | Supplier → Atlantis | Supplier for these transitions | Through the existing transition table (`ORDER_TRANSITIONS`). |
| Invoices | Supplier → Atlantis | Supplier's accounting system | Stored as the supplier invoice attachment. |

## 4. Conflicts, retries, failures

* **Conflicts:** a field has one authoritative system (table above). When an Atlantis-side edit and an external update hit the same field, the authoritative side wins, and the overwritten value is kept in `ProductChangeLog`.
* **Duplicates and retries:** every inbound event needs an idempotency key (the external event id, or a hash of the payload and its timestamp). The unique constraint on `IntegrationEvent.idempotencyKey` makes retries harmless. Outbound calls retry with exponential backoff (5 attempts), then stop as `FAILED`.
* **Failures:** a rejected row is shown to the supplier exactly like the spreadsheet import shows it (row, field, reason), and they get an in-app notification. Admins see a per-connection error count. Nothing fails silently.
* **Ordering:** stock and price events are applied newest-wins, by the source timestamp. Order events must follow the transition table, and an out-of-order event is parked, never forced.

## 5. Credentials and permissions

* Credentials are stored encrypted (`ENCRYPTION_KEY`, already used for 2FA secrets). They are never returned to the browser or written to logs.
* Scopes are the least needed: read stock and prices, read and write order status. No customer data is sent to suppliers beyond what the order screen already shows.
* A supplier can disconnect at any time. Disconnecting revokes the stored credential and stops all sync.

## 6. Rollout order (when demand is confirmed)

1. **Scheduled file sync.** A supplier drops the existing price & stock template on SFTP or a shared link, and it runs daily through `SupplierUpdatesService`. No new parsing is needed.
2. **Push API.** A per-supplier API key with `PATCH /integrations/stock` and `PATCH /integrations/prices`, idempotent, same validation as the hub.
3. **Named connectors** (ERP or accounting), only for systems that several suppliers request.
4. **EDI** (EDIFACT ORDERS/DESADV/INVOIC, or GS1 XML), only if a large retailer-grade supplier requires it.

Paid middleware (iPaaS) is not needed for steps 1–2.
