# Doctor pages — dispatcher

Each page has a co-located `<PageName>.md` with sections, edit hotspots, and
related-component refs. Read the `.md` BEFORE opening the `.tsx` — it tells
you which lines / sub-components to look at.

| Page | Route | Detail |
|------|-------|--------|
| Login | `/doctor/login` | [LoginPage.md](LoginPage.md) |
| Dashboard | `/doctor/dashboard` | [DashboardPage.md](DashboardPage.md) |
| Queue | `/doctor/queue` | [QueuePage.md](QueuePage.md) |
| Consultation | `/doctor/consultation/:opNumber` | [ConsultationPage.md](ConsultationPage.md) |

## Conventions

- File: `<PageName>.tsx` — exports `<PageName>` (no `Doctor` / `Patient` prefix; the folder context already says "doctor pages").
- Detail: `<PageName>.md` co-located. ≤ ~150 lines.
- If a `<PageName>.md` grows past 150 lines, split into a `<PageName>.docs/` folder of topic files; the `<PageName>.md` becomes a link hub.
- Mounted by [../doctorRoutes.tsx](../doctorRoutes.tsx).
