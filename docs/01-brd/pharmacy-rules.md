# Pharmacy Rules

> **Status:** Stub. Companion to [hospital-flows.md §8](hospital-flows.md#8-pharmacy-flow).

## Stock decrement

- Stock is **never reduced before payment**. The decrement happens only at the moment medicines are physically handed to the patient.
- Decrement is enforced by trigger `fn_decrement_stock` on `pharmacy_sale_items AFTER INSERT`:
  - Atomically reduces `medicine_batches.quantity_available`
  - Bumps the batch's `version` (optimistic lock)
  - **Raises an error if stock would go negative** — the sale fails, no over-dispensing
  - Inserts a corresponding `stock_movements` row with `movement_type='sale_out'`

## FEFO dispensing

- First-Expiry-First-Out — when a medicine has multiple open batches, dispense from the batch with the earliest expiry first.
- Index `idx_medicine_batches_expiry` on `(medicine_id, expiry_date) WHERE quantity_available > 0` supports this.

## Expiry handling

- Pharmacist verifies expiry date at the moment of dispense.
- Medicines nearing expiry are flagged on the dispenser screen (TODO: define the threshold — 60 days? 90 days?).
- Expired stock is moved out via a `stock_movements` row with `movement_type='expiry_out'`. **Never silently zeroed.**

## Partial dispense

- If some medicines on the prescription are out of stock or refused by the patient:
  - Pharmacist marks which items were not purchased.
  - Prescription status moves to `partially_dispensed`.
  - The unpurchased items remain visible on subsequent visits.

## Prescription status lifecycle

| Status | Meaning |
|---|---|
| `active` | Created by the doctor; not yet dispensed |
| `partially_dispensed` | Some items dispensed, some pending |
| `dispensed` | All items dispensed |
| `cancelled` | Cancelled before dispensing |
| `expired` | Validity window passed without full dispense |

## OTC sales

- Walk-in patients without a UHID can buy OTC medicines.
- The sale uses a `payees` row of type `walk_in` (no `patient_id`).
- All NDPS rules still apply — narcotic medicines cannot be sold OTC.

## NDPS / narcotic register

- Every transaction on a medicine where `is_narcotic=TRUE` MUST write a `narcotic_register` row.
- Required fields: `prescriber_name + prescriber_reg_no`, `recipient_name + recipient_id_proof`, `witnessed_by`.
- Append-only — corrections via adjustment rows.
- Quarterly Drug Inspector audit must reconcile physical stock with `balance_after`.
- 7-year retention.

## Stock replenishment

- When `medicine_batches` aggregate stock falls below a configured minimum, raise a purchase request.
- PO sent to supplier via the `purchase_orders` workflow (TODO: detail).
- Receiving GRN → new `medicine_batches` row with batch number, quantity, expiry date.

## Idempotency

- `pharmacy_sales.idempotency_key` (partial UNIQUE) guards against double-dispense from a retried payment / bill print.

## Optimistic locking

- `pharmacy_sales` and `medicine_batches` carry a `version` column. Lost-update conflicts must retry, not silently overwrite.
