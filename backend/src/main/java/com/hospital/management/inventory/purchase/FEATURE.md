# purchase — Feature

## Package
[inventory](../MODULE.md)

## Tables
`purchase_orders`, `purchase_order_items`

## Schema reference
[14 · Inventory](../../../../../../../../../../../docs/03-schema/v3/modules/14-inventory.html#purchase_orders)

## Business rules
- `purchase_orders` is L2 maker-checker — a second user must approve before goods can be received
- `approval_status` lifecycle: `pending_approval` → `approved` | `rejected`; rejected POs can be corrected and resubmitted (new row)
- `created_by` and `approved_by` must differ — CHECK `created_by <> approved_by OR approved_by IS NULL`
- On goods receipt (`received_at` set), a `drug_stock` row is created per `purchase_order_items` row and a `drug_stock_ledger` entry of type `receipt` is written
- `purchase_order_items.received_quantity` may be less than `ordered_quantity` — partial receipt is allowed; balance tracked as `pending`

## API endpoints
_To be defined during implementation._

## Known constraints
- PO number is hospital-formatted (e.g. `PO-2026-00042`) — same pattern as invoice number; generated from a DB sequence
- Goods receipt is a transaction: insert `drug_stock` rows + ledger entries + update PO status — must be atomic
