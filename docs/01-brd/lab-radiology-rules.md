# Lab & Radiology Rules

> **Status:** Stub. Companion to [hospital-flows.md §7](hospital-flows.md#7-lab--radiology-flow) and [blood-test-catalogues.md](../02-catalogues/blood-test-catalogues.md).

## Payment-before-service

- **No test is conducted without confirmed payment.** Lab/radiology counter must verify the patient's payment receipt against the order slip before sample collection or imaging.
- If any test on the order slip is unpaid, patient is sent back to the billing counter for that test only.
- This rule is hard — there is no "we'll bill later" path for OPD lab/radiology.

## Order lifecycle

State codes (see runbook §9):

| Code | Label | Meaning |
|------|-------|---------|
| 300 | `lab_pending` | Order placed, awaiting sample collection |
| 310 | `lab_collected` | Sample collected, sent for processing |
| 320 | `lab_in_progress` | Processing |
| 330 | `lab_reported` | Results uploaded; doctor notified |
| 400 | `imaging_pending` | Order placed |
| 410 | `imaging_done` | Image acquired |
| 420 | `imaging_reported` | Radiologist report attached |

## Sequential test rounds

- A single OPD visit may include multiple test rounds (e.g. X-ray first, blood test after the doctor sees the X-ray). Each round is paid separately at the billing counter.
- The `op_visits` row stays open across rounds; status loops `awaiting_doctor → at_lab → reports_ready → awaiting_doctor` until the doctor closes the consultation.

## Result auto-flagging

- `lab_results` rows are auto-flagged on insert by trigger `fn_autoflag_lab_result`:
  - Reads `lab_tests.ref_min_male/female`, `ref_max_male/female`, `critical_low`, `critical_high`
  - Joins via `lab_order_items → lab_orders → patients` to get the patient's gender
  - Sets `flag` to one of `low | normal | high | critical`

## Critical-result escalation

- Trigger `fn_critical_lab_alert` fires on any result with `flag='critical'`:
  - Inserts a `notifications` row addressed to the ordering doctor
  - `priority='urgent'`, `ack_required=TRUE`, `ack_sla_minutes=30`
- Lab staff **also** phone the doctor immediately (out-of-band) — software notification is a backstop, not the primary channel.
- If the doctor doesn't acknowledge within the SLA, `breached_sla=TRUE` flag is set and the breach surfaces in the admin compliance report.

## Sample rejection / repeat

- Rejected samples (haemolysed, insufficient volume, mislabelled) → repeat collection, **no double charge**.
- Capture rejection reason in `lab_orders` (TODO confirm column).

## Reflex testing

- Out of scope for v1. When the use case shows up (e.g. HIV screen → Western Blot), add `lab_orders.triggered_by_result_id`. See runbook §10 Tier 2 #1.

## Reporting & visibility

- Each test produces its own report file, attached to the visit date — not a global "lab folder".
- Reports visible to:
  - Doctor — via patient profile, scoped to the visit date
  - Patient — via the patient portal / app, same scoping
- Image-heavy reports (X-ray, CT, MRI, US, ECG, Echo) attach via `file_attachments` (`entity_table='lab_orders'` or `'radiology_orders'`).

## Catalogue references

- Blood / urine tests: [blood-test-catalogues.md](../02-catalogues/blood-test-catalogues.md)
- Radiology procedures: [radiology-catalogue.md](../02-catalogues/radiology-catalogue.md) *(stub)*
