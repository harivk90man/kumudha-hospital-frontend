# TSD 10: Pharmacy & Inventory

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

The drug supply chain end-to-end — from "vendor delivers a batch" to "patient walks out with their medicine." Eleven tables broken into three concerns:

**Catalog & stock (always referenced; even if procurement is paused, the prescribing UI needs this):**
- `vendors` — supplier registry.
- `medicines` — drug catalog (generic, brand, schedule, narcotic flag, drug class for allergy alerts, requires-prescription flag).
- `medicine_batches` — batch-level stock with expiry, MRP, FEFO pick. The single source of truth for "what can we dispense?".

**Procurement (Layer 2 maker-checker on POs; PO approval matrix per BRD §8 + §12):**
- `purchase_orders` + `purchase_order_items`.
- `stock_movements` — every change in batch quantity is one row here (purchase in, sale out, return in, expiry write-off, ward use, surgery use).

**Sales & returns (POS workflow + customer return path):**
- `pharmacy_sales` + `pharmacy_sale_items` — header + lines. Sale insert triggers `fn_decrement_stock` which atomically decrements `medicine_batches.quantity_available` using FEFO.
- `pharmacy_returns` + `pharmacy_return_items` — customer-side returns; refund mode includes `credit_note` for store-credit.

**Compliance:**
- `narcotic_register` — NDPS Act mandated Schedule X transactions register. **Append-only**; carries the two-person witness columns; 7-year legal retention.

The drug master + batches are kept in this TSD (and not split out into a separate "Inventory" TSD) because the prescribing UI in [TSD-07](07-clinical-consultation.md) needs cross-table joins against `medicine_batches.quantity_available`.

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — step 19–22 (prescription dispensing, expiry verification, payment-then-handover).
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — real-time stock checks at prescribing; medicine picker shows In Stock / Low / Out of Stock.
- [8. Pharmacy Flow](../01-brd/hospital-flows.md#8-pharmacy-flow) — every step (counter check via UHID/mobile, availability check, payment, expiry verification, stock deduction at handover, vendor returns, replenishment workflow, expired batch auto-blocking, vendor credit notes).
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — pharmacy bills are part of the patient's overall billing; `pharmacy_sales.invoice_id` links to a master invoice.
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — low-stock alerts, expiry alerts, pending POs, vendor performance, narcotic compliance.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `vendors` | Pharmacy / consumables supplier registry. |
| `medicines` | Drug catalog — generic, brand, schedule, drug class, narcotic flag, requires-prescription. |
| `medicine_batches` | Batch-level stock with expiry, MRP, optimistic-lock version. FEFO pick. |
| `purchase_orders` | PO header to vendor; **Layer 2 maker-checker** for vendor approval. |
| `purchase_order_items` | PO lines with GST split. |
| `stock_movements` | Append-only log of every change in batch quantity. Separate-column FKs (per [00-conventions.md §FK patterns](00-conventions.md#fk-patterns)). |
| `pharmacy_sales` | Sale header — Rx-bound or OTC; idempotency key + optimistic-lock version. |
| `pharmacy_sale_items` | Sale lines — drug + batch + qty; trigger `fn_decrement_stock` on insert. |
| `pharmacy_returns` | Customer return header — refund-mode + credit-note link. |
| `pharmacy_return_items` | Return lines — restockable vs damaged. |
| `narcotic_register` | NDPS Act Schedule X transactions register; append-only; **Layer 2 two-person witness columns**. |

---

## 4. Table Specifications

> *Standard inline audit columns per [00-conventions.md](00-conventions.md#standard-audit-columns) — not repeated below.*

### 4.1 `vendors`

**Purpose:** Supplier registry. PO targets, payment-terms config, GST registration. Soft-delete keeps historical PO references intact.
**Lifecycle:** mutable; soft-delete via `is_active`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| vendor_code | varchar | NO | UNIQUE per tenant | — | Short code (e.g. `MEDPLUS01`) |
| vendor_name | varchar | NO | — | — | Trading name |
| contact_person | varchar | YES | — | — | Primary contact |
| mobile | varchar | NO | — | — | Primary phone |
| email | varchar | YES | — | — | |
| address | jsonb | YES | — | — | Same shape as patients.address |
| gstin | varchar | YES | — | — | GST registration |
| pan | varchar | YES | — | — | PAN — for TDS reporting |
| drug_licence_number | varchar | YES | — | — | Pharmacy licence — required for narcotic suppliers |
| payment_terms_days | int | NO | — | 30 | Net N days |
| is_narcotic_supplier | boolean | NO | — | FALSE | TRUE allows narcotic POs |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, vendor_code)` UNIQUE.
- `(tenant_id, is_active)` — picklist filter.

---

### 4.2 `medicines`

**Purpose:** Drug catalog. The "what can be prescribed" reference. Drives prescribing-time stock check, allergy alerting, narcotic register triggering, and pricing.
**Lifecycle:** mutable; soft-delete via `is_active`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| medicine_code | varchar | NO | UNIQUE per tenant | — | Short code (`PARA500`, `AMOX250`) |
| generic_name | varchar | NO | — | — | INN / generic |
| brand_name | varchar | YES | — | — | Trade name |
| manufacturer | varchar | YES | — | — | |
| **drug_class** | varchar | YES | — | — | E.g. `penicillin`, `nsaid`, `beta_blocker` — matched against `allergies_lookup.drug_class_code` for prescribing-time allergy alert |
| category | varchar | YES | — | — | Therapeutic category (`antibiotic`, `analgesic`, `antihypertensive`) |
| drug_schedule | varchar | YES | CHECK ∈ {'H','H1','X','G','OTC',NULL} | — | Drugs and Cosmetics Act schedule |
| is_narcotic | boolean | NO | — | FALSE | NDPS Act Schedule X — when TRUE, every transaction MUST write a `narcotic_register` row (enforced by trigger) |
| form | varchar | NO | CHECK ∈ {'tablet','capsule','syrup','injection','cream','ointment','drops','inhaler','patch','suppository','powder','other'} | — | Dosage form |
| strength | varchar | YES | — | — | E.g. `500 mg`, `5 ml`, `10 mg/ml` |
| unit | varchar | NO | — | — | Sale unit (`tablet`, `bottle`, `vial`, `tube`) |
| pack_size | int | NO | — | 1 | Units per pack |
| hsn_code | varchar | YES | — | — | GST HSN |
| gst_pct | decimal(4,2) | NO | — | 12.00 | Default GST % at sale (often 12% for medicines, 5% for some) |
| requires_prescription | boolean | NO | — | TRUE | OTC items can be sold without Rx |
| reorder_level | int | NO | — | 0 | Stock level that triggers PO suggestion |
| max_stock_level | int | NO | — | 0 | For ordering economics |
| storage_temp | varchar | YES | CHECK ∈ {'room','refrigerated','frozen','controlled',NULL} | — | Storage requirement |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, medicine_code)` UNIQUE.
- `(tenant_id, lower(generic_name), strength, form)` — duplicate-detection.
- `(tenant_id, drug_class) WHERE drug_class IS NOT NULL` — allergy-alert join.
- `(tenant_id, is_narcotic, is_active)` partial — narcotic-only views.

**Triggers:**
- `fn_enforce_narcotic_register` (BEFORE INSERT on `pharmacy_sale_items`, `stock_movements`) — when the medicine is `is_narcotic=TRUE`, refuses the write unless a corresponding `narcotic_register` row is being inserted in the same transaction.

---

### 4.3 `medicine_batches`

**Purpose:** Batch-level stock — the **single source of truth** for "what can we dispense right now?" FEFO (First Expiry First Out) is enforced at dispense time by sorting active batches by `expiry_date ASC`. Optimistic-lock `version` prevents lost decrements under concurrent dispense.
**Lifecycle:** mutable; soft-block via `is_blocked` for expired or recall.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| medicine_id | UUID | NO | FK → medicines(id) | — | Drug |
| batch_number | varchar | NO | — | — | Manufacturer batch |
| mfg_date | date | YES | — | — | Manufacture date |
| expiry_date | date | NO | — | — | Indexed; FEFO sort |
| purchase_price | decimal(10,2) | NO | — | — | Cost per unit |
| mrp | decimal(10,2) | NO | — | — | Maximum Retail Price |
| selling_price | decimal(10,2) | NO | — | — | Hospital's selling price (≤ MRP) |
| quantity_received | int | NO | — | — | Snapshot at receipt; immutable |
| quantity_available | int | NO | CHECK >= 0 | — | Decremented atomically at dispense by trigger |
| vendor_id | UUID | NO | FK → vendors(id) | — | Source supplier |
| purchase_order_id | UUID | YES | FK → purchase_orders(id) | — | Originating PO (NULL for emergency direct purchases) |
| received_date | date | NO | — | — | When stock arrived |
| **is_blocked** | boolean | NO | — | FALSE | TRUE = batch unavailable for dispense (expired, recalled, damaged) |
| blocked_reason | varchar | YES | — | — | When `is_blocked=TRUE` (e.g. `'expired'`, `'recall'`, `'damaged'`) |

**Indexes / uniqueness:**
- `(tenant_id, medicine_id, batch_number, vendor_id)` UNIQUE — same vendor can't supply two batches with the same number.
- `(tenant_id, medicine_id, expiry_date) WHERE quantity_available > 0 AND is_blocked = FALSE` partial — FEFO pick.
- `(tenant_id, expiry_date) WHERE expiry_date <= current_date + interval '30 days'` partial — expiry-warning alerts.
- `(tenant_id, medicine_id, quantity_available)` — stock summary by drug.

**Triggers:**
- `fn_block_expired_batches` (nightly job, not a row trigger) — sets `is_blocked=TRUE`, `blocked_reason='expired'` for all rows where `expiry_date < current_date AND is_blocked=FALSE`.
- `fn_decrement_stock` (AFTER INSERT on `pharmacy_sale_items`) — atomic FEFO decrement; raises `EXCEPTION` if no batch has enough quantity.

---

### 4.4 `purchase_orders`

**Purpose:** PO header to a vendor. Carries Layer 2 maker-checker — POs above the requesting staff's spending limit require approval per BRD §12 approval matrix.
**Lifecycle:** mutable on `status`, `approval_*`, `received_at`, `total_amount`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| po_number | varchar | NO | UNIQUE | — | Human-readable, e.g. `PO-2026-00834` |
| vendor_id | UUID | NO | FK → vendors(id) | — | Target vendor |
| expected_date | date | YES | — | — | Expected delivery |
| status | varchar | NO | CHECK ∈ {'draft','pending_approval','approved','sent','partially_received','received','cancelled','rejected'} | 'draft' | Lifecycle |
| total_amount | decimal(12,2) | NO | — | 0 | Sum of line totals; recomputed by app on item INSERT/UPDATE |
| ordered_at | timestamptz | YES | — | — | When sent to vendor |
| received_at | timestamptz | YES | — | — | When fully received |
| includes_narcotics | boolean | NO | — | FALSE | TRUE = the PO contains a Schedule X drug; vendor must be `is_narcotic_supplier=TRUE` |

*+ Layer 2 maker-checker columns (`approval_status`, `approved_by`, `approved_at`, `rejection_reason`) per [00-audit-logging.md §3](00-audit-logging.md#3-layer-2--maker-checker-columns-7-sensitive-tables).*

**Constraints:**
- `CHECK (created_by <> approved_by)` — separation of duties.
- `CHECK (NOT includes_narcotics OR vendor.is_narcotic_supplier)` — DB enforces narcotic-supplier rule (via trigger because cross-table CHECK is not native).

**Indexes / uniqueness:**
- `po_number` UNIQUE.
- `(tenant_id, status, ordered_at DESC)` — pending-PO queue.
- `(vendor_id, status)` — vendor-side view.

---

### 4.5 `purchase_order_items`

**Purpose:** PO lines — drug × quantity × price + GST split. Quantities track ordered vs received for partial-receipt scenarios.
**Lifecycle:** mutable on `quantity_received`, `total_price`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| purchase_order_id | UUID | NO | FK → purchase_orders(id) | — | Parent PO |
| medicine_id | UUID | NO | FK → medicines(id) | — | Drug |
| quantity_ordered | int | NO | CHECK > 0 | — | |
| quantity_received | int | NO | CHECK >= 0 | 0 | Updated as batches arrive |
| unit_price | decimal(10,2) | NO | — | — | |
| cgst_pct | decimal(4,2) | NO | — | 0 | |
| cgst_amount | decimal(10,2) | NO | — | 0 | |
| sgst_pct | decimal(4,2) | NO | — | 0 | |
| sgst_amount | decimal(10,2) | NO | — | 0 | |
| igst_pct | decimal(4,2) | NO | — | 0 | |
| igst_amount | decimal(10,2) | NO | — | 0 | |
| total_price | decimal(12,2) | NO | — | — | After tax |

**Indexes / uniqueness:**
- `(purchase_order_id, medicine_id)` UNIQUE — same drug listed twice on a PO is a data error.

---

### 4.6 `stock_movements`

**Purpose:** Append-only log of every quantity change on `medicine_batches`. The audit trail for stock reconciliation. Each row points at the source event (purchase, sale, return, write-off, transfer) via separate-column FKs (per [00-conventions.md §FK patterns](00-conventions.md#fk-patterns)).
**Lifecycle:** **append-only** — no UPDATE, no DELETE. 7-year retention.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| medicine_batch_id | UUID | NO | FK → medicine_batches(id) | — | Affected batch |
| movement_type | varchar | NO | CHECK ∈ {'purchase_in','sale_out','return_in','return_writeoff','adjustment','expiry_writeoff','surgery_use','ward_use','transfer_in','transfer_out'} | — | Event category |
| quantity | int | NO | CHECK quantity <> 0 | — | Signed: +ve for in, −ve for out |
| balance_after | int | NO | CHECK >= 0 | — | Snapshot of `medicine_batches.quantity_available` after this row was written |
| **purchase_order_item_id** | UUID | YES | FK → purchase_order_items(id) | — | Set when `movement_type='purchase_in'` |
| **pharmacy_sale_item_id** | UUID | YES | FK → pharmacy_sale_items(id) | — | Set when `movement_type='sale_out'` |
| **pharmacy_return_item_id** | UUID | YES | FK → pharmacy_return_items(id) | — | Set when `movement_type IN ('return_in','return_writeoff')` |
| **adjustment_reason** | text | YES | — | — | Required when `movement_type='adjustment'` |
| **transfer_counterpart_id** | UUID | YES | FK → stock_movements(id) | — | Self-FK pairing the matching `transfer_in` / `transfer_out` rows |
| performed_by | UUID | NO | FK → users(id) | — | |
| performed_at | timestamptz | NO | — | now() | |
| notes | text | YES | — | — | Free-form |

**Constraints:**
- `CHECK (num_nonnulls(purchase_order_item_id, pharmacy_sale_item_id, pharmacy_return_item_id, transfer_counterpart_id) <= 1)` — at most one source FK is set.
- `CHECK ((movement_type='adjustment') = (adjustment_reason IS NOT NULL))`.
- `CHECK ((movement_type='purchase_in')   = (purchase_order_item_id IS NOT NULL))`.
- `CHECK ((movement_type='sale_out')      = (pharmacy_sale_item_id IS NOT NULL))`.
- `CHECK ((movement_type IN ('return_in','return_writeoff')) = (pharmacy_return_item_id IS NOT NULL))`.

**Indexes / uniqueness:**
- `(medicine_batch_id, performed_at DESC)` — full ledger for one batch.
- `(tenant_id, movement_type, performed_at DESC)` — owner dashboard.
- One partial index per FK column WHERE `<col> IS NOT NULL` — reverse lookup.

**Append-only enforcement:** `BEFORE UPDATE OR DELETE` trigger raises an exception. Errors are corrected by appending a counter-`adjustment` row.

---

### 4.7 `pharmacy_sales`

**Purpose:** Sale header. Rx-bound (linked to a `prescriptions` row) or OTC (over-the-counter, no Rx). Carries idempotency key + optimistic-lock version.
**Lifecycle:** mutable on `status`, `bill_discount_*`, `version`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| sale_number | varchar | NO | UNIQUE | — | Human-readable, e.g. `PHX-2026-29812` |
| patient_id | UUID | YES | FK → patients(id) | — | NULL for `walkin_otc` |
| sale_type | varchar | NO | CHECK ∈ {'op_patient','ip_patient','walkin_prescription','walkin_otc','staff_self','department_use'} | — | Channel |
| prescription_id | UUID | YES | FK → prescriptions(id) | — | Set for Rx-bound sales |
| external_prescription_ref | varchar | YES | — | — | When Rx is from an external doctor (walk-in with paper Rx) |
| customer_name | varchar | YES | — | — | For walk-in OTC |
| customer_mobile | varchar | YES | — | — | For walk-in OTC |
| customer_age | int | YES | — | — | For walk-in OTC (helps dosing if pharmacist counsels) |
| invoice_id | UUID | YES | FK → invoices(id) | — | Linked bill |
| cash_session_id | UUID | YES | FK → cash_sessions(id) | — | The cashier shift |
| subtotal | decimal(12,2) | NO | — | 0 | Before discount + tax |
| total_tax | decimal(10,2) | NO | — | 0 | Sum of line GST |
| bill_discount_type | varchar | NO | CHECK ∈ {'none','percentage','flat'} | 'none' | Whole-bill discount |
| bill_discount_value | decimal(10,2) | NO | — | 0 | The %/flat number |
| bill_discount_amount | decimal(10,2) | NO | — | 0 | Computed |
| bill_discount_approved_by | UUID | YES | FK → users(id) | — | Required when bill_discount > tier threshold |
| bill_discount_reason | text | YES | — | — | Required when discount applied |
| net_amount | decimal(12,2) | NO | — | 0 | Final amount |
| status | varchar | NO | CHECK ∈ {'draft','billed','dispensed','partially_dispensed','cancelled','returned'} | 'draft' | Lifecycle |
| sale_date | timestamptz | NO | — | now() | |
| idempotency_key | UUID | YES | — | — | Partial UNIQUE — prevents double-charge on retry |
| printer_target | varchar | YES | — | — | Printer routing (`'dot_matrix_main'`, `'thermal_counter2'`) |

**Indexes / uniqueness:**
- `sale_number` UNIQUE.
- `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` UNIQUE partial — idempotency.
- `(tenant_id, patient_id, sale_date DESC) WHERE patient_id IS NOT NULL` — patient's pharmacy history.
- `(tenant_id, status, sale_date)` — pharmacy worklist.
- `(prescription_id) WHERE prescription_id IS NOT NULL` — Rx fulfilment lookup.

---

### 4.8 `pharmacy_sale_items`

**Purpose:** Sale lines — drug + batch + qty + price. Insert triggers FEFO stock decrement.
**Lifecycle:** mutable until parent sale is `dispensed`; immutable thereafter except on cancellation.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| pharmacy_sale_id | UUID | NO | FK → pharmacy_sales(id) | — | Parent sale |
| medicine_id | UUID | NO | FK → medicines(id) | — | Drug |
| medicine_batch_id | UUID | NO | FK → medicine_batches(id) | — | Specific batch dispensed |
| prescription_item_id | UUID | YES | FK → prescription_items(id) | — | Linked Rx item — set for Rx-bound sales |
| quantity | int | NO | CHECK > 0 | — | Units dispensed |
| unit_price | decimal(10,2) | NO | — | — | Snapshot from `medicine_batches.selling_price` |
| line_discount_pct | decimal(4,2) | NO | — | 0 | |
| line_discount_amount | decimal(10,2) | NO | — | 0 | |
| cgst_pct | decimal(4,2) | NO | — | 0 | |
| cgst_amount | decimal(10,2) | NO | — | 0 | |
| sgst_pct | decimal(4,2) | NO | — | 0 | |
| sgst_amount | decimal(10,2) | NO | — | 0 | |
| total_price | decimal(12,2) | NO | — | — | After discount + tax |

**Indexes / uniqueness:**
- `(pharmacy_sale_id, medicine_id, medicine_batch_id)` UNIQUE — same batch listed twice on a sale is a UX error (combine quantities instead).
- `(prescription_item_id) WHERE prescription_item_id IS NOT NULL` — Rx-fulfilment join.

**Triggers:**
- `fn_decrement_stock` (AFTER INSERT) — atomic FEFO decrement on `medicine_batches`; raises if insufficient.
- `fn_increment_dispensed_qty` (AFTER INSERT WHERE prescription_item_id IS NOT NULL) — increments `prescription_items.dispensed_qty`; recomputes parent `prescriptions.status` (`active` → `partially_dispensed` → `dispensed`).
- `fn_log_stock_movement` (AFTER INSERT) — writes `stock_movements` row (`movement_type='sale_out'`, `pharmacy_sale_item_id=NEW.id`).
- `fn_narcotic_register_check` (BEFORE INSERT WHERE medicine.is_narcotic) — refuses unless a paired `narcotic_register` row is being inserted in the same transaction.

---

### 4.9 `pharmacy_returns`

**Purpose:** Customer return header. Refund-mode includes `credit_note` for store-credit (links into the `credit_notes` table in [TSD-12](12-billing-invoicing.md)).
**Lifecycle:** mutable until processed.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| return_number | varchar | NO | UNIQUE | — | Human-readable, e.g. `PHR-2026-04231` |
| original_sale_id | UUID | NO | FK → pharmacy_sales(id) | — | Returning against this sale |
| patient_id | UUID | YES | FK → patients(id) | — | NULL for OTC walk-in returns |
| customer_name | varchar | YES | — | — | For OTC |
| customer_mobile | varchar | YES | — | — | For OTC |
| return_type | varchar | NO | CHECK ∈ {'full','partial'} | — | |
| return_reason | text | NO | — | — | Required (BRD §8 — mandatory reason field for vendor credit notes) |
| total_return_amount | decimal(12,2) | NO | — | — | Pre-refund-mode adjustments |
| refund_mode | varchar | NO | CHECK ∈ {'cash','upi','card','credit_note','original_method'} | — | How the customer is refunded |
| refund_amount | decimal(12,2) | NO | — | — | Final refund (after restocking fees if any) |
| credit_note_id | UUID | YES | FK → credit_notes(id) | — | Set when `refund_mode='credit_note'` |
| cash_session_id | UUID | YES | FK → cash_sessions(id) | — | Cashier shift handling the refund |
| processed_by | UUID | NO | FK → users(id) | — | Pharmacist processing the return |
| processed_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `return_number` UNIQUE.
- `(original_sale_id)` — list returns for a sale.
- `(tenant_id, processed_at DESC)` — daily returns report.

---

### 4.10 `pharmacy_return_items`

**Purpose:** Return lines. Each row carries a `condition` (good / opened / damaged / expired) and a `restock_quantity` — only good-condition items are restocked; damaged ones are written off.
**Lifecycle:** immutable once parent return is processed.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| pharmacy_return_id | UUID | NO | FK → pharmacy_returns(id) | — | Parent return |
| pharmacy_sale_item_id | UUID | NO | FK → pharmacy_sale_items(id) | — | Original sale line being returned |
| medicine_id | UUID | NO | FK → medicines(id) | — | Snapshot |
| medicine_batch_id | UUID | NO | FK → medicine_batches(id) | — | Snapshot |
| quantity_returned | int | NO | CHECK > 0 | — | Total returned |
| condition | varchar | NO | CHECK ∈ {'good','opened','damaged','expired'} | — | Drives restock decision |
| restock_quantity | int | NO | CHECK >= 0 | — | Goes back to stock; 0 if condition isn't `good` |
| writeoff_quantity | int | NO | GENERATED ALWAYS AS (quantity_returned - restock_quantity) STORED | — | The non-restockable portion |
| unit_price | decimal(10,2) | NO | — | — | From original sale |
| return_amount | decimal(12,2) | NO | — | — | qty × price − discount snapshots |
| notes | text | YES | — | — | Free-form (e.g. "broken seal") |

**Indexes / uniqueness:**
- `(pharmacy_return_id, pharmacy_sale_item_id)` UNIQUE.

**Triggers:**
- `fn_log_stock_movement_return` (AFTER INSERT) — writes two `stock_movements` rows: one `return_in` for `restock_quantity`, one `return_writeoff` for `writeoff_quantity` (only if non-zero).

---

### 4.11 `narcotic_register`

**Purpose:** NDPS Act 1985 mandated Schedule X transactions register. **Append-only, 7-year legal retention.** Every transaction (purchase in, dispense out, wastage, transfer, expired write-off) of a Schedule X drug must be recorded with the prescriber, recipient, ID proof, witness — and the running balance must reconcile with physical stock at every audit.

The `medicines.is_narcotic=TRUE` flag enforces this via trigger: any `pharmacy_sale_items` or `stock_movements` row referencing a narcotic drug fails unless a paired `narcotic_register` row is inserted in the same transaction.

**Lifecycle:** **append-only** — no UPDATE, no DELETE. Errors are corrected by appending an adjustment row with `transaction_type='wastage'` or `'adjustment'` (with negative quantity). 7-year legal retention.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| medicine_id | UUID | NO | FK → medicines(id) | — | Must satisfy `medicines.is_narcotic=TRUE` (trigger-validated) |
| medicine_batch_id | UUID | YES | FK → medicine_batches(id) | — | Specific batch (NULL only for opening-balance entries) |
| transaction_type | varchar | NO | CHECK ∈ {'opening_balance','purchase_in','dispense_out','wastage','transfer_in','transfer_out','return','expired_writeoff','adjustment'} | — | Event category |
| quantity | int | NO | CHECK quantity <> 0 | — | Signed by transaction_type semantics; trigger validates sign |
| balance_after | int | NO | CHECK >= 0 | — | Running balance — must reconcile with physical at audit |
| pharmacy_sale_id | UUID | YES | FK → pharmacy_sales(id) | — | Set for `dispense_out` |
| prescription_id | UUID | YES | FK → prescriptions(id) | — | Set for `dispense_out`; required for in-house Rx |
| **prescriber_name** | varchar | YES | — | — | Required for `dispense_out` (NDPS Act) |
| **prescriber_reg_no** | varchar | YES | — | — | TNMC / MCI registration number |
| **recipient_name** | varchar | YES | — | — | Required for `dispense_out` |
| **recipient_relation** | varchar | YES | CHECK ∈ {'self','mother','father','spouse','sibling','child','attender','other',NULL} | — | Per NDPS Act |
| **recipient_id_proof** | varchar | YES | — | — | Aadhaar last 4 / voter ID / DL — required for `dispense_out` |
| **performed_by** | UUID | NO | FK → users(id) | — | Pharmacist (the maker) |
| **witnessed_by** | UUID | NO | FK → users(id) | — | Second pharmacist / senior — **required by NDPS Act two-person rule** |
| performed_at | timestamptz | NO | — | now() | |
| notes | text | YES | — | — | Free-form |

*+ Layer 2 maker-checker columns are present (`approval_status`, `approved_by`, `approved_at`, `rejection_reason`) for **wastage / adjustment** transactions which require additional sign-off. For routine `purchase_in` / `dispense_out`, the `witnessed_by` column captures the two-person rule and `approval_status` defaults to `'approved'`.*

**Constraints:**
- `CHECK (performed_by <> witnessed_by)` — two distinct users.
- `CHECK ((transaction_type='dispense_out') IMPLIES (prescriber_name IS NOT NULL AND recipient_name IS NOT NULL AND recipient_id_proof IS NOT NULL))` — NDPS dispense requires full disclosure.
- `CHECK ((transaction_type IN ('wastage','adjustment')) IMPLIES (approval_status IN ('approved') AND approved_by IS NOT NULL))` — wastage requires approval.

**Indexes / uniqueness:**
- `(tenant_id, medicine_id, performed_at DESC)` — drug-level register printout.
- `(tenant_id, performed_at DESC) WHERE transaction_type='dispense_out'` partial — dispense ledger.
- `(prescription_id) WHERE prescription_id IS NOT NULL` — Rx-fulfilment trace.

**Append-only enforcement:** `BEFORE UPDATE OR DELETE` trigger raises an exception.

---

## 5. Cross-References

- **Patient identity:** [TSD-03 Patient Master](03-patient-master.md). `pharmacy_sales` is a registered mergeable table.
- **Visit anchor:** [TSD-06 OPD Encounters](06-opd-encounters.md) — pharmacy sales tied to visits via `prescription_id` → `consultations.op_visit_id`.
- **State transitions** on Rx fulfilment: [TSD-04 Patient Journey](04-patient-journey.md) — `pharmacy_pending` / `dispensed` events.
- **Prescriptions / consultations:** [TSD-07 Clinical Consultation](07-clinical-consultation.md). `pharmacy_sale_items.prescription_item_id` increments `prescription_items.dispensed_qty`.
- **Tokens at pharmacy counter:** [TSD-05 Appointments §4.3](05-appointments.md#43-tokens) — `tokens.pharmacy_sale_id`.
- **Allergy alert at prescribing:** `medicines.drug_class` ↔ `allergies_lookup.drug_class_code` ↔ `patients.allergies` — see [TSD-03 §4.6](03-patient-master.md#46-allergies_lookup).
- **Billing:** TSD-12 Billing & Invoicing *(Batch D)* — `pharmacy_sales.invoice_id`; `credit_notes` for refund-mode credit.
- **Cash session (cashier shift):** TSD-13 Payments & Cash *(Batch D)* — `pharmacy_sales.cash_session_id`, `pharmacy_returns.cash_session_id`.
- **Audit + maker-checker:** [00-audit-logging.md](00-audit-logging.md). `purchase_orders` and `narcotic_register` carry Layer 2 columns.

---

## 6. Schema Review Notes

### Resolved (2026-05-10)
- [x] **Layer 2 maker-checker on `purchase_orders`** — vendor PO approval per BRD §8 + §12 approval matrix.
- [x] **Layer 2 + two-person witness on `narcotic_register`** — `performed_by` / `witnessed_by` required; `approval_*` triggers for wastage / adjustment.
- [x] **Polymorphic FK on `stock_movements`** — replaced `(reference_type, reference_id)` with separate-column FKs (`purchase_order_item_id`, `pharmacy_sale_item_id`, `pharmacy_return_item_id`, `transfer_counterpart_id`) + CHECK at-most-one-non-null.
- [x] **`medicines.drug_class`** — added (was missing) for allergy-alert match against `allergies_lookup.drug_class_code` at prescribing time.
- [x] **Standard inline audit columns** on every mutable table.
- [x] **Vendor returns vs customer returns** — `pharmacy_returns` is customer-side; vendor returns / vendor credit notes flow through `purchase_orders` cancellation + `credit_notes` (in TSD-12).

### Open
- [ ] **suggestion** — `medicine_batches.is_blocked` is set by a nightly job for expiry. Real-time enforcement at dispense time is via the FEFO pick filter (`WHERE expiry_date >= current_date AND is_blocked=FALSE`). Consider an additional `BEFORE INSERT` trigger on `pharmacy_sale_items` that raises if the chosen batch is expired/blocked at dispense time — defends against UI race conditions.
- [ ] **suggestion** — Reorder-point alerts (`medicines.reorder_level`) and expiry-warning alerts (30 / 60 / 90 days) need a scheduled job + notification. Modelled today only as columns; the job spec belongs in the operational runbook.
- [ ] **question** — `pharmacy_sales.sale_type='department_use'` (e.g. ICU stocks IV fluids from pharmacy) — this isn't a sale to a patient. Should it be a `stock_movements` entry instead, with `movement_type='ward_use'`? Today both paths exist and that's confusing. Resolve before app build.
- [ ] **suggestion** — Vendor credit notes (we received credit from a vendor for a damaged batch returned) are not modelled as a separate entity — currently subsumed under `credit_notes` (TSD-12). For audit clarity, consider `vendor_credit_notes` as a sibling of `credit_notes` (which is patient-side). Defer.
- [ ] **suggestion** — `medicines.gst_pct DEFAULT 12` is a legal default but real-world Indian medicines split between 5% and 12% (some life-saving drugs are 0%). Consider a per-medicine `gst_category` column with a lookup to centralised GST rates that can change with budget revisions. Defer.
- [ ] **question** — Generic substitution at dispense: pharmacist wants to substitute a brand for an equivalent generic when the prescribed brand is out of stock. Today there is no `is_substitutable` flag on `prescription_items` or `medicines`. Substitutions are silently happening or being refused. Surface for product decision — important for cost-control and stock management.
- [ ] **question** — `pharmacy_sales.bill_discount_approved_by` exists informally; should it use Layer 2 columns instead? The runbook style is informal here. Consistency suggests Layer 2 for big discounts. Surface for owner decision (BRD §9 discount approval matrix).
- [ ] **suggestion** — `narcotic_register.balance_after` is supposed to reconcile with physical stock at audit. But the column is set by app code, not by trigger. A `fn_compute_narcotic_balance()` trigger that computes `balance_after = previous_balance + signed_quantity` removes the chance of manual error.
- [ ] **suggestion** — `purchase_orders.includes_narcotics` can drift from the actual line items. A trigger on `purchase_order_items` that recomputes this flag from the items would be sound.
- [ ] **suggestion** — Stock-transfer between counters (e.g. main pharmacy → IP ward stock) is modelled via `transfer_in`/`transfer_out` paired rows linked by `transfer_counterpart_id`. This works but having a `stock_transfers(id, from_batch, to_batch, qty, reason)` aggregate root makes transfer UX cleaner. Defer.
