# Glossary

Domain terms used across BRD, schema, and UI. If a term isn't here, it should be.

## Patient journey

| Term | Meaning |
|------|---------|
| **OPD** | Outpatient Department — patient comes in, sees doctor, leaves the same day |
| **IPD** | Inpatient Department — patient is admitted to a bed |
| **Day Care** | Procedures requiring a few hours of observation but no overnight stay (Phase 2) |
| **ER / Casualty / Emergency** | Walk-in or ambulance arrivals needing immediate care |
| **Triage** | Severity assessment at emergency entry. Codes used: red (critical) / yellow (serious) / green (mild) |
| **Discharge Summary** | Final document handed to an IPD patient at discharge — diagnosis, treatment given, take-home meds, follow-up date |
| **Visit / Encounter** | A single hospital interaction — has a start, status transitions, and a close. Stored in `op_visits` (OP) or `ip_admissions` (IP) |
| **Side-trip** | When a patient leaves their primary station to visit another (e.g. doctor → lab → back to doctor). Tracked via `patient_queue.parent_queue_id` |

## Records & identifiers

| Term | Meaning |
|------|---------|
| **UHID** | Unique Health Identifier — patient's permanent ID across all visits. Format `KH-YYYY-NNNNNN` |
| **TEMP-UHID** | Provisional UHID for emergency entry. Format `TEMP-KH-YYYY-NNNNNN`. Merged into a permanent UHID later |
| **OP Number** | Per-visit OP identifier, e.g. `OP-2026-58821`. UNIQUE on `op_visits` |
| **IP Number** | Per-stay IP identifier. UNIQUE on `ip_admissions` |
| **MLC Number** | Medico-legal case number, written into `op_visits.mlc_number` when `is_mlc=TRUE` |
| **MRD** | Medical Records Department — long-term archive of patient files |
| **EMR** | Electronic Medical Record — the digital patient file inside this system |
| **Chief Complaint** | Patient's stated reason for the visit, captured before the doctor sees them |
| **Vitals** | BP (systolic/diastolic), pulse, temperature, SpO₂, weight, blood sugar |

## Scheduling & queueing

| Term | Meaning |
|------|---------|
| **Slot** | A bookable time window on a doctor's calendar. UNIQUE per (doctor, date, time) |
| **Token** | The numbered queue position issued at request time. Format like `D-04` (doctor), `L-12` (lab), `P-08` (pharmacy). Never reused |
| **Station** | A physical service-point — front desk, billing, vitals room, doctor:naveen, lab, radiology, pharmacy. Stored in `stations`; FK target for queue + journey events |
| **Patient Queue** | Live snapshot of which station the patient is at right now. Closed when the patient leaves a station, opened at the next |

## State machine

| Term | Meaning |
|------|---------|
| **State Catalog** | Codes 100–710 in `patient_states`. Phase 0 = ER, 1–6 = OP lifecycle, 7+ = IP lifecycle. Every transition appends to `patient_journey_events` |
| **Hybrid state model** | State lives in two places — append-only `patient_journey_events` (truth) and denormalized `current_state_code` on `op_visits` / `ip_admissions` (fast read), kept in sync by trigger |
| **Blocking state** | A state the patient cannot leave until something resolves (e.g. `awaiting_billing`, `awaiting_vitals`). Marked `is_blocking=TRUE` in `patient_states` |
| **Terminal state** | End-of-journey state (e.g. `completed`, `discharged`). Marked `is_terminal=TRUE` |
| **SLA** | Target time before patient should leave a given state. Measured against `sla_minutes` on `patient_states` |

## Clinical catalogues

| Term | Meaning |
|------|---------|
| **CBC** | Complete Blood Count |
| **LFT** | Liver Function Test |
| **RFT** | Renal Function Test |
| **CRP** | C-Reactive Protein |
| **ESR** | Erythrocyte Sedimentation Rate |
| **HbA1C** | Glycated Haemoglobin (3-month sugar average) |
| **HBsAg** | Hepatitis B surface Antigen |
| **HCV** | Hepatitis C Virus antibody |
| **BT** | Bleeding Time |
| **MLC** | Medico-Legal Case |
| **NDPS** | Narcotic Drugs and Psychotropic Substances Act — governs Schedule X medicines |
| **NABL** | National Accreditation Board for Testing and Calibration Laboratories |
| **SAC** | Services Accounting Code (GST classification for services) |
| **HSN** | Harmonized System of Nomenclature (GST classification for goods) |
| **MCCD** | Medical Certificate of Cause of Death (Phase 2 deferred item) |

See [blood-test-catalogues.md](../02-catalogues/blood-test-catalogues.md) for full panel definitions.

## Money & operations

| Term | Meaning |
|------|---------|
| **GST / CGST / SGST / IGST** | Goods & Services Tax + central / state / inter-state splits. Stored on `invoice_items` |
| **GSTR-1** | Monthly GST return; export view is `v_gstr1_export` |
| **TPA** | Third-Party Administrator — handles insurance claims on behalf of the insurer |
| **Pre-auth** | Pre-authorisation — insurance approval before a planned procedure |
| **Co-pay** | The portion of a covered bill the patient pays out of pocket |
| **FEFO** | First-Expiry-First-Out — pharmacy dispensing order against `medicine_batches` |
| **Idempotency key** | UUID on payments / pharmacy sales that ensures retried requests can't double-charge |
| **Optimistic locking** | The `version`-column pattern used on `invoices`, `payments`, `ip_admissions`, etc. |

## Roles

| Term | Meaning |
|------|---------|
| **Receptionist / Front Desk** | Registration, appointments, consultation fee collection |
| **Cashier** | Billing and end-of-day cash closure |
| **Pharmacist** | Dispenses medicines, manages pharmacy stock |
| **Lab Technician** | Collects samples and produces lab reports |
| **Radiographer / Radiologist** | Performs imaging / interprets imaging |
| **Hospital Owner** | Has full visibility — revenue, staff, occupancy, alerts |
| **Admin Manager** | Slot configuration, doctor schedules, master data, user management |
