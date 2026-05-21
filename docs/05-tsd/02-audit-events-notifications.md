# TSD 02: Audit, Events & Notifications

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

Cross-cutting infrastructure that every clinical, financial, and operational module writes into:

- **Audit trail** of every CRUD on critical tables (compliance, malpractice defence).
- **Domain event bus** for asynchronous cross-module subscribers (notifications, analytics, integrations).
- **Notifications** — in-app, email, SMS — with explicit acknowledgment tracking and SLA-driven escalation for critical clinical alerts.
- **File attachments and document templates** — generic blob storage and reusable rendering templates (prescriptions, receipts, discharge summaries, lab reports).

These tables are not "owned" by any single business flow; they are the spine the system uses to stay accountable and to communicate.

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — visit-status events, prescription receipt rendering, lab result file attachments
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — Reports Ready inbox driven by notifications, draft consultation notes, prescription template rendering
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — sample-rejection notifications, critical-result alerts (ACK required), result image / scan files
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — discount-approval audit log, receipt template
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — alerts dashboard (low stock, expiry, unpaid bills, pending discounts, SLA breaches), audit log access, exportable reports
- [13. Platform Admin Flow](../01-brd/hospital-flows.md#13-platform-admin-flow) — cross-tenant audit log access, support session attachments

Implicitly used by **every flow** for write auditing.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `audit_logs` | Append-only CRUD log on Tier-1 tables, written by trigger. 7-year retention; monthly partitioned. JSONB before/after diffs. |
| `domain_events` | Append-only business event bus. 3-year retention. |
| `notifications` | In-app + email + SMS notification queue with priority, ACK requirement, escalation chain. |
| `notification_acknowledgments` | Per-user explicit ACK of critical notifications, with action text and SLA-breach flag. |
| `document_templates` | Reusable templates for prescriptions, receipts, discharge summaries, lab reports. |
| `file_attachments` | Generic blob storage — used by consultations, lab, radiology, IP, HR, support. Polymorphic (entity_table, entity_id) — see [00-conventions.md §FK patterns](00-conventions.md#fk-patterns). |
| `audit_excluded_tables` | Registry — Tier-3 tables (and column-level exclusions) that should NOT emit audit rows. |

---

## 4. Table Specifications

### 4.1 `audit_logs`

**Purpose:** Append-only CRUD log. Written by the central trigger `fn_audit_row()` attached to every Tier-1 table (see [00-audit-logging.md](00-audit-logging.md)). One row inserted per write; full row contents stored as JSONB before / after; acting user resolved from session variables. Used for compliance audits, forensic replay, malpractice defence, and the "show me how this row evolved" UI.
**Lifecycle:** **append-only** — `BEFORE UPDATE OR DELETE` trigger raises an exception. 7-year retention. Monthly partitioning by `occurred_at`; partitions older than 12 months are detached and archived to cold storage.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | YES | FK → tenants(id) | — | Tenant scope (NULL only for cross-tenant Platform Admin actions) |
| user_id | UUID | YES | FK → users(id) | — | Acting user, read from `current_setting('app.user_id')`. NULL for system jobs (monitored). |
| action | varchar | NO | CHECK ∈ {'INSERT','UPDATE','DELETE'} | — | Operation type |
| entity_table | varchar | NO | — | — | Target table name |
| entity_id | UUID | NO | — | — | Target row id |
| before_state | jsonb | YES | — | — | Full row snapshot before change (NULL for INSERT) |
| after_state | jsonb | YES | — | — | Full row snapshot after change (NULL for DELETE) |
| changed_fields | text[] | NO | — | '{}' | Computed by trigger — keys whose value changed (INSERT = all keys; DELETE = '{}') |
| request_id | UUID | YES | — | — | Correlation id; all writes within one HTTP request share this — read from `current_setting('app.request_id')` |
| ip_address | varchar | YES | — | — | Source IP — read from `current_setting('app.ip')` |
| user_agent | text | YES | — | — | Client UA — read from `current_setting('app.user_agent')` |
| occurred_at | timestamptz | NO | — | now() | Time of write |

**Indexes / uniqueness:**
- `(tenant_id, entity_table, entity_id, occurred_at DESC)` — "all changes to this row" (most common query).
- `(tenant_id, user_id, occurred_at DESC)` — per-user activity report.
- `(tenant_id, occurred_at DESC) WHERE action='DELETE'` partial — forensic on deletes.
- `(request_id)` — all writes in one HTTP request (correlation forensic).
- Partition pruning by `occurred_at` (RANGE monthly).

**Trigger:** `fn_audit_row()` (AFTER INSERT OR UPDATE OR DELETE) attached to every Tier-1 table by migration. See [00-audit-logging.md §4.2](00-audit-logging.md#42-trigger-pattern).

**Append-only enforcement:** DB-level — `BEFORE UPDATE OR DELETE` trigger on `audit_logs` raises `EXCEPTION 'audit_logs is append-only'`. Tamper-resistant.

---

### 4.2 `domain_events`

**Purpose:** Business event bus. Modules emit events like `BillFinalized`, `SurgeryCompleted`, `MedicationDispensed`, `LabResultCriticallyAbnormal` for asynchronous subscribers (notification dispatcher, analytics aggregator, future integrations). Distinct from `audit_logs`: audit is "what changed in row X"; domain events are "what happened in business terms."
**Lifecycle:** **append-only**. 3-year retention (long enough for replay if a downstream subscriber needs to re-process).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| event_type | varchar | NO | — | — | Event name (e.g. `BillFinalized`, `DrugDispensed`) |
| aggregate_id | UUID | NO | — | — | The id of the business object the event is about |
| payload | jsonb | NO | — | — | Event body |
| occurred_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `(tenant_id, event_type, occurred_at DESC)` — subscriber lag checks.
- `aggregate_id` — replay events for one business object.

---

### 4.3 `notifications`

**Purpose:** Outbound notification queue. Drives the topbar bell, email, and SMS channels. Critical clinical alerts (lab criticals, drug interactions, vitals breaches) require explicit ACK and escalate when SLA elapses.
**Lifecycle:** mutable (`read_at`, `escalated_*` are updated). Rows are not deleted.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| user_id | UUID | YES | FK → users(id) | — | Direct recipient (NULL when targeted by role) |
| role_id | UUID | YES | FK → roles(id) | — | Role recipient (NULL when targeted at user) |
| type | varchar | NO | — | — | Notification type slug |
| title | varchar | NO | — | — | Short headline |
| body | text | YES | — | — | Long body text |
| link | varchar | YES | — | — | Deep link into the app |
| priority | varchar | NO | CHECK ∈ {'normal','high','urgent'} | 'normal' | Display priority |
| ack_required | boolean | NO | — | FALSE | TRUE for critical clinical alerts; UI surfaces until ACK |
| ack_sla_minutes | int | YES | — | — | Target ACK time. Escalation worker fires after this elapses. |
| escalation_chain | jsonb | YES | — | — | Ordered array (e.g. `["doctor:doc1","hod:doc_hod","oncall:doc_emrg"]`) |
| escalated_at | timestamptz | YES | — | — | Set when SLA elapsed and notification was forwarded |
| escalated_to | UUID | YES | FK → users(id) | — | Whom it was escalated to |
| read_at | timestamptz | YES | — | — | Set on first read (any channel) |
| created_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `(user_id, read_at, priority DESC)` — unread inbox per user.
- `(role_id, read_at)` — role-targeted inbox.
- `(ack_required, escalated_at, created_at)` partial WHERE `ack_required AND read_at IS NULL` — escalation worker scan.

**State transitions:**
- created → (read_at set) read
- created → (SLA elapsed, ack_required=TRUE) → escalated → (escalated_to user reads) → read

---

### 4.4 `notification_acknowledgments`

**Purpose:** Explicit ACK by a user that a critical notification has been seen and acted on. The free-text `action_taken` is required for audit — "saw it" alone is not enough for malpractice defence. SLA-breach flag is computed on insert.
**Lifecycle:** mutable on `action_taken` only (clinicians can edit the action text within a small window). Otherwise immutable.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| notification_id | UUID | NO | FK → notifications(id) | — | The alert being acknowledged |
| acked_by | UUID | NO | FK → users(id) | — | The acknowledger |
| acked_at | timestamptz | NO | — | now() | |
| action_taken | text | YES | — | — | What the acker did in response (audit-required for clinical alerts) |
| sla_minutes | int | YES | — | — | Snapshot of `notifications.ack_sla_minutes` at ack time |
| breached_sla | boolean | NO | — | FALSE | Computed: `(acked_at - notifications.created_at) > sla_minutes` |

**Indexes / uniqueness:**
- `(notification_id, acked_by)` UNIQUE — one ACK per user per notification.
- `(breached_sla, acked_at DESC)` partial WHERE `breached_sla = TRUE` — compliance dashboard.

---

### 4.5 `document_templates`

**Purpose:** Reusable rendering templates for printable / emailable documents. Holds both an HTML body (for direct rendering) and a JSONB schema (for editable templating in the admin UI).
**Lifecycle:** mutable. Each (tenant, template_type) has at most one default.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| template_type | varchar | NO | CHECK ∈ {'consultation','discharge_summary','prescription','receipt','lab_report'} | — | Template category |
| template_name | varchar | NO | — | — | Display name (a tenant may have multiple e.g. `'short_rx'`, `'detailed_rx'`) |
| body_html | text | NO | — | — | Rendered HTML with placeholders |
| body_jsonb | jsonb | NO | — | — | Editable JSON form |
| is_default | boolean | NO | — | FALSE | At most one default per (tenant, template_type) |
| is_active | boolean | NO | — | TRUE | Soft-delete flag |

**Indexes / uniqueness:**
- `(tenant_id, template_type, is_default) WHERE is_default = TRUE` partial UNIQUE — at most one default per type per tenant.

---

### 4.6 `file_attachments`

**Purpose:** Generic blob storage. Stores object-store URLs for files attached to any business entity (consultation notes, lab result images, radiology DICOM, IP discharge documents, HR ID proofs, support session screenshots). Polymorphic `(entity_table, entity_id)` — DB cannot enforce FK; the writing module ensures referential integrity.
**Lifecycle:** mutable on metadata; the underlying storage object is immutable once uploaded.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| entity_table | varchar | NO | — | — | Target table name (e.g. `lab_results`) |
| entity_id | UUID | NO | — | — | Target row id |
| file_name | varchar | NO | — | — | Original filename |
| mime_type | varchar | YES | — | — | MIME, e.g. `application/pdf`, `image/jpeg`, `application/dicom` |
| file_size_bytes | bigint | NO | — | — | Size in bytes |
| storage_url | text | NO | — | — | Object-store URL |
| uploaded_by | UUID | YES | FK → users(id) | — | Uploader |
| uploaded_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `(tenant_id, entity_table, entity_id)` — "list attachments for this row".
- `uploaded_by` for staff-activity reports.

**Polymorphic FK note:** `(entity_table, entity_id)` is one of two accepted polymorphic patterns in v1 (see [00-conventions.md §FK patterns](00-conventions.md#fk-patterns)). A nightly CI job scans for orphan rows and alerts on non-zero results.

---

### 4.7 `audit_excluded_tables`

**Purpose:** Registry of Tier-3 tables (and column-level exclusions) that should NOT emit `audit_logs` rows. Makes the exclusion explicit and reviewable rather than buried in trigger code.
**Lifecycle:** mutable; rows are seeded by migration and edited rarely.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| table_name | varchar | NO | PK | — | Excluded table |
| exclusion_scope | varchar | NO | CHECK ∈ {'full','columns'} | 'full' | `full` skips the whole row; `columns` skips only listed cols |
| excluded_columns | text[] | NO | — | '{}' | Used when `exclusion_scope='columns'` (e.g. exclude `notifications.read_at` updates only) |
| reason | text | NO | — | — | Why excluded — required for governance review |
| added_at | timestamptz | NO | — | now() | |
| added_by | UUID | YES | FK → users(id) | — | NULL for migration-seeded entries |

**Initial seed (Tier-3 from [00-audit-logging.md §5](00-audit-logging.md#tier-3--excluded-registered-in-audit_excluded_tables)):**
- `consultation_drafts` (full) — autosave volume.
- `user_sessions` (full) — JWT churn.
- `user_preferences` (full) — UI prefs.
- `notifications` (columns: `read_at`) — read-receipt churn only.
- `appointment_slots` (full) — bulk-generated daily.
- `patient_queue` (full) — high-churn live data; analytics covered by `patient_journey_events`.

**Read by:** the trigger function `fn_audit_row()` consults this registry at execution time (cached for performance) and skips writes accordingly.

---

## 5. Cross-References

- **Identity for `user_id`, `role_id`, `created_by` everywhere:** [TSD-01 Platform & Tenancy](01-platform-tenancy.md).
- **Lab criticals raise `notifications` with `ack_required=TRUE`:** TSD-08 Lab *(Batch C)*.
- **Radiology `Released` events emit `domain_events` and notify the ordering doctor:** TSD-09 Radiology *(Batch C)*.
- **Pharmacy stock-low / batch-expiry alerts:** TSD-10 Pharmacy & Inventory *(Batch C)*.
- **Discount approvals (BRD §9, §12) write to `audit_logs` with the approving user and reason:** TSD-12 Billing *(Batch D)*.
- **Owner alerts dashboard reads `notifications` + `domain_events`:** TSD-14 Reports *(Batch E)*.
- **`document_templates`** consumers: prescriptions (TSD-07), receipts (TSD-13), lab reports (TSD-08), discharge summaries (phase-2/15).
- **`file_attachments`** consumers: lab (TSD-08), radiology (TSD-09), consultations (TSD-07), IP (phase-2/15), platform admin support sessions (TSD-01).

---

## 6. Schema Review Notes

- [ ] **suggestion** — `audit_logs` append-only invariant is application-level. Consider a `BEFORE UPDATE OR DELETE` trigger that `RAISE EXCEPTION` to enforce at DB level. Impact: belt-and-braces; protects against a developer mistake or a runaway migration. No flow change.

- [ ] **suggestion** — `notifications.escalation_chain jsonb` is free-form. As escalation gets more sophisticated (BRD §7 critical-result handoff, §9 discount approval matrix), consider a typed table `notification_escalation_steps` with `(notification_id, step_index, target_user_id, target_role_id, sla_minutes)`. Impact: bigger refactor; leave as-is for v1 but note for v2 if the JSONB shape grows.

- [ ] **question** — `notification_acknowledgments.action_taken` is nullable. The runbook states it is "required for audit." Should we make it NOT NULL with a CHECK on length ≥ N for `ack_required = TRUE` notifications? The challenge: a UI that surfaces the alert in the corridor display has no place to type. Need a UX decision. Impact: minor schema tweak once decided.

- [ ] **suggestion** — `file_attachments` uses polymorphic `(entity_table, entity_id)`. This pattern hurts FK integrity. Alternative: typed bridge tables (`lab_result_files`, `consultation_files`, …). Trade-off: more tables, but DB-enforced. Runbook accepts the polymorphic cost in exchange for one shared upload pipeline. Flagging — no change suggested.

- [ ] **suggestion** — `domain_events` payload is jsonb without a schema registry. As event types grow, a `domain_event_types(event_type, payload_schema)` lookup with JSON-schema validation in the writer would prevent shape drift. Impact: future-proofing; no v1 change.

- [ ] **question** — `notifications.ack_required` and `escalation_chain` model the "critical alert" pattern, but BRD §7 (Lab) describes an **Override Release** with mandatory reason where a senior releases a critical result anyway. That reason field needs a home. Belongs in the lab module, not here — flagging so we wire it correctly when TSD-08 is written. Impact: cross-module; no change in this TSD.

No `[!] blocker` items.
