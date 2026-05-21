# Apps — role shells

Each role has its own app shell with layout, sidebar, pages, and components.
Pure composition — no domain logic owned here. Domain state, types, APIs and
components live in `src/features/<module>` and are imported into pages.

| Role | Status | Index |
|------|--------|-------|
| Doctor | Built (v1) | [doctor/INDEX.md](doctor/INDEX.md) |
| Front-desk (Receptionist + Nurse) | Built (v1, BRD §1 steps 1-7 + §4) | [frontdesk/INDEX.md](frontdesk/INDEX.md) |
| Cashier | Built (v1, BRD §9 + cross-counter billing) | [cashier/INDEX.md](cashier/INDEX.md) |
| Diagnostics (Lab + Radiology) | Built (v1, BRD §7) | [diagnostics/INDEX.md](diagnostics/INDEX.md) |
| Pharmacy | Built (v1, BRD §1 step 23 + §8) | [pharmacy/INDEX.md](pharmacy/INDEX.md) |
| Inventory clerk (back-office) | Built (v1, TSD-10 §4.3 batches + GRN) | [inventory/INDEX.md](inventory/INDEX.md) |
| Owner | Built (v1, BRD §12) | [owner/INDEX.md](owner/INDEX.md) |
| Platform admin | Built (v1, BRD §13) | [admin/INDEX.md](admin/INDEX.md) |

When a new role lands, add a sibling `apps/<role>/` folder following the
same shape (`pages/`, `components/`, `<role>Routes.tsx`, `<role>Api.ts`,
`<role>Types.ts`, `index.ts`, `INDEX.md`, `PROJECT.md`).
