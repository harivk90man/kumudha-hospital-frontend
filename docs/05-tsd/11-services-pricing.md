# TSD 11: Services & Pricing

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

The **catalog of every billable thing the hospital sells** plus the rules that govern when each one is billed (before service / after service / on discharge / split).

Three tables:

1. **`services`** — the master price list. Consultation fees, room charges, procedure fees, ECG, dressings, and a row per non-pharmacy/non-lab/non-radiology billable item. Lab tests, imaging procedures, and medicines are NOT here — they have their own catalogs in TSD-08, TSD-09, TSD-10. `services` is the residual catalog plus consultation pricing.
2. **`service_price_history`** — **append-only / closed-period** audit of `services.default_price` changes. Whenever the price changes, the trigger closes the prior row's `effective_to` and inserts a new row. 10-year retention.
3. **`service_billing_policies`** — the rules engine. For each `service_type` (op_consultation, lab_routine, lab_stat, radiology, pharmacy_rx, pharmacy_otc, ip_admission, surgery), captures whether payment is collected `before_service`, `after_service`, `on_discharge`, or `split`; advance-required and advance-percent for IP; emergency-override flag. Per-department overrides supported via `department_id`.

Together these answer two questions:
- "How much does X cost today?" → `services` (with history reachable for the same service via `service_price_history`).
- "When should we collect for X?" → `service_billing_policies`.

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — step 4 (pay consultation), step 17 (pay lab fee, pay radiology fee).
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — payment-before-service rule applied via `service_billing_policies`.
- [8. Pharmacy Flow](../01-brd/hospital-flows.md#8-pharmacy-flow) — same rule.
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — every line item resolves to a `services` row for naming + pricing.
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — service price edits emit price-history rows; pending-billing-policy changes show up in approvals.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `services` | Catalog of billable items (consultation, procedure, room charge, ECG, dressings) — residual non-pharmacy / non-lab / non-radiology. Lab and radiology have their own catalogs (TSD-08 / TSD-09). |
| `service_price_history` | Append-only / closed-period audit of price changes; trigger-driven from `services.default_price` updates. |
| `service_billing_policies` | Rules engine — when to bill (before / after / on discharge / split) per `service_type`, with per-department override. |

---

## 4. Table Specifications

> *Standard inline audit columns per [00-conventions.md](00-conventions.md#standard-audit-columns) — not repeated below.*

### 4.1 `services`

**Purpose:** Master price list for billable items not covered by lab / radiology / pharmacy catalogs. Examples: doctor consultation (per doctor), follow-up consultation, ECG, dressing, suture removal, bed charge by room class, OT charge, anaesthesia (Phase 2), ambulance.
**Lifecycle:** mutable; soft-delete via `is_active`. Price changes trigger `service_price_history` insert.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| service_code | varchar | NO | UNIQUE per tenant | — | Short code (`CONSULT_NEW`, `CONSULT_FU`, `ECG`, `BED_PVT_DLX`) |
| service_name | varchar | NO | — | — | Display name |
| service_type | varchar | NO | CHECK ∈ {'op_consultation','op_followup','procedure','room_charge','nursing','consumable','ambulance','other'} | — | Category — drives billing policy lookup |
| segment | varchar | YES | — | — | For revenue analytics (`opd`, `ipd`, `er`, `daycare`) |
| department_id | UUID | YES | FK → departments(id) | — | Owning department (NULL for cross-cutting) |
| doctor_id | UUID | YES | FK → users(id) | — | When the service is doctor-specific (consultation fee per doctor) |
| sac_code | varchar | YES | — | — | Services Accounting Code — `9993xx` for healthcare (GST-exempt) |
| hsn_code | varchar | YES | — | — | Used only for goods (cafeteria, retail items) |
| default_price | decimal(10,2) | NO | — | — | Current selling price; history kept in `service_price_history` |
| is_taxable | boolean | NO | — | FALSE | TRUE for non-healthcare services (cafeteria, retail) — drives GST on `invoice_items` |
| default_gst_pct | decimal(4,2) | NO | — | 0 | Used when `is_taxable=TRUE`; healthcare = 0 |
| description | text | YES | — | — | Free-form |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, service_code)` UNIQUE.
- `(tenant_id, service_type, is_active)` — picklist filter at billing.
- `(doctor_id) WHERE doctor_id IS NOT NULL` — consultation-fee lookup by doctor.

**Triggers:**
- `fn_log_price_change` (AFTER UPDATE OF default_price on services) — closes the prior `service_price_history` row's `effective_to` and inserts a new row with `effective_from = current_date`.

**Note on legacy `gst_pct`:** the runbook had a column `gst_pct` flagged as DEPRECATED. Replaced here with `default_gst_pct` + `is_taxable` flag — semantically clearer and avoids zero-default confusion for healthcare-exempt services.

---

### 4.2 `service_price_history`

**Purpose:** Append-only / closed-period audit of every price change. Closed-period pattern: at any time, the row where `effective_to IS NULL` is the currently-active price; older rows are sealed with their effective_to date. Used for invoice repricing audits ("on date X what was the price of service Y?") and for the Hospital Owner's revenue trend reports.
**Lifecycle:** **closed-period** — inserts of new rows + a single UPDATE of the prior row's `effective_to` only. No edits to historical price values. 10-year retention.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| service_id | UUID | NO | FK → services(id) | — | The service |
| price | decimal(10,2) | NO | — | — | Price during this effective period |
| effective_from | date | NO | — | — | Start (inclusive) |
| effective_to | date | YES | — | — | End (exclusive); NULL = currently active |
| changed_by | UUID | YES | FK → users(id) | — | The user who triggered the change |
| reason | text | YES | — | — | Free-form (e.g. "annual revision", "campaign discount", "tariff harmonisation") |

**Constraints:**
- `(service_id) WHERE effective_to IS NULL` UNIQUE partial — at most one active price per service.
- `CHECK (effective_to IS NULL OR effective_to > effective_from)`.

**Indexes / uniqueness:**
- `(service_id, effective_from DESC)` — full price history for one service.
- `(service_id, effective_to)` partial WHERE `effective_to IS NULL` — active-price lookup (covered by the partial UNIQUE above).

**Append-only enforcement:** `BEFORE DELETE` trigger raises an exception. `BEFORE UPDATE` trigger allows updates only to `effective_to` and only on the previously-open row.

---

### 4.3 `service_billing_policies`

**Purpose:** The rules engine. For each `service_type` (and optional per-department override), declares **when** to bill and whether an advance is required. Read at the moment a service is created (lab order, radiology order, etc.) to set `payment_required_before_service` and to compute advance amounts.

The runbook's `service_type` enumeration mixes `services.service_type` with cross-module categories (`lab_routine`, `pharmacy_rx`). The policy table operates in a wider namespace than the catalog.

**Lifecycle:** mutable; carries Layer 2 maker-checker via the related `system_config` change-control (BRD §12 Owner Flow — billing policy changes are tenant-config sign-off territory).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| service_type | varchar | NO | CHECK ∈ {'op_consultation','op_followup','lab_routine','lab_stat','radiology','pharmacy_rx','pharmacy_otc','ip_admission','surgery','ambulance','other'} | — | Category being governed |
| department_id | UUID | YES | FK → departments(id) | — | Per-department override (NULL = tenant-wide default) |
| payment_timing | varchar | NO | CHECK ∈ {'before_service','after_service','on_discharge','split'} | — | When to collect |
| advance_required | boolean | NO | — | FALSE | TRUE = collect advance before scheduling (typical for IP / surgery) |
| advance_percentage | decimal(5,2) | YES | — | — | % of estimate (used when `advance_required=TRUE`) |
| min_advance_amount | decimal(10,2) | YES | — | — | Minimum floor (some hospitals use absolute, not %) |
| emergency_override | boolean | NO | — | TRUE | TRUE = stat / emergency cases bypass payment-before-service |

**Indexes / uniqueness:**
- `(tenant_id, service_type, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid))` UNIQUE — allows one default + at most one per-department override per `service_type`.

**Resolution at lookup time** (app logic):
1. Lookup `(tenant_id, service_type, department_id=:dept)`.
2. If not found, fall back to `(tenant_id, service_type, department_id IS NULL)`.
3. If still not found, the service is treated as `payment_timing='after_service'` (default).

---

## 5. Cross-References

- **Service catalog feeds invoice line creation:** [TSD-12 Billing & Invoicing §4.2 `invoice_items`](12-billing-invoicing.md#42-invoice_items) — `invoice_items.service_id` FK + `unit_price` snapshot from `services.default_price`.
- **Lab / radiology / pharmacy have their own catalogs:** [TSD-08 §4.1 `lab_tests`](08-lab.md), [TSD-09 §4.1 `radiology_procedures`](09-radiology.md), [TSD-10 §4.2 `medicines`](10-pharmacy-inventory.md). Their own `default_price` columns; this TSD does not duplicate them.
- **Service billing policy drives `payment_required_before_service`:** TSD-08 `lab_orders.payment_required_before_service`, TSD-09 `radiology_orders.payment_required_before_service`.
- **System config carries thresholds and approval matrix:** [TSD-01 §4.10 `system_config`](01-platform-tenancy.md#410-system_config) keys like `billing.discount_max_pct`, `billing.approval_matrix`.
- **Audit:** [TSD-02 + 00-audit-logging.md](00-audit-logging.md). `services` is Tier-1; price changes captured both in `service_price_history` (closed-period) and `audit_logs` (full row diff).
- **Doctor profile consultation fees** can either be denormalised here (rows in `services` per doctor with `doctor_id` set) or computed from [TSD-01 `doctor_profiles.consultation_fee` / `follow_up_fee`](01-platform-tenancy.md). Today both paths exist; see §6.

---

## 6. Schema Review Notes

### Resolved (2026-05-10)
- [x] **Standard inline audit columns** on every mutable table.
- [x] **Closed-period pattern** on `service_price_history` — partial UNIQUE on `(service_id) WHERE effective_to IS NULL` enforces at-most-one active period.
- [x] **`gst_pct` DEPRECATED rename** — replaced with `default_gst_pct` + `is_taxable` (clearer semantics; defaults to non-taxable for healthcare).

### Open
- [ ] **question** — Doctor consultation fees: today they live in **two places**: (a) `doctor_profiles.consultation_fee` / `follow_up_fee` and (b) optional rows in `services` with `doctor_id` set. Two sources of truth = drift. Recommend: pick one. Either (a) drop `services.doctor_id` and resolve consultation-fee at billing time from `doctor_profiles`, or (b) drop `doctor_profiles.consultation_fee` / `follow_up_fee` and require a `services` row per doctor. Surface for owner decision.
- [ ] **suggestion** — `service_billing_policies.service_type` overlaps with `services.service_type` in some values but adds others (`lab_routine`, `pharmacy_rx`). Consider renaming the policy column to `policy_scope` or splitting the enum. Today the overlap is confusing for AI codegen.
- [ ] **suggestion** — Service bundles (e.g. "Pre-employment health check" = consultation + CBC + LFT + chest X-ray + ECG) are not modelled here. `lab_test_panels` is panel-only. A `service_packages(id, name, components_jsonb)` would let owner define bundles spanning lab + radiology + consultation. Defer.
- [ ] **suggestion** — `services.default_price` is what the customer pays. Hospitals often track **internal cost** for margin reporting. Add `internal_cost decimal` column? Owner dashboard would benefit. Defer.
- [ ] **suggestion** — `service_billing_policies.advance_percentage` is a number; combined with `min_advance_amount` allows "max(% of estimate, ₹X)". Document the "max of two" semantics here so app code is consistent.
- [ ] **question** — Closed-period UPDATE on `service_price_history.effective_to` — the standard `audit_logs` trigger would also fire on this UPDATE, creating an audit row for an audit row. Is that fine, or does `service_price_history` go on the `audit_excluded_tables` list? Recommend: exclude (already itself an audit table). Add to the registry.
- [ ] **suggestion** — Currency: today `decimal` is implicitly INR. Hospitals selling tourist services or offshore care would charge USD. Add `currency_code char(3) DEFAULT 'INR'` to `services` and `invoice_items`? Defer to Phase 2 if not needed for Kumudha.
