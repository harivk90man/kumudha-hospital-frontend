# Billing Rules

> **Status:** Stub — flesh out each section as billing screens are designed.

## Charge capture

- **OPD model:** each service paid at its own counter (consultation at reception, tests at lab counter, pharmacy at pharmacy counter). No single OPD checkout.
- **IPD model:** running bill across the stay, settled at discharge with pre-admission deposit adjusted.
- Charges are sourced from `services` (master) → `service_price_history` (point-in-time price) → `invoice_items` (the line on the bill).

## Pricing

- Price at billing time is whichever row in `service_price_history` is active for `CURRENT_DATE` (i.e. `effective_from <= today AND (effective_to IS NULL OR today <= effective_to)`).
- Price changes on `services.default_price` automatically close the prior history row and append a new one (trigger `fn_log_price_change`).
- **Mid-bill price changes do not retroactively re-price an already-finalised invoice.**

## GST

- Healthcare services: **GST-exempt** — `cgst_pct = sgst_pct = igst_pct = 0`.
- Pharmacy / lab products: per HSN — typically 5%, 12%, or 18%. Same split tracked on `purchase_order_items` for input credit.
- Every service in `services` carries an `sac_code`; every product carries an HSN code.
- Monthly GSTR-1 export view: `v_gstr1_export`.

## Discounts

> TODO: define the discount approval matrix.

Working draft:

| Discount type | Approver | Cap |
|---|---|---|
| Senior citizen (≥ 60) | Cashier | 10% |
| Hospital staff / family | Admin Manager | 25% |
| Hardship case | Hospital Owner | up to 100% |
| Insurance pre-negotiated | System (auto) | per TPA contract |

Discounts must be captured as a discrete invoice item (negative amount) so the audit trail shows the original gross + discount + net.

## Refunds & adjustments

- **No row in a finalised invoice is mutated.** Corrections happen via:
  - **Credit note** — offsetting `payment_direction='out'` payment row, with allocations to the original invoice.
  - **Adjustment item** — additional negative line item with reason captured.
- Refunds require senior approval beyond a defined threshold (TODO).

## Partial payment

- Allowed at the cashier's discretion.
- `invoices.payment_status = 'partially_paid'`, `balance > 0`.
- Patient state moves to code 230 (`partially_paid`, blocking, SLA 60 min — see runbook §9).

## Insurance

- Insurance-covered items separated at final billing.
- Patient pays only co-pay / non-covered portion.
- Hospital files claim post-discharge. See [insurance-tpa-rules.md](insurance-tpa-rules.md).

## End-of-day closure

- Cashier opens a cash session at start of shift, closes at end.
- All `payments` for the session must reconcile with physical cash count.
- Variance recorded; closure requires senior approval if non-zero.

## Optimistic locking

- `invoices` and `payments` carry a `version` column. Concurrent edits resolve via the version race; loser must re-read and retry.

## Idempotency

- Payment writes accept an idempotency key. A retried request with the same key fails fast (no double-charge). Enforced by partial UNIQUE index on `payments.idempotency_key`.
