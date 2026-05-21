# Audit-Logging Design

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

A hospital information system must answer three questions for any data change:

1. **Who** made the change?
2. **What** did the row look like before, and after?
3. **Was it approved**, where business policy requires two-person sign-off?

This document defines the cross-cutting audit infrastructure — three layers, applied consistently across the schema — that answers those questions for the whole app.

The layers are independent and complementary:

| Layer | Scope | Mechanism | Purpose |
|---|---|---|---|
| **1. Inline audit columns** | Every mutable table | 5 standard columns | Fast UI answer to "who created / last edited this row" |
| **2. Maker-checker columns** | 7 sensitive tables | 4 standard columns | Built-in two-person approval workflow |
| **3. Central `audit_logs`** | Every Tier-1 table | DB trigger + JSONB before/after | Full forensic record, cross-table compliance, regulatory defensibility |

History tables (T24-style shadow tables) are **deliberately excluded from v1**. The central `audit_logs` answers "show me how this row evolved" via JSONB diffs. Selective history tables can be added later for specific UI features (e.g. "reconstruct a patient's record AS-OF a date") — none of the BRD §1–§13 flows requires this today.

---

## 2. Layer 1 — Inline Audit Columns (every mutable table)

Every mutable, audited table carries this standard set:

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| created_by | UUID | NO | FK → users(id) | — | User who inserted the row |
| created_at | timestamptz | NO | — | now() | Insert timestamp |
| updated_by | UUID | YES | FK → users(id) | — | User of the most recent UPDATE (NULL on insert) |
| updated_at | timestamptz | NO | — | now() | Last-update timestamp; trigger refreshes on every UPDATE |
| version | int | NO | — | 0 | Optimistic-lock counter; incremented on every UPDATE |

**Trigger:** `fn_touch_updated()` (BEFORE UPDATE) auto-fills `updated_at = now()` and increments `version`. App is responsible for setting `updated_by` from session.

**Exemptions:** append-only tables (`audit_logs`, `domain_events`, `patient_journey_events`, `narcotic_register`, `service_price_history`) carry only `created_by` + `created_at` — they are never updated.

**Why standardise:** today the runbook has these inconsistently — some tables have `created_at` only, financial tables have `version`, almost nothing has `updated_by`. Standardising makes "who last touched this row" answerable from any UI without joining `audit_logs`.

---

## 3. Layer 2 — Maker-Checker Columns (7 sensitive tables)

Tables where business policy requires two-person sign-off carry this additional standard set:

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| approval_status | varchar | NO | CHECK ∈ {'draft','pending_approval','approved','rejected'} | 'draft' | Workflow state |
| approved_by | UUID | YES | FK → users(id) | — | Approver (set when status reaches `approved`) |
| approved_at | timestamptz | YES | — | — | Approval timestamp |
| rejection_reason | text | YES | — | — | Required when status = `rejected` |

**Workflow:**
- Inputter creates the row → `approval_status='draft'`.
- Inputter submits → `approval_status='pending_approval'`.
- Approver acts → `approval_status='approved'` with `approved_by`, `approved_at` set; **or** `approval_status='rejected'` with `rejection_reason` required.
- Operations that consume the row check `approval_status='approved'` before acting.

**Constraints (DB-enforced):**
- Inputter (`created_by`) ≠ approver (`approved_by`) — separation of duties.
- `approved_at IS NULL` ↔ `approval_status NOT IN ('approved')`.
- `rejection_reason` is NOT NULL when `approval_status='rejected'`.

**Tables that carry maker-checker (the 7):**

| Table | Approval scenario | BRD reference |
|---|---|---|
| `invoices` | Line-item discount + whole-bill discount above approver's threshold | §9 Billing — discount approval matrix |
| `credit_notes` | Refund or write-off above approver's threshold | §8 Pharmacy returns + §9 |
| `purchase_orders` | Vendor PO above receiving-staff's spending limit | §8 Pharmacy stock replenishment |
| `narcotic_register` | NDPS Act two-person witness — both witness IDs captured | NDPS Act statutory |
| `system_config` | Tenant-level rule changes (thresholds, approval matrix, business rules) | §12 Owner / §13 Platform Admin |
| `patient_merges` | Unmerge requires founder approval per runbook | §13 Platform Admin |
| `lab_results` | Override Release for critical values — senior reviewer with reason | §7 Lab — Override Release |

**Why only these 7:** the rest of the schema is doctor-/staff-authored and doesn't need a second pair of eyes (vitals, consultations, prescriptions, lab orders, appointments, etc. are recorded in real time by the responsible clinician).

---

## 4. Layer 3 — Central `audit_logs` (trigger-based)

The forensic record. One central table; one row inserted per write to any Tier-1 table; before/after row contents stored as JSONB. Industry-standard pattern for healthcare information systems.

### 4.1 Schema (also in [02-audit-events-notifications.md](02-audit-events-notifications.md) §4.1)

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | YES | FK → tenants(id) | — | Tenant scope (NULL only for cross-tenant Platform Admin actions) |
| user_id | UUID | YES | FK → users(id) | — | Acting user (read from session variable) |
| action | varchar | NO | CHECK ∈ {'INSERT','UPDATE','DELETE'} | — | Operation type |
| entity_table | varchar | NO | — | — | Target table name |
| entity_id | UUID | NO | — | — | Target row id |
| before_state | jsonb | YES | — | — | Snapshot before change (NULL for INSERT) |
| after_state | jsonb | YES | — | — | Snapshot after change (NULL for DELETE) |
| changed_fields | text[] | NO | — | '{}' | Computed: keys that differ between before / after. INSERT = all keys; DELETE = '{}'. |
| request_id | UUID | YES | — | — | Correlation id — all writes within one HTTP request share this |
| ip_address | varchar | YES | — | — | Source IP at write time |
| user_agent | text | YES | — | — | Client UA string |
| occurred_at | timestamptz | NO | — | now() | Time of write |

### 4.2 Trigger pattern

A single generic trigger function, attached to every Tier-1 table by migration:

```
fn_audit_row()  -- AFTER INSERT OR UPDATE OR DELETE
  reads session vars:  app.user_id, app.tenant_id, app.request_id, app.ip, app.user_agent
  computes changed_fields = jsonb_object_keys(after) where after->>k <> before->>k
  inserts one row into audit_logs
```

**Append-only enforcement** — `BEFORE UPDATE OR DELETE` trigger on `audit_logs` itself raises `EXCEPTION 'audit_logs is append-only'`. Tamper-resistant at the DB level.

### 4.3 Acting-user resolution — session variables

App middleware runs at the start of every request:

```sql
SET LOCAL app.user_id   = '<authenticated user uuid>';
SET LOCAL app.tenant_id = '<tenant uuid>';
SET LOCAL app.request_id = '<correlation uuid>';
SET LOCAL app.ip         = '<client IP>';
SET LOCAL app.user_agent = '<UA string>';
```

`SET LOCAL` scopes to the transaction — automatically cleared at commit/rollback. The trigger reads these via `current_setting('app.user_id', true)`. If missing (system-driven write outside a request), the trigger writes NULL — which is acceptable for periodic jobs but flagged in monitoring.

**Bypass risk:** a developer running `psql` directly skips the middleware, so `user_id` ends up NULL. Mitigation: monitoring dashboard alerts when > 1% of audit rows in a window have `user_id IS NULL`.

### 4.4 What the JSONB looks like

Example: receptionist Naveen updates Mrs Lakshmi's address.

```json
// before_state
{ "id": "...", "uhid": "KH-2024-005412", "first_name": "Lakshmi",
  "address": {"line1": "23 Park St", "city": "Villupuram", "pincode": "605602"},
  "version": 3, "updated_at": "2026-04-12T10:33:00Z", … }

// after_state
{ "id": "...", "uhid": "KH-2024-005412", "first_name": "Lakshmi",
  "address": {"line1": "47 Anna Salai", "city": "Villupuram", "pincode": "605602"},
  "version": 4, "updated_at": "2026-05-10T14:21:00Z", "updated_by": "<naveen-uuid>", … }

// changed_fields
["address", "version", "updated_at", "updated_by"]
```

The whole row is stored, not a diff — Postgres TOAST + JSONB compression keeps storage reasonable (~30% of operational data on average).

---

## 5. Audit Tier Classification

Which tables get audited (Tier 1) vs already-immutable (Tier 2) vs excluded (Tier 3).

### Tier 1 — MUST audit (trigger attached)

| Category | Tables |
|---|---|
| Patient identity | `patients`, `patient_govt_ids`, `patient_merges`, `patient_mergeable_tables`, `patient_family_history`, `uhid_sequences` |
| Encounters | `op_visits`, `appointments`, `appointment_slots`, `tokens`, `patient_queue` |
| Clinical | `consultations`, `vitals`, `prescriptions`, `prescription_items`, `doctor_recommendations`, `diagnosis_templates` |
| Lab / Radiology | `lab_orders`, `lab_order_items`, `lab_results`, `radiology_orders`, `radiology_reports` |
| Pharmacy / Stock | `medicines`, `medicine_batches`, `stock_movements`, `purchase_orders`, `purchase_order_items`, `pharmacy_sales`, `pharmacy_sale_items` |
| Money | `invoices`, `invoice_items`, `payments`, `payment_allocations`, `payment_items`, `payment_*` (5 detail tables), `credit_notes`, `cash_sessions` |
| Pricing | `services`, `service_billing_policies` |
| Identity / Access / Config | `users`, `user_roles`, `roles`, `permissions`, `role_permissions`, `system_config`, `tenants`, `tenant_holidays`, `doctor_profiles`, `departments`, `stations` |
| Compliance | `mlc_records` *(Phase 2)* |
| Lookups | `allergies_lookup`, `chronic_conditions_lookup` (because owner/admin edits matter) |

### Tier 2 — Already append-only (the table IS its own audit)

`audit_logs`, `domain_events`, `patient_journey_events`, `narcotic_register`, `service_price_history`, `notification_acknowledgments`. Trigger is **not** attached (recursive audit would explode the table); append-only invariant enforced via separate `BEFORE UPDATE OR DELETE` trigger that raises an exception.

### Tier 3 — Excluded (registered in `audit_excluded_tables`)

| Table | Why excluded |
|---|---|
| `consultation_drafts` | Autosaves every few minutes per active consultation — would explode audit volume |
| `user_sessions` | JWT issuance churn; separate session activity log captures this |
| `user_preferences` | Per-user UI prefs (theme, language); low value |
| `notifications.read_at` | Read-receipt churn (table itself audited for create/update of body/escalation, but `read_at` updates are excluded by column-level filter in trigger) |

The exclusion is registered in a small lookup so it's visible and reviewable:

```
audit_excluded_tables(table_name PK, exclusion_scope ['full'|'columns'], excluded_columns text[], reason)
```

---

## 6. Performance, Partitioning, Retention

### 6.1 Volume estimate (per hospital, mid-size)

- ~30 audited writes per OP visit × 1,000 visits/day = **30,000 audit rows/day**.
- 365 × 30K = **~11M rows/year**.
- 7-year retention = **~77M rows / hospital**.
- JSONB before/after average ~3 KB raw → ~1 KB compressed (TOAST) = **~80 GB / hospital / 7 years**.
- Active working set (last 90 days) = ~3M rows, ~3 GB.

For a 70-tenant chain (Apollo-scale), 5 billion rows total is manageable with per-tenant partitioning.

### 6.2 Partitioning

```
audit_logs PARTITION BY RANGE (occurred_at)
  ├── audit_logs_2026_05  (current month — hot)
  ├── audit_logs_2026_04
  ├── audit_logs_2026_03
  └── ... (12 months online; older partitions detached + archived)
```

Sub-partition by `tenant_id` (LIST) for multi-tenant deployments.

### 6.3 Index strategy

| Index | Query it serves |
|---|---|
| `(tenant_id, entity_table, entity_id, occurred_at DESC)` | "All changes to this row" — the most common operational query |
| `(tenant_id, user_id, occurred_at DESC)` | "All changes by user X" |
| `(tenant_id, occurred_at DESC) WHERE action='DELETE'` partial | Forensic on deletes |
| `(request_id)` | All writes in one request (correlation) |

Partition pruning by `occurred_at` makes "last 90 days" queries fast; partition + index combination keeps "all history of patient X" queries under 50 ms even at 77M rows.

### 6.4 Retention

- **Hot online** — 12 months in the live DB.
- **Cold archive** — partitions older than 12 months are detached and copied to S3-compatible cold storage (Postgres logical-dump format). Read-only access via `pg_dump`-restore on a sandbox if forensic recovery is needed.
- **Total retention** — 7 years (DPDP Act minimum for sensitive PII; hospital-insurance audits often demand 10).
- **Tenant override** — `system_config` key `audit.retention_years` lets a tenant extend (cannot reduce below 7).

Archival is a nightly job; the spec lives in the operational runbook (separate doc, not a TSD).

---

## 7. Example Query Patterns

### 7.1 "Show me how Mrs Lakshmi's record evolved"

```sql
SELECT occurred_at,
       (after_state->>'address')::jsonb AS new_address,
       (before_state->>'address')::jsonb AS old_address,
       user_id, changed_fields
FROM audit_logs
WHERE tenant_id   = :kh
  AND entity_table = 'patients'
  AND entity_id    = :patient_id
  AND occurred_at >= now() - interval '12 months'
ORDER BY occurred_at DESC;
```

Plan: index lookup `(tenant_id, entity_table, entity_id, occurred_at)` → ~10 ms.

### 7.2 "Everything Naveen edited yesterday"

```sql
SELECT entity_table, entity_id, action, changed_fields, occurred_at
FROM audit_logs
WHERE tenant_id   = :kh
  AND user_id     = :naveen_id
  AND occurred_at >= current_date - interval '1 day'
  AND occurred_at <  current_date
ORDER BY occurred_at;
```

Plan: index lookup `(tenant_id, user_id, occurred_at)` + partition prune → ~20 ms.

### 7.3 "All discount approvals on invoices this month, with approver"

```sql
SELECT a.entity_id     AS invoice_id,
       a.before_state->>'discount_amount' AS prev_discount,
       a.after_state->>'discount_amount'  AS new_discount,
       a.after_state->>'approved_by'      AS approver,
       a.occurred_at
FROM audit_logs a
WHERE a.tenant_id   = :kh
  AND a.entity_table = 'invoices'
  AND 'discount_amount' = ANY(a.changed_fields)
  AND a.occurred_at >= date_trunc('month', current_date);
```

Plan: index lookup + JSONB key probe → ~50 ms on a million-row partition.

### 7.4 "All writes in HTTP request <correlation-id>" (forensic)

```sql
SELECT entity_table, entity_id, action, occurred_at
FROM audit_logs
WHERE request_id = :req
ORDER BY occurred_at;
```

Plan: index `(request_id)` → ~5 ms.

---

## 8. Cross-References

- **Trigger / append-only schema:** [TSD-02 Audit, Events & Notifications §4.1](02-audit-events-notifications.md#41-audit_logs).
- **Inline audit columns** are documented in [00-conventions.md §Standard audit columns](00-conventions.md#standard-audit-columns).
- **Maker-checker tables** carry these columns inline; documented in their respective TSDs (`invoices`, `credit_notes`, `purchase_orders`, `narcotic_register`, `system_config`, `patient_merges`, `lab_results`).
- **Tier-3 exclusion registry:** [TSD-02 §4.7 `audit_excluded_tables`](02-audit-events-notifications.md#47-audit_excluded_tables).

---

## 9. Open Questions / Future Work

- [ ] **Read auditing for sensitive PII** (Aadhaar / PAN reads) — currently out of scope; will be added in the Phase 2 compliance pass via a separate `pii_access_logs` table (deferred per user decision 2026-05-10).
- [ ] **History tables for `patients` / `prescriptions` / `consultations`** — deferred. Add only when a UI feature genuinely needs row-level "AS-OF" reconstruction. Today's central `audit_logs` answers all known queries.
- [ ] **Domain-event emission alongside audit** — for high-value state changes (`PaymentReceived`, `PrescriptionLocked`, `LabResultReleased`), the application also writes a `domain_events` row. Audit is for compliance; events are for downstream subscribers (notifications, analytics, integrations). Keep both — they answer different questions.
- [ ] **Selective column-level audit** for tables with high-frequency low-value updates (e.g. `medicine_batches.qty_on_hand` updates every dispense) — could exclude that one column from the trigger to reduce noise. Defer to v2.
- [ ] **Performance baseline** — measure trigger overhead on representative workload before production. Expected: ~10% write-path latency increase; acceptable for a HIS at this scale.
