# Vision and Scope — Kumudha Hospital HMS

> **Master authority for project scope.** All other documents defer to this file on questions of what is in scope, what is out of scope, and why. Do not duplicate scope decisions elsewhere — reference this file instead.
>
> **Companion documents:**
> - Phase-by-phase feature breakdown → [phase-breakdown.md](phase-breakdown.md)
> - Architectural design principles and technical assumptions → [architecture-principles.md](architecture-principles.md)
> - End-to-end flows (with scope tags on every flow) → [../01-brd/hospital-flows.md](../01-brd/hospital-flows.md)
> - Schema rationale and module deep dive → [../03-schema/hms_schema_runbook.md](../03-schema/hms_schema_runbook.md)

---

## What We Are Building

Hospital Management System (HMS) for **Kumudha Hospital, Villupuram, Tamil Nadu** (`tenant_code = KH`). The system supports the full clinical, operational, and financial workflow for a mid-size multi-specialty hospital.

## Operational Scale (Kumudha Hospital today)

- **60–70 OPD visits per day** across multiple specialties
- **10–20 surgeries per month**
- **~50 staff** across front desk, nursing, doctors, pharmacy, lab, radiology, ward, HR, admin
- **Inpatient ward + ICU + 3 operation theatres**
- **In-house pharmacy, lab, and radiology** departments

---

## Architecture Intent — Why the Schema Goes Beyond v1 Scope

> **This paragraph is important. Read it before making any design decisions.**

The HMS is designed with an **encounter-centric architecture** to support future IPD and Emergency expansion without redesign. Every clinical event, billing charge, and state transition is anchored to an encounter (`op_visit` or `ip_admission`) — never hardcoded to OPD only. However, IPD and Emergency workflows are **intentionally excluded from v1 implementation scope**. The schema tables for IP, Surgery, Beds, Nursing, and OT are already drafted and present in the database (so we never face a "big migration" moment), but they are not surfaced in the v1 application UI. This is a deliberate deferral, not an architectural gap.

---

## Design Priorities (in order)

1. **Clinical safety** — accurate vitals, prescriptions, lab results, medication administration logs; critical results acknowledged within SLA
2. **Financial integrity** — every rupee tracked, attributable, audit-ready; GST split enforced; refunds and adjustments via credit notes (no destructive edits)
3. **Operational visibility** — at-a-glance state of every patient, every queue, every bed
4. **Regulatory compliance** — MLC register, NDPS narcotic register, NABL / audit trails, append-only event logs
5. **AI-friendly extensibility** — schema designed so AI assistants and engineers can extend without breaking invariants
6. **Multi-tenant from day 1** — single-hospital deployment now, but `tenant_id` everywhere so SaaS expansion needs zero migration later

---

## v1 — In Scope (13 Modules)

| # | Module | Key Tables | Notes |
|---|--------|---|---|
| 5.1 | Core / Platform | tenants, users, roles, audit_logs, domain_events | Multi-tenancy, RBAC, append-only logs |
| 5.2 | Patient Master | patients, patient_merges, uhid_sequences | UHID generation, demographics, dedup/merge |
| 5.3 | Patient Journey / Workflow | patient_states, stations, patient_journey_events | State machine + queue topology + event log |
| 5.4 | Scheduling | appointment_slots, appointments, tokens | Doctor calendars, slot lock, never-reused tokens |
| 5.5 | Patient Encounters | op_visits, patient_queue, ip_admissions (shell only) | Visit shells + live queue position |
| 5.6 | Clinical | vitals, consultations, prescriptions, physio_sessions | Per-encounter clinical data |
| 5.7 | Billing | invoices, invoice_items, services, service_price_history | Charge capture, GST, price audit |
| 5.8 | Cash & Closure | payments, payees, payment_allocations, cash_sessions | Money-in / money-out + EOD reconciliation |
| 5.11 | Lab | lab_tests, lab_orders, lab_results | Test catalogue + orders + auto-flagged results |
| 5.12 | Radiology | radiology_studies, radiology_orders, radiology_reports | Imaging orders + reports + DICOM refs |
| 5.13 | Pharmacy | pharmacy_sales, pharmacy_sale_items, narcotic_register | Prescription dispensing + OTC + NDPS |
| 5.14 | Inventory | medicines, medicine_batches, stock_movements, purchase_orders | FEFO dispensing, batch + expiry, PO lifecycle |
| 5.15 | Reports / Analytics | mv_revenue_daily, mv_outstanding_dues, … | Owner dashboard, daily/weekly reports |

> Module 5.14 (Inventory) is kept in v1 — though full warehouse features are Phase 2 — because doctors need real-time medicine stock at prescription time.

---

## Phase 2 — Deferred (schema drafted, UI not built)

| # | Module | What is deferred |
|---|--------|---|
| 5.9 | IP (Inpatient) | Bed management, ward assignment, daily IP billing, running bill, room transfers |
| 5.10 | Surgery | OT booking, surgical packages, anaesthesia notes, pre/post-op flow |
| 5.16 | HR · Attendance | Staff check-in, leave management, shift rosters |
| 5.17 | Payroll | Salary processing, statutory deductions |

**Also deferred to Phase 2:** Emergency Flow, Nurse / Ward Flow, Discharge Flow, Insurance / TPA Flow.

> The schema for all Phase 2 modules is already present in v8 — they are not surfaced in the v1 UI but require no migration to enable.

---

## What We Are Not (v1)

- Not a generic EMR product — features are driven by Kumudha Hospital's actual operations
- Not automating insurance settlement end-to-end — only manual claim filing and tracking
- Not integrating with ABDM / national health stack (Phase 3 candidate)
- Not building a native mobile app (Phase 3 candidate)
- Not a microservices architecture — modular monolith on PostgreSQL is the deliberate choice

---

## Future Phase Candidates (not yet committed)

- **Phase 3:** ABDM / national health stack integration, patient mobile app, telemedicine, multi-location / multi-hospital onboarding, advanced analytics, full EMR
- Insurance / TPA full automation (currently Phase 2; may move to Phase 3 — decision deferred)

See [phase-breakdown.md](phase-breakdown.md) for the full phased feature list.
