# State Catalog Reference

> Mirror of [schema runbook §9](hms_schema_runbook.md#9-state-catalog-reference). Stored separately so the BRD layer can reference it without dragging in the whole schema runbook. **Keep both files in sync** — the runbook is authoritative.

Codes 100–710 in `patient_states`. Phase 0 = ER, Phase 1–6 = OP lifecycle, Phase 7 = OP terminal / IP handoff, Phase 8–9 = IP lifecycle.

| Code | Label | Phase | Department | SLA (min) | Blocking |
|---:|---|---|---|---:|:---:|
| 100 | walk_in_arrived | 0 | front_desk | — | — |
| 110 | registered | 1 | front_desk | 5 | — |
| 120 | awaiting_vitals | 1 | nursing | 10 | ✓ |
| 130 | vitals_done | 1 | nursing | 2 | — |
| 140 | awaiting_doctor | 2 | doctor | 20 | ✓ |
| 150 | in_consultation | 2 | doctor | 15 | — |
| 160 | consultation_done | 2 | doctor | 2 | — |
| 165 | doctor_review_pending | 2 | doctor | — | ✓ |
| 200 | awaiting_billing | 3 | billing | 10 | ✓ |
| 210 | billed | 3 | billing | 5 | — |
| 220 | paid | 3 | billing | 1 | — |
| 230 | partially_paid | 3 | billing | 60 | ✓ |
| 300 | lab_pending | 4 | lab | 60 | ✓ |
| 310 | lab_collected | 4 | lab | 30 | — |
| 320 | lab_in_progress | 4 | lab | 120 | — |
| 330 | lab_reported | 4 | lab | 2 | — |
| 400 | imaging_pending | 5 | radiology | 30 | ✓ |
| 410 | imaging_done | 5 | radiology | 5 | — |
| 420 | imaging_reported | 5 | radiology | 60 | — |
| 500 | rx_pending | 6 | pharmacy | 10 | ✓ |
| 510 | rx_dispensed | 6 | pharmacy | 1 | — |
| 600 | completed | 7 | — | 0 | — |
| 620 | ip_admission_recommended | 7 | front_desk | 60 | ✓ |
| 630 | transferred_to_ip | 7 | — | 0 | — |
| 701 | admission_pending | 8 | inpatient | 60 | ✓ |
| 702 | admitted_ip | 8 | inpatient | — | — |
| 703 | in_treatment | 8 | inpatient | — | — |
| 704 | pre_op | 8 | surgery | 60 | — |
| 705 | in_surgery | 8 | surgery | — | — |
| 706 | post_op | 8 | surgery | — | — |
| 707 | mobilized | 8 | inpatient | — | — |
| 708 | discharge_pending | 8 | inpatient | 60 | ✓ |
| 709 | final_billed | 8 | billing | 30 | ✓ |
| 710 | discharged | 9 | — | 0 | ✓ |

## Hybrid state model recap

State lives in two places:

| Place | Purpose | When to read |
|---|---|---|
| `patient_journey_events` (append-only) | **Truth.** Every transition with timestamp, station, actor | Audit, timeline, bottleneck analysis |
| `op_visits.current_state_code` / `ip_admissions.current_state_code` (denormalized) | **Fast read.** Synced by trigger | Live queue, doctor's console, beds dashboard |

Trigger `fn_sync_op_visit_state` keeps the denormalized columns honest. **Never write to them from app code.**

## Notes on specific states

**`doctor_review_pending` (165):** Triggered only when **all** tests ordered in the current round are reported — not when the first result arrives. The visit remains in this state across shift boundaries and calendar days (a patient may return the next day or later). No SLA — the patient controls when they return. Blocking: visit cannot close until doctor reviews. Admin can force-close as `abandoned` after the configurable threshold (hospital setting, default 14 days).

**`ip_admission_recommended` (620):** Set when the OPD doctor decides to admit the patient. Blocking until a bed is assigned and the IP admission record is created. The OPD visit does not progress to `completed (600)` — it terminates at `transferred_to_ip (630)` instead.

**`transferred_to_ip` (630):** Terminal state for an OPD visit that ended in admission. The IP admission record carries `op_visit_id` linking back to this visit so clinical history carries forward.

## Report review token type

When a patient returns for report review (state 165), reception issues a token with `service_type = 'report_review'`. This token appears in a **separate fast-track lane** on the doctor's console (distinct from the regular consultation queue). No consultation fee is charged and no vitals are re-recorded. The doctor chooses freely when to call from either lane.
