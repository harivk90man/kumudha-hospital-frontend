# Encounter feature

Maps to schema v2 module **10-encounter**.

## Purpose
The encounter is the unit of "patient came in today for X". Owns:
- The doctor's live queue (`fetchQueue`).
- The "reports-to-check" derived queue (`fetchReportPendingQueue`) — encounters where the doctor consulted, ordered reports, and ≥1 report has come back.
- Encounter lifecycle transitions (`startConsultation`, `completeConsultation`).
- The shared `<QueueStatusBadge>` (status + priority) used by any role's queue view.
- The sticky `<PatientContextHeader>` reused across per-encounter screens.

## How to run
- `<QueueStatusBadge status="WAITING" />` or `<QueueStatusBadge priority="EMERGENCY" />`.
- `<PatientContextHeader patient={...} encounterNo="OP-2026-00121" backTo="/doctor/consultation/..." />`.

## DB tables / entities (schema v2)
- `opd_encounter`, `encounter_status_event`

## Known issues / limitations
- Report-pending queue is a derived view; backend endpoint should aggregate from `lab_order` + `radiology_order` status tables.
- `fetchQueue` returns the entire day; pagination + filter pushdown are TODO.

## Planned improvements
- [ ] Server-side queue filters (status, priority, doctor, department).
- [ ] WebSocket live updates for queue + report-ready events.
- [ ] Queue partitioning by doctor/department once multi-doctor support lands.
