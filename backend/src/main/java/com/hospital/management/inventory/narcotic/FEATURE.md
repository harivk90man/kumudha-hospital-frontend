# narcotic — Feature

## Package
[inventory](../MODULE.md)

## Tables
`narcotic_register`

## Schema reference
[14 · Inventory](../../../../../../../../../../../docs/03-schema/v3/modules/14-inventory.html#narcotic_register)

## Business rules
- `narcotic_register` is append-only — every dispensing or destruction of a Schedule H / H1 drug writes a row
- Entries are written automatically when pharmacy dispenses a drug with `drug_catalogue.is_narcotic = true`
- `entry_type` values: `dispensing`, `destruction`, `adjustment`, `transfer`
- `witnessed_by` (second staff member) is required for destruction entries — enforced at application level
- Balance at any time = SUM of signed quantities up to that point — the register is the audit trail; no separate balance column

## API endpoints
_To be defined during implementation._

## Known constraints
- Narcotic register is regulatory (Drugs and Cosmetics Act) — entries must never be soft-deleted or modified
- Monthly reconciliation report: balance per drug per month, verified against physical stock count; discrepancies flagged
