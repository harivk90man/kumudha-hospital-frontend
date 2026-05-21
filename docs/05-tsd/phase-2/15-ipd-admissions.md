# TSD 15: IPD — Inpatient Admissions, Wards, Discharge (Phase 2 Stub)

**Status:** Phase 2 — Reference Architecture, deferred
**Source of truth (interim):** [docs/03-schema/hms_schema_runbook.md §5.9 + §5.12 redistributed](../../../03-schema/hms_schema_runbook.md)
**Last updated:** 2026-05-10

---

## Purpose

The inpatient admission lifecycle, end-to-end: admit (multiple entry points), bed allocation with running bill, daily vitals/meds cycle, room change with pro-ration, interim payments, surgery pathway, discharge with bed lifecycle (Occupied → Cleaning → Ready). Plus medico-legal cases (MLC) and the ward / nursing operational tables (handovers, medication administration, nursing notes, physio sessions).

## BRD Flows Covered

- [2. IPD — Inpatient Admission](../../01-brd/hospital-flows.md#2-ipd--inpatient-admission)
- [3. Emergency Flow](../../01-brd/hospital-flows.md#3-emergency-flow) — emergency entry to IP
- [6. Nurse / Ward Flow](../../01-brd/hospital-flows.md#6-nurse--ward-flow)
- [10. Discharge Flow](../../01-brd/hospital-flows.md#10-discharge-flow)

## Tables (names only — full specs deferred)

### Core IPD
- `ip_admissions` — admission aggregate; `current_bed_id` synced by trigger; optimistic-lock version. Phase 1 TSDs already reference this via `op_visits.ip_admission_id` (OP→IP transfer) and `lab_orders.ip_admission_id` / `radiology_orders.ip_admission_id` for IP-context orders.
- `wards` — physical ward registry.
- `beds` — bed registry per ward; status (occupied / cleaning / ready / out_of_service / reserved).
- `bed_assignments` — the assignment ledger (admission, room change, discharge); `from_ts` / `to_ts` for pro-ration.
- `interim_bills` — periodic IP bills generated during stay (day-N billing, post-OT billing).
- `discharge_summaries` — final clinical document at discharge.

### Medico-legal
- `mlc_records` — MLC register; statutory; police intimation tracking; discharge-block until closed.

### Nursing / ward operations
- `nursing_notes` — free-form nursing notes; vitals snapshot; intake/output.
- `medication_administrations` — drug administration log per IP admission; route, dose, time, administered_by.
- `shift_handovers` — outgoing → incoming nurse shift handoff record.
- `patient_handover_notes` — per-patient notes during handover.
- `physio_sessions` — physiotherapy session records; OP and IP both.

## Conventions when expanded

When this stub becomes a full TSD, it will follow:

- [00-conventions.md](../00-conventions.md) — column-spec syntax, FK pattern rule (separate-column default), standard inline audit columns, naming.
- [00-audit-logging.md](../00-audit-logging.md) — Tier-1 audit on every clinical / financial table; `mlc_records` likely on Layer 2 maker-checker (police intimation closure requires sign-off).
- Same critical-review pass as Phase 1 — surface gaps proactively (consent for procedures, identity verification at blood transfusion, drug-administration safety checks, fall-risk assessment, etc.).

## Why deferred

Phase 2 per [phase-breakdown.md](../../00-overview/phase-breakdown.md). Kumudha v1 ships OPD-only.

## Cross-references already present in Phase 1 TSDs

| Phase 1 TSD | Reference |
|---|---|
| [TSD-06 OPD Encounters](../06-opd-encounters.md) | `op_visits.is_emergency`, `op_visits.is_mlc`, `op_visits.mlc_number`; OP→IP transfer flow |
| [TSD-07 Clinical Consultation](../07-clinical-consultation.md) | `vitals.ip_admission_id`, `consultations.admission_required`, `doctor_recommendations` types `admission` / `surgery` |
| [TSD-08 Lab](../08-lab.md) | `lab_orders.ip_admission_id` |
| [TSD-09 Radiology](../09-radiology.md) | `radiology_orders.ip_admission_id` |
| [TSD-10 Pharmacy & Inventory](../10-pharmacy-inventory.md) | `medication_administrations` referenced for IP medication trigger |
| [TSD-12 Billing & Invoicing](../12-billing-invoicing.md) | `invoices.ip_admission_id`, `invoice_items.bed_assignment_id`, invoice types `IP_INTERIM` / `IP_FINAL` |
| [TSD-13 Payments & Cash](../13-payments-cash.md) | `payment_allocations.ip_admission_id` (advance), `payment_allocations.interim_bill_id` |
| [TSD-14 Reports & Analytics](../14-reports-analytics.md) | `mv_bed_occupancy_daily` |
