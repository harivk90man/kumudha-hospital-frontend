# Billing feature

Maps to schema v2 modules `services_catalog` (TSD-11), `invoices` +
`invoice_lines` (TSD-12), and `payments` (TSD-13).

> **Status:** FE-ahead. Backend migration not yet shipped (the doctor-flow
> migration set in `backend/db/migrations/` covers up to module 13
> radiology only). API signatures match the planned schema so backend can
> swap in without FE changes.

## Purpose
The single shared billing surface used by every actor that takes money:

- **Front-desk** records the consult-fee invoice + payment at registration (BRD §1 step 4).
- **Lab tech** invoices for ordered tests (BRD §1 step 15).
- **Radiology tech** invoices for ordered imaging (same step).
- **Pharmacist** invoices for dispensed medicines (BRD §1 step 23).
- **Cashier** owns the central counter for refunds, daily-collection report, and walk-in payment of any open invoice.

The **`station`** field on every invoice lets the cashier (and the owner
dashboard) see "today's collection by counter" without rewriting the same
join in every report.

## How to consume
- `fetchServices(category?)` — catalogue lookup for any "add to invoice" picker.
- `fetchInvoices({...})` — list with filters (status / station / date / q); honours `?page=&limit=&sort=`.
- `fetchInvoice(id)` — single invoice with line items.
- `createInvoice(input)` — server stamps `invoice_number` and totals; status starts `billed`.
- `recordPayment({invoiceId, amount, method, referenceNo?})` — partial or full; `status` flips to `paid` or `partially_paid`.
- `refundPayment({paymentId, reason})` — issues a negative-amount payment, original marked `refunded`, balance restored.
- `fetchPayments({...})` — list for daily collection report.

## DB tables / entities (TSD-11/12/13)
- `services_catalog` (catalogue)
- `invoices`, `invoice_lines`
- `payments` (cash, upi, card, netbanking, insurance methods + refund_of self-FK)

## Known issues / limitations
- No backend migration yet → all writes in-memory; refresh resets state.
- No tax-discount surfacing (line-item discount, full-invoice discount, package pricing) — single-rate GST per service line only.
- Insurance / TPA pre-auth pipeline absent — Phase 2 (per BRD).
- No PDF receipt yet — print is browser-print-window for now.

## Planned improvements
- [ ] Land the `invoices` + `payments` migrations + RLS policies.
- [ ] Insurance / TPA approval flow (Phase 2).
- [ ] Discount surfaces (line and invoice).
- [ ] Daily-Z report at end-of-shift for the cashier.
- [ ] Receipt template + PDF render.
