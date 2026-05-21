# TSD 07: Clinical Consultation

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

What clinicians record during an OP encounter. Seven tables that hang off [TSD-06 `op_visits`](06-opd-encounters.md):

1. **`vitals`** — BP, pulse, temperature, weight, blood sugar, SpO₂, BMI, pain score. Captured by the nurse at the pre-consultation desk (BRD §1 step 6).
2. **`consultations`** — the doctor's record: chief complaint, history of present illness, examination findings, ICD-10 diagnoses, clinical notes, advice, the `next_action` decision (prescription only / lab ordered / admit IP / surgery referral / follow-up).
3. **`diagnosis_templates`** — reusable templates per specialty. Saves doctors typing common workups (e.g. "URTI with cough" auto-fills exam, common Rx, common tests).
4. **`prescriptions`** + **`prescription_items`** — Rx header + individual drug rows. `dispensed_qty` increments as pharmacy dispenses; status reaches `dispensed` when complete.
5. **`doctor_recommendations`** — non-Rx outputs of the consultation: physio referral, surgery referral, admission, follow-up booking, lab/radiology referrals (separate from immediate orders).
6. **`consultation_drafts`** — autosave for in-progress consultations (BRD §5 Doctor flow: "draft clinical notes — not visible until locked"). Cleaned up after 7 days unless restored.

Together these capture the clinical record that a future doctor (or insurer) reads to understand what happened.

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — step 6 (vitals), step 12 (consultation), step 14 (Rx + diagnosis), step 15 (lab order from doctor).
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — entire flow: dashboard split view, full medical history, consultation template system, real-time stock checks, medicine picker with stock status, draft clinical notes (not visible until locked), follow-up date.
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — `consultations.next_action='lab_ordered'` triggers an order. Lab order specifics live in TSD-08.
- [8. Pharmacy Flow](../01-brd/hospital-flows.md#8-pharmacy-flow) — `prescription_items.dispensed_qty` increments at dispense; partial dispense supported.
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — consultation fee derived from `appointments.visit_type` × `doctor_profiles.consultation_fee` / `follow_up_fee`.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `vitals` | Nurse-recorded vitals (BP, pulse, temp, weight, BSL, SpO₂, BMI, pain score) before consultation. |
| `consultations` | Doctor's full record: complaint, history, exam findings, ICD-10 dx, plan, next action. |
| `diagnosis_templates` | Reusable template per specialty (default exam + common Rx + common tests). |
| `prescriptions` | Prescription header — one per consultation. Status drives pharmacy workflow. |
| `prescription_items` | Individual Rx lines (drug + dose + frequency + duration + qty). `dispensed_qty` tracks fulfilment. |
| `doctor_recommendations` | Non-Rx outputs: physio / surgery / admission / follow-up / lab / radiology referrals. |
| `consultation_drafts` | Autosaved in-progress consultations (per BRD: not visible until locked). 7-day TTL. |

---

## 4. Table Specifications

### 4.1 `vitals`

**Purpose:** Snapshot of vital signs at a point in time. In OP, recorded by the nurse before the doctor sees the patient (BRD §1 step 6); in IP, recorded periodically per ward shift (Phase 2). Multiple `vitals` rows per visit are allowed — e.g. recheck after BP medication.
**Lifecycle:** mutable for typo correction within a short window (usually 15 min); audit-logged. Not soft-deleted.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| patient_id | UUID | NO | FK → patients(id) | — | Subject |
| op_visit_id | UUID | YES | FK → op_visits(id) | — | OP context (NULL for IP-only) |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | IP context (Phase 2) |
| bp_systolic | int | YES | — | — | mm Hg |
| bp_diastolic | int | YES | — | — | mm Hg |
| pulse_rate | int | YES | — | — | bpm |
| spo2 | int | YES | CHECK 0–100 | — | % |
| temperature_f | decimal(4,1) | YES | — | — | Fahrenheit |
| respiratory_rate | int | YES | — | — | breaths / min |
| weight_kg | decimal(5,2) | YES | — | — | kg |
| height_cm | decimal(5,2) | YES | — | — | cm |
| bmi | decimal(4,2) | YES | GENERATED ALWAYS AS (weight_kg / NULLIF((height_cm/100)^2, 0)) STORED | — | Computed when both height and weight are present |
| blood_sugar_mg_dl | int | YES | — | — | mg/dL (random or fasting; specify in `notes`) |
| pain_score | int | YES | CHECK 0–10 | — | 0–10 numeric rating scale |
| notes | text | YES | — | — | Free-form context (e.g. "fasting BSL", "post-meal") |
| recorded_by | UUID | NO | FK → users(id) | — | Capturing staff (typically a nurse) |
| recorded_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `(op_visit_id, recorded_at DESC)` — show vitals timeline for this visit.
- `(patient_id, recorded_at DESC)` — patient history.

---

### 4.2 `consultations`

**Purpose:** The doctor's clinical record for one OP visit. Multi-diagnosis support via the `diagnoses jsonb[]` array (each entry: `{icd10, desc, type}` where `type` ∈ `primary | secondary | provisional | rule_out`). The `next_action` column captures the doctor's discharge decision and drives downstream flows (Rx-only, lab, admission referral).
**Lifecycle:** mutable while the consultation is open; **locked** when the doctor clicks "Complete" — after which it is read-only (drafts table covers in-progress edits).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| op_visit_id | UUID | NO | UNIQUE, FK → op_visits(id) | — | One consultation per OP visit |
| patient_id | UUID | NO | FK → patients(id) | — | Subject |
| doctor_id | UUID | NO | FK → users(id) | — | Treating doctor |
| chief_complaint | text | YES | — | — | Patient-stated primary complaint |
| history_of_present_illness | text | YES | — | — | HPI narrative |
| past_history | text | YES | — | — | Free-form past medical history (PMH) — also denormalised from `patients.chronic_conditions` for snapshot |
| examination_findings | jsonb | YES | — | — | Structured exam: `{general, cvs, rs, p_a, cns, locomotor, …}` |
| diagnoses | jsonb[] | NO | — | '{}' | Array of `{icd10, desc, type}`. GIN-indexed for ICD-10 search across visits. |
| symptoms | text | YES | — | — | Patient-reported symptoms |
| clinical_notes | text | YES | — | — | Free-form impressions |
| advice | text | YES | — | — | Patient-facing advice (printed on prescription) |
| vitals_snapshot | jsonb | YES | — | — | Frozen snapshot of latest `vitals` at consultation time |
| next_action | varchar | NO | CHECK ∈ {'prescription_only','lab_ordered','radiology_ordered','admit_ip','surgery_referral','follow_up','referred_external','no_action'} | — | Discharge decision |
| follow_up_required | boolean | NO | — | FALSE | Convenience flag |
| follow_up_date | date | YES | — | — | Set when `follow_up_required=TRUE` |
| admission_required | boolean | NO | — | FALSE | OP→IP transfer flag |
| surgery_required | boolean | NO | — | FALSE | Surgery referral flag |
| physio_required | boolean | NO | — | FALSE | Physio referral flag |
| locked_at | timestamptz | YES | — | — | Set when doctor clicks Complete; row becomes read-only |
| created_at | timestamptz | NO | — | now() | |
| updated_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `op_visit_id` UNIQUE — one consultation per visit.
- GIN `(diagnoses)` — ICD-10 search across visits ("how many diabetes cases this month?").
- `(tenant_id, doctor_id, created_at DESC)` — doctor's recent consultations.
- `(tenant_id, follow_up_required, follow_up_date) WHERE follow_up_required = TRUE` — follow-up reminder queue.

---

### 4.3 `diagnosis_templates`

**Purpose:** Reusable consultation templates per specialty / department. A doctor selecting "URTI with cough" auto-fills exam findings, common Rx items, and the routine lab tests for that diagnosis. Speeds up high-volume OP days; templates are tenant-scoped and editable by the owner.
**Lifecycle:** mutable; soft-delete via `is_active=false`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| template_name | varchar | NO | — | — | E.g. "URTI with cough", "Hypertension follow-up" |
| department_id | UUID | YES | FK → departments(id) | — | Owning department (NULL = general) |
| specialty | varchar | YES | — | — | Specialty slug (e.g. `dermatology`, `paediatrics`) |
| icd10_code | varchar | YES | — | — | Primary ICD-10 the template encodes |
| diagnosis_text | text | NO | — | — | Plain-English diagnosis text |
| template_json | jsonb | NO | — | — | Default `examination_findings`, `common_meds[]` (drug + default dose), `common_tests[]` |
| default_advice | text | YES | — | — | Default `consultations.advice` |
| default_followup_days | int | YES | — | — | Default follow-up window |
| created_by | UUID | YES | FK → users(id) | — | Creating doctor / owner |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, department_id, is_active)` — list templates available for a department.
- `(tenant_id, lower(template_name))` — search by name.

---

### 4.4 `prescriptions`

**Purpose:** Prescription header — one per consultation. Status drives the pharmacy fulfilment workflow.
**Lifecycle:** mutable on `status` only (state machine below). Items are added before lock; modifications after lock require a new prescription.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| consultation_id | UUID | NO | UNIQUE, FK → consultations(id) | — | One Rx per consultation |
| patient_id | UUID | NO | FK → patients(id) | — | Subject |
| doctor_id | UUID | NO | FK → users(id) | — | Prescribing doctor |
| status | varchar | NO | CHECK ∈ {'draft','active','dispensed','partially_dispensed','cancelled'} | 'draft' | Pharmacy fulfilment lifecycle |
| locked_at | timestamptz | YES | — | — | Set when consultation is locked; before that, items can be edited |
| created_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `consultation_id` UNIQUE.
- `(tenant_id, patient_id, created_at DESC)` — patient's Rx history.
- `(tenant_id, status, created_at DESC) WHERE status IN ('active','partially_dispensed')` — pharmacy inbox.

**State transitions:**
- `draft` (consultation in progress) → `active` (consultation locked) → `partially_dispensed` (some items dispensed) → `dispensed` (all items dispensed).
- `draft|active|partially_dispensed` → `cancelled` (e.g. doctor reissues with corrections).

---

### 4.5 `prescription_items`

**Purpose:** One row per drug on the prescription. `dispensed_qty` increments as the pharmacy dispenses; the parent `prescriptions.status` is recomputed when items change.
**Lifecycle:** mutable while parent `prescriptions.status='draft'`; immutable after lock except for `dispensed_qty` (incremented by pharmacy).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| prescription_id | UUID | NO | FK → prescriptions(id) | — | Parent Rx |
| medicine_id | UUID | NO | FK → medicines(id) | — | Drug from catalogue (TSD-10) |
| medicine_name_snapshot | varchar | NO | — | — | Frozen name in case the catalogue entry changes later |
| dosage | varchar | NO | — | — | E.g. `500 mg`, `5 ml` |
| frequency | varchar | NO | — | — | E.g. `1-0-1`, `BD AC`, `SOS` |
| duration_days | int | NO | — | — | Number of days |
| instructions | text | YES | — | — | Free-form (`take with food`, `avoid driving`) |
| quantity_prescribed | int | NO | — | — | Total units to dispense |
| dispensed_qty | int | NO | — | 0 | Running total dispensed by pharmacy |
| sequence_no | int | NO | — | — | Display order on the printed Rx |

**Indexes / uniqueness:**
- `(prescription_id, sequence_no)` UNIQUE — stable display order.
- `(prescription_id, medicine_id)` — duplicate-drug check.

---

### 4.6 `doctor_recommendations`

**Purpose:** Non-Rx outputs of a consultation that need follow-up by other staff: physio referral, surgery scheduling, admission planning, follow-up booking, lab/radiology referrals (distinct from immediate orders that have their own tables). A queue for nurses / front desk to actively work through.
**Lifecycle:** mutable on `status` and `notes`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| consultation_id | UUID | NO | FK → consultations(id) | — | Originating consultation |
| patient_id | UUID | NO | FK → patients(id) | — | Subject |
| recommendation_type | varchar | NO | CHECK ∈ {'physio','surgery','admission','follow_up','lab','radiology','specialist_referral'} | — | Category |
| physio_session_id | UUID | YES | FK → physio_sessions(id) | — | Set when `recommendation_type='physio'` *(physio_sessions is Phase 2)* |
| surgery_schedule_id | UUID | YES | FK → surgery_schedules(id) | — | Set when `recommendation_type='surgery'` *(Phase 2)* |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | Set when `recommendation_type='admission'` *(Phase 2)* |
| follow_up_appointment_id | UUID | YES | FK → appointments(id) | — | Set when `recommendation_type='follow_up'` and the appointment is already booked |
| lab_order_id | UUID | YES | FK → lab_orders(id) | — | Set when `recommendation_type='lab'` |
| radiology_order_id | UUID | YES | FK → radiology_orders(id) | — | Set when `recommendation_type='radiology'` |
| referral_id | UUID | YES | — | — | External referral id when `recommendation_type='specialist_referral'` (no internal FK target — text only) |
| notes | text | YES | — | — | Free-form |
| priority | varchar | NO | CHECK ∈ {'routine','urgent','stat'} | 'routine' | Triage |
| status | varchar | NO | CHECK ∈ {'open','scheduled','completed','cancelled','declined'} | 'open' | Lifecycle |
| created_at | timestamptz | NO | — | now() | |
| updated_at | timestamptz | NO | — | now() | |

**Constraints:**
- `CHECK (num_nonnulls(physio_session_id, surgery_schedule_id, ip_admission_id, follow_up_appointment_id, lab_order_id, radiology_order_id) <= 1)` — at most one internal FK is set. (Zero is allowed when the recommendation is `open` and no entity has been created yet — e.g. surgery referred but not yet scheduled.)
- `CHECK ((recommendation_type = 'specialist_referral') OR (referral_id IS NULL))` — `referral_id` is only meaningful for external specialist referrals.

**Indexes / uniqueness:**
- `(tenant_id, status, recommendation_type, priority)` — nurse / front-desk worklist.
- `(consultation_id)` — list all recs for a consultation.
- `(patient_id, status, created_at DESC)` — patient's open referrals.
- One partial index per FK column WHERE `<col> IS NOT NULL` — reverse lookup ("what recommendation produced this lab order?").

---

### 4.7 `consultation_drafts`

**Purpose:** Autosave for in-progress consultations. BRD §5 Doctor flow: "draft clinical notes — not visible until locked." This table holds those drafts so a power outage / browser crash doesn't lose the doctor's typing.
**Lifecycle:** ephemeral. `expires_at` triggers cleanup after 7 days unless the draft is restored into a live consultation.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| doctor_id | UUID | NO | FK → users(id) | — | Owning doctor (only the owner sees this draft) |
| patient_id | UUID | NO | FK → patients(id) | — | Subject |
| op_visit_id | UUID | YES | FK → op_visits(id) | — | OP context |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | IP context (Phase 2) |
| draft_data | jsonb | NO | — | — | Snapshot of all consultation fields at autosave time |
| autosave_count | int | NO | — | 0 | How many times this draft has been autosaved (UX metric) |
| last_saved_at | timestamptz | NO | — | now() | |
| expires_at | timestamptz | NO | — | now() + interval '7 days' | Cleanup boundary |
| restored_at | timestamptz | YES | — | — | Set when the draft is loaded into a real consultation; row can be deleted |

**Indexes / uniqueness:**
- `(doctor_id, op_visit_id) WHERE op_visit_id IS NOT NULL` UNIQUE partial — one OP draft per doctor per visit.
- `(expires_at) WHERE restored_at IS NULL` — cleanup sweep.

**Privacy:** drafts are visible only to the owning doctor. Critical because the BRD explicitly states drafts are not visible to other staff until locked.

---

## 5. Cross-References

- **Patient identity:** [TSD-03 Patient Master](03-patient-master.md). `vitals`, `consultations`, `prescriptions` are registered mergeable tables.
- **Visit anchor:** [TSD-06 OPD Encounters](06-opd-encounters.md). Every table here FKs to `op_visits.id`.
- **State transitions:** [TSD-04 Patient Journey](04-patient-journey.md). Consultation lock writes a `consultation_done` event; Rx creation writes a `pharmacy_pending` event.
- **Audit + draft autosave events:** [TSD-02 Audit, Events & Notifications](02-audit-events-notifications.md). `consultation_drafts` does NOT emit audit rows on every autosave (would explode `audit_logs`); only restores are audited.
- **Lab / radiology orders triggered by `next_action`:** TSD-08 / TSD-09 *(Batch C)* — `consultations.next_action='lab_ordered'` opens a `lab_orders` row.
- **Pharmacy dispense increments `prescription_items.dispensed_qty`:** TSD-10 Pharmacy & Inventory *(Batch C)*.
- **Consultation fee derives from `appointments.visit_type`:** TSD-13 Payments *(Batch D)* — `payment_consultation`.
- **Document templates for prescription printout:** [TSD-02 §4.5 `document_templates`](02-audit-events-notifications.md#45-document_templates) (`template_type='prescription'`).

---

## 6. Schema Review Notes

- [ ] **suggestion** — `consultations.diagnoses jsonb[]` with each entry typed as `{icd10, desc, type}` is flexible but loose. Consider a child table `consultation_diagnoses(consultation_id, icd10, desc, type, sequence)` for FK integrity, indexed search, and per-row audit. Trade-off: one more table; ICD-10 GIN index moves to a relational index. Flagging — runbook chose array for one-shot snapshot semantics.
- [ ] **suggestion** — `prescription_items.medicine_name_snapshot` duplicates `medicines.name`. The snapshot is intentional (medicine catalogue can change after Rx is written). Keep, but document the snapshot semantics here so devs don't try to "normalise it away."
- [ ] **question** — BRD §5 Doctor flow: "real-time stock checks" while prescribing — the doctor's UI needs to show stock status next to each medicine. That's a read against `medicine_batches` (TSD-10). Today nothing in `prescription_items` records the stock status seen by the doctor at prescribing time. Should we snapshot `available_qty_at_prescribe` for audit? Useful when patient complains "doctor said it was in stock." Surface for product decision.
- [ ] **suggestion** — `consultations.locked_at` is set when the doctor clicks Complete. Consider a DB-level `BEFORE UPDATE` trigger that blocks edits when `locked_at IS NOT NULL` (with an exception for `clinical_notes` corrections within a 60-min window). Today this is application-enforced. Adds belt-and-braces.
- [ ] **question** — `consultations.next_action` enum includes `prescription_only`, `lab_ordered`, `radiology_ordered`. But a single consultation can produce **both** a Rx and a lab order. Should `next_action` be an array, or should we split it into separate boolean flags (`has_prescription`, `has_lab_order`, `has_radiology_order`, `has_admission`, …)? The booleans are arguably more honest. **Affects the BRD §5 'next_action' decision step.** Surface for user decision.
- [ ] **suggestion** — `consultation_drafts.draft_data jsonb` snapshot is an entire consultation form. As that form grows, the JSONB grows. Consider compressing (Postgres TOAST handles this) and adding `last_saved_at DESC` retention so we keep only the last N drafts per `(doctor, visit)`. Defer; v1 is fine with the 7-day TTL.
- [ ] **question** — `vitals` allows multiple rows per visit (BP recheck after meds). The doctor's console shows the *latest* by default. Should we mark the "official" recheck (e.g. `is_recheck` boolean, `replaces_vitals_id` self-FK) so historical analysis can distinguish initial vitals from rechecks? Surface for clinical-data-quality decision.
- [x] **Polymorphic FK on `doctor_recommendations`** — **resolved 2026-05-10**: replaced `reference_id` with per-type nullable FK columns (`physio_session_id`, `surgery_schedule_id`, `ip_admission_id`, `follow_up_appointment_id`, `lab_order_id`, `radiology_order_id`) + `referral_id` for external specialist references + CHECK at-most-one-non-null. Per [00-conventions.md §FK patterns](00-conventions.md#fk-patterns).
- [x] **Language preference** — deferred per user decision 2026-05-10. Cost to add later is low; no historical-data loss in the v1 window.
