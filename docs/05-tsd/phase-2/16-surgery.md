# TSD 16: Surgery (Phase 2 Stub)

**Status:** Phase 2 — Reference Architecture, deferred
**Source of truth (interim):** [docs/03-schema/hms_schema_runbook.md §5.10](../../../03-schema/hms_schema_runbook.md)
**Last updated:** 2026-05-10

---

## Purpose

Surgical scheduling, OT (operation theatre) management, anaesthesia records, and surgical-package pricing. Closely coupled to IPD ([TSD-15](15-ipd-admissions.md)) — most surgeries follow an IP admission and feed into discharge summaries.

## BRD Flows Covered

- [2. IPD — Inpatient Admission §F. Surgery Pathway](../../01-brd/hospital-flows.md#2-ipd--inpatient-admission)

## Tables (names only — full specs deferred)

- `surgery_schedules` — booked surgery; surgeon, anaesthetist, OT, scheduled time, estimated duration, status.
- `operation_theatres` — OT registry (count, equipment, status).
- `anaesthesia_records` — anaesthesia type, drugs given, vitals during, induction/recovery times.
- `surgical_packages` — bundled-pricing for procedures (knee replacement, C-section).

## Conventions when expanded

- Standard inline audit columns + Layer 2 maker-checker on `surgical_packages` (price changes require approval).
- Consent capture at scheduling time (surgical consent + anaesthesia consent + photo consent) — links to the future `patient_consents` table (deferred per Tier 2 compliance pass).
- Identity-verification audit at OT entry (Site Marking, Time Out, WHO Surgical Safety Checklist) — links to a future `verification_checks` table.

## Why deferred

Phase 2. Kumudha's OT operations join in a later phase per [phase-breakdown.md](../../00-overview/phase-breakdown.md).

## Cross-references already present in Phase 1 TSDs

| Phase 1 TSD | Reference |
|---|---|
| [TSD-07 Clinical Consultation](../07-clinical-consultation.md) | `consultations.surgery_required`, `doctor_recommendations.surgery_schedule_id` |
| [TSD-12 Billing & Invoicing](../12-billing-invoicing.md) | `invoice_items.surgery_schedule_id`, `item_type='surgery'` |
