# sample — Feature

## Package
[lab](../MODULE.md)

## Tables
`lab_samples`

## Schema reference
[12 · Lab](../../../../../../../../../../../docs/03-schema/v3/modules/12-lab.html#lab_samples)

## Business rules
- One `lab_samples` row per physical sample collected — a single order may generate multiple samples (blood, urine, etc.)
- `barcode` is printed on the sample tube and scanned at the analyser — unique per sample, generated at collection time
- Sample status lifecycle: `collected` → `received_at_lab` → `processing` → `done` | `rejected`
- A rejected sample requires a reason and triggers a re-collection request back to the nurse station
- `collected_by` is the nurse/phlebotomist who drew the sample; `received_by` is the lab technician who accepted it

## API endpoints
_To be defined during implementation._

## Known constraints
- Barcode uniqueness is enforced by a UNIQUE index — barcode generation must account for this (timestamp + sequence suffix)
- Sample status drives the parent `lab_orders` status update (trigger or application logic)
