# TSD 18: Payroll (Phase 2 Stub)

**Status:** Phase 2 — Reference Architecture, deferred
**Source of truth (interim):** [docs/03-schema/hms_schema_runbook.md §5.17](../../../03-schema/hms_schema_runbook.md)
**Last updated:** 2026-05-10

---

## Purpose

Payroll computation: monthly payslip generation, salary-component master, statutory deductions (PF, ESI, professional tax, TDS).

## BRD Flows Covered

- *(no dedicated BRD flow; HR/admin cross-cutting)*

## Tables (names only — full specs deferred)

- `salary_components` — earnings + deductions catalog (basic, HRA, conveyance, PF employee/employer, ESI, PT, TDS).
- `payslips` — per-staff per-month payslip; gross / net / deductions breakdown; locked once approved.
- `statutory_deductions` — period-wise statutory rates (PF rate, ESI threshold, slab rates) — closed-period like `service_price_history`.

## Notes for expansion

- `payslips` will carry **Layer 2 maker-checker** — payroll must be approved before disbursement.
- Source for [TSD-14 §4.9 `mv_payroll_cost_monthly`](../14-reports-analytics.md#49-mv_payroll_cost_monthly).
- Integrates with [`payments`](../13-payments-cash.md) — salary disbursement creates `payments` rows with `payee_type='employee'`.

## Why deferred

Phase 2. Kumudha's payroll runs externally via the accountant in v1.
