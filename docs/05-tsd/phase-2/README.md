# Phase 2 — Reference Architecture (Stubs)

The TSDs in this folder cover modules that are **out of scope for v1** and modelled here for forward planning only:

| TSD | Module | BRD Flow | Why deferred |
|---|---|---|---|
| [15-ipd-admissions.md](15-ipd-admissions.md) | IPD — Inpatient Admission, Discharge, Nursing / Ward, MLC | BRD §2 IPD, §6 Nurse, §10 Discharge | Phase 2 per [phase-breakdown.md](../../00-overview/phase-breakdown.md) |
| [16-surgery.md](16-surgery.md) | Surgery scheduling, OT, anaesthesia | BRD §2 IPD ⊃ Surgery sub-flow | Phase 2 |
| [17-hr-attendance.md](17-hr-attendance.md) | Staff attendance, leave, shift roster | (cross-cutting; not a separate BRD flow) | Phase 2 |
| [18-payroll.md](18-payroll.md) | Payslips, salary components, statutory deductions | (cross-cutting) | Phase 2 |

## What's in a stub

Each Phase 2 stub is intentionally short — table list with one-line purpose, BRD flow link, and "why deferred." **No column specs are documented yet.** When Phase 2 begins, each stub will be expanded into a full TSD using the same template as the Phase 1 TSDs ([00-conventions.md](../00-conventions.md#file-template)).

## Why we model them now

- BRD §1 OPD (Phase 1, locked) includes an OP→IP transfer path. The transfer target needs to exist as a documented table even if Phase 2 hasn't built it yet.
- BRD §7 Lab + §8 Pharmacy reference IP context (`ip_admission_id`) so Phase 1 TSDs need a stable name to link to.
- The Hospital Owner dashboard MVs (`mv_bed_occupancy_daily`, `mv_payroll_cost_monthly`) source from these tables.

## Schema is tentative

Per the project-wide rule, the runbook for Phase 2 modules ([docs/03-schema/hms_schema_runbook.md §5.9–5.10, §5.16–5.17](../../03-schema/hms_schema_runbook.md)) is a *starting point*. When Phase 2 begins, the schema will be reviewed end-to-end with the same critical eye applied to Phase 1 (consents, allergies, audit, separate-FK preference, maker-checker, etc.).
