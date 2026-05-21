# recommendation — Feature

## Package
[clinical](../MODULE.md)

## Tables
`doctor_recommendations`

## Schema reference
[11 · Consultation](../../../../../../../../../../../docs/03-schema/v3/modules/11-consultation.html#doctor_recommendations)

## Business rules
- `recommendation_type` values: `lab_test`, `radiology`, `referral`, `procedure`, `follow_up`, `other`
- A recommendation is a doctor's clinical instruction — separate from a formal lab_order or radiology_order
- `status` lifecycle: `pending` → `fulfilled` | `cancelled`; fulfilled when the corresponding order is placed
- Recommendations are linked to a consultation — soft-deleted if the consultation is voided
- `referred_to` (free text) holds the specialist name for referral type — no FK to users (specialist may be external)

## API endpoints
_To be defined during implementation._

## Known constraints
- Recommendations are informational — they do not block consultation locking
- Lab and radiology modules read recommendations to pre-populate order forms (convenience, not enforcement)
