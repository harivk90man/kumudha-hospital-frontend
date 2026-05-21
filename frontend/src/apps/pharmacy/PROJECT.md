# Pharmacy app

Front-of-house dispensing shell for the Pharmacist role (BRD §1 step 23 +
BRD §8). Distinct from the back-office **Inventory** app (catalog,
batches, expiry, suppliers — coming next).

## Routes

| Path | Page | Notes |
|------|------|-------|
| `/pharmacy/login` | LoginPage | Mock login on `pharma.*`. |
| `/pharmacy/dashboard` | DashboardPage | KPI tiles + pending Rx + stock alerts. |
| `/pharmacy/queue` | RxQueuePage | Filterable Rx queue. Pickup → Dispense sheet. |
| `/pharmacy/alerts` | StockAlertsPage | Read-only stock alerts (full management in Inventory). |

## Workflow per BRD §1 step 23

1. **Pending Rx** — surface in `rx_pending`. Pharmacist clicks "Pick up + dispense".
2. **Pickup** — `pickupRx` flips status to `rx_in_progress` (claims it).
3. **Dispense sheet** — per item:
   - Decision: dispense / decline / out-of-stock
   - Quantity (capped at min(prescribed, available))
   - Notes
   - Live total + GST as you type
4. **Take payment** — counter pay (cash / UPI / card / netbanking / insurance) for the dispensed total.
5. **Submit** — chains `dispenseRx` → `billing.createInvoice` (`station: 'pharmacy'`) → `billing.recordPayment`.
6. Status flips to one of:
   - `rx_dispensed` (all items dispensed)
   - `rx_partially_dispensed` (some declined)
   - `rx_cancelled` (nothing dispensed)

Per BRD §1 step 23: declined items leave the prescription `active` so the patient can fill them later — handled by leaving prescription_items unchanged on decline.

## Features consumed
- `auth` — `pharmacist` role guard.
- `pharmacy` — Rx queue + dispense flow.
- `inventory` — `fetchPharmacyAlerts` for the stock alerts page + dashboard.
- `billing` — `createInvoice` + `recordPayment` from the dispense sheet.

## Components consumed
- `<Card>`, `<CardHeader/Title/Label>` (layout)
- `<Breadcrumb>`, `<DashboardStatCard>`, `<StatusPill>` (data-display)
- `<FormInput>`, `<FormSelect>` (form)
- `<Sheet>` via the `DispenseSheet` component
- `<Spinner>` (feedback)
- `<SettingsSheet>` (overlay)

## Known issues / limitations
- Dispense invoice uses a placeholder service line (svc-201) for billing; real backend creates per-line `invoice_lines` from medicines pricing.
- No batch-aware dispense (FEFO is server-only).
- No generic-substitution UX.
- No print receipt / Rx label.

## Planned improvements
- [ ] Per-medicine `invoice_lines` on dispense (one line per dispensed item).
- [ ] Generic substitution picker.
- [ ] Print Rx label / dispense slip.
- [ ] "Returns / re-stock" for cancelled dispenses.
