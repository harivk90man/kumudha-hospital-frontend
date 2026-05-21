# Diagnostics app

Combined shell for the Lab Tech + Radiology Tech roles (BRD §7 — Phase 1
OPD lab + radiology). One app, two tabs — small clinics often run them
as one role; tab-level ACL gating per role is a follow-up.

## Routes

| Path | Page | Notes |
|------|------|-------|
| `/diagnostics/login` | LoginPage | Public; mock login routes by username prefix (`lab.*` / `rad.*`). |
| `/diagnostics/dashboard` | DashboardPage | 6-tile KPI grid (Lab + Radiology counts at each stage) + side-by-side worklist previews. |
| `/diagnostics/lab` | LabPage | Lab worklist with status filter (paid / collecting / collected / processing / reported / released). Per-row: Start collection → Mark collected → Start processing → Enter result → Release. |
| `/diagnostics/radiology` | RadiologyPage | Radiology worklist (capture → report → release). |

## Workflow per BRD §7 + TSD-08/09 §4.6

Lab order goes through the status ladder:
`paid → sample_collection → sample_collected → in_progress → reported → released`.
Radiology mirrors with `paid → in_progress → reported → released` (no
sample-handling stage). When all orders for a visit are `released` the
doctor's `doctor_review_pending` notice fires.

## Features consumed
- `auth` — guard for `lab_tech | rad_tech` roles.
- `lab` — `fetchLabOrderQueue`, `transitionLabOrder`, `recordLabResult`, `releaseLabOrder`.
- `radiology` — same surface (`fetchRadiologyOrderQueue` etc.).

## Components consumed
- `<Card>`, `<CardHeader/Title/Label>` (layout)
- `<Breadcrumb>`, `<DashboardStatCard>`, `<StatusPill>` (data-display)
- `<FormInput>`, `<FormSelect>`, `<FormTextarea>` (form)
- `<Sheet>` (ui) — via `LabResultSheet` + `RadiologyResultSheet`
- `<Spinner>` (feedback)
- `<SettingsSheet>` (overlay)

## Known issues / limitations
- All writes are mocks — refresh resets state.
- No image upload (radiology) — impression text only for now.
- No fasting-confirmation hard-stop on lab collection — informational
  warning only.
- No sample barcode scanning at collection.

## Planned improvements
- [ ] Image attachment upload for radiology reports (TSD-09 §4.4).
- [ ] Multi-line numeric result entry (panel tests like CBC have many
      analytes — current schema records one numeric per row).
- [ ] Per-tab role ACL (lab tech can't release radiology, etc.).
- [ ] "Patient called" vs "patient arrived" vs "sample drawn" sub-states.
