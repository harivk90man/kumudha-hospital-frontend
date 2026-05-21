# order — Feature

## Package
[lab](../MODULE.md)

## Tables
`lab_orders`, `lab_order_items`

## Schema reference
[12 · Lab](../../../../../../../../../../../docs/03-schema/v3/modules/12-lab.html#lab_orders)

## Business rules
- One `lab_orders` row per ordering event (a doctor may order multiple tests in one go)
- `lab_order_items` are individual tests or panels within an order — one row per test/panel
- `lab_order_items` cascade-delete when the parent `lab_orders` row is hard-deleted (admin operation only)
- Order status lifecycle: `pending` → `sample_collected` → `in_progress` → `completed` | `cancelled`
- An order item cannot be cancelled once the sample is collected — enforced at application level
- `ordered_by` must be a user with doctor role — validated at application level

## API endpoints
_To be defined during implementation._

## Known constraints
- `LabOrderQueryService.getOrderItemsForVisit(opVisitId)` is the cross-package interface used by billing
- Billing creates one `invoice_items` row per `lab_order_items` row — the FK `lab_order_item_id` links them
