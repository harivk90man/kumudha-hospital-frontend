# Migration Notes

> Per-version notes capturing **what changed and why** across schema versions. Authoritative source for "why does this column exist / why did this rename happen".

## v8 (locked 2026-05-09)

- 17 modules · 117 tables · ~1,220 fields · 7 triggers · 40+ indexes.
- Module structure was **reorganised on 2026-05-09**:
  - **Patient Master (5.2)** carved out of *Core* — patient identity / dedup / UHID lifecycle gets its own module boundary.
  - **Patient Journey / Workflow (5.3)** carved out of *Core + Patient Encounters* — `patient_states`, `stations`, and `patient_journey_events` now live together as the workflow layer.
  - **Patient Encounters (5.5)** slimmed down to encounter shells (`op_visits`, `patient_queue`, `tokens`, `ip_admissions`).
  - **Inventory (5.14)** kept in v1 (medicines + batches) so doctors see stock at prescription time, even though the broader warehouse functionality is Phase-2.
  - Phase-2 modules (IP 5.9, Surgery 5.10, HR 5.16, Payroll 5.17) **fenced off** — schema present, UI not surfaced in v1.
- **Token uniqueness fix:** the original UNIQUE on `tokens` broke for service-counter tokens where `provider_id IS NULL` (because `NULL <> NULL`). Replaced with two partial unique indexes — see [indexes-and-triggers.md](indexes-and-triggers.md).
- **`patient_journey_events.tenant_id` added** to close a multi-tenant audit-trail gap.
- **Migration file:** `db/migrations/V0__schema_v8_upgrade.sql` (Flyway). *Path placeholder — file doesn't exist yet at the time of writing.*

## v7 → v8 deltas (highlights)

> TODO: extract from `SCHEMA_v8_OPTIMIZATIONS.md` once that doc lands. The runbook header references it as "47 hospital journeys audited".

## Going forward

- Schema is **locked at v8 as of 2026-05-09**. Any further change requires:
  1. Explicit version bump (v9, v10, …)
  2. A fresh `Vn__schema_vN_*.sql` migration file
  3. A new section in this document explaining the change + rationale
- Append-only, never amend — same discipline as our event tables.
