# Pharmacy feature

Maps to TSD-10 §4.4 (`prescription_dispenses`) and cross-feature into
`features/billing` for the dispense invoice.

> **Status:** FE-ahead. Backend dispense table not yet shipped.

## Purpose
The front-of-house pharmacist workflow per BRD §1 step 23:
- See Rx queue (status `rx_pending`).
- Pick up an Rx (claims it: `rx_pending → rx_in_progress`).
- Per item: decide **dispense** (with quantity), **decline** (patient
  doesn't want it), or **out_of_stock** (informational note for doctor).
- Submit → flips Rx to `rx_dispensed` / `rx_partially_dispensed` /
  `rx_cancelled`, deducts stock, hands an invoice off to billing.

This feature is **distinct from `features/inventory`**. Inventory is the
back-office surface (catalog, batches, expiry, suppliers, GRN). Pharmacy
owns the customer-facing dispense flow that consumes inventory data.

## Spec mapping

| BRD §1 step 23 | Type / API |
|----------------|------------|
| "Patient buys all medicines" | `dispenseRx` with all lines `decision='dispense'` and `quantityDispensed = quantityPrescribed` → `rx_dispensed` |
| "Patient buys only some" | mixed lines → `rx_partially_dispensed` |
| "Patient declines all" | all lines `decision='decline'` → `rx_cancelled`; Rx remains `active` for later fill (per BRD note) |
| "Pharmacist notes which items not purchased" | per-line `notes` field |

## How to consume
- `fetchRxQueue({ status?, q? })` — pharmacist's worklist.
- `fetchRx(id)` — full Rx with items + live stock.
- `pickupRx(id)` — claim before dispense (avoids two pharmacists clashing).
- `dispenseRx({ rxId, lines, billDiscount? })` — submit decisions; returns `{ rx, invoiceId, invoiceTotal }`. Each dispensed line accepts an optional `lineDiscount` (pre-tax). The bill-level `billDiscount` is applied to (taxable-base + GST). Caller chains into `billing.recordPayment` to take counter payment.

## Discount math
- Per-line: `gross = unitPrice × qty`; `lineDiscount` (pct or amt) applied to `gross` first, then GST is computed on `(gross − lineDiscount)`.
- Bill-level: applied to `(Σ taxable-net + Σ GST)` after item discounts. Negative totals are clamped to zero.
- Tax base reduction is intentional — line-level concession is a pre-tax invoice discount per Indian GST §15(3)(a).

## Known issues / limitations
- All writes are mocks — refresh resets state.
- No batch picking / FEFO — server side will deduct from earliest-expiry batch automatically; the FE doesn't expose batch choice today.
- No generic-substitution suggestion UX — type carries `genericName` but the substitution modal is a follow-up.
- No partial-quantity payment reservation (e.g., "patient pays now, takes
  half today, half tomorrow").

## Planned improvements
- [ ] Generic-substitution picker when primary brand is out of stock.
- [ ] Batch-aware dispense (allow pharmacist to pick a batch when FEFO disagrees with patient preference).
- [ ] Print Rx label / dispense slip.
- [ ] Returns / re-stock for cancelled dispenses.
