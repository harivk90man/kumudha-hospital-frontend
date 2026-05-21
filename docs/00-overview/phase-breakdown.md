# Phase Breakdown — Project Contract

> **This is the project contract.** It defines what ships in each phase. Changes to this document require explicit agreement between the hospital and the development team.
>
> **Master scope authority** → [vision-and-scope.md](vision-and-scope.md)
> **Architectural principles** → [architecture-principles.md](architecture-principles.md)
> **Flow-level scope tags** → [../01-brd/hospital-flows.md](../01-brd/hospital-flows.md)

---

## Phase 1 — Current Build

> **Goal:** A fully functional OPD + billing + pharmacy + lab system. A patient can walk in, be seen by a doctor, get tests done, receive a prescription, pay their bill, and leave. The hospital owner has full operational visibility.

| Feature Area | Flows Covered | Status |
|---|---|---|
| Patient registration and UHID | OPD Flow §1 (steps 1–2) | ✅ In Scope |
| Appointment booking (walk-in, phone, app) | Appointment Flow §4 | ✅ In Scope |
| Queue management and token system | OPD Flow §1, Doctor Flow §5 | ✅ In Scope |
| Nurse vitals recording (OPD) | OPD Flow §1 (steps 5–6) | ✅ In Scope |
| OPD consultation (doctor flow) | Doctor Flow §5 | ✅ In Scope |
| Lab and radiology (OPD) | Lab & Radiology Flow §7 | ✅ In Scope |
| Pharmacy dispensing and stock | Pharmacy Flow §8 | ✅ In Scope |
| Billing and payments | Billing Flow §9 | ✅ In Scope |
| Hospital owner dashboard | Hospital Owner Flow §12 | ✅ In Scope |
| Platform admin (vendor support) | Platform Admin Flow §13 | ✅ In Scope |
| Medicine inventory and purchase orders | Pharmacy Flow §8, step 9 | ✅ In Scope |

---

## Phase 2 — Next Build

> **Goal:** Full inpatient management. A patient can be admitted, assigned a bed, tracked through daily clinical cycles, undergo surgery if needed, and be discharged with a consolidated bill.

| Feature Area | Flows Covered | Notes |
|---|---|---|
| IPD admission (all entry points) | IPD Flow §2 | Schema drafted in v8, UI not built |
| Bed management and room transfers | IPD Flow §2-D, Discharge Flow §10 | bed_assignments, beds, rooms tables ready |
| Nurse / ward flow (IPD) | Nurse / Ward Flow §6 | Nursing notes, shift handover, medication admin |
| Surgery and OT management | IPD Flow §2-F | OT rooms, surgery_schedules, surgery_team tables ready |
| Discharge flow | Discharge Flow §10 | Discharge summary, final bill, bed release |
| Emergency flow | Emergency Flow §3 | Triage, emergency admission, MLC initiation |
| Insurance / TPA (manual) | Insurance / TPA Flow §11 | Pre-auth, claim filing, claim tracking — may move to Phase 3 |
| IPD lab billing (running bill) | Lab & Radiology Flow §7 (IPD note) | Auto-add to running bill; configurable toggle |
| HR and attendance | — | Staff check-in, leave, shift rosters |

---

## Phase 3 — Future

> **Goal:** National integration, patient self-service, advanced analytics, and SaaS multi-hospital expansion.

| Feature Area | Notes |
|---|---|
| ABDM / national health stack | Ayushman Bharat Digital Mission integration |
| Patient mobile app | Appointment booking, report viewing, bill preview |
| Telemedicine | Video consultation, remote prescription |
| Multi-location / multi-hospital | Branch management, consolidated owner reporting |
| Advanced analytics and EMR | Full electronic medical record, population health dashboards |
| Insurance / TPA full automation | Automated claim submission and settlement (if moved from Phase 2) |
| Payroll | Salary processing, statutory deductions |
| Pricing schemes | Corporate / EWS / government tariff support |
| External referring physician tracking | Attribution and commission management |

---

## What Is Deliberately Never Built

- Generic EMR product — features stay driven by real hospital operations
- Microservices split — modular monolith on PostgreSQL is the permanent choice
- Destructive financial edits — immutable invoices, credit note pattern forever
