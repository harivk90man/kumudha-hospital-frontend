# payment — Feature

## Package
[billing](../MODULE.md)

## Tables
`payments`, `payment_allocations`

## Schema reference
[18 · Payments](../../../../../../../../../../../docs/03-schema/v3/modules/18-payments.html#payments)

## Business rules
- `payment_direction`: `in` = money received from patient; `out` = money returned to patient (refund)
- Amount is always positive — direction is carried by `payment_direction`, not by sign of amount
- `payment_mode` values: `cash`, `upi`, `card`, `cheque`, `bank_transfer`, `other`
- `payment_allocations` links one payment to one or more invoices — a single payment can settle multiple invoices
- `payment_allocations.allocated_amount` sum must not exceed `payments.amount` — enforced at application level
- Pharmacy return refunds: `payments.pharmacy_return_id` FK set + `payment_direction = 'out'` — CHECK enforces direction
- `idempotency_key` on payments prevents duplicate payment recording on UI retry

## API endpoints
_To be defined during implementation._

## Known constraints
- `payment_allocations` is append-only at the DB level — overpayment corrections are new reverse payments, not edits
- `invoices.amount_paid` is updated by a trigger when `payment_allocations` rows are inserted — never set by app code directly
