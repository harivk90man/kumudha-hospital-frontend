# Consultation feature

Maps to schema v2 module **11-consultation**.

## Purpose
The doctor's clinical capture for an encounter: notes, diagnoses, vitals, prescription, advice, and the read-only view of past visits. Aggregate state lives in `ConsultationContext`. Composes `lab` + `radiology` (orders + result viewer) and `inventory` (medicine catalog + stock severity).

## How to run
- `useConsultationContext(encounterNo)` — load + patch the active consultation.
- `<ConsultationStepper>` — step bar (notes → diagnosis → prescription → orders → advice).
- `<PrescriptionBuilder>`, `<OrdersPanel>` — workspace panels for the steps.
- Past visits open in the **same** consultation page in read-only mode (locked encounter → fieldset disabled, view-only footer with Amend + Return). No separate drawer.

## Stores

Server-synced data lives in `useConsultationContext` (until the planned TanStack Query migration). UI-only state that needs cross-component sharing lives in dedicated Zustand stores listed below.

| File | Scope | Used by | Persists? |
|---|---|---|---|
| [`prescriptionTableStore.ts`](./prescriptionTableStore.ts) | Feature-internal — **not** exported from `index.ts` | `<PrescriptionBuilder>` and its inline `<PrescriptionRow>` children | No — singleton, reset on `initRows()` |

**Adding a new store?** Per CLAUDE.md §3.7:
- One store per concern (not a mega-store)
- Subscribe via selectors: `useStore((s) => s.value)`, never `useStore()`
- Server-cached data stays out — that's TanStack Query's job
- Feature-internal stores stay out of `index.ts` so the feature surface area doesn't leak

## DB tables / entities (schema v2)
- `consultation`, `consultation_note`, `vitals`, `diagnosis`
- `prescription`, `prescription_item`, `prescription_template`, `prescription_template_item`
- `follow_up_advice`, `admission_advice`

## Known issues / limitations
- `mockConsultation.patient` and `mockPastEncounters` inline a hard-coded patient — fine for a mock, real backend will join `patient` table.
- `OrdersPanel` is a consultation-internal composer over `lab` + `radiology`. If a non-doctor role ever needs the same UX, hoist into `apps/<x>` or a shared component.
- `ReportResultsPanel` lives here because consultation is the only consumer; same hoist plan if reused.

## Planned improvements
- [ ] TanStack Query for server cache (`useConsultationContext` is currently hand-rolled).
- [ ] Print-friendly prescription view.
- [ ] Optimistic updates for diagnosis/prescription edits.
