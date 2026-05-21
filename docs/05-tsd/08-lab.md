# TSD 08: Lab

**Status:** Phase 1 — In Scope (OPD lab; IPD lab billing is Phase 2)  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

Pathology + ancillary diagnostics. Six tables that together cover the full lifecycle from "doctor orders a test" to "result released to the doctor's inbox":

1. **`lab_tests`** — the test catalog (CBC, LFT, Creatinine, …) with reference ranges, critical thresholds, and turnaround targets. Drives the auto-flag (normal / high / low / critical) at result entry.
2. **`lab_test_panels`** — bundle definitions (CBC = WBC + RBC + Platelets + Hb + …) with package pricing. Doctors order the panel; the system fans out to individual tests.
3. **`lab_orders`** — order header (one per ordering event, often containing several tests). Holds priority, payment-before-service flag, status.
4. **`lab_order_items`** — one row per test in the order. Each item is sample-bound and result-bound.
5. **`lab_samples`** — physical samples collected. Unique barcode. Tracks collection / receipt / rejection / re-collection. Self-FK `replaces_sample_id` chains a recollected sample to the rejected original.
6. **`lab_results`** — per-test result with auto-flagging trigger and **Layer 2 maker-checker** for verification / override release of critical values (BRD §7).

The full BRD §7 workflow is encoded here: order → payment → identification → collection (with possible rejection + recollection) → processing → result entry → senior review (Verified / Correction Needed / Critically Abnormal alert / Override Release with mandatory reason) → release notification.

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — step 15 (lab order from doctor), step 17–18 (report-review fast-track queue when results return).
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — Reports Ready inbox is `lab_results` with `release_status='released'`; "Order tests" writes a `lab_orders`.
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — every step.
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — `lab_orders.invoice_id` links to the bill.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `lab_tests` | Catalog of individual tests with numeric reference ranges (M/F), critical thresholds, TAT target. |
| `lab_test_panels` | Panel / package definitions — `test_ids[]` array + package price. |
| `lab_orders` | Order header — patient, doctor, priority, payment-before-service flag, status, invoice link. |
| `lab_order_items` | One row per test in the order; sample- and result-bound. |
| `lab_samples` | Physical sample tracking — barcode, collection time, rejection + recollection chain. |
| `lab_results` | Per-test result; auto-flagged; **Layer 2 maker-checker for verified release / override release**. |

---

## 4. Table Specifications

> *Standard inline audit columns (`created_by`, `created_at`, `updated_by`, `updated_at`, `version`) are present on every mutable table per [00-conventions.md](00-conventions.md#standard-audit-columns) and not repeated below.*

### 4.1 `lab_tests`

**Purpose:** Reference catalog. Each row is one diagnostic test with its reference ranges, critical thresholds, sample requirement, and TAT target. Reference ranges drive the auto-flag trigger on `lab_results`.
**Lifecycle:** mutable; soft-delete via `is_active`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| test_code | varchar | NO | UNIQUE per tenant | — | Short code (e.g. `CBC`, `HBA1C`) |
| test_name | varchar | NO | — | — | Display name |
| category | varchar | NO | CHECK ∈ {'hematology','biochemistry','microbiology','serology','pathology','endocrinology','immunology'} | — | Lab category |
| sample_type | varchar | NO | — | — | E.g. `EDTA blood`, `serum`, `urine`, `swab` |
| sample_volume_ml | decimal(4,1) | YES | — | — | Volume needed (helps tech know correct vial) |
| department_id | UUID | YES | FK → departments(id) | — | Owning lab dept |
| default_price | decimal(10,2) | NO | — | — | Standard price (history in `service_price_history`) |
| ref_min_male | decimal(12,4) | YES | — | — | Numeric — drives auto-flag |
| ref_max_male | decimal(12,4) | YES | — | — | Numeric — drives auto-flag |
| ref_min_female | decimal(12,4) | YES | — | — | Numeric |
| ref_max_female | decimal(12,4) | YES | — | — | Numeric |
| critical_low | decimal(12,4) | YES | — | — | Below this → `flag='critical'` + alert |
| critical_high | decimal(12,4) | YES | — | — | Above this → `flag='critical'` + alert |
| normal_range_male | varchar | YES | — | — | Display string (e.g. `"13.5–17.5 g/dL"`) — printed on report |
| normal_range_female | varchar | YES | — | — | Display string |
| unit | varchar | YES | — | — | E.g. `g/dL`, `mg/dL`, `cells/cumm` |
| tat_hours | int | YES | — | — | Target turn-around in hours; SLA monitor compares against `lab_orders.ordered_at → lab_results.reported_at` |
| result_type | varchar | NO | CHECK ∈ {'numeric','positive_negative','reactive_nonreactive','grade','free_text','image'} | 'numeric' | Drives result entry UI |
| requires_fasting | boolean | NO | — | FALSE | Affects sample collection workflow |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, test_code)` UNIQUE.
- `(tenant_id, category, is_active)` — picklist filter.

**GST note:** healthcare diagnostic services are exempt under GST SAC 9993; no `cgst_pct` / `sgst_pct` columns here. Pricing uses `default_price` directly.

---

### 4.2 `lab_test_panels`

**Purpose:** Bundle multiple `lab_tests` into a named package (CBC, LFT, "Diabetes Panel", "Pre-employment Profile") with discount pricing. The doctor orders the panel; the order-creation procedure expands it into individual `lab_order_items`.
**Lifecycle:** mutable; soft-delete.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| panel_code | varchar | NO | UNIQUE per tenant | — | Short code |
| panel_name | varchar | NO | — | — | Display name |
| test_ids | UUID[] | NO | — | '{}' | Constituent `lab_tests.id` values |
| package_price | decimal(10,2) | NO | — | — | Total price; usually less than sum of individual prices |
| description | text | YES | — | — | What it screens for / when to order |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, panel_code)` UNIQUE.
- GIN `(test_ids)` — "which panels include test X?" reverse query.

**Validation:** application validates that every `test_ids[i]` resolves to an active `lab_tests` row in the same tenant.

---

### 4.3 `lab_orders`

**Purpose:** One order = one act of ordering tests at a particular time. Multiple tests are recorded as `lab_order_items`. The order carries the priority and payment-before-service rule that drive the patient's journey state.
**Lifecycle:** mutable on `status`, `invoice_id`, `completed_at`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| order_number | varchar | NO | UNIQUE | — | Human-readable, e.g. `LAB-2026-23981` |
| patient_id | UUID | NO | FK → patients(id) | — | Subject |
| op_visit_id | UUID | YES | FK → op_visits(id) | — | OP context |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | IP context (Phase 2 billing only) |
| consultation_id | UUID | YES | FK → consultations(id) | — | Originating consultation |
| doctor_id | UUID | NO | FK → users(id) | — | Ordering doctor |
| priority | varchar | NO | CHECK ∈ {'routine','urgent','stat'} | 'routine' | Drives scheduling and SLA |
| invoice_id | UUID | YES | FK → invoices(id) | — | Linked bill (set after billing) |
| payment_required_before_service | boolean | NO | — | TRUE | Stat orders may set FALSE |
| status | varchar | NO | CHECK ∈ {'ordered','awaiting_payment','paid','sample_collection','sample_collected','in_progress','partially_reported','reported','released','cancelled'} | 'ordered' | Lifecycle |
| ordered_at | timestamptz | NO | — | now() | |
| completed_at | timestamptz | YES | — | — | Set when all items are reported and released |

**Indexes / uniqueness:**
- `order_number` UNIQUE.
- `(tenant_id, patient_id, ordered_at DESC)` — patient's lab history.
- `(tenant_id, status, priority, ordered_at)` — lab worklist.
- `(consultation_id)` — Rx lookup ("what tests did Dr X order in this consultation?").

**State transitions** (BRD §7):
- `ordered` → `awaiting_payment` → `paid` → `sample_collection` → `sample_collected` → `in_progress` → `partially_reported` / `reported` → `released`.
- Any → `cancelled` with reason captured in `audit_logs`.

---

### 4.4 `lab_order_items`

**Purpose:** One row per individual test within an order. Sample- and result-bound. Item-level status lets a single order include both completed tests (released) and pending ones (still in_progress).
**Lifecycle:** mutable on `status`, `sample_id`, `result_id`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| lab_order_id | UUID | NO | FK → lab_orders(id) | — | Parent order |
| lab_test_id | UUID | NO | FK → lab_tests(id) | — | Which test |
| panel_id | UUID | YES | FK → lab_test_panels(id) | — | Set when the item came from panel expansion |
| sample_id | UUID | YES | FK → lab_samples(id) | — | Bound sample |
| status | varchar | NO | CHECK ∈ {'pending','sample_collected','rejected','recollection_pending','in_progress','reported','verified','released','cancelled'} | 'pending' | Item lifecycle |
| sequence_no | int | NO | — | — | Display order on the report |

**Indexes / uniqueness:**
- `(lab_order_id, lab_test_id)` UNIQUE — same test ordered twice on one order is treated as a separate order (re-test).
- `(sample_id) WHERE sample_id IS NOT NULL` — reverse lookup.
- `(status, lab_order_id)` — order-progress view.

---

### 4.5 `lab_samples`

**Purpose:** Physical sample tracking. One row per *unique* sample collected. Supports rejection (`status='rejected'` + reason) and re-collection via self-FK `replaces_sample_id`. Critical for BRD §7 sample-rejection-with-recollection sub-flow.
**Lifecycle:** mutable on `status`, `received_at`, `rejected_at`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| sample_barcode | varchar | NO | UNIQUE | — | Printed on the vial (also used as scan input) |
| patient_id | UUID | NO | FK → patients(id) | — | Subject — verified at collection time (BRD §7 identification step) |
| lab_order_id | UUID | NO | FK → lab_orders(id) | — | Parent order |
| sample_type | varchar | NO | — | — | Snapshot from `lab_tests.sample_type` of the constituent tests |
| status | varchar | NO | CHECK ∈ {'collected','received','rejected','processing','processed','disposed'} | 'collected' | Sample lifecycle |
| collected_by | UUID | NO | FK → users(id) | — | Phlebotomist / nurse |
| collected_at | timestamptz | NO | — | now() | |
| received_at | timestamptz | YES | — | — | When sample arrived at lab |
| received_by | UUID | YES | FK → users(id) | — | Receiving lab tech |
| rejected_at | timestamptz | YES | — | — | When rejected |
| rejected_by | UUID | YES | FK → users(id) | — | Rejecting lab tech |
| rejection_reason | text | YES | — | — | Required when `status='rejected'` (e.g. "haemolysed", "insufficient quantity", "wrong tube") |
| disposed_at | timestamptz | YES | — | — | Final disposal timestamp |
| replaces_sample_id | UUID | YES | FK → lab_samples(id) | — | Self-FK — set when this sample is a recollection of a previously-rejected one |
| notes | text | YES | — | — | Free-form |

**Constraints:**
- `CHECK ((status='rejected') = (rejection_reason IS NOT NULL))`.

**Indexes / uniqueness:**
- `sample_barcode` UNIQUE (globally — not just per tenant; barcodes are tenant-scoped via prefix but the column itself is globally unique to defend against scan errors).
- `(tenant_id, lab_order_id)` — samples for one order.
- `(tenant_id, status, collected_at)` — lab worklist.
- `(replaces_sample_id) WHERE replaces_sample_id IS NOT NULL` — recollection chain.

---

### 4.6 `lab_results`

**Purpose:** One row per test result. Auto-flagged on insert against `lab_tests` reference ranges; critical values trigger an alert notification; **Layer 2 maker-checker** governs the verification / override-release workflow per BRD §7.
**Lifecycle:** mutable on `release_status`, `verified_*`, `override_*`, `amended_from_result_id`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| lab_order_item_id | UUID | NO | UNIQUE, FK → lab_order_items(id) | — | One result per item (re-tests are new items) |
| value_raw | varchar | NO | — | — | As entered by tech (e.g. `"5.6"`, `"Positive"`, `"Grade II"`) |
| value_numeric | decimal(12,4) | YES | — | — | Parsed numeric; drives auto-flag and trending |
| value_text | varchar | YES | — | — | For non-numeric results (`"Positive"`, `"Reactive"`, `"Grade II"`) |
| unit | varchar | YES | — | — | Snapshot from `lab_tests.unit` |
| flag | varchar | NO | CHECK ∈ {'normal','high','low','critical_high','critical_low'} | 'normal' | Auto-set by trigger from `lab_tests` ranges |
| method | varchar | YES | — | — | Analytical method used (`"Nephelometry"`, `"ELISA"`) |
| comments | text | YES | — | — | Tech / pathologist notes |
| performed_by | UUID | NO | FK → users(id) | — | Lab tech who ran the test |
| performed_at | timestamptz | NO | — | now() | |
| reported_at | timestamptz | NO | — | now() | When result was finalised in the system |
| report_pdf_url | text | YES | — | — | URL to rendered PDF (file_attachments link preferred) |
| report_attachment_id | UUID | YES | FK → file_attachments(id) | — | Preferred over `report_pdf_url`; consistent with TSD-02 §4.6 |
| **release_status** | varchar | NO | CHECK ∈ {'pending_verification','verified','override_released','amended','rejected'} | 'pending_verification' | Drives whether the doctor sees this result |
| **verified_by** | UUID | YES | FK → users(id) | — | Senior reviewer; required when `release_status='verified'` |
| **verified_at** | timestamptz | YES | — | — | Verification timestamp |
| **is_override_release** | boolean | NO | — | FALSE | TRUE when senior released a critical value with mandatory reason (BRD §7) |
| **override_release_reason** | text | YES | — | — | Required when `is_override_release=TRUE` |
| **amended_from_result_id** | UUID | YES | FK → lab_results(id) | — | Self-FK — set when this row corrects a previously-released result |

*+ Layer 2 maker-checker columns (`approval_status`, `approved_by`, `approved_at`, `rejection_reason`) per [00-audit-logging.md §3](00-audit-logging.md#3-layer-2--maker-checker-columns-7-sensitive-tables). Maps as: tech enters result → `approval_status='pending_approval'`; senior verifies → `approved_by`/`approved_at` set, `release_status='verified'`. Override release: senior approves AND sets `is_override_release=TRUE` with `override_release_reason`. Correction needed: `approval_status='rejected'` + `rejection_reason` → tech re-enters → new submission cycle.*

**Constraints:**
- `CHECK ((is_override_release = FALSE) OR (override_release_reason IS NOT NULL AND length(override_release_reason) > 10))` — override needs a real reason.
- `CHECK ((release_status = 'verified' OR release_status = 'override_released') = (verified_by IS NOT NULL))` — released results have a reviewer.
- `CHECK (created_by <> verified_by)` — separation of duties: tech who entered ≠ reviewer who released.

**Indexes / uniqueness:**
- `lab_order_item_id` UNIQUE.
- `(tenant_id, release_status, reported_at DESC) WHERE release_status='pending_verification'` partial — senior reviewer's inbox.
- `(tenant_id, flag, release_status) WHERE flag IN ('critical_high','critical_low')` partial — critical-value queue.
- `(tenant_id, performed_at DESC)` — daily lab activity report.

**Triggers:**
- `fn_autoflag_lab_result` (BEFORE INSERT) — sets `flag` based on `value_numeric` against the constituent `lab_tests` reference ranges (gender-aware via `patients.gender`).
- `fn_critical_lab_alert` (AFTER INSERT) — if `flag IN ('critical_high','critical_low')`, creates a `notifications` row to the senior reviewer with `ack_required=TRUE`, `ack_sla_minutes=30`, escalation chain to HOD if not acked.
- `fn_lab_release_event` (AFTER UPDATE OF release_status) — when status moves to `verified` / `override_released`, emits a `domain_events` row of type `LabResultReleased` (subscribed by the doctor's "Reports Ready" inbox notifier).

**Override release workflow** (BRD §7):
1. Tech enters result → `release_status='pending_verification'`, `approval_status='pending_approval'`.
2. If `flag='critical_*'`, alert fires immediately (regardless of release status).
3. Senior reviews: three outcomes.
   - **Verified:** `approval_status='approved'`, `release_status='verified'`, `verified_by`/`verified_at` set.
   - **Correction Needed:** `approval_status='rejected'`, `rejection_reason` set; tech corrects → new result with `amended_from_result_id` chain.
   - **Override Release** (senior decides to release a critical value as-is): `approval_status='approved'`, `release_status='override_released'`, `is_override_release=TRUE`, `override_release_reason` set. Audit logs flag this prominently in compliance reports.

---

## 5. Cross-References

- **Patient identity:** [TSD-03 Patient Master](03-patient-master.md). All Tier-1 lab tables FK to `patients(id)` and are registered in `patient_mergeable_tables`.
- **Visit anchor:** [TSD-06 OPD Encounters](06-opd-encounters.md) — `lab_orders.op_visit_id`.
- **State transitions** on order creation, sample collection, result release: [TSD-04 Patient Journey](04-patient-journey.md) — events written for `lab_pending`, `sample_collected`, `result_released`.
- **Consultation that produced the order:** [TSD-07 Clinical Consultation](07-clinical-consultation.md) — `lab_orders.consultation_id`.
- **Token at lab counter:** [TSD-05 Appointments §4.3](05-appointments.md#43-tokens) — `tokens.lab_order_id` (separate-column FK).
- **Billing:** TSD-12 Billing & Invoicing *(Batch D)* — `lab_orders.invoice_id`; payment-before-service rule from [TSD-11 Services & Pricing](11-services-pricing.md) `service_billing_policies`.
- **Audit / notifications / file attachments:** [TSD-02](02-audit-events-notifications.md). Critical-value alerts use the `notifications` ACK + escalation chain.
- **Blood-test catalogue master list:** [docs/02-catalogues/blood-test-catalogues.md](../02-catalogues/blood-test-catalogues.md) — seed data for `lab_tests`.

---

## 6. Schema Review Notes

### Resolved (2026-05-10)
- [x] **Layer 2 maker-checker on `lab_results`** — verification + override release modelled. Includes `is_override_release` + `override_release_reason` per BRD §7.
- [x] **Standard inline audit columns** on every mutable table per [00-conventions.md](00-conventions.md#standard-audit-columns).
- [x] **Polymorphic FKs** — none in this TSD (lab tables already use named FKs).
- [x] **GST exemption** — confirmed: healthcare diagnostic services are exempt under SAC 9993; no GST columns on `lab_tests`.

### Open
- [!] **blocker (potential)** — `lab_tests.ref_min_male/female` is binary M/F. Pediatric ranges (age < 12) and pregnancy-specific ranges (e.g. HCG, TSH) are clinically significant — using adult ranges for a 5-year-old can mis-flag normal values as critical. Real hospital laboratories maintain age + gender stratified ranges. **Surface for user decision** before production: do we (a) add `ref_min_pediatric`/`ref_max_pediatric` columns now, or (b) introduce a child table `lab_test_reference_ranges(test_id, min_age, max_age, gender, ref_min, ref_max, critical_low, critical_high)`? Option (b) is more flexible and clinically correct; option (a) is faster.
- [ ] **suggestion** — `lab_results.value_text` for non-numeric tests (Positive / Reactive / Grade II) bypasses the auto-flag trigger. Consider a `result_type`-aware flag rule: positive/reactive results may be inherently abnormal regardless of numeric range. Today the flag is just `'normal'` for all non-numeric results.
- [ ] **suggestion** — Critical values often require a **re-test before release** in many labs (clinical-safety practice). Consider `lab_results.requires_recheck` / `recheck_result_id` self-FK chain. Defer to a future safety-pass review.
- [ ] **question** — `lab_orders.status='partially_reported'` lets a multi-test order release some results before others. Does the doctor's "Reports Ready" inbox receive one notification per item or one per order? UX design decision affects how `domain_events` are emitted.
- [ ] **question** — `lab_samples.sample_type` is currently a single column; some orders need multiple sample types (e.g. CBC + LFT = EDTA + plain). Should one order produce multiple samples? Today: one row per `lab_samples` per sample-type combo per order. Confirm.
- [ ] **suggestion** — `lab_test_panels.test_ids UUID[]` makes "find panels containing test X" cheap with GIN index but loses sequence. Some panels imply ordering (e.g. dilution series). If sequence matters, switch to a child table `lab_test_panel_items(panel_id, test_id, sequence)`. Defer.
- [ ] **suggestion** — Lab QC runs (NABL accreditation requirement) and equipment calibration are deferred per Tier 2 compliance decision. Add to future compliance TSD.
- [ ] **question** — Result amendments use `amended_from_result_id` self-FK. The amended result inherits a new `id`; the original stays in place with its old release. Reports printed on the old result are now wrong. Should the system flag the original as `release_status='amended'` and force re-print of the report? Consult with the doctor's UX flow.
