# pricing — Feature

## Package
[billing](../MODULE.md)

## Tables
`services`, `service_price_history`

## Schema reference
[16 · Pricing](../../../../../../../../../../../docs/03-schema/v3/modules/16-pricing.html)

## Business rules
- `services` is the centralised price catalogue for all non-drug billable items (consultations, lab tests, panels, radiology, procedures, room charges, ambulance, etc.)
- `service_type` values: `consultation`, `lab_test`, `lab_panel`, `radiology`, `procedure`, `room_charge`, `nursing`, `consumable`, `ambulance`, `other`
- `default_price` is NULL for consultation-type services — consultation fees come from `doctor_profiles.consultation_fee` / `follow_up_fee`
- Price changes go through `service_price_history` — old price row gets `effective_to` set, new row inserted; the current price is the row with `effective_to IS NULL`
- `service_price_history` changes are audited (not excluded) — price history is forensic data

## API endpoints
_To be defined during implementation._

## Known constraints
- `invoice_items.unit_price` is a snapshot of the price at billing time — not a live FK to `service_price_history`; historic invoices are unaffected by price changes
- `services.service_code` is unique — used as a stable reference in Flyway seed data and reporting
