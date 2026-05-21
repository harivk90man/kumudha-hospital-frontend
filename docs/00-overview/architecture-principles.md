# Architecture Principles

> **Read this before designing any new feature or module.**
>
> These principles are not preferences — they are load-bearing decisions baked into the schema and the BRD. Violating them creates technical debt that is expensive to undo. If a new requirement seems to conflict with a principle, discuss and amend the principle deliberately rather than silently working around it.
>
> Master scope authority → [vision-and-scope.md](vision-and-scope.md)

---

## 1. Encounter-Centric Architecture

Every clinical event, billing charge, and state transition is anchored to an **encounter** — either an `op_visit` (OPD) or an `ip_admission` (IPD). Nothing is attached directly to a patient without an encounter in between.

**Why it matters:** The patient record is a timeline of encounters. A doctor reviewing a returning patient sees events grouped by visit date, not a flat list of all events ever. Billing is per-encounter. State machines are per-encounter. Adding IPD later required no schema redesign because the pattern was already encounter-centric from day one.

**Violation to avoid:** Storing a clinical observation, a charge, or a state change directly on the `patients` table.

---

## 2. No OPD-Specific Hardcoding

States, queues, billing rules, and workflows are designed to be encounter-type-agnostic. The system should not have logic that says "if OPD, do X; if IPD, do Y" in its core flow — instead, the encounter type informs configuration (e.g., billing policy = `before_service` for OPD, `at_discharge` for IPD), not branching business logic.

**Why it matters:** Any OPD-only shortcut today becomes a wall when IPD is added in Phase 2.

**Violation to avoid:** Hardcoding `op_visit_id` as a required field in places where `ip_admission_id` should also be valid.

---

## 3. Workflow-Driven States

A patient's progress through the system is tracked via an **explicit state machine** (`patient_journey_events`), not inferred from the presence or absence of data rows. The current state is always knowable from the last event, not from checking whether a vitals row exists or whether an invoice is paid.

**Why it matters:** Inferred state is ambiguous and breaks when data is incomplete. Explicit state transitions make every step auditable, SLA-measurable, and reportable.

**Rules:**
- Every state transition is its own `patient_journey_events` row — never compress two transitions into one
- The denormalized `current_state_code` on `op_visits` / `ip_admissions` is a fast-read cache only — synced by trigger, never written from app code
- New states must be added to `patient_states` with a code, label, phase, department, SLA, and blocking flag before any code references them

---

## 4. Audit-First Financial Design

Every money movement is:
- **Append-only** — no DELETE, no UPDATE on finalized rows
- **Attributable** — every payment row carries who collected it, when, and on which cash session
- **Audit-ready** — `audit_logs` captures every CRUD event; 7-year retention

**Why it matters:** Financial disputes, insurance claims, and government audits require a complete, unmodifiable paper trail.

**Violation to avoid:** Updating a payment amount after the fact. Corrections must use the credit note pattern (an offsetting `payment_direction='out'` row), never a mutation.

---

## 5. Immutable Finalized Invoices

Once an invoice is finalized (payment received), its line items are **frozen**. Price changes, discount changes, or corrections go through:
- A **credit note** (adjustment row) for financial corrections
- A new invoice line item for additions

Mid-bill price changes use `service_price_history` — the price at the time of service is honoured; later price changes do not retroactively reprice open or closed invoices.

**Why it matters:** Retroactive edits make reconciliation impossible and open the door to fraud.

---

## 6. Event-Oriented Patient Journey Tracking

`patient_journey_events` is the **source of truth** for everything that happened to a patient during an encounter. It is append-only, 7-year retention, and indexed for timeline queries.

The denormalized `current_state_code` column exists only for performance — dashboards and queues read it because it avoids an aggregate query. But every audit, report, or SLA calculation reads from `patient_journey_events`.

**Rules:**
- Never skip a state to "save a step" — every intermediate state must be recorded
- Never batch two state transitions into one row
- The trigger `fn_sync_op_visit_state` keeps the denormalized column honest — app code must not bypass it

---

## 7. Future IP Compatibility

The schema was designed in v8 with IPD, Surgery, Beds, Nursing, and OT tables **already present**. They are not surfaced in the v1 UI but are structurally complete.

**Implication for v1 developers:** When building OPD features, always ask: "will this design decision break when we turn on the IPD tables?" If yes, redesign before shipping.

**Examples of safe patterns:**
- `vitals` table accepts both `op_visit_id` and `ip_admission_id` (nullable FK, one or the other)
- `lab_orders` can originate from either encounter type
- `invoices` carry an `encounter_type` discriminator, not an `op_visit_id` FK

---

## 8. Multi-Tenant from Day One

Every table carries `tenant_id`. Every query filters by `tenant_id`. No cross-tenant data leakage is possible at the query level.

**Why it matters:** Kumudha Hospital is the first tenant. A second hospital (or a SaaS rollout) requires zero schema migration — only a new tenant row and onboarding config.

**Violation to avoid:** Any query that omits `WHERE tenant_id = :tid`. Even internal background jobs must scope to a tenant.

---

## 9. Optimistic Locking on Financial and Stock Tables

Tables that are written by concurrent users carry a `version` integer column. Every UPDATE must include `WHERE id = :id AND version = :v` and bump the version. If the version has changed (another user beat you), the transaction fails and the UI must surface a clean "retry" error.

**Tables requiring optimistic locking:** `invoices`, `payments`, `ip_admissions`, `bed_assignments`, `medicine_batches`, `pharmacy_sales`.

**Why it matters:** Prevents double-charge, double-dispense, and concurrent billing conflicts without expensive row-level locking.

---

## 10. Idempotency on All Payment and Dispense Operations

Every `payments` row and every `pharmacy_sales` row carries an `idempotency_key` (UUID, partial UNIQUE index). Retrying a failed payment or dispense with the same key is safe — the second attempt returns the existing row instead of creating a duplicate.

**Why it matters:** Network failures and UI retries are inevitable. Without idempotency keys, a patient gets double-charged or double-dispensed every time a request times out.

---

## Hard Assumptions (baked into the schema — change with care)

> These are decisions taken without further debate. Changing any of them ripples into the BRD and schema. Each is encoded as an invariant in the schema runbook.

### Deployment

- **Single-tenant first** — Kumudha Hospital (`tenant_code = KH`). Schema is multi-tenant ready but only one tenant in v1.
- **Single hospital location** in v1. Branch / multi-location is Phase 3.
- **Modular monolith on PostgreSQL** — one database, one deploy. Module boundaries enforced in code, not network calls. No microservices split, ever.
- Web-first. No native mobile app in v1.

### Money

- Currency: **INR only**.
- **Healthcare services are GST-exempt** (CGST/SGST = 0 on consultations, IP charges, clinical procedures).
- **Pharmacy / lab products** carry GST per HSN — typically 5% / 12% / 18%. Every billable service has a `sac_code`; every invoice item carries the CGST/SGST/IGST split.
- **Refunds are never destructive** — corrections happen via credit notes / adjustment rows. No row in a finalized invoice is mutated retroactively.
- Rounding: nearest rupee on patient-facing bills; full precision retained in DB.

### Identifiers

- **All PKs are UUIDs** — synthetic, never shown in the UI.
- **Business identifiers** (UHID, op_number, ip_number, invoice_number) are UNIQUE columns, not PKs — format changes don't cascade through the schema.
- **UHID format:** `KH-YYYY-NNNNNN` (tenant prefix + year + 6-digit running number). Atomic mint via `uhid_sequences`.
- **Provisional UHIDs:** `TEMP-KH-YYYY-NNNNNN` for emergency walk-ins; merged into a permanent UHID via `sp_merge_patients`.
- **Token numbers** reset daily, scoped per `(tenant, service_type, provider, date)`. Never reused — cancelled tokens stay in the table; a partial unique index keeps the slot occupied permanently.

### Compliance and Legal Context

- **India-specific.** No HIPAA. Indian medical regulatory frameworks apply.
- **NDPS Act** — every transaction on narcotic medicines (Schedule X) writes a `narcotic_register` row with prescriber + recipient + witness. Quarterly Drug Inspector audits. 7-year retention.
- **Medico-Legal Cases (MLC)** — trauma, assault, suicide attempts, poisoning, burns, sexual assault, animal bites, industrial accidents must register an MLC row. Discharge UI blocks until `mlc_records.closure_status = 'closed'`.
- **NABL audit trails** — append-only event logs across the system support this requirement.
- **Critical-result SLA** — critical lab results raise an `ack_required = TRUE` notification; breach surfaces in compliance reports.
- **ABDM** (Ayushman Bharat Digital Mission) integration is out of scope for v1; designed not to block Phase 3 integration.

### Append-Only / Immutability Retention

| Table | Retention | Pattern |
|---|---|---|
| `audit_logs` | 7 years | Append-only — no UPDATE, no DELETE |
| `domain_events` | 3 years | Append-only |
| `patient_journey_events` | 7 years | Append-only |
| `narcotic_register` | 7 years (NDPS Act) | Append-only |
| `service_price_history` | 10 years | Closed-period (insert + close prior period; values immutable) |
| `discharge_summaries`, `consultations`, `lab_results`, `radiology_reports` | 10 years | Clinical record retention |

### Timezone and Language

- All timestamps stored in **UTC** (`timestamptz`). Display in `Asia/Kolkata`.
- v1 UI: **English only**. Patient-facing printouts (prescriptions, receipts) may need Tamil — confirm with hospital before implementation.
