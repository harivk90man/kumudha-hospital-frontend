# TSD 12: Billing & Invoicing

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

The **invoice** as a business artefact — the printable, GST-compliant document that ties together every billable item from a patient's encounter into one settled bill.

Three tables:

1. **`invoices`** — header per bill. Holds the patient and visit/admission anchors, totals, GST split (CGST + SGST + IGST), discount type/amount, payment status, balance, optimistic-lock version, idempotency key. **Carries Layer 2 maker-checker** for discount approval per BRD §9 (line-item + whole-bill discount tiers).
2. **`invoice_items`** — bill lines. One row per billable item; carries item type (consultation / drug / lab / radiology / room / procedure / consumable), reference to the source business object via separate-column FKs (per [00-conventions §FK patterns](00-conventions.md#fk-patterns)), unit price snapshot, line-level discount, GST split.
3. **`credit_notes`** — refund / write-off / store-credit instrument. Generated when a payment is reversed (cancelled service after payment), a return is processed (pharmacy return with `refund_mode='credit_note'`), or a discretionary write-off is approved. **Carries Layer 2 maker-checker** for refund / write-off approval.

The actual money movement (cash, UPI, card) is **not** here — that lives in [TSD-13 Payments & Cash](13-payments-cash.md). An invoice records *what was billed*; a payment records *how it was paid*. They are linked via `payment_allocations`.

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — every paid step generates an invoice + invoice_item rows.
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — `lab_orders.invoice_id`, `radiology_orders.invoice_id` link back here.
- [8. Pharmacy Flow](../01-brd/hospital-flows.md#8-pharmacy-flow) — `pharmacy_sales.invoice_id`; pharmacy refunds create `credit_notes`.
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — entire flow: bill opening, line-item charging, discounts (line + whole-bill, % + flat), approval matrix, mandatory reason, audit trail, partial payment, receipt generation. Insurance separation columns are placeholders for Phase 2.
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — daily collections, outstanding bills, overdue, dept-wise revenue.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `invoices` | Bill header — patient, totals, GST, discounts, status, balance, idempotency, optimistic lock; **Layer 2 maker-checker** for discount approval. |
| `invoice_items` | Bill lines with GST split + line-level discount; separate-column FKs to source business objects. |
| `credit_notes` | Refund / write-off / store-credit instrument; **Layer 2 maker-checker**. |

---

## 4. Table Specifications

> *Standard inline audit columns per [00-conventions.md](00-conventions.md#standard-audit-columns) — not repeated below.*

### 4.1 `invoices`

**Purpose:** Bill header. Every paid service (consultation, lab, radiology, pharmacy) lives under one of five invoice types. The header carries totals, discounts (line + whole-bill), GST split, balance, and approval status. Layer 2 maker-checker formalises BRD §9's discount approval matrix.
**Lifecycle:** mutable on `status`, `discount_*`, `amount_paid`, `balance`, `version`. Once `status='paid'`, items are immutable.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| invoice_number | varchar | NO | UNIQUE | — | Human-readable; format locked after first record (BRD §13) |
| invoice_type | varchar | NO | CHECK ∈ {'OP','IP_INTERIM','IP_FINAL','PHARMACY','LAB_DIRECT','RADIOLOGY_DIRECT','OTHER'} | — | Determines which dashboards roll it up |
| patient_id | UUID | NO | FK → patients(id) | — | Subject |
| op_visit_id | UUID | YES | FK → op_visits(id) | — | OP context |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | IP context (Phase 2) |
| invoice_date | date | NO | — | current_date | Financial date for period reports |
| subtotal | decimal(12,2) | NO | — | 0 | Sum of line totals before discounts/tax |
| total_line_discount | decimal(12,2) | NO | — | 0 | Sum of `invoice_items.line_discount_amount` |
| bill_discount_type | varchar | NO | CHECK ∈ {'none','percentage','flat'} | 'none' | Whole-bill discount |
| bill_discount_value | decimal(10,2) | NO | — | 0 | The %/flat number entered |
| bill_discount_amount | decimal(12,2) | NO | — | 0 | Computed from value + subtotal |
| bill_discount_reason | text | YES | — | — | Required when discount applied (BRD §9 mandatory reason) |
| bill_discount_category | varchar | YES | CHECK ∈ {'senior_citizen','staff','camp','corporate','charity','management','special',NULL} | — | BRD §9 discount-category list |
| total_discount | decimal(12,2) | NO | GENERATED ALWAYS AS (total_line_discount + bill_discount_amount) STORED | — | Combined |
| total_tax | decimal(12,2) | NO | — | 0 | Sum of CGST + SGST + IGST across items |
| total_amount | decimal(12,2) | NO | — | 0 | subtotal − total_discount + total_tax |
| amount_paid | decimal(12,2) | NO | — | 0 | Updated by payment-allocation procedure |
| balance | decimal(12,2) | NO | GENERATED ALWAYS AS (total_amount - amount_paid) STORED | — | Outstanding |
| payment_status | varchar | NO | CHECK ∈ {'draft','finalized','paid','partially_paid','refunded','cancelled','written_off'} | 'draft' | Lifecycle |
| insurance_covered_amount | decimal(12,2) | NO | — | 0 | Phase 2 placeholder; today always 0 |
| patient_copay_amount | decimal(12,2) | NO | — | 0 | Phase 2 placeholder |
| finalized_at | timestamptz | YES | — | — | Set when status moves from `draft` → `finalized` |
| idempotency_key | UUID | YES | — | — | Partial UNIQUE — prevents double-bill on UI retry |

*+ Layer 2 maker-checker columns (`approval_status`, `approved_by`, `approved_at`, `rejection_reason`) per [00-audit-logging.md §3](00-audit-logging.md#3-layer-2--maker-checker-columns-7-sensitive-tables). When `total_discount > system_config['billing.discount_threshold_for_approval']`, status moves to `pending_approval` and downstream payment is blocked until approved.*

**Constraints:**
- `CHECK (bill_discount_type = 'none') = (bill_discount_amount = 0)`.
- `CHECK ((bill_discount_amount > 0 OR total_line_discount > 0) IMPLIES bill_discount_reason IS NOT NULL)` — discounts need a reason.
- `CHECK (created_by <> approved_by)` — separation of duties.
- `CHECK (amount_paid <= total_amount)` — no overpayment in this column (excess goes to `payments.on_account` allocation).

**Indexes / uniqueness:**
- `(tenant_id, invoice_number)` UNIQUE.
- `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` UNIQUE partial.
- `(tenant_id, payment_status, invoice_date)` — owner outstanding-bills view.
- `(tenant_id, patient_id, invoice_date DESC)` — patient billing history.
- `(tenant_id, payment_status, balance) WHERE balance > 0 AND payment_status NOT IN ('cancelled','written_off','draft')` partial — overdue dashboard.

**State transitions** (BRD §9):
- `draft` → `finalized` (no more items added) → `paid` / `partially_paid` (via payment allocation) → `paid` (when balance=0).
- `finalized | partially_paid` → `refunded` (full refund issued via credit note).
- `draft | finalized` → `cancelled` (with reason).
- `partially_paid` → `written_off` (long-overdue write-off; requires Layer 2 approval on the write-off credit note).

---

### 4.2 `invoice_items`

**Purpose:** Bill lines. One row per billable artefact. Each line has a `item_type` discriminator and a separate-column FK to the source business object (consultation, lab order, radiology order, prescription item, etc.). GST is split per line (CGST + SGST for intra-state; IGST for inter-state).
**Lifecycle:** mutable while parent `invoices.payment_status='draft'`. Immutable thereafter.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| invoice_id | UUID | NO | FK → invoices(id) | — | Parent invoice |
| service_id | UUID | YES | FK → services(id) | — | Set for `services` catalog items (consultation, ECG, room) |
| item_type | varchar | NO | CHECK ∈ {'consultation','lab_test','radiology','drug','room_charge','nursing','procedure','surgery','consumable','ambulance','other'} | — | Discriminator |
| item_name | varchar | NO | — | — | Snapshot at billing time (so retroactive catalog rename doesn't change historic invoice display) |
| sequence_no | int | NO | — | — | Display order |
| **consultation_id** | UUID | YES | FK → consultations(id) | — | Set when `item_type='consultation'` |
| **lab_order_item_id** | UUID | YES | FK → lab_order_items(id) | — | Set when `item_type='lab_test'` |
| **radiology_order_id** | UUID | YES | FK → radiology_orders(id) | — | Set when `item_type='radiology'` |
| **pharmacy_sale_item_id** | UUID | YES | FK → pharmacy_sale_items(id) | — | Set when `item_type='drug'` |
| **prescription_item_id** | UUID | YES | FK → prescription_items(id) | — | Optional cross-link for Rx-bound drug lines |
| **bed_assignment_id** | UUID | YES | FK → bed_assignments(id) | — | Set when `item_type='room_charge'` *(Phase 2)* |
| **surgery_schedule_id** | UUID | YES | FK → surgery_schedules(id) | — | Set when `item_type='surgery'` *(Phase 2)* |
| hsn_code | varchar | YES | — | — | Used for goods (cafeteria, retail) |
| sac_code | varchar | YES | — | — | Used for healthcare services |
| quantity | int | NO | CHECK > 0 | 1 | |
| unit_price | decimal(10,2) | NO | — | — | Snapshot of price at invoice time |
| line_discount_pct | decimal(4,2) | NO | — | 0 | |
| line_discount_amount | decimal(10,2) | NO | — | 0 | Computed |
| line_discount_reason | text | YES | — | — | Required when line discount > 0 |
| line_discount_by | UUID | YES | FK → users(id) | — | Approver when line discount needs sign-off |
| cgst_pct | decimal(4,2) | NO | — | 0 | Healthcare services: 0 |
| cgst_amount | decimal(10,2) | NO | — | 0 | |
| sgst_pct | decimal(4,2) | NO | — | 0 | |
| sgst_amount | decimal(10,2) | NO | — | 0 | |
| igst_pct | decimal(4,2) | NO | — | 0 | Inter-state supplies |
| igst_amount | decimal(10,2) | NO | — | 0 | |
| total_price | decimal(12,2) | NO | — | — | (qty × unit_price) − line_discount_amount + cgst_amount + sgst_amount + igst_amount |

**Constraints:**
- `CHECK (num_nonnulls(consultation_id, lab_order_item_id, radiology_order_id, pharmacy_sale_item_id, bed_assignment_id, surgery_schedule_id) <= 1)` — at most one source FK is set.
- `CHECK ((item_type='consultation') = (consultation_id IS NOT NULL))`.
- `CHECK ((item_type='lab_test')     = (lab_order_item_id IS NOT NULL))`.
- `CHECK ((item_type='radiology')    = (radiology_order_id IS NOT NULL))`.
- `CHECK ((item_type='drug')         = (pharmacy_sale_item_id IS NOT NULL))`.
- `CHECK ((line_discount_amount > 0) IMPLIES line_discount_reason IS NOT NULL)`.

**Indexes / uniqueness:**
- `(invoice_id, sequence_no)` UNIQUE — stable display order.
- One partial index per source-FK column WHERE `<col> IS NOT NULL` — reverse lookup ("which invoice line is this lab test on?").

**Triggers:**
- `fn_recompute_invoice_totals` (AFTER INSERT/UPDATE/DELETE) — recomputes `invoices.subtotal`, `total_line_discount`, `total_tax`, `total_amount`. The version-based optimistic lock on `invoices` ensures concurrent line edits don't lose updates.

---

### 4.3 `credit_notes`

**Purpose:** Refund / write-off / store-credit instrument. Created when (a) a service is cancelled after payment (refund), (b) a pharmacy return is processed with `refund_mode='credit_note'` (store credit), (c) a long-overdue invoice is written off, (d) an over-collected invoice needs adjustment. **Carries Layer 2 maker-checker** for refund / write-off approval per BRD §9.
**Lifecycle:** mutable on `status`, `applied_to_invoice_id`, `redeemed_at`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| credit_note_number | varchar | NO | UNIQUE | — | Human-readable, e.g. `CN-2026-00194` |
| credit_note_type | varchar | NO | CHECK ∈ {'refund','store_credit','write_off','adjustment'} | — | Reason category |
| amount | decimal(12,2) | NO | CHECK > 0 | — | Note value |
| status | varchar | NO | CHECK ∈ {'draft','pending_approval','approved','redeemed','expired','cancelled'} | 'draft' | Lifecycle |
| patient_id | UUID | YES | FK → patients(id) | — | Subject (NULL for vendor credit notes — see §6) |
| original_invoice_id | UUID | YES | FK → invoices(id) | — | The invoice being credited (set for `refund` / `adjustment` / `write_off`) |
| original_pharmacy_return_id | UUID | YES | FK → pharmacy_returns(id) | — | The return being credited (set for `store_credit` from pharmacy returns) |
| applied_to_invoice_id | UUID | YES | FK → invoices(id) | — | When `status='redeemed'`, the invoice it was applied to |
| reason | text | NO | — | — | Required (BRD §8 — mandatory reason) |
| expires_at | date | YES | — | — | For store-credit; NULL = no expiry |
| redeemed_at | timestamptz | YES | — | — | Set when applied to an invoice |

*+ Layer 2 maker-checker columns. Refunds, write-offs, and store-credits all flow through `pending_approval` → `approved`.*

**Constraints:**
- `CHECK (num_nonnulls(original_invoice_id, original_pharmacy_return_id) >= 1)` — must reference at least one origin.
- `CHECK ((status='redeemed') = (applied_to_invoice_id IS NOT NULL AND redeemed_at IS NOT NULL))`.
- `CHECK ((credit_note_type='store_credit') OR (status NOT IN ('redeemed') OR applied_to_invoice_id IS NOT NULL))`.
- `CHECK (created_by <> approved_by)` — separation of duties.

**Indexes / uniqueness:**
- `credit_note_number` UNIQUE.
- `(tenant_id, patient_id, status) WHERE patient_id IS NOT NULL` — patient's outstanding store-credit.
- `(tenant_id, status, expires_at) WHERE status='approved' AND expires_at IS NOT NULL` partial — expiry alerts.

---

## 5. Cross-References

- **Patient identity:** [TSD-03 Patient Master](03-patient-master.md). `invoices` is a registered mergeable table.
- **Visit anchor:** [TSD-06 OPD Encounters](06-opd-encounters.md). `invoices.op_visit_id`.
- **Service catalog & pricing:** [TSD-11 Services & Pricing](11-services-pricing.md). `invoice_items.service_id`, `unit_price` snapshot.
- **Lab / Radiology / Pharmacy** — separate-column source FKs from `invoice_items`: TSD-08, TSD-09, TSD-10.
- **Pharmacy returns redeem credit notes:** [TSD-10 §4.9](10-pharmacy-inventory.md#49-pharmacy_returns) — `pharmacy_returns.credit_note_id`.
- **Payments and allocations:** [TSD-13 Payments & Cash](13-payments-cash.md). Money movement is in TSD-13; `payment_allocations.invoice_id` ties payments to invoices.
- **Audit + Layer 2 maker-checker:** [00-audit-logging.md](00-audit-logging.md). `invoices` and `credit_notes` are two of the seven Layer-2 tables.
- **Discount approval matrix configured in:** [TSD-01 §4.10 `system_config`](01-platform-tenancy.md#410-system_config) — keys like `billing.discount_threshold_for_approval`, `billing.discount_max_pct_by_role`.

---

## 6. Schema Review Notes

### Resolved (2026-05-10)
- [x] **Layer 2 maker-checker on `invoices`** — discount approval per BRD §9.
- [x] **Layer 2 maker-checker on `credit_notes`** — refund / write-off approval.
- [x] **Standard inline audit columns** on every mutable table.
- [x] **Polymorphic FKs replaced** — `invoice_items.reference_id` was polymorphic in the runbook; replaced with named source-FK columns (`consultation_id`, `lab_order_item_id`, `radiology_order_id`, `pharmacy_sale_item_id`, `bed_assignment_id`, `surgery_schedule_id`) + CHECK at-most-one-non-null + agreement CHECKs against `item_type`.
- [x] **Generated columns**: `invoices.balance` and `invoices.total_discount` are STORED generated, removing a class of "balance got out of sync" bugs.
- [x] **GST split** retained at line level; `tax_pct` legacy column dropped.

### Open
- [ ] **suggestion** — `invoices.invoice_number` format. Today no DB-level format check. The runbook says format is locked after first record per BRD §13 — same guard pattern as UHID. Add a CHECK constraint enforced via `system_config` (value validation in trigger).
- [ ] **question** — Approval matrix evaluation: today the threshold is read from `system_config` at write time. If thresholds change, partially-approved invoices retain their original threshold context. Should we snapshot the matrix used at approval time (`approval_matrix_snapshot jsonb`)? Defends against retroactive policy changes. Defer.
- [ ] **suggestion** — Vendor credit notes (received from a pharmacy supplier for a damaged batch) are not separated from patient credit notes. Consider `vendor_credit_notes` as a sibling. Defer (also flagged in TSD-10).
- [ ] **suggestion** — Insurance columns (`insurance_covered_amount`, `patient_copay_amount`) are placeholders today. The actual TPA flow is Phase 2. Today they default to 0 and aren't read. Decision: keep as columns (cheap, future-proof) or move to a separate `invoice_insurance_split` table. Defer.
- [ ] **question** — Multi-currency: today implicit INR. Out of scope unless international patients become significant.
- [ ] **suggestion** — `invoices.payment_status='written_off'` requires Layer 2 approval — but the approval today is captured on the **credit note** (write-off credit note), not on the invoice itself. Document the handshake clearly: invoice `payment_status='written_off'` IFF a credit note `credit_note_type='write_off'` `status='approved'` exists referencing it. Add a CHECK or trigger.
- [ ] **suggestion** — `invoice_items.unit_price` is a snapshot; if a finalized invoice is later "re-priced" (rare), today there is no audit. Add a trigger that emits an `audit_logs` row when `unit_price` changes on a finalized invoice (refusing the change unless a Layer 2 approval is in place). Defer.
