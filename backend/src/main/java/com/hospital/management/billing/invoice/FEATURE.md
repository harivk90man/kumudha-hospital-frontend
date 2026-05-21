# invoice — Feature

## Package
[billing](../MODULE.md)

## Tables
`invoices`, `invoice_items`

## Schema reference
[17 · Billing](../../../../../../../../../../../docs/03-schema/v3/modules/17-billing.html#invoices)

## Business rules
- `invoices.balance` and `invoices.total_discount` are GENERATED ALWAYS AS columns — never set by application code
- `invoice_items` trigger `fn_recompute_invoice_totals()` on every INSERT/UPDATE/DELETE — parent invoice totals are always in sync
- L2 maker-checker: when `total_discount > system_config.billing.discount_threshold_for_approval`, `approval_status = 'pending_approval'` blocks payment collection
- `payment_status` lifecycle: `draft` → `finalized` → `paid` | `partially_paid` | `refunded` | `cancelled`
- Invoice is immutable once `payment_status = 'finalized'` — no items can be added or removed after finalization
- `invoice_items.item_type` discriminates the source: `consultation`, `lab_test`, `lab_panel`, `drug`, `radiology`, `ambulance`, `room_charge`, `nursing`, `procedure`, `consumable`, `surgery`, `other`
- Separate-column FK pattern: at most one of `consultation_id`, `lab_order_item_id`, `radiology_order_id`, `pharmacy_sale_item_id` is set per line — CHECK enforces

## API endpoints
_To be defined during implementation._

## Known constraints
- `invoice_number` format locked after first record — same guard as UHID
- `idempotency_key` (client UUID) prevents double-billing on UI retry — partial unique index enforces
- GST: CGST + SGST for intra-state; IGST for inter-state; mutually exclusive — CHECK enforces
