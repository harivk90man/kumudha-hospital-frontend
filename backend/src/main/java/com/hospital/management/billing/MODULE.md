# billing — Bounded Context

## Schema modules
[16 · Pricing](../../../../../../../../../../docs/03-schema/v3/modules/16-pricing.html) ·
[17 · Billing](../../../../../../../../../../docs/03-schema/v3/modules/17-billing.html) ·
[18 · Payments](../../../../../../../../../../docs/03-schema/v3/modules/18-payments.html)

## Owns
`services`, `service_price_history`,
`invoices`, `invoice_items`,
`payments`, `payment_allocations`,
`cash_counters`, `cash_sessions`, `cash_counter_handovers`

## Depends on
- `platform` — UserQueryService (created_by, approved_by), ConfigService (discount threshold)
- `patient` — PatientQueryService
- `opd` — OpVisitQueryService (link invoice to visit)
- `clinical` — ConsultationQueryService, PrescriptionQueryService
- `lab` — LabOrderQueryService (invoice lab lines)
- `radiology` — RadiologyOrderQueryService (invoice radiology lines)
- `pharmacy` — PharmacySaleQueryService (invoice drug lines)
- `inventory` — DrugCatalogueQueryService (drug name snapshot on invoice line)

## Exposes to other packages
- `InvoiceQueryService` — get invoice summary for a patient (balance, status); used by OPD encounter to block discharge if balance > 0
- `PaymentQueryService` — verify payment received for a given invoice

## MS split boundary
Extract last — billing has the most upstream dependencies. Before extraction, ensure all upstream packages expose stable HTTP APIs. When extracted, billing becomes a revenue service that calls all clinical services to pull billable items. Consider an event-driven approach (each package emits a BillableItemCreated event; billing consumes) to reduce synchronous coupling at extraction time.

## Features
- [pricing](pricing/FEATURE.md) — services catalogue, service_price_history, price snapshot at billing time
- [invoice](invoice/FEATURE.md) — invoices, invoice_items, L2 discount approval, finalization workflow
- [payment](payment/FEATURE.md) — payments, payment_allocations, refund (payment_direction=out), pharmacy return refunds
- [cash](cash/FEATURE.md) — cash_counters, cash_sessions, cash_counter_handovers, shift management
