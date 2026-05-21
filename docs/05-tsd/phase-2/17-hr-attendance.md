# TSD 17: HR & Attendance (Phase 2 Stub)

**Status:** Phase 2 — Reference Architecture, deferred
**Source of truth (interim):** [docs/03-schema/hms_schema_runbook.md §5.16](../../../03-schema/hms_schema_runbook.md)
**Last updated:** 2026-05-10

---

## Purpose

Staff attendance tracking, leave management, shift roster planning. The operational layer that powers the doctor / nurse / cashier scheduling visible on the BRD owner dashboard.

## BRD Flows Covered

- [12. Hospital Owner Flow](../../01-brd/hospital-flows.md#12-hospital-owner-flow) — staff presence on daily dashboard
- *(no dedicated BRD flow today; cross-cutting concern)*

## Tables (names only — full specs deferred)

- `staff_attendance` — daily attendance log; check-in / check-out timestamps; biometric / RFID / manual source.
- `leave_requests` — leave application + approval workflow; affects slot generation per [TSD-05 §4.1 `appointment_slots`](../05-appointments.md#41-appointment_slots) on approval.
- `shift_rosters` — pre-planned shift assignments per role / department / date range.

## Notes for expansion

- `leave_requests` will carry **Layer 2 maker-checker** — leave requires approval from HOD / owner.
- `shift_rosters` may interact with `cash_sessions` (cashier shift auto-create from roster) and `appointment_slots` (doctor slots blocked when on roster leave).
- Already-existing related tables in Phase 1: [`tenant_holidays`](../01-platform-tenancy.md#412-tenant_holidays) (holiday calendar) — slot generator joins both.

## Why deferred

Phase 2. Kumudha v1 ships with manual roster + ad-hoc slot blocks via `appointment_slots.status='blocked'`.
