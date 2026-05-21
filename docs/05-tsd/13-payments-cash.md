# TSD 13: Payments & Cash

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

The **money movement** layer — every rupee in or out of the hospital, who paid it, what it paid for, which cashier shift handled it, and how the daily cash close reconciles.

Three sub-domains:

**A. Payments + payees + allocations** — the core ledger:
- `payees` — the *who*. Decoupled from `patients` so walk-in OTC customers, vendor refunds, and employee advances can also be recorded.
- `payments` — the *event*. One row per cash / UPI / card / cheque / insurance settlement, in or out, idempotency-keyed and version-locked.
- `payment_allocations` — the *split*. One UPI of ₹5,000 may pay ₹3,000 to a pharmacy bill and ₹2,000 to an IP advance — multiple allocation rows make that traceable.

**B. Polymorphic payment-source bridge** — the parallel "what did this payment fund" view (see runbook §3 *Polymorphic payment-source bridge*):
- `payment_item_types` — registry of supported payment sources.
- `payment_items` — bridge between `payments` and per-type detail tables. **Now uses separate-column FKs** (resolved 2026-05-10) instead of polymorphic `(payment_type_id, item_record_id)`.
- `payment_consultation`, `payment_lab`, `payment_pharmacy`, `payment_xray`, `payment_cafeteria` — per-type detail tables holding the line-level information specific to each revenue stream.

This bridge is **parallel** to `invoice_items` because the questions are different: `invoice_items` answers "what's on this bill?"; `payment_items` answers "what revenue stream did this rupee fund?" — fastest path to revenue-by-source dashboards without traversing invoices.

**C. Cashier shift management** — daily reconciliation:
- `cash_counters` — physical counter registry.
- `cash_sessions` — open / close shift with denomination breakdown, expected vs counted, variance reason.
- `session_movements` — non-sale in/out (petty cash, deposits to bank, cashier handovers, refund payouts).

> **Naming note:** the runbook called the shift table `business_sessions`. Renamed to `cash_sessions` here for clarity (every TSD that references it — TSD-10 pharmacy, TSD-13 — uses the cash_sessions name).

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — every paid step writes a `payments` row + allocation.
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — `payment_lab`, `payment_xray` per-type lines.
- [8. Pharmacy Flow](../01-brd/hospital-flows.md#8-pharmacy-flow) — `payment_pharmacy` lines; pharmacy-return refund payouts.
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — partial payments, multi-allocation splits, refund handling.
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — daily collections by source (the `payment_items` bridge powers this), open / closed sessions, variance reports, cashier-wise reconciliation.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `payees` | Who paid — patient / walk-in / vendor / employee / insurance — decoupled from UHID. |
| `payments` | Money event — cash / UPI / card / cheque / insurance, in or out; idempotency-keyed; version-locked. |
| `payment_allocations` | Splits — one payment may fund multiple invoices, advances, or sit on-account. |
| `payment_item_types` | Registry of supported payment sources (consultation, lab, pharmacy, xray, cafeteria). |
| `payment_items` | Bridge from a payment to the per-type detail row that was paid for; **separate-column FKs**. |
| `payment_consultation` | Per-line detail for doctor consultation fees. |
| `payment_lab` | Per-line detail for lab charges. |
| `payment_pharmacy` | Per-line detail for pharmacy charges. |
| `payment_xray` | Per-line detail for radiology charges. |
| `payment_cafeteria` | Per-line detail for cafeteria charges. |
| `cash_counters` | Physical cash counter registry. |
| `cash_sessions` | Cashier shift open/close — denomination breakdown, expected vs counted, variance. |
| `session_movements` | Non-sale movements during a session (refunds, petty cash out, bank deposits, cashier handovers). |

---

## 4. Table Specifications

> *Standard inline audit columns per [00-conventions.md](00-conventions.md#standard-audit-columns) — not repeated below.*

### 4.1 `payees`

**Purpose:** The "who paid" table — decoupled from `patients`. Lets the system handle walk-in OTC customers (no UHID), vendor refunds, employee advances, and insurance payments under one common payment-event model.
**Lifecycle:** mutable; rows persist for historical traceability.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| payee_type | varchar | NO | CHECK ∈ {'patient','walk_in','vendor','employee','insurance','other'} | — | Discriminator |
| patient_id | UUID | YES | FK → patients(id) | — | Set when `payee_type='patient'` |
| vendor_id | UUID | YES | FK → vendors(id) | — | Set when `payee_type='vendor'` |
| employee_user_id | UUID | YES | FK → users(id) | — | Set when `payee_type='employee'` |
| insurance_tpa_name | varchar | YES | — | — | Set when `payee_type='insurance'` (Phase 2 — placeholder today) |
| name | varchar | YES | — | — | For walk-in or other; required when no FK is set |
| mobile | varchar | YES | — | — | For walk-in |
| gstin | varchar | YES | — | — | For B2B receipts (vendor / corporate) |
| notes | text | YES | — | — | Free-form |

**Constraints:**
- `CHECK ((payee_type='patient')   = (patient_id IS NOT NULL))`.
- `CHECK ((payee_type='vendor')    = (vendor_id IS NOT NULL))`.
- `CHECK ((payee_type='employee')  = (employee_user_id IS NOT NULL))`.
- `CHECK ((payee_type IN ('walk_in','other')) IMPLIES (name IS NOT NULL))`.

**Indexes / uniqueness:**
- `(tenant_id, patient_id) WHERE patient_id IS NOT NULL` — find existing payee row for a patient (UPSERT pattern).
- `(tenant_id, vendor_id) WHERE vendor_id IS NOT NULL`.
- `(tenant_id, employee_user_id) WHERE employee_user_id IS NOT NULL`.

---

### 4.2 `payments`

**Purpose:** Money event. One row per receipt or payout. Carries idempotency key (defends against double-charge on UI retry), version (optimistic lock), session link (cashier shift).
**Lifecycle:** mutable on `version`, `notes`. Other fields immutable post-insert.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| payee_id | UUID | NO | FK → payees(id) | — | Who paid (or who was paid) |
| payment_direction | varchar | NO | CHECK ∈ {'in','out'} | — | `in` = collection, `out` = refund/payout |
| payment_mode | varchar | NO | CHECK ∈ {'cash','card','upi','cheque','net_banking','insurance','other'} | — | How money moved |
| amount | decimal(12,2) | NO | CHECK > 0 | — | Always positive; direction is in the column above |
| transaction_ref | varchar | YES | — | — | UPI ref, card RRN, cheque number |
| paid_at | timestamptz | NO | — | now() | When the money moved |
| received_by | UUID | NO | FK → users(id) | — | The cashier |
| cash_session_id | UUID | NO | FK → cash_sessions(id) | — | Owning session — every payment belongs to a session |
| idempotency_key | UUID | YES | — | — | Partial UNIQUE — prevents double-charge on retry |
| notes | text | YES | — | — | Free-form |

**Indexes / uniqueness:**
- `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` UNIQUE partial — idempotency.
- `(tenant_id, paid_at DESC)` — daily collection report.
- `(cash_session_id, payment_direction)` — session reconciliation.
- `(payee_id, paid_at DESC)` — payee history.

---

### 4.3 `payment_allocations`

**Purpose:** How a single `payments` row splits across one or more invoices, advances, or on-account positions. A patient paying ₹5,000 for ₹3,000 of pharmacy + ₹2,000 of lab gets one `payments` row and two `payment_allocations` rows.
**Lifecycle:** immutable post-insert (corrections via reverse allocation).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| payment_id | UUID | NO | FK → payments(id) | — | Parent payment |
| allocation_type | varchar | NO | CHECK ∈ {'invoice','pharmacy_sale','ip_advance','interim_bill','refund','on_account','credit_note_application'} | — | What is being funded |
| invoice_id | UUID | YES | FK → invoices(id) | — | Set for `invoice` / `credit_note_application` |
| pharmacy_sale_id | UUID | YES | FK → pharmacy_sales(id) | — | Set for `pharmacy_sale` |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | Set for `ip_advance` *(Phase 2)* |
| interim_bill_id | UUID | YES | FK → interim_bills(id) | — | Set for `interim_bill` *(Phase 2)* |
| credit_note_id | UUID | YES | FK → credit_notes(id) | — | Set for `credit_note_application` |
| amount | decimal(12,2) | NO | CHECK > 0 | — | Allocated amount; sum across siblings = `payments.amount` |
| notes | text | YES | — | — | Free-form |

**Constraints:**
- `CHECK (num_nonnulls(invoice_id, pharmacy_sale_id, ip_admission_id, interim_bill_id, credit_note_id) <= 1)` — at most one target FK.
- `CHECK ((allocation_type='invoice')          = (invoice_id IS NOT NULL))` — and similar agreement CHECKs per type.
- `CHECK ((allocation_type='on_account')       = (num_nonnulls(invoice_id, pharmacy_sale_id, ip_admission_id, interim_bill_id, credit_note_id) = 0))` — on-account holds no FK.

**Indexes / uniqueness:**
- `(payment_id)` — list allocations for a payment.
- `(invoice_id) WHERE invoice_id IS NOT NULL` — payments funding this invoice.
- `(pharmacy_sale_id) WHERE pharmacy_sale_id IS NOT NULL`.

**Triggers:**
- `fn_check_allocation_sum` (BEFORE INSERT/UPDATE) — verifies running sum of allocations does not exceed `payments.amount`. Excess goes on `on_account` (handled in app logic).

---

### 4.4 `payment_item_types`

**Purpose:** Registry of supported payment sources. Stable numeric codes (1=xray, 2=pharmacy, 3=consultation, 4=lab, 5=cafeteria) — never re-numbered.
**Lifecycle:** mutable; new codes are added rarely (new revenue streams).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | int | NO | PK | — | Stable numeric code; never re-numbered |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| code | varchar | NO | UNIQUE per tenant | — | `xray` / `pharmacy` / `consultation` / `lab` / `cafeteria` |
| display_name | varchar | NO | — | — | UI label |
| detail_table | varchar | NO | CHECK ∈ {'payment_xray','payment_pharmacy','payment_consultation','payment_lab','payment_cafeteria'} | — | Which detail table holds the per-line row |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, code)` UNIQUE.

---

### 4.5 `payment_items`

**Purpose:** Bridge between a `payments` row and the per-type detail row. Powers the polymorphic-payment-source bridge (runbook §3) — but **with separate-column FKs** instead of `(payment_type_id, item_record_id)`.
**Lifecycle:** immutable post-insert.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| payment_id | UUID | NO | FK → payments(id) | — | Parent payment |
| payment_type_id | int | NO | FK → payment_item_types(id) | — | Discriminator code (kept for filterability) |
| **payment_xray_id** | UUID | YES | FK → payment_xray(id) | — | Set when type = `xray` |
| **payment_pharmacy_id** | UUID | YES | FK → payment_pharmacy(id) | — | Set when type = `pharmacy` |
| **payment_consultation_id** | UUID | YES | FK → payment_consultation(id) | — | Set when type = `consultation` |
| **payment_lab_id** | UUID | YES | FK → payment_lab(id) | — | Set when type = `lab` |
| **payment_cafeteria_id** | UUID | YES | FK → payment_cafeteria(id) | — | Set when type = `cafeteria` |
| amount | decimal(12,2) | NO | CHECK > 0 | — | Line ₹ |

**Constraints:**
- `CHECK (num_nonnulls(payment_xray_id, payment_pharmacy_id, payment_consultation_id, payment_lab_id, payment_cafeteria_id) = 1)` — exactly one detail FK is set.

**Indexes / uniqueness:**
- `(payment_id)` — list items for a payment.
- One partial index per detail-FK column WHERE `<col> IS NOT NULL` — reverse lookup.

**Revenue-by-source query** (the dashboard this bridge serves):

```sql
SELECT pit.code,
       SUM(pi.amount) AS revenue
FROM payment_items pi
JOIN payment_item_types pit ON pit.id = pi.payment_type_id
JOIN payments p ON p.id = pi.payment_id
WHERE p.tenant_id = :kh
  AND p.payment_direction = 'in'
  AND p.paid_at BETWEEN :from AND :to
GROUP BY pit.code;
```

---

### 4.6 `payment_consultation`

**Purpose:** Per-line detail for doctor consultation fees.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| consultation_id | UUID | NO | FK → consultations(id) | — | The consultation funded |
| doctor_id | UUID | NO | FK → users(id) | — | Doctor — for doctor-wise revenue reports |
| visit_type | varchar | NO | CHECK ∈ {'new','follow_up','procedure'} | — | Drives fee tier from `doctor_profiles` |
| fee | decimal(10,2) | NO | — | — | Snapshot of the doctor's fee at payment time |
| discount | decimal(10,2) | NO | — | 0 | Line discount |
| amount | decimal(10,2) | NO | — | — | Final ₹ paid for this consultation |

**Indexes:** `(doctor_id, paid_at DESC)` *(via parent payment join — denormalise if hot)*.

---

### 4.7 `payment_lab`

**Purpose:** Per-line detail for lab charges.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| lab_order_id | UUID | NO | FK → lab_orders(id) | — | Order funded |
| test_name | varchar | NO | — | — | Snapshot |
| sample_type | varchar | YES | — | — | Snapshot |
| rate | decimal(10,2) | NO | — | — | Snapshot |
| discount | decimal(10,2) | NO | — | 0 | |
| amount | decimal(10,2) | NO | — | — | Final ₹ |

---

### 4.8 `payment_pharmacy`

**Purpose:** Per-line detail for pharmacy charges.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| pharmacy_sale_id | UUID | NO | FK → pharmacy_sales(id) | — | Sale funded |
| medicine_name | varchar | NO | — | — | Snapshot |
| batch_no | varchar | YES | — | — | Snapshot |
| quantity | int | NO | — | — | Snapshot |
| unit_price | decimal(10,2) | NO | — | — | Snapshot |
| discount | decimal(10,2) | NO | — | 0 | |
| amount | decimal(10,2) | NO | — | — | Final ₹ |

---

### 4.9 `payment_xray`

**Purpose:** Per-line detail for radiology charges.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| radiology_order_id | UUID | NO | FK → radiology_orders(id) | — | Order funded |
| procedure_name | varchar | NO | — | — | Snapshot |
| modality | varchar | NO | — | — | Snapshot |
| rate | decimal(10,2) | NO | — | — | Snapshot |
| quantity | int | NO | — | 1 | Usually 1 |
| discount | decimal(10,2) | NO | — | 0 | |
| amount | decimal(10,2) | NO | — | — | Final ₹ |

---

### 4.10 `payment_cafeteria`

**Purpose:** Per-line detail for cafeteria charges (visitor canteen, IP food).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| order_ref | varchar | YES | — | — | External POS reference (cafeteria runs its own POS) |
| item_name | varchar | NO | — | — | Snapshot |
| quantity | int | NO | — | — | |
| unit_price | decimal(10,2) | NO | — | — | |
| amount | decimal(10,2) | NO | — | — | Final ₹ |

---

### 4.11 `cash_counters`

**Purpose:** Physical cash counter registry — Front Desk, Pharmacy, IP Billing.
**Lifecycle:** mutable; soft-delete.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| counter_code | varchar | NO | UNIQUE per tenant | — | E.g. `FD`, `PHX`, `IP_BILL` |
| counter_name | varchar | NO | — | — | Display name |
| location | varchar | YES | — | — | Floor / room |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, counter_code)` UNIQUE.

---

### 4.12 `cash_sessions`

**Purpose:** Cashier shift — open / close cycle with denomination breakdown, expected vs counted, variance reason. Every `payments` row belongs to a session. Renamed from runbook's `business_sessions`.
**Lifecycle:** mutable through the session lifecycle; once `status='LOCKED'`, immutable.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| counter_id | UUID | NO | FK → cash_counters(id) | — | Owning counter |
| session_number | varchar | NO | UNIQUE per tenant | — | Human-readable, e.g. `KH-FD-2026-05-10-M` |
| session_label | varchar | NO | CHECK ∈ {'MORNING','EVENING','NIGHT','FULL_DAY','CUSTOM'} | — | Shift label |
| business_date | date | NO | — | — | Local date (interpreted in `tenants.timezone`) |
| opened_by | UUID | NO | FK → users(id) | — | Opening cashier |
| opened_at | timestamptz | NO | — | now() | |
| closed_by | UUID | YES | FK → users(id) | — | Closing cashier |
| closed_at | timestamptz | YES | — | — | |
| status | varchar | NO | CHECK ∈ {'OPEN','CLOSED','REOPENED','LOCKED'} | 'OPEN' | Lifecycle |
| opening_float | decimal(10,2) | NO | — | 0 | Cash placed in the till at start |
| expected_cash | decimal(12,2) | YES | — | — | Computed at close: opening_float + cash_in − cash_out |
| counted_cash | decimal(12,2) | YES | — | — | Physical count entered by cashier |
| variance | decimal(12,2) | YES | GENERATED ALWAYS AS (counted_cash - expected_cash) STORED | — | Counted minus expected |
| variance_reason | text | YES | — | — | Required when `variance <> 0` |
| denomination_breakdown | jsonb | YES | — | — | `{2000:5, 500:20, 200:10, 100:50, 50:30, 20:50, 10:100, 5:80}` |
| closure_notes | text | YES | — | — | Free-form |
| closure_report_pdf_url | text | YES | — | — | Generated PDF |

**Constraints:**
- `(tenant_id, session_number)` UNIQUE.
- `CHECK ((status='CLOSED') IMPLIES (closed_at IS NOT NULL AND counted_cash IS NOT NULL))`.
- `CHECK ((variance IS NOT NULL AND variance <> 0) IMPLIES (variance_reason IS NOT NULL))`.

**Indexes / uniqueness:**
- `(counter_id, status, business_date)` — find open session for a counter.
- `(tenant_id, business_date, status)` — daily reconciliation view.

**State transitions:**
- `OPEN` → `CLOSED` (cashier closes shift) → `REOPENED` (manager reopens for correction) → `CLOSED` again → `LOCKED` (locked by daily-close job; immutable).

---

### 4.13 `session_movements`

**Purpose:** Non-sale in/out movements during a session. Refunds, petty cash payouts, bank deposits, cashier handovers.
**Lifecycle:** immutable post-insert.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| cash_session_id | UUID | NO | FK → cash_sessions(id) | — | Owning session |
| movement_type | varchar | NO | CHECK ∈ {'EXPENSE_PAYOUT','REFUND_PAYOUT','PETTY_CASH_OUT','CASH_DEPOSIT_TO_BANK','CASH_HANDOVER'} | — | Reason |
| amount | decimal(12,2) | NO | CHECK > 0 | — | Always positive; direction implied by movement_type |
| reason | text | NO | — | — | Required |
| reference_doc_url | text | YES | — | — | Voucher / receipt scan |
| performed_by | UUID | NO | FK → users(id) | — | |
| performed_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `(cash_session_id, performed_at)` — session ledger.
- `(tenant_id, movement_type, performed_at DESC)` — tenant-wide movement report.

---

## 5. Cross-References

- **Patient identity:** [TSD-03 Patient Master](03-patient-master.md). `payees.patient_id` resolves to a patient.
- **Vendor:** [TSD-10 Pharmacy & Inventory §4.1 `vendors`](10-pharmacy-inventory.md#41-vendors) — `payees.vendor_id`.
- **Employee:** [TSD-01 §4.2 `users`](01-platform-tenancy.md#42-users) — `payees.employee_user_id`.
- **Bills funded:** [TSD-12 Billing & Invoicing](12-billing-invoicing.md). `payment_allocations.invoice_id`, `pharmacy_sale_id`, `credit_note_id`.
- **Per-type detail tables FK back to source business objects:** TSD-07 (consultations), TSD-08 (lab_orders), TSD-09 (radiology_orders), TSD-10 (pharmacy_sales).
- **Audit:** [00-audit-logging.md](00-audit-logging.md). All Tier-1; `payments` has idempotency + version; allocations are append-only-ish (corrections via reverse rows).
- **Owner reports:** TSD-14 Reports & Analytics *(Batch E)* — `mv_revenue_daily`, `mv_revenue_by_doctor`, `mv_revenue_by_source` aggregate from `payment_items`.

---

## 6. Schema Review Notes

### Resolved (2026-05-10)
- [x] **Polymorphic `payment_items.item_record_id`** → 5 separate-column FKs + CHECK exactly-one-non-null. AI-codegen safe.
- [x] **Standard inline audit columns** on every mutable table.
- [x] **`business_sessions` renamed to `cash_sessions`** for cross-TSD consistency.
- [x] **`cash_sessions.variance` GENERATED column** removes a class of "computed wrong" bugs.
- [x] **`payment_allocations` separate-column FK + CHECK at-most-one** (was already named in runbook; kept the named columns; added agreement CHECKs).

### Open
- [ ] **suggestion** — Reverse / correction allocations: today an over-allocation can only be fixed by a fresh `payments out` + new allocations. Consider an `allocation_reversal_id` self-FK on `payment_allocations` for cleaner audit. Defer.
- [ ] **question** — `payments.payment_direction='out'` writes (refunds, payouts) — should they also have idempotency_keys? The runbook gave it only to `in`. Refunds can also be retried by UI. Recommend: extend idempotency to all payments. Surface for product decision.
- [ ] **suggestion** — `cash_sessions.denomination_breakdown` is jsonb. For a future "cash-flow forecasting by denomination" feature, normalising into a child table `cash_session_denominations(session_id, denom, count)` helps. Defer; v1 jsonb is fine.
- [ ] **suggestion** — `session_closure_audit` table from the runbook is **not modelled here** because the central `audit_logs` (with trigger) captures every `cash_sessions` UPDATE — same data, one place. The runbook's `session_closure_audit` is redundant. Drop it from the design.
- [ ] **question** — Insurance / TPA settlements are Phase 2 (`payee_type='insurance'` exists but the workflow is undefined). Needs full TSD when Phase 2 begins.
- [ ] **suggestion** — `payment_consultation.fee` is a snapshot of doctor fee — but the consultation also has discounts, taxes (typically zero for healthcare), and the fee may be split (consultation + procedure). Consider adding `fee_breakdown jsonb` for complex consultations. Defer.
- [ ] **suggestion** — `payment_items` is parallel to `invoice_items`. They report the same underlying revenue but from different angles. Consider whether the `payment_items` bridge can be derived (materialised view) from `invoice_items` + `payment_allocations`. Trade-off: bridge gives O(1) revenue-by-source queries; derivation needs joining 3 tables. Today the runbook keeps the bridge for performance. Flag as architecture decision.
- [ ] **suggestion** — `payment_cafeteria.order_ref` is a free-text reference to an external cafeteria POS. No enforced integrity. If cafeteria is ever brought in-app, this becomes a real FK. Note for future.
- [ ] **suggestion** — `cash_sessions.opening_float` defaults to 0 — many hospitals start each shift with a fixed float (₹2000 in small denominations). Should be tenant-configurable via `system_config['cashier.default_opening_float']`. Surface for owner config.
