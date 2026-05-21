# TSD 04: Patient Journey

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

The state machine and physical-location tracking that tells the system "where is this patient right now, and what is supposed to happen to them next." Three separate concerns kept together because they describe the same domain — the lifecycle of a single visit from registration to closure:

1. **`patient_states`** — the *catalog* of every state a patient can be in (codes 100–710), with SLA targets, owning department, and whether the state blocks progression.
2. **`stations`** — the *physical service points* (front desk, billing, vitals room, doctor:priya, lab, pharmacy) where staff serve patients.
3. **`patient_journey_events`** — the *append-only ledger* of every state transition. Source of truth for analytics, SLA monitoring, and bottleneck detection. Every dashboard query that says "patient X is at vitals" is, under the covers, reading the latest `patient_journey_events` row plus the synced `op_visits.current_state_code` (denormalised by trigger from this ledger).

The hybrid pattern: the ledger is the truth, the denormalised state code on `op_visits` / `ip_admissions` is the fast read.

The live queue itself (which patient is in front of which station, in what order) lives in `patient_queue` — see [TSD-06 OPD Encounters §4.2](06-opd-encounters.md).

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — every numbered step transitions a state (`waiting → with_doctor → at_lab → awaiting_report_review → consultation_complete`).
- [4. Appointment Booking](../01-brd/hospital-flows.md#4-appointment-booking-flow) — `arrived` event when patient checks in; `no_show` after expiry.
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — Reports Ready queue is patients in `awaiting_report_review`; "Call next" writes a `in_consultation` event.
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — `imaging_pending`, `sample_collected`, `result_released` transitions.
- [8. Pharmacy Flow](../01-brd/hospital-flows.md#8-pharmacy-flow) — `pharmacy_pending`, `dispensed` transitions; pharmacy_decline path.
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — turnaround time and bottleneck dashboards aggregate `patient_journey_events`.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `patient_states` | Reference data — state codes 100–710 with phase, SLA, blocking flag, owning department, display colour. |
| `stations` | Physical service-point registry — front desk, billing, vitals room, doctor:N, lab, pharmacy, radiology. |
| `patient_journey_events` | Append-only ledger of every state transition. Drives dashboards, SLA reports, bottleneck analysis. |

---

## 4. Table Specifications

### 4.1 `patient_states`

**Purpose:** Reference catalog. Defines every legal state the system can place a patient into. State codes are intentionally numeric and grouped by *phase* (Phase 0 = Emergency, Phase 1–6 = OP lifecycle, Phase 7 = terminal, Phase 8–9 = IP). Each state declares an SLA target (minutes after which the patient is considered overdue), a `is_blocking` flag (TRUE = patient cannot advance past this point until something happens), and the department that owns it.
**Lifecycle:** seed data — populated by migration; rarely changed at runtime.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| code | int | NO | PK | — | Numeric state code (100–710). Stable; never re-numbered. |
| label | varchar | NO | — | — | Short slug, e.g. `awaiting_doctor`, `consultation_done` |
| phase | int | NO | — | — | 0=ER, 1–6=OP lifecycle, 7=terminal, 8–9=IP |
| phase_label | varchar | NO | — | — | Human label for the phase (`Outpatient`, `Lab`, `Pharmacy`, `Closed`) |
| department | varchar | YES | — | — | Owning department slug (`opd`, `lab`, `pharmacy`, `radiology`, `er`, `ipd`, NULL for cross-cutting) |
| color | varchar | YES | — | — | UI hint (hex / token) for the live-queue board |
| derived_from | varchar | YES | — | — | Which underlying layer drove this state (e.g. `payment`, `lab`, `consultation`) |
| sla_minutes | int | YES | — | — | Target time before patient should leave this state. NULL = no SLA. |
| is_blocking | boolean | NO | — | FALSE | TRUE means patient cannot proceed until this state resolves |
| is_terminal | boolean | NO | — | FALSE | TRUE means lifecycle has ended (visit closed) |
| description | text | YES | — | — | Free-form clinician-readable description |

**Indexes / uniqueness:**
- `code` is PK.
- `(phase, code)` indexed for phase-scoped queries (e.g. "all OP states").

**Initial seed:** see [docs/03-schema/state-catalog.md](../03-schema/state-catalog.md) for the full code list. Examples: `100=walk_in_arrived`, `110=registered`, `120=awaiting_vitals`, `140=awaiting_doctor`, `150=in_consultation`, `160=consultation_done`, `200=awaiting_billing`, `220=paid`, `300=lab_pending`, `400=imaging_pending`, `500=pharmacy_pending`, `600=closed`, `701=admitted`, `710=discharged`.

---

### 4.2 `stations`

**Purpose:** Physical service-point registry. One row per place where staff serve patients. Slug-based (`front_desk`, `billing`, `vitals`, `doctor:priya`, `lab_collection`, `lab_processing`, `pharmacy_counter`, `radiology_xray`). FK target for `patient_queue.station_id` and `patient_journey_events.station_id`.
**Lifecycle:** mutable; soft-delete via `is_active=false`. Doctor-bound stations (`doctor:priya`) are managed alongside `users` lifecycle.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| slug | varchar | NO | UNIQUE per tenant | — | URL-safe slug (e.g. `front_desk`, `doctor:priya`) |
| display_name | varchar | NO | — | — | Human label shown on dashboards |
| station_type | varchar | NO | CHECK ∈ {'front_desk','billing','vitals','doctor','lab_collection','lab_processing','radiology','pharmacy','er_triage','ip_ward'} | — | Category for grouping and routing |
| location | varchar | YES | — | — | Floor / room number for wayfinding |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, slug)` UNIQUE.
- `(tenant_id, station_type, is_active)` for "list active doctor stations" queries.

---

### 4.3 `patient_journey_events`

**Purpose:** Append-only ledger of every state transition for every visit. Each row records `from_state → to_state` plus the station, the user who triggered it, the duration spent in the previous state (precomputed for fast SLA queries), and an optional metadata blob for context (invoice id, return-to-provider id, etc.).

This is the **truth**. The `current_state_code` columns on `op_visits` and `ip_admissions` are denormalised projections of "the latest row in this ledger for this visit," kept in sync by trigger `fn_sync_op_visit_state` (and the IP equivalent). **App code never writes to `current_state_code` directly** — it inserts into this ledger and lets the trigger update the projection.

**Lifecycle:** **append-only** — no UPDATE, no DELETE. 7-year retention. Partition by `RANGE (occurred_at)` monthly when row count exceeds 10M.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope (added in v8 to close cross-tenant audit gap) |
| patient_id | UUID | NO | FK → patients(id) | — | Subject patient |
| op_visit_id | UUID | YES | FK → op_visits(id) | — | OP visit (NULL when transition is for IP only) |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | IP admission (NULL for OP-only transitions) |
| from_state_code | int | YES | FK → patient_states(code) | — | Previous state. NULL for the first event of a visit. |
| to_state_code | int | NO | FK → patient_states(code) | — | New state |
| station_id | UUID | YES | FK → stations(id) | — | Where the transition physically happened |
| duration_in_prev_state_seconds | int | YES | — | — | Precomputed: `occurred_at - prev_event.occurred_at`. Lets dashboards aggregate without window functions. |
| triggered_by_user_id | UUID | YES | FK → users(id) | — | Who caused the change (NULL for system-driven transitions) |
| reason | text | YES | — | — | Free-form context (e.g. "patient left without paying", "doctor override") |
| metadata | jsonb | YES | — | — | Snapshot, e.g. `{invoice_id, return_to_provider_id, parent_queue_id}` |
| occurred_at | timestamptz | NO | — | now() | Indexed for time-window queries |

**Indexes / uniqueness:**
- `(patient_id, occurred_at DESC)` — full timeline for one patient.
- `(op_visit_id, occurred_at DESC)` partial WHERE `op_visit_id IS NOT NULL` — visit timeline.
- `(tenant_id, to_state_code, occurred_at DESC)` — "all patients currently in state X" via the state-sync projection.
- `(tenant_id, occurred_at)` — base partition key.

**Triggers (consequences of an INSERT here):**
- `fn_sync_op_visit_state` (AFTER INSERT) — updates `op_visits.current_state_code = NEW.to_state_code` when `op_visit_id IS NOT NULL`.
- `fn_sync_ip_admission_state` (AFTER INSERT) — updates `ip_admissions.current_state_code` when `ip_admission_id IS NOT NULL`.
- `fn_compute_prev_duration` (BEFORE INSERT) — fills `duration_in_prev_state_seconds` from the previous row for this visit.

**Append-only enforcement:** application-level (data-access layer); strongly recommended to add a `BEFORE UPDATE OR DELETE` trigger that raises an exception. See §6.

---

## 5. Cross-References

- **Identity / staff:** [TSD-01 Platform & Tenancy](01-platform-tenancy.md) (`triggered_by_user_id`).
- **Audit on append-only writes:** [TSD-02 Audit, Events & Notifications](02-audit-events-notifications.md). Every journey-event insert also emits a `domain_events` row of type `PatientStateChanged` for downstream subscribers (notifications, analytics).
- **Patients:** [TSD-03 Patient Master](03-patient-master.md). `patient_journey_events` is a registered mergeable table — listed in `patient_mergeable_tables`.
- **OP visits / patient queue:** [TSD-06 OPD Encounters](06-opd-encounters.md). `op_visits.current_state_code` is the synced projection from this ledger.
- **Appointments and tokens:** [TSD-05 Appointments](05-appointments.md). `arrived`, `no_show`, `cancelled` events fire here.
- **Lab / Radiology / Pharmacy:** TSD-08 / 09 / 10 *(Batch C)* — each writes its own state transitions.
- **Owner dashboard SLA / bottleneck:** TSD-14 Reports & Analytics *(Batch E)* — materialised views aggregate from this ledger.

---

## 6. Schema Review Notes

- [ ] **suggestion** — Add `BEFORE UPDATE OR DELETE` trigger on `patient_journey_events` raising an exception, to enforce append-only at DB level. Same for `audit_logs` and `domain_events` in TSD-02. Flagged across all three.
- [ ] **suggestion** — `to_state` and `from_state` were noted as DEPRECATED varchar columns in the runbook (kept for back-compat). Drop them entirely in the v8 migration once nothing reads them. Impact: minor cleanup; reduces row width.
- [ ] **suggestion** — `patient_states.code` is `int`. Consider making it the **same** PK type used elsewhere (UUID) for consistency. Counter-argument: numeric codes are human-readable in logs (`100`, `200`) and are deliberately stable across deploys. Keep as-is. Flagging for record only.
- [ ] **question** — `duration_in_prev_state_seconds` is computed by trigger from the previous row. What happens for the **first** event of a visit (no previous row)? Default to 0 or NULL? Spec implies NULL via the `[null]` marker. Confirm in trigger implementation.
- [ ] **question** — Allowed-transitions enforcement (e.g. cannot go from `walk_in_arrived` directly to `dispensed`) is currently *not* in the schema. Do we want a `patient_state_transitions(from_code, to_code)` lookup the trigger validates against? **BRD-relevant**: §1 OPD locks specific transition orders. Surface for decision — small data table, big safety win.
- [ ] **suggestion** — `metadata jsonb` is free-form; we should at least document the keys we expect (`invoice_id`, `return_to_provider_id`, `parent_queue_id`, `lab_order_id`, `radiology_order_id`, `pharmacy_sale_id`, `mlc_number`). Add a "metadata key registry" subsection here once Batch C identifies all uses.
- [ ] **question** — When a merge happens (TSD-03), the source patient's `patient_journey_events` are repointed to the target. The from/to state codes remain intact, but the timeline now interleaves two prior identities. Should the merge add a synthetic event marking the merge time on the target? Helps timeline UI explain the discontinuity. Surface for user decision.
