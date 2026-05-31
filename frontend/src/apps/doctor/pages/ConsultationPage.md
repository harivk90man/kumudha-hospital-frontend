# ConsultationPage

**File:** [ConsultationPage.tsx](ConsultationPage.tsx) · **Route:** `/doctor/consultation/:opNumber` · **Auth:** required

## Purpose

The doctor's per-encounter workspace. Loads `ConsultationContext` for the
`:opNumber`, surfaces critical-result alerts and draft-restore banners, and
hosts a 3-tab layout (Workspace / Reports / Patient history) with a stepper
and a sticky action bar.

This is the **densest** page in the app — most clinical workflow happens here.
If this `.md` grows past ~150 lines, split into `ConsultationPage.docs/`.

## Two states, one page

The same page renders both the **active consultation** and a **past visit**
in read-only mode. The signal is `data.lockedAt`:

| State | When | Affordances |
|-------|------|-------------|
| **Active** (`lockedAt == null`) | Live encounter the doctor is working on | Editable forms, draft autosave, critical-result banner, action bar with Await reports / Complete |
| **View-only** (`lockedAt` set) | Past visit clicked from history, OR finished consultation re-opened | `<fieldset disabled>` over step area, "Past visit · &lt;date&gt;" header strip, view-only footer with **Amend with reason** + **← Return to current consultation OP-XXX** |

After `Amend with reason` is submitted, the page becomes editable for the rest
of the session. Each edit is audit-logged (TSD-07 §4.2). The `?from=<currentOp>`
URL param carries the doctor's live encounter so the Return button works on
chained past-visit hops.

## Data

- `useConsultationContext(opNumber)` from [features/consultation/hooks/useConsultationContext.ts](../../../features/consultation/hooks/useConsultationContext.ts)
  - Returns `data, loading, error, isLocked, patch, lock, amend, pendingDraft, draftSavedAt, restoreDraft, dismissDraft`.
  - Owns the autosave-draft loop (2s debounce, 7-day TTL on server per TSD-07 §4.7).
  - `isLocked` drives `viewOnly` mode (locked + not amended in this session).
- Visit history: `fetchVisitHistory(uhid)` lazy-loaded into `visits` state.
- Journey timeline (past visits only): `fetchJourneyEvents(opNumber)` lazy-loaded into `journey` state when `viewOnly` flips true.
- Critical notifications: come pre-joined on `data.criticalNotifications` (composite over `notifications` + `lab_results` + `lab_orders`). Hidden in view-only mode.

## State sources

This page is the composition point for several different state mechanisms — each used for a deliberate reason. New state belongs in the column whose lifecycle matches it.

| Source | Kind | Holds | Lifecycle |
|---|---|---|---|
| `useConsultationContext(opNumber)` | Custom hook | Server-synced `ConsultationContext` — notes, diagnoses, prescription items, vitals, follow-up, recommendations, lock state, drafts — plus the autosave loop | Per-page; resets on `opNumber` change |
| `useAuth()` | Hook | Current doctor identity | App-session |
| `prescriptionTableStore` *(via `<PrescriptionBuilder>`)* | **Zustand** — [`features/consultation/prescriptionTableStore.ts`](../../../features/consultation/prescriptionTableStore.ts) | Prescription row list (committed + draft rows the inline table edits). Feature-internal — not re-exported from `index.ts`. | Singleton; reset by `initRows()` on prescription-section mount |
| `useState` × 8 (`openSections`, `busy`, `amendOpen`, `criticalOpen`, `showHistory`, `activeSection`, `visits`, `tick`) | React local | Pure UI: section open/close, modal flags, busy spinner, visit-history cache, "saved Xs ago" rerender tick | Unmounts with the page |
| `useRef` × 3 (`didInitialScroll`, `showHistoryRef`, `autoOpenedRef`) | React local | Scroll-restoration latch + stale-callback shield + "sections already auto-opened once" memo so user collapses survive autosaves | Unmounts with the page |

**Decision tree for adding new state** (per CLAUDE.md §3.7):

```
Is it server-persisted?           → TanStack Query (or useConsultationContext today)
Is it shared by 2+ components?    → Zustand store (feature-scoped)
Is it state + side-effects?       → Custom hook (internally uses the above)
Otherwise                         → useState / useRef
```

## Top-of-page (always visible)

| Section | Where | Notes |
|---------|-------|-------|
| Past-visit strip | [features/encounter/components/PatientContextHeader](../../../features/encounter/components/PatientContextHeader.tsx) (`pastVisitDate` prop) | Amber-tinted strip above patient row: "Past visit · &lt;long date&gt;". Renders only when `pastVisitDate` is set. |
| Patient context header (sticky) | inline → [PatientContextHeader](../../../features/encounter/components/PatientContextHeader.tsx) | Patient name, UHID, age/sex, blood group, allergy banner, linked-patients popover. |
| Breadcrumb | inline → [components/DoctorBreadcrumb](../components/DoctorBreadcrumb.tsx) | Built dynamically from current tab. |
| Critical-result ACK banner | inline → [features/consultation/components/CriticalResultBanner](../../../features/consultation/components/CriticalResultBanner.tsx) | Live-only. Hidden in view-only mode (history would re-prompt obsolete ACKs). |
| Draft-restore banner | inline | Live-only. Hidden in view-only mode. |

## Tabs

| Tab | Param | Body section |
|-----|-------|--------------|
| Workspace | (default) | split-pane: left (PatientSummaryCard + VitalsPanel + Timeline if past), right (Stepper + step body inside `<fieldset disabled={viewOnly}>`) |
| Reports | `?tab=reports` | ReportResultsPanel for the active visit's lab + radiology |
| Patient history | `?tab=history` | VisitHistoryPanel timeline; clicking a row navigates to `/doctor/consultation/<op>?from=<currentOp>` |

### Workspace stepper (5 steps)

`?step=` URL param drives which sub-form renders. Order:

| Step | URL param | Component | Notes |
|------|-----------|-----------|-------|
| Notes | `notes` (default) | [ConsultationNotesForm](../../../features/consultation/components/ConsultationNotesForm.tsx) | Chief complaint, HPI, examination, impression, advice. |
| Diagnosis | `diagnosis` | [DiagnosisForm](../../../features/consultation/components/DiagnosisForm.tsx) | ICD-10 + description + type (primary/secondary/provisional/rule_out). One-primary enforcement. |
| Prescription | `prescription` | [PrescriptionBuilder](../../../features/consultation/components/PrescriptionBuilder.tsx) | Medicine search → dose / frequency / route / duration / qty. Allergy alert if drug class matches patient allergies. Stock-block override flow. |
| Orders | `orders` | [OrdersPanel](../../../features/consultation/components/OrdersPanel.tsx) + [ReportResultsPanel](../../../features/consultation/components/ReportResultsPanel.tsx) | Lab + radiology catalog selectors with priority. Inline "Reports & results" panel below. |
| Advice | `advice` | [FollowUpAdvicePanel](../../../features/consultation/components/FollowUpAdvicePanel.tsx) + [AdmissionAdvicePanel](../../../features/consultation/components/AdmissionAdvicePanel.tsx) + [RecommendationsPanel](../../../features/consultation/components/RecommendationsPanel.tsx) | Follow-up + admission + non-Rx recommendations (physio / surgery / referral / etc.) |

The stepper itself stays outside the disabled fieldset so the doctor can
still navigate steps to **read** all clinical capture even in view-only mode.

### Footer (sticky bottom)

Two variants depending on mode:

| Mode | Component | Renders |
|------|-----------|---------|
| Active | [ConsultationActionBar](../../../features/consultation/components/ConsultationActionBar.tsx) | Captures `next_action` (TSD-07 §4.2) + drives Await-reports + Complete. After lock + amend, swaps to amend-warning state. |
| View-only | inline `<ViewOnlyFooter>` in `ConsultationPage.tsx` | "Locked at &lt;date&gt;" + Amend with reason + ← Return to current consultation OP-XXX (only when `?from=` is set) |

### Amend-with-reason sheet

[AmendWithReasonSheet](../../../features/consultation/components/AmendWithReasonSheet.tsx).
Opens when "Amend with reason" is clicked from either footer variant. On submit, the consultation
becomes editable for the session (per `useConsultationContext.amend()`), the
view-only footer is replaced with the live action bar, and each subsequent
edit is audit-logged.

## Common edit hotspots

| User says | Open this |
|-----------|-----------|
| "Critical alert ACK button" | [CriticalResultBanner.tsx](../../../features/consultation/components/CriticalResultBanner.tsx) |
| "Allergy alert at prescribing" | [features/inventory/allergyMatcher.ts](../../../features/inventory/allergyMatcher.ts) + [AllergyAlertBanner](../../../features/inventory/components/AllergyAlertBanner.tsx) wired into `<PrescriptionBuilder>` |
| "Draft autosave timing" | [useConsultationContext.ts](../../../features/consultation/hooks/useConsultationContext.ts) constant `AUTOSAVE_DEBOUNCE_MS` |
| "Lock / Amend semantics" | TSD-07 §4.2 + `lock()` / `amend()` in `useConsultationContext` |
| "Stepper completion ticks" | ConsultationPage.tsx — the `completed` prop on `<ConsultationStepper>` |
| "Past-visit date in header" | `pastVisitDate` prop on [PatientContextHeader](../../../features/encounter/components/PatientContextHeader.tsx) |
| "View-only footer" | inline `<ViewOnlyFooter>` at the bottom of `ConsultationPage.tsx` |
| "Past-visit timeline" | inline `<Timeline>` at the bottom of `ConsultationPage.tsx`; data via `fetchJourneyEvents` |
| "Reports tab — flag chip" | [ResultFlagChip.tsx](../../../features/lab/components/ResultFlagChip.tsx) consumed by `<ReportResultsPanel>` |
| "Linked-patients popover" | [features/patient/components/LinkedPatientsButton.tsx](../../../features/patient/components/LinkedPatientsButton.tsx) — wired via `onSelectLinkedPatient` prop on `<PatientContextHeader>` |

## Related

- Hook: [useConsultationContext](../../../features/consultation/hooks/useConsultationContext.ts)
- Types: `ConsultationContext`, `ConsultationDraft`, `ConsultationAmendment`, `Diagnosis`, `PrescriptionItem`, `DoctorRecommendation`, `NextAction`, `Vitals` in [features/consultation/consultationTypes.ts](../../../features/consultation/consultationTypes.ts)
- API: [features/consultation/consultationApi.ts](../../../features/consultation/consultationApi.ts) — `fetchConsultation` resolves both current and past op-numbers; locked encounters drive view-only mode in the page.
- Mock: [features/consultation/__mocks__/consultationMocks.ts](../../../features/consultation/__mocks__/consultationMocks.ts) — has 1 active + 3 past encounters (all with `lockedAt`) + critical Potassium for Karthik (drives the banner)

## Quirks / TODOs

- `?from=<currentOp>` is read from the URL but not seeded by anything other than the history click. If a doctor lands directly on a past visit URL (e.g. shared link), the "Return to current" button doesn't render. Wire when "current encounter" tracking lands.
- Linked-patient "open in new tab" target is `/patient/<uhid>` — that route doesn't exist yet → 404. Wire when a patient profile screen lands.
- `next_action` consistency is not validated (e.g. picking `prescription_only` while lab orders exist → no warning). Spec §6 open question.
- ICD-10 input is free text; no autocomplete against a catalog yet.
- `clinicalImpression` doesn't map to a single spec column — possibly should rename to match `clinical_notes` or be deliberate UX grouping.
