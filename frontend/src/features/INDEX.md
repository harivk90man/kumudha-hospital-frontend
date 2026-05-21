# Features — domain slices

Each folder is one schema-v2 module. Owns its types, API, hooks, store,
mocks, schemas, and components. Pages compose features; features never
import from `apps/`.

| Feature | Schema module | What it owns | Detail |
|---------|---------------|--------------|--------|
| [auth](auth/) | 01-platform-tenancy | Login, session, `UserProfile` (doctor / receptionist / nurse discriminated union), `useAuth` | [auth/PROJECT.md](auth/PROJECT.md) |
| [patient](patient/) | 07-patient | Patient summary, registration (`createPatient`), lookup (UHID / mobile), allergies, kin, linked-patients | [patient/PROJECT.md](patient/PROJECT.md) |
| [encounter](encounter/) | 10-encounter + 08-journey | Queue, op_visits (`createOpVisit`), vitals capture (`recordVitals`), status badge, journey events, patient-context header, state transition | [encounter/PROJECT.md](encounter/PROJECT.md) |
| [appointments](appointments/) | TSD-05 (FE-ahead, no migration yet) | Slot calendar, booking + check-in + cancellation + no-show + late-arrival | [appointments/PROJECT.md](appointments/PROJECT.md) |
| [billing](billing/) | TSD-11/12/13 (FE-ahead) | Service catalogue, invoices, payments (cash/UPI/card/insurance), refunds. Used by every actor that takes money. | [billing/PROJECT.md](billing/PROJECT.md) |
| [pharmacy](pharmacy/) | TSD-10 §4.4 (FE-ahead) | Rx queue + dispense workflow (pickup, per-line decision, partial / decline). Bridges consultation Rx and inventory stock. | [pharmacy/PROJECT.md](pharmacy/PROJECT.md) |
| [consultation](consultation/) | 11-consultation | Vitals, notes, diagnoses, prescriptions, recommendations, drafts, lock+amend, past visits, critical-result banner | [consultation/PROJECT.md](consultation/PROJECT.md) |
| [lab](lab/) | 12-lab | Lab catalog, orders, result flags, ACK notifications | [lab/PROJECT.md](lab/PROJECT.md) |
| [radiology](radiology/) | 13-radiology | Radiology catalog + orders | [radiology/PROJECT.md](radiology/PROJECT.md) |
| [inventory](inventory/) | 14-inventory | Medicines, drug-class allergy match, stock alerts, severity badges, batches/suppliers/GRN | [inventory/PROJECT.md](inventory/PROJECT.md) |
| [platform](platform/) | TSD-01 + TSD-02 (FE-ahead) | Tenants, users, RBAC, lookup tables (departments / allergies / services / states), audit log. Used by the Platform-admin app. | [platform/PROJECT.md](platform/PROJECT.md) |

## Conventions (CLAUDE.md §3.6)

Every feature folder has:
- `<feature>Types.ts` — wire shapes (mirror schema columns; camelCase)
- `<feature>Api.ts` — typed wrappers over `lib/http/httpClient` (mocks today)
- `components/` — feature-specific UI
- `hooks/` (optional)
- `<feature>Store.ts` (optional, Zustand)
- `__mocks__/<feature>Mocks.ts`
- `index.ts` — public surface
- `PROJECT.md` — long-form package notes
