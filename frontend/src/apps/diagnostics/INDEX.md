# Diagnostics app — map

Lab tech + Radiology tech shell. Mounted at `/diagnostics/*` via [`diagnosticsRoutes.tsx`](diagnosticsRoutes.tsx). Long-form: [PROJECT.md](PROJECT.md).

## Pages

| Path | File |
|------|------|
| `/diagnostics/login` | [pages/LoginPage.tsx](pages/LoginPage.tsx) |
| `/diagnostics/dashboard` | [pages/DashboardPage.tsx](pages/DashboardPage.tsx) |
| `/diagnostics/lab` | [pages/LabPage.tsx](pages/LabPage.tsx) |
| `/diagnostics/radiology` | [pages/RadiologyPage.tsx](pages/RadiologyPage.tsx) |

## Components
[components/](components/) — shell + result-entry sheets:
- `DiagnosticsLayout`, `DiagnosticsSidebar`, `DiagnosticsBottomNav`
- `LabResultSheet` — opens from Lab page; numeric value + unit + flag + summary + notes.
- `RadiologyResultSheet` — opens from Radiology page; impression + notes.

## Features used
- [lab](../../features/lab/) — order queue + transitions + result recording.
- [radiology](../../features/radiology/) — same surface for imaging.
- [auth](../../features/auth/) — `lab_tech | rad_tech` role guard.
