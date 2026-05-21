# TSD 14: Reports & Analytics

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

The reporting layer that powers the **Hospital Owner Dashboard** (BRD §12). Three concerns:

1. **Configuration tables** the owner can edit — revenue targets per department / doctor / month, system-wide announcements, parameterised alert rules.
2. **Materialized views (MVs)** — pre-aggregated, hourly / daily / monthly refreshed views over the transactional tables. Dashboards read MVs, not OLTP, so OPD and pharmacy throughput is not slowed by long aggregation queries.
3. **Refresh + alert orchestration** — when each MV refreshes; how `alert_rules` evaluate against MV outputs to push notifications.

The MVs themselves don't add new "data" — they are *projections* of the OLTP tables in [TSD-07](07-clinical-consultation.md), [TSD-08](08-lab.md), [TSD-09](09-radiology.md), [TSD-10](10-pharmacy-inventory.md), [TSD-12](12-billing-invoicing.md), [TSD-13](13-payments-cash.md). Listing them here gives the dashboard developer one place to look for "which view powers which widget."

---

## 2. BRD Flows Covered

- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — every dashboard widget is backed by one or more MVs from this TSD.
- [13. Platform Admin Flow](../01-brd/hospital-flows.md#13-platform-admin-flow) — system-wide announcements, cross-tenant audit views.
- Read-only consumer of every other TSD.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `revenue_targets` | Per-dept / per-doctor monthly revenue target — drives "achieved vs target" widgets. |
| `announcements` | System-wide messages from admin pinned to topbar (HR notices, holiday announcements, system maintenance). |
| `alert_rules` | Parameterised alert rules — JSON condition + subscriber roles + severity. Evaluated against MV outputs by a scheduled job. |
| `mv_revenue_daily` | MV — daily revenue by tenant × segment × payment source. Hourly refresh. |
| `mv_revenue_by_doctor` | MV — revenue per doctor (consultations + procedures). Hourly refresh. |
| `mv_outstanding_dues` | MV — open invoices with balance > 0, age-bucketed. Hourly refresh. |
| `mv_bed_occupancy_daily` | MV — daily bed occupancy %; uses `bed_assignments`. Daily refresh. *(Phase 2 source data)* |
| `mv_pharmacy_expiry_loss` | MV — value of expired stock written off; from `stock_movements WHERE movement_type='expiry_writeoff'`. Daily refresh. |
| `mv_payroll_cost_monthly` | MV — monthly payroll cost from `payslips`. Monthly refresh. *(Phase 2 source data)* |

---

## 4. Table Specifications

> *Standard inline audit columns per [00-conventions.md](00-conventions.md#standard-audit-columns) on the three regular tables. MVs have no audit (they are derived).*

### 4.1 `revenue_targets`

**Purpose:** Per-dept / per-doctor monthly revenue target. The dashboard's "Achieved vs Target" widget computes `mv_revenue_daily` rolled up to the month and compares against this row.
**Lifecycle:** mutable; rows are kept indefinitely for trend reports.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| department_id | UUID | YES | FK → departments(id) | — | NULL = whole-hospital target |
| doctor_id | UUID | YES | FK → users(id) | — | NULL = department-wide target |
| period_month | int | NO | CHECK 1–12 | — | |
| period_year | int | NO | — | — | |
| target_amount | decimal(12,2) | NO | CHECK > 0 | — | INR target |
| stretch_target | decimal(12,2) | YES | — | — | Optional stretch number |
| set_by | UUID | NO | FK → users(id) | — | The owner / HOD setting the target |
| notes | text | YES | — | — | |

**Indexes / uniqueness:**
- `(tenant_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid), period_year, period_month)` UNIQUE — at most one target per (scope, period).
- `(tenant_id, period_year, period_month)` — month-rollup queries.

---

### 4.2 `announcements`

**Purpose:** Internal communications from administration. Pinned messages appear at the top of every staff member's app. Audience scoping (`'all'`, `'doctors'`, `'nurses'`, `'pharmacists'`, custom role list) controls visibility.
**Lifecycle:** mutable; expire when `expires_at` passes.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| title | varchar | NO | — | — | Short headline |
| body | text | NO | — | — | Body content |
| target_audience | varchar | NO | CHECK ∈ {'all','doctors','nurses','pharmacists','front_desk','lab','radiology','admin','custom'} | 'all' | Audience |
| target_role_ids | UUID[] | NO | — | '{}' | Used when `target_audience='custom'` |
| pinned | boolean | NO | — | FALSE | TRUE = appears above the topbar bell |
| severity | varchar | NO | CHECK ∈ {'info','warn','critical'} | 'info' | Display style |
| from_user_id | UUID | NO | FK → users(id) | — | Author |
| effective_at | timestamptz | NO | — | now() | When announcement starts being visible |
| expires_at | timestamptz | YES | — | — | Auto-hide after this (NULL = no expiry) |

**Indexes / uniqueness:**
- `(tenant_id, pinned, effective_at DESC) WHERE expires_at IS NULL OR expires_at > now()` partial — current pinned items.

---

### 4.3 `alert_rules`

**Purpose:** Parameterised alert configuration. Owner / admin defines rules like "warn if OP queue exceeds 30 minutes" or "critical if vendor PO has been pending approval > 48 hours." A scheduled evaluator job checks each rule against the relevant MV (or transactional aggregate) and triggers `notifications` for the subscriber roles.
**Lifecycle:** mutable; soft-delete via `is_active`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| rule_name | varchar | NO | UNIQUE per tenant | — | Display name |
| description | text | YES | — | — | Free-form |
| metric_source | varchar | NO | CHECK ∈ {'mv_revenue_daily','mv_outstanding_dues','mv_pharmacy_expiry_loss','op_queue','low_stock','expiry_warning','sla_breach','approval_backlog'} | — | Where the metric comes from |
| condition_jsonb | jsonb | NO | — | — | Parsed by evaluator: `{"metric":"op_queue_minutes","op":">","threshold":30}` |
| severity | varchar | NO | CHECK ∈ {'info','warn','critical'} | 'warn' | Notification priority |
| subscribers_role_ids | UUID[] | NO | — | '{}' | Roles to notify when rule fires |
| evaluation_interval_minutes | int | NO | — | 15 | How often the evaluator runs this rule |
| last_evaluated_at | timestamptz | YES | — | — | Set by evaluator |
| last_fired_at | timestamptz | YES | — | — | Set when rule last triggered |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, rule_name)` UNIQUE.
- `(tenant_id, is_active, last_evaluated_at)` — evaluator scan.

**Standard seed rules** (loaded by migration; tenant can disable / edit):
- `low_stock_alert` — fires when any `medicine_batches.quantity_available <= medicines.reorder_level`.
- `expiry_warning_30d` — batches expiring within 30 days.
- `op_queue_breach` — patient in `awaiting_doctor` state for > 30 min.
- `unpaid_bills_aged` — `mv_outstanding_dues` > 7 days, severity `warn`; > 30 days, severity `critical`.
- `pending_po_approval` — `purchase_orders.approval_status='pending_approval'` for > 24 hr.
- `lab_critical_unacked` — critical-flag results without ACK for > 30 min (already covered by built-in lab trigger but `alert_rules` provides a second-level escalation to HOD).
- `discount_pending_approval` — `invoices.approval_status='pending_approval'` for > 4 hr.

---

### 4.4 `mv_revenue_daily`

**Purpose:** Daily revenue rolled up by tenant × segment × payment source. Backs the owner dashboard's "Today's Revenue" and "Date-range Revenue" widgets.

**Refresh:** hourly via scheduled job `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_daily;`.

**Source query** (illustrative — exact form lives in the migration):
```sql
SELECT p.tenant_id,
       date_trunc('day', p.paid_at AT TIME ZONE t.timezone) AS revenue_date,
       pit.code AS source,
       COALESCE(s.segment, 'unclassified') AS segment,
       SUM(CASE WHEN p.payment_direction='in'  THEN p.amount ELSE 0 END) AS gross_in,
       SUM(CASE WHEN p.payment_direction='out' THEN p.amount ELSE 0 END) AS gross_out,
       SUM(CASE WHEN p.payment_direction='in'  THEN p.amount ELSE -p.amount END) AS net
FROM payments p
JOIN payment_items pi ON pi.payment_id = p.id
JOIN payment_item_types pit ON pit.id = pi.payment_type_id
LEFT JOIN ... -- joins to extract segment from source detail tables
JOIN tenants t ON t.id = p.tenant_id
GROUP BY 1,2,3,4;
```

**Columns:** `tenant_id`, `revenue_date`, `source`, `segment`, `gross_in`, `gross_out`, `net`.

**Indexes** on the MV: `(tenant_id, revenue_date DESC, source)`.

---

### 4.5 `mv_revenue_by_doctor`

**Purpose:** Per-doctor revenue (consultation + procedures + ordered tests attributed to ordering doctor). Backs the doctor leaderboard widget. Hourly refresh.

**Columns:** `tenant_id`, `doctor_id`, `period_year`, `period_month`, `consultation_count`, `consultation_revenue`, `procedure_revenue`, `ordered_test_revenue`, `total_revenue`.

---

### 4.6 `mv_outstanding_dues`

**Purpose:** AR aging — every invoice with balance > 0, bucketed by age (0–7, 8–15, 16–30, 31–60, 60+ days). Backs the AR aging dashboard. Hourly refresh.

**Columns:** `tenant_id`, `invoice_id`, `patient_id`, `invoice_number`, `total_amount`, `balance`, `age_days`, `age_bucket`, `payment_status`.

---

### 4.7 `mv_bed_occupancy_daily`

**Purpose:** Daily bed occupancy % per ward. *(Source tables are Phase 2; this MV is a Phase 2 deliverable — the spec is here so dashboard wireframes know it's coming.)*

**Columns:** `tenant_id`, `occupancy_date`, `ward_id`, `total_beds`, `occupied_count`, `cleaning_count`, `out_of_service_count`, `occupancy_pct`.

---

### 4.8 `mv_pharmacy_expiry_loss`

**Purpose:** Value of expired stock written off (`stock_movements WHERE movement_type='expiry_writeoff'`). Backs the operational-loss widget. Daily refresh.

**Columns:** `tenant_id`, `month`, `expired_units`, `expiry_loss_value`.

---

### 4.9 `mv_payroll_cost_monthly`

**Purpose:** Monthly payroll cost. *(Phase 2 source.)*

**Columns:** `tenant_id`, `period_year`, `period_month`, `gross_pay`, `deductions`, `net_pay`, `staff_count`.

---

## 5. Cross-References

- **All transactional sources:** TSD-07 through TSD-13. MVs are projections; the source rows are authoritative.
- **Notifications fired by `alert_rules`:** [TSD-02 §4.3 `notifications`](02-audit-events-notifications.md#43-notifications).
- **Audit:** changes to `revenue_targets`, `announcements`, `alert_rules` are audited via the standard trigger (these are Tier-1 tables despite being configuration).
- **Phase 2 MVs** (`mv_bed_occupancy_daily`, `mv_payroll_cost_monthly`) source from tables in [phase-2/15-ipd-admissions.md](phase-2/15-ipd-admissions.md), [phase-2/18-payroll.md](phase-2/18-payroll.md). Build the MVs only when those modules ship.

---

## 6. Schema Review Notes

### Resolved (2026-05-10)
- [x] **Standard inline audit columns** on the three regular tables.
- [x] **MV refresh strategy** documented (hourly / daily / monthly).
- [x] **Standard seed `alert_rules`** documented (low stock, expiry, OP queue, unpaid bills, pending PO, lab critical, discount approval).

### Open
- [ ] **suggestion** — `alert_rules.condition_jsonb` is free-form. Today the evaluator parses by convention. Consider a typed schema registry: `alert_rule_metric(metric_code, metric_source, value_extractor_sql)` so adding a new metric is a data change, not code. Defer.
- [ ] **suggestion** — Materialised views are not multi-tenant-partitioned today. At Apollo-scale (70 tenants × billions of rows in source tables) MVs become huge and slow to refresh. Consider per-tenant `MATERIALIZED VIEW` or partitioned base tables. Defer to scale-up engineering.
- [ ] **question** — `revenue_targets.set_by` is captured but no Layer 2 maker-checker. Should target setting require approval (e.g. department head proposes, owner approves)? Surface for owner decision.
- [ ] **suggestion** — Owner-dashboard widgets that overlay actual against target benefit from a `mv_target_vs_actual_monthly` view. Define and add when dashboard wireframes firm up.
- [ ] **suggestion** — Real-time dashboards (live OP queue, live cash count) cannot use hourly MVs. They read transactional tables directly with carefully indexed queries. Document which widgets are MV-backed vs OLTP-backed in the dashboard TSD (separate doc, future).
- [ ] **question** — `announcements.target_audience='custom'` uses `target_role_ids[]`. For a hospital with 50 staff and a few core roles, this is fine. For Apollo-scale (thousands of staff, complex role hierarchy), more sophisticated audience targeting (by location, by speciality) may be needed. Defer.
- [ ] **suggestion** — System-maintenance / outage announcements often need to be read-receipt tracked (every staff member must acknowledge a critical safety notice). Today only `notifications` has ACK; `announcements` doesn't. Consider promoting critical announcements through `notifications` as well, with `ack_required=TRUE`. Surface for product decision.
