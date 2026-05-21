# Facility Profile — Kumudha Hospital, Villupuram

> Concrete physical inventory of the hospital. Used as seed data for the `stations` table (v1) and as the basis for ward/bed planning in Phase 2.

## Branding assets

Static brand assets shipped with the deployment. Used by the React UI and (later) by the backend's PDF templates for invoices / prescriptions / lab reports.

| Asset | File path | Used by | Notes |
|---|---|---|---|
| Primary logo | `frontend/public/branding/kh-logo.jpeg` | UI header, login screen | ~300–400px wide, web-optimized |
| Print logo | *(TODO — high-res variant)* | PDF invoices, prescriptions | ~1200px wide; add as `kh-logo-print.jpeg` |
| Favicon | *(TODO)* | Browser tab | Add as `kh-favicon.ico` |

**Naming convention:** `<tenant_code>-<asset>.<ext>` — matches `tenants.tenant_code = 'KH'` ([TSD-01 Platform & Tenancy](../05-tsd/01-platform-tenancy.md)). When a second hospital is onboarded, its assets sit alongside (e.g. `vt-logo.jpeg`).

**Storage location rationale:** placed in `frontend/public/` (not `src/assets/`) so the bundler does not fingerprint the filename — the value stored in `tenants.logo_path` stays stable across builds.

**DB seed:** `tenants.logo_path = 'branding/kh-logo.jpeg'` — relative path served from the React `public/` root (`/branding/kh-logo.jpeg`).

## Bed inventory

| Type | Count | Notes |
|------|------:|-------|
| Ward (general) | 6 | Phase-2 module 5.9 IP |
| Emergency / Casualty | 4 | v1 — emergency triage flow |
| ICU | 4 | Phase-2 |
| Spare / unused | 1 | Reserved capacity |
| **Total** | **15** | |

## Consultation rooms & departments

> Each row below is also a `stations` row in the database (v1 module 5.3 Patient Journey / Workflow). Slug shown is the suggested `stations.slug`.

| Room # | Specialty / Use | Suggested station slug | Notes |
|-------:|-----------------|------------------------|-------|
| 1 | Orthopaedics | `consult:ortho` | |
| 2 | General Medicine | `consult:gen_med` | |
| 3 | TODO — confirm | TODO | Not provided in current data |
| 4 | Obstetrics & Gynaecology + Dermatology (shared) | `consult:og_derma` | Two specialties sharing one room — confirm scheduling rules |
| 5 | X-ray | `radiology:xray` | Imaging modality, not a doctor consult room |
| 6 | Lab | `lab:main` | Sample collection + processing |
| 7 | Physiotherapy | `physio:main` | |
| ? | Dental | `consult:dental` | **TODO — clarify location.** Original spec read "...7 physio... 2, dental" — unclear whether dental is in a separate Room 2, sharing Room 2 with General Med, or in a Room 8 |

## Operation Theatres

3 OTs (per [vision-and-scope.md](vision-and-scope.md) §Operational Scale). Phase-2 module 5.10 Surgery.

> TODO: capture per-OT details (number, equipment, anaesthesia setup) before the Surgery module is built.

## Capacity assumptions baked into the design

- 60–70 OP visits per day across all consultation rooms combined
- 10–20 surgeries per month across the 3 OTs
- ~50 staff total

## Open questions

- [ ] Confirm Room 3 specialty
- [ ] Confirm dental room location
- [ ] Are X-ray / Lab / Physio counted as "consultation rooms" or separate departments? (Implementation impact: how `stations` are typed and grouped on the queue UI)
- [ ] Bed-to-ward grouping for Phase-2 IP module — which beds belong to which ward / unit?
