# TSD 09: Radiology

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

Imaging operations — X-ray, ultrasound, CT, MRI. Four tables that mirror the lab structure but adapted for image-centric workflows:

1. **`radiology_procedures`** — catalog of available procedures (Chest X-ray PA, MRI Brain, USG Abdomen).
2. **`radiology_orders`** — order header per ordering event. Like `lab_orders`: priority, payment-before-service, invoice link, status.
3. **`radiology_studies`** — study metadata for one or more imaging series. Holds the **DICOM Study Instance UID** that bridges to PACS (Picture Archiving and Communication System — typically Orthanc on-prem). Image binaries stay in PACS; the database holds the reference plus thumbnail/preview URLs.
4. **`radiology_reports`** — radiologist's findings + impression. Carries **Layer 2 maker-checker** for senior sign-off on the report before release (radiology reports are signed clinical documents — trainee reads, consultant verifies, mirrors the lab Verified / Override Release pattern).

The image binaries themselves (DICOM files) are not in the database. They live in the PACS via `study_uid`; the database only holds preview URLs and the DICOM Study UID for retrieval.

---

## 2. BRD Flows Covered

- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — step 15–17 (X-ray ordered, billing, performed).
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — radiology images embedded in patient file; "Reports Ready" inbox includes radiology reports.
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — order → payment → identification → study capture → report.
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — `radiology_orders.invoice_id`.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `radiology_procedures` | Catalog of available procedures with modality, body part, default price. |
| `radiology_orders` | Order header — patient, doctor, procedure, priority, payment-before-service, status, invoice link. |
| `radiology_studies` | Study metadata + DICOM Study UID (bridge to PACS). Preview URLs; binaries stay in PACS. |
| `radiology_reports` | Radiologist findings + impression; **Layer 2 maker-checker** for senior sign-off; amendment chain. |

---

## 4. Table Specifications

> *Standard inline audit columns per [00-conventions.md](00-conventions.md#standard-audit-columns) — not repeated below.*

### 4.1 `radiology_procedures`

**Purpose:** Catalog of available imaging procedures. Drives the order-creation UI and pricing.
**Lifecycle:** mutable; soft-delete.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| procedure_code | varchar | NO | UNIQUE per tenant | — | Short code (e.g. `CXR-PA`, `MRI-BR`) |
| procedure_name | varchar | NO | — | — | Display name (`"Chest X-ray PA"`, `"MRI Brain Plain"`) |
| modality | varchar | NO | CHECK ∈ {'xray','ultrasound','ct','mri','mammography','dexa','fluoroscopy','nuclear','other'} | — | Imaging modality |
| body_part | varchar | YES | — | — | E.g. `chest`, `abdomen`, `brain`, `lumbar_spine` |
| with_contrast | boolean | NO | — | FALSE | Procedure-level default; see §6 — contrast is sometimes optional |
| department_id | UUID | YES | FK → departments(id) | — | Owning radiology dept |
| default_price | decimal(10,2) | NO | — | — | Standard price (history in `service_price_history`) |
| typical_duration_mins | int | YES | — | — | Used for slot allocation |
| requires_fasting | boolean | NO | — | FALSE | Affects scheduling / patient prep |
| requires_radiologist_presence | boolean | NO | — | FALSE | TRUE for USG, contrast-CT, fluoroscopy |
| is_active | boolean | NO | — | TRUE | Soft-delete |

**Indexes / uniqueness:**
- `(tenant_id, procedure_code)` UNIQUE.
- `(tenant_id, modality, is_active)` — picklist filter.

---

### 4.2 `radiology_orders`

**Purpose:** One order = one act of ordering an imaging procedure. Multi-procedure orders are recorded as multiple `radiology_orders` rows (no separate items table — radiology orders are typically one procedure each, unlike lab where panels bundle).
**Lifecycle:** mutable on `status`, `invoice_id`, `completed_at`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| order_number | varchar | NO | UNIQUE | — | Human-readable, e.g. `RAD-2026-04582` |
| patient_id | UUID | NO | FK → patients(id) | — | Subject |
| op_visit_id | UUID | YES | FK → op_visits(id) | — | OP context |
| ip_admission_id | UUID | YES | FK → ip_admissions(id) | — | IP context (Phase 2 billing) |
| consultation_id | UUID | YES | FK → consultations(id) | — | Originating consultation |
| doctor_id | UUID | NO | FK → users(id) | — | Ordering doctor |
| radiology_procedure_id | UUID | NO | FK → radiology_procedures(id) | — | Procedure |
| with_contrast | boolean | NO | — | FALSE | Order-level — overrides procedure default |
| clinical_question | text | YES | — | — | What the doctor wants to know (helps the radiologist) — best practice: never order without one |
| priority | varchar | NO | CHECK ∈ {'routine','urgent','stat'} | 'routine' | Drives scheduling and SLA |
| invoice_id | UUID | YES | FK → invoices(id) | — | Linked bill |
| payment_required_before_service | boolean | NO | — | TRUE | Stat orders may set FALSE |
| status | varchar | NO | CHECK ∈ {'ordered','awaiting_payment','paid','imaging_pending','imaging_in_progress','imaging_completed','reporting_pending','reported','released','cancelled'} | 'ordered' | Lifecycle |
| ordered_at | timestamptz | NO | — | now() | |
| imaging_completed_at | timestamptz | YES | — | — | Set when tech finishes capture |
| released_at | timestamptz | YES | — | — | Set when report is released |

**Indexes / uniqueness:**
- `order_number` UNIQUE.
- `(tenant_id, patient_id, ordered_at DESC)` — patient's imaging history.
- `(tenant_id, status, priority, ordered_at)` — radiology worklist.
- `(consultation_id)` — Rx lookup.

---

### 4.3 `radiology_studies`

**Purpose:** Bridge to the DICOM PACS. Each `radiology_study` represents one captured study — typically one per order, but for multi-series exams (e.g. multi-phase CT) one study still holds many series referenced as `images_url[]`. The DICOM `study_uid` is the immutable reference into the PACS.
**Lifecycle:** mutable on `images_url`, `preview_url`, `images_count`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| radiology_order_id | UUID | NO | FK → radiology_orders(id) | — | Parent order |
| study_uid | varchar | NO | UNIQUE | — | DICOM Study Instance UID (`1.2.840.10008…`) — the immutable PACS reference |
| accession_number | varchar | NO | UNIQUE | — | DICOM accession number — visible in PACS UI; mirrors `radiology_orders.order_number` |
| modality | varchar | NO | — | — | Snapshot from `radiology_procedures.modality` (in case procedure is later edited) |
| body_part | varchar | YES | — | — | Snapshot |
| technique | text | YES | — | — | Tech's notes — kVp, mA, contrast volume, etc. |
| images_count | int | NO | — | 0 | Number of image files in the study |
| images_url | text[] | NO | — | '{}' | Preview / thumbnail URLs (PACS or object-store); full DICOM stays in PACS via study_uid |
| pacs_archive_status | varchar | NO | CHECK ∈ {'pending','archived','retrieval_failed'} | 'pending' | PACS push status |
| technician_id | UUID | NO | FK → users(id) | — | Capturing tech |
| study_started_at | timestamptz | NO | — | now() | When capture began |
| study_completed_at | timestamptz | YES | — | — | When capture finished |

**Indexes / uniqueness:**
- `study_uid` UNIQUE.
- `accession_number` UNIQUE.
- `(radiology_order_id)` — typically one study per order; if multiple, all listed.

---

### 4.4 `radiology_reports`

**Purpose:** The signed clinical document — radiologist's findings, impression, and recommendation. Carries **Layer 2 maker-checker** for senior sign-off (junior radiologist reads → consultant verifies → released). Supports amendment via `amended_from_report_id` self-FK.
**Lifecycle:** mutable on `release_status`, `approved_*`, `findings`, `impression` (until released).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| radiology_order_id | UUID | NO | FK → radiology_orders(id) | — | Parent order |
| study_id | UUID | YES | FK → radiology_studies(id) | — | The study being reported on |
| findings | text | YES | — | — | Section-by-section observations |
| impression | text | YES | — | — | Diagnostic impression — the headline for the doctor |
| recommendation | text | YES | — | — | Suggested follow-up or further imaging |
| reported_by_radiologist_id | UUID | NO | FK → users(id) | — | Reading radiologist |
| dictated_at | timestamptz | YES | — | — | When dictation completed |
| **release_status** | varchar | NO | CHECK ∈ {'pending_verification','verified','released','amended','rejected'} | 'pending_verification' | Drives whether the doctor sees this report |
| report_attachment_id | UUID | YES | FK → file_attachments(id) | — | Final PDF (rendered from template + findings + impression) |
| **amended_from_report_id** | UUID | YES | FK → radiology_reports(id) | — | Self-FK — set when this report corrects a previously-released one |
| **amendment_reason** | text | YES | — | — | Required when `amended_from_report_id IS NOT NULL` |

*+ Layer 2 maker-checker columns (`approval_status`, `approved_by`, `approved_at`, `rejection_reason`) per [00-audit-logging.md §3](00-audit-logging.md#3-layer-2--maker-checker-columns-7-sensitive-tables). Junior radiologist drafts → `approval_status='pending_approval'`; consultant verifies → `approved_by`/`approved_at` set, `release_status='released'`. Correction Needed: `approval_status='rejected'` with `rejection_reason` returns the report to draft.*

**Constraints:**
- `CHECK ((amended_from_report_id IS NULL) OR (amendment_reason IS NOT NULL AND length(amendment_reason) > 10))` — amendments need a real reason.
- `CHECK ((release_status = 'released') = (approval_status = 'approved' AND approved_by IS NOT NULL))` — released reports have an approver.
- `CHECK (created_by <> approved_by)` — separation of duties: dictating radiologist ≠ verifying consultant. (Single-radiologist hospitals: relax this CHECK via tenant-config flag — see §6.)

**Indexes / uniqueness:**
- `(tenant_id, release_status, dictated_at DESC) WHERE release_status='pending_verification'` partial — consultant's inbox.
- `(radiology_order_id)` — reports for one order; chained via `amended_from_report_id` for the amendment trail.
- `(reported_by_radiologist_id, dictated_at DESC)` — radiologist productivity report.

**Trigger:**
- `fn_radiology_release_event` (AFTER UPDATE OF release_status) — when status moves to `released`, emits `domain_events` row of type `RadiologyReportReleased`; subscribed by the doctor's "Reports Ready" inbox notifier.

---

## 5. Cross-References

- **Patient identity:** [TSD-03 Patient Master](03-patient-master.md). All Tier-1 radiology tables FK to `patients(id)`.
- **Visit anchor:** [TSD-06 OPD Encounters](06-opd-encounters.md) — `radiology_orders.op_visit_id`.
- **State transitions** on order, capture, release: [TSD-04 Patient Journey](04-patient-journey.md) — events for `imaging_pending`, `imaging_completed`, `report_released`.
- **Originating consultation:** [TSD-07 Clinical Consultation](07-clinical-consultation.md) — `radiology_orders.consultation_id`. `doctor_recommendations.radiology_order_id` can also point here.
- **Token at radiology counter:** [TSD-05 Appointments §4.3](05-appointments.md#43-tokens) — `tokens.radiology_order_id`.
- **Billing:** TSD-12 Billing & Invoicing *(Batch D)* — `radiology_orders.invoice_id`.
- **PACS integration:** external system; this TSD bridges via `study_uid` + `accession_number`. Operational config (PACS hostname, AE title, modality worklist server) lives in `system_config`.
- **File attachments for the rendered PDF report:** [TSD-02 §4.6](02-audit-events-notifications.md#46-file_attachments).

---

## 6. Schema Review Notes

### Resolved (2026-05-10)
- [x] **Layer 2 maker-checker on `radiology_reports`** — added (junior reads, consultant verifies). Note: not on user's original 7-table list, but BRD §7 implies the same pattern as lab; flagging as proactive addition.
- [x] **Standard inline audit columns** on every mutable table.
- [x] **No polymorphic FKs** in this TSD — all parent links are named.

### Open
- [!] **blocker (potential)** — Layer 2 maker-checker on `radiology_reports` includes `CHECK (created_by <> approved_by)`. Many small hospitals have a **single radiologist** who both reads and signs. This CHECK would block them. **Surface to user**: do we (a) make the CHECK conditional on `system_config['radiology.require_dual_signoff']`, or (b) drop it and rely on policy? Adding the proactive Layer 2 was a design call — confirming acceptable.
- [ ] **suggestion** — `radiology_reports.findings` and `impression` are free `text` today. For structured reporting (BI-RADS for mammography, RECIST for oncology, Lung-RADS for screening CT), structured templates outperform free text. Consider `findings_jsonb` for structured reporting + free-text `findings_narrative` for prose. Defer; v1 free text is fine.
- [ ] **suggestion** — `radiology_studies.images_url` is the preview / thumbnail set; full DICOM is in PACS. If PACS goes down, the doctor still has the rendered PDF report (`report_attachment_id`) but loses image review. Document the runbook for PACS outage in the operational doc.
- [ ] **question** — Multi-study orders (e.g. CT abdomen with delayed phase imaging) — does the system create one `radiology_studies` row with multi-series `images_url[]` or multiple rows? Today the design supports either; locking the convention before app build will save AI codegen confusion.
- [ ] **suggestion** — `radiology_procedures.with_contrast` as a boolean is a simplification — many CTs have contrast-optional. The `radiology_orders.with_contrast` overrides at order time. Consider: is this enough? A consent step is needed for IV contrast (allergy, renal function) — that lives in a future `patient_consents` table (deferred per Tier 2).
- [ ] **suggestion** — Critical findings (e.g. "intracranial haemorrhage on CT") need the same alert mechanism as lab criticals — page the ordering doctor immediately, not just inbox. Add a `is_critical_finding` flag + alert trigger? Defer to next safety-pass review.
- [ ] **question** — Radiology referrals to external imaging centres (when hospital lacks MRI) — how is that modelled? Today: out of scope; orders are for in-house procedures only. Flag for Phase 2 if external referrals become common.
- [ ] **suggestion** — `radiology_studies.pacs_archive_status='retrieval_failed'` flags PACS push failures. Add a retry queue + alert? Operational concern; defer to ops doc.
