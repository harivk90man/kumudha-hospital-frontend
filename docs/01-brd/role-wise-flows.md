# Role-wise Flows

> **Status:** Stub. The end-to-end *journey* is documented in [hospital-flows.md](hospital-flows.md). This file should reorganise the same content **by role** so each user (doctor, nurse, pharmacist, etc.) can read just their slice without scrolling through the whole journey.
>
> **Scope authority** → [../00-overview/vision-and-scope.md](../00-overview/vision-and-scope.md) | **Phase breakdown** → [../00-overview/phase-breakdown.md](../00-overview/phase-breakdown.md)

## Source content already drafted

| Role | Currently lives in `hospital-flows.md` | Phase | Status |
|------|----------------------------------------|---|--------|
| Doctor | §5 Doctor Flow | Phase 1 | Lift here |
| Nurse / Ward | §6 Nurse / Ward Flow | Phase 2 | Document for reference only |
| Hospital Owner | §12 Hospital Owner Flow | Phase 1 | Lift here |
| Platform Admin | §13 Platform Admin Flow | Phase 1 | Lift here |

## Roles still to write (Phase 1)

- Receptionist (registration, appointment booking, consultation fee collection, no-show handling)
- Cashier (billing screens, refunds, end-of-day closure, cash session reconciliation)
- Pharmacist (dispensing, stock checks, expiry alerts, narcotic register)
- Lab Technician (sample collection, payment verification, result entry, critical alerts)
- Radiographer (study acquisition, report attachment)

## Open question

Do we keep one big `hospital-flows.md` (journey-centric) **and** split each role into its own file here, or do we have role-specific files completely supersede the role sections in `hospital-flows.md`? Recommend: keep both — `hospital-flows.md` shows the cross-role journey, role files are the per-role checklists.
