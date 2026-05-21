# TSD 06: OPD Encounters

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

The aggregate roots for an outpatient visit. Two tables work together:

1. **`op_visits`** — one row per OP encounter. Holds the human-readable visit number (`OP-2026-58821`), the chief complaint, the doctor in charge, the emergency / MLC flags, and a denormalised `current_state_code` synced by trigger from [TSD-04 `patient_journey_events`](04-patient-journey.md). The visit is the umbrella that consultations, vitals, prescriptions, lab orders, radiology orders, and invoices all hang off.
2. **`patient_queue`** — the live queue position. Tells the system "Mrs Lakshmi is at the vitals room, position 2." Each station the patient passes through opens a queue row (closed when she moves on). The `parent_queue_id` self-FK supports **side-trips**: doctor sends patient to billing for an X-ray fee, then back to the doctor afterwards — the side-trip queue row points at the original doctor row.

Together these answer the dashboard question "where is this patient right now?" without scanning the journey ledger every time. The journey ledger remains the truth; these two are the fast read.

`ip_admissions` and `mlc_records` are referenced by `op_visits` (for OP→IP transfers and medico-legal cases) but are owned by Phase 2 — see [phase-2/15-ipd-admissions.md](phase-2/15-ipd-admissions.md).

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — every numbered step touches `op_visits` or `patient_queue` (visit creation, queue movement, side-trip, OP→IP transfer).
- [3. Emergency](../01-brd/hospital-flows.md#3-emergency-flow) *(Phase 2 entry)* — emergency walk-ins create `op_visits` with `is_emergency=TRUE` + `emergency_triage`.
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — doctor's console reads `op_visits` rows where `current_state_code IN (140, 150)` and the patient_queue rows pointing at her station.
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — invoices FK to `op_visits.id`.
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — OPD census, dept-wise activity, turnaround time all read `op_visits` aggregates.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `op_visits` | One row per OP encounter. Holds visit number, chief complaint, current state (synced), emergency / MLC flags. |
| `patient_queue` | Live queue position per station. `parent_queue_id` supports side-trips (doctor → billing → back to doctor). |

---

## 4. Table Specifications

### 4.1 `op_visits`

**Purpose:** The OP encounter aggregate. Created the moment a registered patient is intended to see a doctor today (booked appointment marks `arrived`; walk-in proceeds straight to `op_visits` creation). All clinical artefacts (vitals, consultation, prescriptions, lab/radiology orders) FK back here. The `current_state_code` is denormalised from the journey ledger by trigger — fast queries don't pay the cost of scanning `patient_journey_events`.
**Lifecycle:** mutable on `current_state_code` (via trigger only) and the `is_mlc` / `mlc_number` columns. Otherwise immutable after creation. No soft-delete — a cancelled visit moves to a terminal state code (e.g. `601=cancelled_by_patient`).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| op_number | varchar | NO | UNIQUE per tenant | — | Human-readable visit ID, e.g. `OP-2026-58821`. Format locked after first record per BRD §13. |
| patient_id | UUID | NO | FK → patients(id) | — | Subject patient |
| appointment_id | UUID | YES | FK → appointments(id) | — | Linked appointment if pre-booked; NULL for walk-ins |
| doctor_id | UUID | NO | FK → users(id) | — | Treating doctor |
| visit_date | date | NO | — | — | Local date of the visit |
| token_number | varchar | YES | — | — | Convenience denormalisation of the consultation token; see TSD-05 `tokens` |
| chief_complaint | text | YES | — | — | Captured by receptionist / nurse at registration; visible on doctor's queue |
| is_emergency | boolean | NO | — | FALSE | TRUE for ER triage entries |
| emergency_triage | varchar | YES | CHECK ∈ {'red','yellow','green'} | — | When `is_emergency=TRUE` |
| current_state_code | int | YES | FK → patient_states(code) | — | **Denormalised; synced by trigger from `patient_journey_events`. App code never writes this directly.** |
| is_mlc | boolean | NO | — | FALSE | Medico-legal case flag |
| mlc_number | varchar | YES | — | — | When `is_mlc=TRUE`; mirrors `mlc_records.mlc_number` (Phase 2) |
| created_by | UUID | NO | FK → users(id) | — | Registering staff |
| created_at | timestamptz | NO | — | now() | |

**Key relationships:**
- `appointment_id → appointments(id)` — visit links back to the booking that created it.
- Referenced by `consultations`, `vitals`, `prescriptions`, `lab_orders`, `radiology_orders`, `invoices`, `patient_queue`, `patient_journey_events`.

**Indexes / uniqueness:**
- `(tenant_id, op_number)` UNIQUE.
- `(tenant_id, visit_date, current_state_code)` — owner dashboard queries.
- `(tenant_id, doctor_id, visit_date, current_state_code)` — doctor's console.
- `(tenant_id, patient_id, visit_date DESC)` — patient history view.
- `(tenant_id, is_emergency, visit_date) WHERE is_emergency = TRUE` partial — ER census.

**Triggers:**
- `fn_sync_op_visit_state` (AFTER INSERT on `patient_journey_events`) — updates `op_visits.current_state_code = NEW.to_state_code` when `op_visit_id IS NOT NULL`.

**Note on the deprecated `status` column:** the runbook flagged a legacy `status varchar` column as DEPRECATED ("derive from `current_state_code`"). Drop it in the v8 migration once nothing reads it. See §6.

---

### 4.2 `patient_queue`

**Purpose:** Live queue position. One row per `(patient, station)` while the patient is at that station; closed when they leave. `parent_queue_id` supports **side-trips** — a doctor sends the patient to billing for an X-ray fee mid-consultation, then expects them back. The billing row points at the doctor's queue row via `parent_queue_id`, and `return_to_provider_id` records who should resume care.
**Lifecycle:** mutable on `status`, `served_at`, `completed_at`. Rows are kept indefinitely for queue analytics.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| patient_id | UUID | NO | FK → patients(id) | — | Patient in the queue |
| station_id | UUID | NO | FK → stations(id) | — | Where the patient is |
| op_visit_id | UUID | YES | FK → op_visits(id) | — | OP context (NULL for IP-only queues) |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | IP context (Phase 2) |
| queue_position | int | NO | — | — | Position at this station (1-based; recomputed on insert/close) |
| parent_queue_id | UUID | YES | FK → patient_queue(id) | — | Self-FK; set when this row is a side-trip from another station |
| return_to_provider_id | UUID | YES | FK → users(id) | — | Who the patient should return to after the side-trip |
| status | varchar | NO | CHECK ∈ {'waiting','in_service','completed','left'} | 'waiting' | Lifecycle |
| entered_at | timestamptz | NO | — | now() | When the patient arrived at this station |
| served_at | timestamptz | YES | — | — | When service began (e.g. token called) |
| completed_at | timestamptz | YES | — | — | When the patient left this station |
| metadata | jsonb | YES | — | — | Free-form context (`late_arrival=true`, `priority='vip'`, `ambulance_arrival_time`) |

**Key relationships:**
- Self-FK `parent_queue_id` — side-trip support.
- `op_visit_id → op_visits(id)` — ties queue rows to a visit.
- `station_id → stations(id)` — physical location.

**Indexes / uniqueness:**
- `(tenant_id, station_id, status, entered_at)` — live queue board ("show me everyone waiting at the vitals room, oldest first").
- `(tenant_id, patient_id, status) WHERE status IN ('waiting','in_service')` — "where is this patient right now?".
- `(parent_queue_id) WHERE parent_queue_id IS NOT NULL` — side-trip resolution.

**State transitions:**
- `waiting` (arrived in queue) → `in_service` (token called) → `completed` (service done) → patient moves on (next queue row created).
- `waiting|in_service` → `left` (patient walks out without completing service — captured for owner abandonment metrics).

**Side-trip pattern:** when a doctor sends the patient to billing mid-consultation:
1. Doctor's queue row stays `in_service` (consultation is paused).
2. New row at billing: `parent_queue_id = doctor's queue row.id`, `return_to_provider_id = doctor.id`.
3. After billing: billing row closes (`completed`); a new queue row at the doctor's station is opened pointing back via `parent_queue_id`.
4. Eventually the original doctor's row is closed only when the consultation actually finishes.

---

## 5. Cross-References

- **Patient identity:** [TSD-03 Patient Master](03-patient-master.md). Both `op_visits` and `patient_queue` are registered mergeable tables (TSD-03 §4.4).
- **State catalog and transitions:** [TSD-04 Patient Journey](04-patient-journey.md) — `op_visits.current_state_code` is synced from `patient_journey_events`; `stations` is the FK target for `patient_queue.station_id`.
- **Booking that created the visit:** [TSD-05 Appointments](05-appointments.md) — `op_visits.appointment_id`.
- **Clinical artefacts:** [TSD-07 Clinical Consultation](07-clinical-consultation.md) — vitals, consultations, prescriptions all FK to `op_visits.id`.
- **Lab / radiology orders:** TSD-08 / TSD-09 *(Batch C)* — `lab_orders.op_visit_id`, `radiology_orders.op_visit_id`.
- **Invoices:** TSD-12 Billing *(Batch D)* — `invoices.op_visit_id`.
- **OP→IP transfer:** [phase-2/15-ipd-admissions.md](phase-2/15-ipd-admissions.md) — `ip_admissions.op_visit_id` links the IP stay to the originating OP visit (BRD §1 OPD locked: OP→IP path).
- **MLC linkage:** Phase 2 — `mlc_records.op_visit_id` mirrors `op_visits.mlc_number`.

---

## 6. Schema Review Notes

- [ ] **suggestion** — Drop the deprecated `op_visits.status varchar` column entirely; nothing should read it. The runbook flags it as DEPRECATED already. Cleanup in v8 migration.
- [ ] **question** — BRD §1 OPD includes a state `awaiting_report_review` where the visit "stays open across shift boundaries and calendar days." Today `op_visits.visit_date` is a `date` — does the visit get one row per calendar day or one row that spans days? Implications: doctor's "Reports Ready" inbox queries, owner's daily census counts, billing aggregation. **Likely answer:** one row that spans days, with `visit_date` = original visit date; the journey ledger captures the multi-day timeline. Confirm before finalising the doctor's-console TSD.
- [ ] **suggestion** — `op_visits.token_number` is a denormalised string. Consider dropping and joining `tokens` on `(context_table='op_visits', context_id=op_visits.id)` when the display needs it. Trade-off: query cost vs schema cleanliness. Flagging.
- [ ] **suggestion** — `patient_queue.queue_position` is an int that needs recomputation when rows close. Consider deriving on read (`row_number()` over (waiting rows ordered by entered_at)) and dropping the column. Removes a class of "position got out of sync" bugs at the cost of one window function per queue render.
- [ ] **question** — BRD §1 OPD step 14 (abandonment): "patient leaves without completing service." That maps to `patient_queue.status='left'` here, but who sets it — automatic timeout or explicit staff action? Affects the owner's abandonment-rate metric. Surface for product decision.
- [ ] **suggestion** — `op_visits` has no `closed_at` timestamp. Visit closure is implied by `current_state_code` reaching a terminal state. Adding `closed_at` (set by trigger when entering a terminal state) makes "duration of visit" queries cheap. Impact: small column, large analytics convenience.
- [ ] **question** — Side-trip pattern — when a patient does multiple side-trips in a row (doctor → billing → lab → billing → back to doctor), do we chain `parent_queue_id` linearly or do they all point back to the doctor row? The runbook example chains linearly. Confirm; this affects how the doctor's "where did my patient go?" UI walks the chain.
