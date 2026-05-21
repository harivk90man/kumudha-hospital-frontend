# clinical — Bounded Context

## Schema modules
[11 · Consultation](../../../../../../../../../../docs/03-schema/v3/modules/11-consultation.html)

## Owns
`vitals`, `consultations`, `diagnosis_templates`,
`prescriptions`, `prescription_items`, `doctor_recommendations`

## Depends on
- `platform` — UserQueryService (doctor_id, created_by), ConfigService
- `patient` — PatientQueryService
- `opd` — OpVisitQueryService (link consultation to visit)

## Exposes to other packages
- `ConsultationQueryService` — get consultation by ID, return ConsultationSummary (patient_id, doctor_id, op_visit_id, locked status)
- `PrescriptionQueryService` — get prescription items for a given consultation; verify item is dispensable (not already fully dispensed)

## MS split boundary
Extract as a **clinical / EMR service** when clinical data volume or regulatory requirements (e.g. NMC audit) demand isolation. Prescription data is consumed by pharmacy — that cross-boundary call becomes an HTTP client on PrescriptionQueryService.

## Features
- [consultation](consultation/FEATURE.md) — consultations, diagnosis_templates, consultation lock workflow
- [vitals](vitals/FEATURE.md) — vitals recording and retrieval
- [prescription](prescription/FEATURE.md) — prescriptions, prescription_items, dispensing state tracking
- [recommendation](recommendation/FEATURE.md) — doctor_recommendations (lab, radiology, referral orders)
