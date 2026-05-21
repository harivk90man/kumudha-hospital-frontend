# TSD 05: Appointments & Tokens

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

The booking layer that sits in front of an OPD encounter. Three concerns:

1. **`appointment_slots`** — the doctor's daily slot grid (typically 15-min granularity), generated from `doctor_profiles.available_days` × `slot_duration_mins`. A slot is `available`, `booked`, `blocked`, or `cancelled`. Capacity = 1 patient per slot by default.
2. **`appointments`** — booked appointments. One per slot. The booking channel (`walk_in`, `phone`, `online`, `referral`) is recorded so reception/owner reports can split traffic by channel.
3. **`tokens`** — the visible identifier patients hear called out (`D-04`, `L-12`, `P-08`). Tokens are issued at request time, are scoped to one `(tenant, service_type, provider, date)`, and **are never reused** — a cancelled token's number stays cancelled forever for that day. The v8 fix (two partial UNIQUE indexes) handles `provider_id IS NULL` cases (lab and pharmacy queue tokens) correctly.

This TSD is the contract between the BRD's Appointment Booking flow (BRD §4) and the OPD encounter that follows (TSD-06).

---

## 2. BRD Flows Covered

- [4. Appointment Booking](../01-brd/hospital-flows.md#4-appointment-booking-flow) — three booking channels (walk-in counter, app self-service, phone via receptionist), cancellation (immediately frees slot; no refund), no-show (slot expires; token removed), late arrival (added to end of queue unless manually moved).
- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — token issuance (step 5), token call by doctor.
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — Scheduled patients pane = today's appointments by slot.
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — service-counter tokens (`L-04`) for lab queue.
- [8. Pharmacy Flow](../01-brd/hospital-flows.md#8-pharmacy-flow) — service-counter tokens (`P-08`) for pharmacy queue.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `appointment_slots` | Doctor's daily slot grid (15-min default). Status = available / booked / blocked / cancelled. |
| `appointments` | Booked appointment — one per slot. Records channel (walk-in / app / phone / referral) and lifecycle status. |
| `tokens` | Issued service tokens (`D-04`, `L-12`, `P-08`). Never reused; partial UNIQUE indexes handle non-provider tokens. |

---

## 4. Table Specifications

### 4.1 `appointment_slots`

**Purpose:** A doctor's daily slot grid. Generated daily from `doctor_profiles.available_days` × `slot_duration_mins` for the next N days. A slot is `available` (open for booking), `booked` (one appointment attached), `blocked` (admin reserved — leave / surgery / training), or `cancelled` (slot itself was withdrawn).
**Lifecycle:** mutable; created by a daily job and on-demand when a doctor's schedule is extended.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| doctor_id | UUID | NO | FK → users(id) | — | The doctor |
| slot_date | date | NO | — | — | Local date of the slot |
| slot_time | time | NO | — | — | Local start time |
| duration_mins | int | NO | — | 15 | Slot length (defaults to `doctor_profiles.slot_duration_mins`) |
| status | varchar | NO | CHECK ∈ {'available','booked','blocked','cancelled'} | 'available' | Current state |
| booked_by | UUID | YES | FK → users(id) | — | Receptionist / staff who booked (NULL if patient-self-service) |
| blocked_reason | text | YES | — | — | Required when `status='blocked'` |
| created_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `(doctor_id, slot_date, slot_time)` UNIQUE — no duplicate slots for the same doctor.
- `(tenant_id, slot_date, status)` — used by the doctor's calendar UI and the booking screen ("show me available slots tomorrow").

**State transitions:**
- `available` → `booked` (on booking) → `available` (on cancellation) **or** `cancelled` (rare — slot withdrawn).
- `available` → `blocked` (admin reserves) → `available` (block lifted).

---

### 4.2 `appointments`

**Purpose:** A booked appointment. Always pinned to a slot (`slot_id`); the slot is the source of truth for time. Records the booking channel — important for the Hospital Owner's "patients by source" report.
**Lifecycle:** mutable; cancelled / no-show rows are kept for audit and analytics.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| patient_id | UUID | NO | FK → patients(id) | — | Booking patient |
| doctor_id | UUID | NO | FK → users(id) | — | Booked doctor |
| slot_id | UUID | YES | FK → appointment_slots(id) | — | The slot. NULL allowed for legacy / walk-in arrivals that bypass slot grid. |
| appointment_no | varchar | NO | UNIQUE | — | Human-readable, e.g. `APT-2026-12431` |
| scheduled_at | timestamptz | NO | — | — | Denormalised slot start (UTC) for sorting |
| visit_type | varchar | NO | CHECK ∈ {'new','follow_up','emergency','procedure'} | 'new' | Drives consultation fee (TSD-13 `payment_consultation`) |
| status | varchar | NO | CHECK ∈ {'booked','confirmed','arrived','in_consultation','completed','cancelled','no_show'} | 'booked' | Lifecycle state |
| source | varchar | NO | CHECK ∈ {'walk_in','phone','online','referral'} | — | Booking channel |
| reason | text | YES | — | — | Why the patient is coming (chief complaint, free text) |
| cancelled_at | timestamptz | YES | — | — | Set on cancellation |
| cancelled_by | UUID | YES | FK → users(id) | — | Cancelling user (NULL when patient self-cancels via app) |
| cancel_reason | text | YES | — | — | Free-form; required for non-self cancellations |
| created_by | UUID | YES | FK → users(id) | — | Booking staff (NULL for app-self-service — see TSD-03 §6 open question on `created_via`) |
| created_at | timestamptz | NO | — | now() | |
| updated_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `appointment_no` UNIQUE.
- `(slot_id) WHERE status NOT IN ('cancelled','no_show')` partial UNIQUE — at most one active booking per slot.
- `(tenant_id, doctor_id, scheduled_at DESC)` — doctor's calendar query.
- `(tenant_id, patient_id, scheduled_at DESC)` — patient's appointment history.
- `(tenant_id, status, scheduled_at)` — "all booked appointments today".

**State transitions** (BRD §4):
- `booked` → `confirmed` (reminder ack) → `arrived` (patient checks in) → `in_consultation` (doctor calls token) → `completed` (consultation closes).
- `booked|confirmed` → `cancelled` (immediate; releases slot back to `available`).
- `booked|confirmed` → `no_show` (after slot expiry threshold).
- `arrived → late_arrival` (handled in `patient_queue` rather than this status — see §6 open question).

---

### 4.3 `tokens`

**Purpose:** The visible queue identifier — what patients hear called out and what corridor display boards show. Issued at the moment the service is requested (consultation booking, lab order placed, pharmacy bill opened); never reused after cancellation. Provider-scoped tokens (consultation `D-*`) and counter-scoped tokens (lab `L-*`, pharmacy `P-*`, billing `B-*`) coexist via the polymorphic `(context_table, context_id)` link.
**Lifecycle:** mutable on `status`; rows are kept forever (cancelled tokens persist so the same `token_sequence` is never reissued for that day).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| token_number | varchar | NO | — | — | Display string, e.g. `D-04`, `L-12`, `P-08`, `X-03` |
| token_sequence | int | NO | — | — | Sequential per `(tenant, service_type, provider_id, issue_date)` |
| service_type | varchar | NO | CHECK ∈ {'consultation','lab','pharmacy','radiology','billing'} | — | Service category |
| provider_id | UUID | YES | FK → users(id) | — | NULL for service-counter tokens (lab `L-*`, pharmacy `P-*`, radiology `X-*`) |
| issue_date | date | NO | — | — | Local date the token was issued |
| slot_id | UUID | YES | FK → appointment_slots(id) | — | Locks this token to a specific slot (consultation tokens) |
| op_visit_id | UUID | YES | FK → op_visits(id) | — | Set for consultation tokens (`D-*`) |
| lab_order_id | UUID | YES | FK → lab_orders(id) | — | Set for lab tokens (`L-*`) |
| pharmacy_sale_id | UUID | YES | FK → pharmacy_sales(id) | — | Set for pharmacy tokens (`P-*`) |
| radiology_order_id | UUID | YES | FK → radiology_orders(id) | — | Set for radiology tokens (`X-*`) |
| invoice_id | UUID | YES | FK → invoices(id) | — | Set for billing-counter tokens (`B-*`) |
| status | varchar | NO | CHECK ∈ {'active','called','completed','cancelled','no_show'} | 'active' | Lifecycle |
| issued_by | UUID | YES | FK → users(id) | — | Issuing staff (NULL for system-issued tokens) |
| issued_at | timestamptz | NO | — | now() | |
| called_at | timestamptz | YES | — | — | Set when token is called from the queue |
| completed_at | timestamptz | YES | — | — | Set when service finishes |

**Constraints:**

- `CHECK (num_nonnulls(op_visit_id, lab_order_id, pharmacy_sale_id, radiology_order_id, invoice_id) = 1)` — exactly one parent FK is set. The DB enforces context integrity.
- `CHECK ((service_type = 'consultation') = (op_visit_id IS NOT NULL))` — service_type and the populated FK must agree.
- `CHECK ((service_type = 'lab') = (lab_order_id IS NOT NULL))`
- `CHECK ((service_type = 'pharmacy') = (pharmacy_sale_id IS NOT NULL))`
- `CHECK ((service_type = 'radiology') = (radiology_order_id IS NOT NULL))`
- `CHECK ((service_type = 'billing') = (invoice_id IS NOT NULL))`

**Indexes / uniqueness — v8 token-sequence fix:**

The original UNIQUE constraint `(tenant_id, service_type, provider_id, issue_date, token_sequence)` broke for non-provider tokens because `NULL <> NULL` in SQL. Replaced with **two partial unique indexes**:

- `uq_tokens_with_provider`: `(tenant_id, service_type, provider_id, issue_date, token_sequence) WHERE provider_id IS NOT NULL` — consultation tokens, scoped per doctor per day.
- `uq_tokens_no_provider`: `(tenant_id, service_type, issue_date, token_sequence) WHERE provider_id IS NULL` — service-counter tokens (lab, pharmacy, radiology), scoped per service per day.

Together these guarantee no `token_sequence` is reissued, regardless of whether the token is provider-scoped.

Other indexes (one per parent FK, partial WHERE NOT NULL):
- `op_visit_id` partial WHERE `op_visit_id IS NOT NULL` — "what token does this OP visit have?".
- `lab_order_id`, `pharmacy_sale_id`, `radiology_order_id`, `invoice_id` — same pattern, partial.
- `(tenant_id, service_type, status, issue_date)` — live queue board ("active consultations for Dr. Priya today").

**State transitions:**
- `active` (issued) → `called` (called by provider) → `completed` (service done).
- `active|called` → `cancelled` (booking cancelled or patient leaves).
- `active|called` → `no_show` (patient never showed up by end of slot).

**Atomic re-allocation:** when an appointment is rescheduled, the old token AND the old slot are released **in one transaction** so a partial state cannot exist.

---

## 5. Cross-References

- **Doctor calendar template feeds slot generation:** [TSD-01 Platform & Tenancy](01-platform-tenancy.md) §4.4 `doctor_profiles.available_days` + `slot_duration_mins`. *Open: shape of `available_days` JSON to be locked — see TSD-01 §6.*
- **Patient identity:** [TSD-03 Patient Master](03-patient-master.md). `appointments` is a registered mergeable table.
- **State transitions on arrival / cancel / no-show:** [TSD-04 Patient Journey](04-patient-journey.md) — every `appointments.status` change writes a `patient_journey_events` row.
- **Encounter created when patient arrives:** [TSD-06 OPD Encounters](06-opd-encounters.md) — `op_visits.appointment_id` links back here.
- **Notifications (reminder, no-show alert, late-arrival ping):** [TSD-02 Audit, Events & Notifications](02-audit-events-notifications.md).
- **Tokens for lab/pharmacy/radiology contexts:** TSD-08, 09, 10 *(Batch C)*.
- **Consultation fee derived from `visit_type`:** TSD-13 Payments *(Batch D)* §`payment_consultation`.

---

## 6. Schema Review Notes

- [ ] **question** — BRD §4 *Late Arrival* says "added to end of queue unless manually moved." This is a queue-position concern (TSD-06 `patient_queue`), not an `appointments.status`. Confirm: late arrival uses `appointments.status='arrived'` + late flag in `patient_queue.metadata`, **not** a separate status. Resolution affects the `appointments.status` CHECK constraint above.
- [ ] **suggestion** — `appointments.scheduled_at` denormalises `appointment_slots.slot_date + slot_time`. Consider a generated column derived from the slot, or drop it if app code can join. Trade-off: denormalisation makes the booked-appointments index simpler. Keep as-is for now.
- [ ] **question** — BRD §4 says cancellations "no refund" — but consultations are paid per BRD §1 OPD step 4. If a patient cancels after paying, what happens to the payment? (Treated as on-account credit? Lost? Refundable via credit note?) Affects TSD-13 Payments and the cancellation flow. Surface for user decision.
- [x] **Polymorphic FK on tokens** — **resolved 2026-05-10**: replaced `(context_table, context_id)` with five nullable FK columns + CHECK exactly-one-non-null + agreement CHECKs against `service_type`. Per [00-conventions.md §FK patterns](00-conventions.md#fk-patterns): default to separate columns for AI-assisted development.
- [ ] **question** — BRD §4 *App self-service*: who is `created_by` on `appointments` when a patient books via the app? Linked to TSD-03 §6 open question on `created_via`. Resolve together.
- [ ] **suggestion** — `tokens.token_number` is a display string built from `service_type` and `token_sequence` (e.g. `D-04`). Today both columns can drift. Consider a generated column: `token_number = service_prefix(service_type) || '-' || lpad(token_sequence::text, 2, '0')`. Impact: removes a class of "display says D-04, sequence says 5" bugs.
- [ ] **suggestion** — `appointment_slots` are generated daily — that's a heavy job for hospitals with many doctors. Consider a virtual-slot model (slots derived on-the-fly from `doctor_profiles.available_days`) where rows are written **only on first booking**. Trade-off: simpler scheduling but harder "block this slot" UX. Defer; mention for v2.
