# Insurance / TPA Rules

> **STATUS: 🔴 OUT OF SCOPE — Phase 2 (may move to Phase 3 — decision deferred)**
> Companion to [hospital-flows.md §11](hospital-flows.md#11-insurance--tpa-flow). Not implemented in v1.
> Master scope authority → [../00-overview/vision-and-scope.md](../00-overview/vision-and-scope.md)
>
> v1 supports **manual** claim filing only — automated insurance settlement is a Phase-2 candidate.

## Verification at registration

- Patient declares insurance at registration / admission.
- Insurance desk verifies card details: insurer, policy number, validity, sum-insured, coverage limits.
- Any patient flagged as `insurance` is routed through the insurance desk before billing finalisation.

## Pre-authorisation (planned admissions / expensive procedures)

| Outcome | What happens |
|---|---|
| **Approved** | Treatment proceeds; approved amount noted on the admission |
| **Partially approved** | Patient informed of shortfall; consent recorded; patient pays the gap |
| **Rejected** | Patient pays out of pocket OR opts for an alternative procedure |

- Pre-auth document stored via `file_attachments`.
- Pre-auth response time is tracked — admissions can be delayed waiting for it.

## At final billing

- **Covered vs non-covered split** — insurance desk separates line items at discharge.
- Patient pays:
  - Co-pay (% of covered)
  - Deductibles (per-policy fixed amount)
  - Items not in policy (cosmetic procedures, deluxe room upgrades, etc.)
- Hospital pursues the covered remainder from the insurer / TPA.

## Claim filing

- Documents required: discharge summary, all bills, test reports, prescriptions, pre-auth letter, insurance card copy.
- Claim packet generated and sent to TPA / insurer.
- Claim status tracked: `submitted`, `query_raised`, `approved`, `partially_approved`, `rejected`, `settled`.

## Claim outcomes

| Status | What happens |
|---|---|
| **Approved** | Insurance pays the hospital directly; invoice marked fully paid |
| **Query raised** | Hospital responds with additional documents; claim cycle continues |
| **Rejected** | Patient billed for the full amount; recovery follow-up begins |
| **Partially settled** | Difference is patient liability; recovery follow-up begins |

## TPA contracts

- Some insurers operate via TPAs with pre-negotiated tariffs. Tariff sheets must be honoured at billing.
- Tariff data lives in TODO (pricing schemes — Phase-2 deferred per runbook §10 Tier 2 #12).

## Open items

- TODO: define the SLA expectations between hospital ↔ TPA (response time targets).
- TODO: cashless vs reimbursement flows — confirm whether v1 supports both.
- TODO: aging report on outstanding insurance claims — should surface in the owner dashboard.
