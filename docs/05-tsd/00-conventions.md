# TSD Conventions

How to read every TSD in this folder.

---

## File template

Every Phase 1 TSD follows the same six-section structure:

1. **Purpose** — what business need this entity serves (2–3 sentences).
2. **BRD Flows Covered** — clickable links into the BRD flow sections that touch these tables.
3. **Tables in This TSD** — one-line summary of each table.
4. **Table Specifications** — full column spec per table (the heart of the document).
5. **Cross-References** — pointers to upstream / downstream TSDs.
6. **Schema Review Notes** — open questions and improvement suggestions over the runbook.

Phase 2 TSDs are **stubs** — table list + status only, no column specs (until Phase 2 begins).

---

## Column spec syntax

Each table presents its columns as a markdown table:

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate primary key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Multi-tenant scope |
| uhid | varchar | NO | UNIQUE | — | Hospital-issued patient-facing ID |
| dob | date | YES | — | — | Date of birth (one of dob/age required) |

Conventions used in this template:

| Field | Values | Meaning |
|---|---|---|
| **Type** | UUID, varchar, text, int, bigint, decimal, boolean, timestamptz, date, jsonb, text[] | PostgreSQL native types. `decimal` defaults to `numeric(12,2)` for money unless noted. |
| **Null** | YES / NO | NO = NOT NULL constraint. |
| **Constraint** | PK, FK, UNIQUE, CHECK, partial UNIQUE | Multiple constraints separated by commas. FK shown as `FK → table(col)`. |
| **Default** | literal value, function, or `—` | `—` means no default — application must supply a value (or it's nullable). |
| **Meaning** | one-line business-domain description | What this column *means*, not what it stores. |

---

## Lifecycle tags

Each table is labelled with one of the following lifecycle tags:

| Tag | Meaning | Examples |
|---|---|---|
| **mutable** | Standard CRUD; rows are inserted, updated, occasionally soft-deleted. | `patients`, `users`, `appointments` |
| **append-only** | Rows are inserted but never updated or deleted. Errors are corrected by inserting a compensating row. | `audit_logs`, `domain_events`, `patient_journey_events`, `narcotic_register` |
| **closed-period history** | Insert + a single UPDATE on the *previous* row to close its period. Historical values are immutable. | `service_price_history` |
| **soft-delete** | Logical delete via `is_active=false` or similar; rows physically remain. | `users`, `medicines`, `medicine_batches` |
| **transactional ledger** | Append-only with optimistic locking; balance is computed by aggregation. | `payments`, `payment_allocations` |

When a table has triggers, the trigger is named in the table's *Indexes / triggers* subsection.

---

## Standard audit columns

Every **mutable** audited table carries this standard set of inline audit columns (Layer 1 of the audit-logging design — see [00-audit-logging.md](00-audit-logging.md)):

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| created_by | UUID | NO | FK → users(id) | — | User who inserted the row |
| created_at | timestamptz | NO | — | now() | Insert timestamp |
| updated_by | UUID | YES | FK → users(id) | — | User of the most recent UPDATE (NULL on insert) |
| updated_at | timestamptz | NO | — | now() | Last-update timestamp; trigger refreshes on every UPDATE |
| version | int | NO | — | 0 | Optimistic-lock counter; incremented on every UPDATE |

Trigger `fn_touch_updated()` (BEFORE UPDATE) auto-fills `updated_at = now()` and increments `version`. App is responsible for setting `updated_by` from the request session.

**Append-only tables** (`audit_logs`, `domain_events`, `patient_journey_events`, `narcotic_register`, `service_price_history`) carry only `created_by` + `created_at`.

**Maker-checker tables** (the 7 sensitive tables — `invoices`, `credit_notes`, `purchase_orders`, `narcotic_register`, `system_config`, `patient_merges`, `lab_results`) carry an additional 4 columns: `approval_status`, `approved_by`, `approved_at`, `rejection_reason`. See [00-audit-logging.md §3](00-audit-logging.md#3-layer-2--maker-checker-columns-7-sensitive-tables).

To keep individual TSD tables readable, **the standard 5 audit columns are not repeated in every column spec** — assume they are present unless explicitly noted.

---

## FK patterns

For relationships where one row points at one of many possible parent tables, two patterns are available. Default rule:

> **Use separate nullable FK columns + `CHECK (exactly one is non-null)` for bounded sets. Use polymorphic `(entity_table, entity_id)` only for genuinely unbounded sets.**

### Why separate columns by default

In an AI-assisted development workflow, DB-level integrity is the safety net the AI cannot escape:

- AI cannot accidentally write `'op_visit'` (singular) instead of `'op_visits'` — there is no string column to mis-spell.
- Postgres rejects orphan rows at INSERT time (the FK constraint fires).
- Tooling and ORMs handle nullable FKs natively.
- New context types are added by `ALTER TABLE ADD COLUMN` — mechanical and reviewable in migrations.

### Where polymorphic is acceptable

Only where the parent set is genuinely **unbounded** — i.e. every audited table is a potential target:

| Table | Why unbounded |
|---|---|
| `audit_logs.entity_table + entity_id` | By definition, audits every Tier-1 table |
| `file_attachments.entity_table + entity_id` | Any business entity may need a file attached (consultations, lab results, radiology reports, IP records, govt-ID scans, support session captures, future modules) |

For these two, a **CI orphan-check job** runs nightly:

```sql
-- Example: file_attachments orphans
SELECT fa.id, fa.entity_table, fa.entity_id
FROM file_attachments fa
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_name = fa.entity_table
)
   OR (
     fa.entity_table = 'patients' AND
     NOT EXISTS (SELECT 1 FROM patients WHERE id = fa.entity_id)
   )
   OR (
     fa.entity_table = 'lab_results' AND
     NOT EXISTS (SELECT 1 FROM lab_results WHERE id = fa.entity_id)
   )
   -- repeat for every registered entity_table value
;
-- Should always return 0 rows. Non-zero = alert.
```

The check is registered in CI / a nightly Postgres job; non-zero results page the on-call engineer.

### Tables migrating from polymorphic → separate columns

Per the schema-review pass on 2026-05-10:

| Table | Was polymorphic | Now separate columns |
|---|---|---|
| `tokens` | `context_table + context_id` | `op_visit_id`, `lab_order_id`, `pharmacy_sale_id`, `radiology_order_id`, `invoice_id` (TSD-05) |
| `doctor_recommendations` | `recommendation_type + reference_id` | `surgery_schedule_id`, `appointment_slot_id`, `lab_order_id`, `radiology_order_id`, `ip_admission_id`, `physio_session_id`, `referral_id` (TSD-07) |
| `payment_items` | `payment_type_id + item_record_id` | `payment_xray_id`, `payment_pharmacy_id`, `payment_consultation_id`, `payment_lab_id`, `payment_cafeteria_id` (TSD-13) |

Each gets a `CHECK (num_nonnulls(<col1>, <col2>, …) = 1)` constraint.

---

## Naming conventions

| Convention | Example | When to use |
|---|---|---|
| `<entity>_lookup` | `allergies_lookup`, `chronic_conditions_lookup` | Reference / catalogue tables — small static sets used as picklists. **Do not use `_master`** (banking-software convention; not appropriate here). |
| `<entity>_history` | `patients_history` | Reserved — not used in v1 (see [00-audit-logging.md §1](00-audit-logging.md#1-purpose) on why history tables are deferred). |
| `mv_<entity>_<aggregation>` | `mv_revenue_daily` | Materialised views for analytics. |
| `fn_<verb>_<object>` | `fn_audit_row`, `fn_touch_updated`, `fn_sync_op_visit_state` | Trigger / stored-procedure functions. |
| `sp_<verb>_<object>` | `sp_merge_patients` | Stored procedures invoked by application code. |

---

## Status tags

Used in TSD frontmatter and in the [README.md index](README.md):

| Tag | Meaning |
|---|---|
| **Phase 1 — In Scope** | Required for v1 launch (per BRD `IN SCOPE` flows). |
| **Phase 2 — Reference Architecture** | Modelled but deferred. Schema present in runbook; TSD is a stub. |
| **🔒 LOCKED** *(BRD only)* | The flow has been finalised and approved. TSDs covering locked flows must not propose changes that alter business behaviour without owner re-approval. |

---

## Anchors and links

- **TSD → TSD links:** relative file links, e.g. `[TSD-04 Patient Journey](04-patient-journey.md)`.
- **TSD → BRD flow links:** `[Flow Name](../01-brd/hospital-flows.md#1-opd--outpatient-visit)` — anchor format follows GitHub markdown rules (lowercase, spaces → hyphens, special chars dropped, em-dash collapses).
- **TSD → runbook links** (rare): `[Schema runbook §5.x](../03-schema/hms_schema_runbook.md#5x-module-name)`. Use only when explaining a design rationale that hasn't been replicated in the TSD.

---

## Schema Review Notes — what counts as what

In each TSD's *§6 Schema Review Notes* section, items are tagged by impact:

| Tag | When to use | Action |
|---|---|---|
| `[ ] suggestion` | A column / index / constraint that would improve the design but does not change table shape or flow behaviour. | Accumulate; surface in batch review at the end of each batch. |
| `[ ] question` | An ambiguity in the runbook that needs user clarification. | Accumulate; surface in batch review. |
| `[!] blocker` | A change that *would* alter table shape, column semantics, or business-flow complexity. | **Authoring stops.** Surface in chat immediately; await explicit user decision. |

This is the discipline the user requested on 2026-05-10 — schema is tentative, but no silent reworks.

---

## Source of truth

These TSDs supersede the table specs in [../03-schema/hms_schema_runbook.md](../03-schema/hms_schema_runbook.md). The runbook is preserved as the *design rationale* (architecture decisions, cross-cutting patterns, the worked patient-journey example). When a TSD and the runbook disagree on column shape, **the TSD wins** — but the divergence should be flagged in *§6* so a runbook update can be scheduled.
