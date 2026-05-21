# Exception Flows

> **Status:** Stub. Capture all the "what if it doesn't go to plan" branches here. Each section below should expand into its own subflow with steps, screens touched, and the resulting state-machine transitions.

## Patient-side exceptions

- **No-show** — appointment booked but patient never arrives. Slot release window, token cancellation, refund policy.
- **Walk-out / LAMA** — patient leaves against medical advice mid-visit. Visit closure, billing for services already rendered.
- **Abandoned visit (report review not completed)** — visit stuck in `doctor_review_pending (165)` beyond the configured threshold (default 14 days). Admin manually closes the visit as **Abandoned**; the prescription remains `active` so the patient can still fill it at the pharmacy using their UHID. Report: end-of-day list of all visits in `doctor_review_pending` with days elapsed, so admin can follow up with patients before the threshold is hit.
- **Wrong patient identified at registration** — duplicate UHID created. Use `sp_merge_patients` to consolidate.
- **TEMP-UHID merge** — emergency entry → permanent UHID. Documented in runbook §3 *Patient identity model*.
- **Patient refuses test/treatment** — capture refusal in clinical notes, no charge, no journey advance.
- **Patient cannot pay full bill** — partial payment, balance noted as due, follow-up collection.
- **Death during visit / admission** — death certificate workflow (Phase 2 — `death_certificates` table deferred).

## Operational exceptions

- **Doctor cancels / runs late** — bulk slot reschedule, patient notification.
- **Slot conflict** — two staff trying to book the same slot simultaneously. Slot lock + UNIQUE constraint resolves at DB level; UI must show clean error.
- **Sample rejected at lab** — repeat collection, no double charge.
- **Critical lab result unacknowledged within SLA** — `breached_sla=TRUE`, escalation to senior doctor / department head.
- **Stock out at dispense time** — partial dispense, prescription marked `partially_dispensed`, patient sources remainder elsewhere.
- **Expired medicine dispensed (caught at counter)** — never dispense; flag the batch; FEFO violation review.
- **Power / system outage** — manual register, retro-entry on restoration. Each retro entry must mark `created_at` real but record actual event time in domain-specific column.

## Financial exceptions

- **Double payment / accidental retry** — guarded by `payments.idempotency_key` partial UNIQUE index.
- **Optimistic-lock conflict on invoice / payment** — UI must surface "another user changed this — refresh and retry".
- **Refund** — credit note pattern. Original payment row stays; an offsetting `payment_direction='out'` row is created; allocations updated.
- **Cash mismatch at EOD** — variance recorded in cash session closure; requires senior approval to close.
- **Price change mid-bill** — old price wins. Honoured via `service_price_history` lookup at billing time.
- **Discount approval beyond cashier limit** — see [billing-rules.md](billing-rules.md) for the approval matrix.

## Insurance / TPA exceptions

- **Pre-auth rejected after admission** — patient pays out of pocket.
- **Claim rejected post-discharge** — patient billed for full amount; recovery follow-up.
- **TPA query** — additional documents requested; claim status tracked.

## Compliance exceptions

- **MLC closure incomplete at discharge** — discharge UI is **blocked** until `mlc_records.closure_status='closed'`.
- **Narcotic stock count variance** — Drug Inspector audit follow-up; adjustment row in `narcotic_register`.
- **Audit log gap** — investigation; append-only design means it shouldn't be possible without DB-level intervention.

---

> Each item above should grow into its own numbered subflow once we start designing the actual screens.
