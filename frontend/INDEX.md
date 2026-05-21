# HMS Frontend — navigation index

**AI: cold-start? Read this first.** Each link points to a smaller index that
points further down. The leaves are `<PageName>.md`, `PROJECT.md`, or source
files. Stay in the navigation tree until you have the right file path —
don't grep blindly.

## Stack

React + TypeScript + Vite · Tailwind CSS + shadcn/ui · Zustand · axios ·
react-hook-form + zod · lucide-react. Architecture: Feature-Sliced Design
+ per-role app shells. Source of truth for project rules:
[../CLAUDE.md](../CLAUDE.md).

## Areas

| Area | What lives here | Index |
|------|-----------------|-------|
| Apps | Per-role page shells (doctor today; front-desk / pharmacist / billing planned) | [src/apps/INDEX.md](src/apps/INDEX.md) |
| Features | Domain logic per schema-v2 module: auth, patient, encounter, consultation, lab, radiology, inventory | [src/features/INDEX.md](src/features/INDEX.md) |
| Components | Shared UI primitives (Card, Button, StatusPill, InsetGroup, Sheet, Spinner, …) | [src/components/INDEX.md](src/components/INDEX.md) |
| Stores / Providers | Global app-shell state + theme/preference plumbing | [src/store/](src/store/) · [src/providers/](src/providers/) |
| Database | Postgres migrations + sample data (Supabase-ready, will move to AWS RDS later) | [../backend/db/README.md](../backend/db/README.md) |
| Specs | BRD + TSDs + Schema v2 (read-only docs) | [../docs/](../docs/) |

## Common navigation cheats

- "Issue in `<X>` page" → start at `src/apps/<role>/pages/INDEX.md` → open `<X>Page.md`.
- "Issue in `<feature>` logic" → start at `src/features/<feature>/PROJECT.md`.
- "Want to add a UI variant" → `src/components/INDEX.md`.
- "Database column / table question" → `../backend/db/README.md`.
- "Spec question (what does the doctor flow say?)" → `../docs/01-brd/hospital-flows.md` + `../docs/05-tsd/`.

## Maintenance discipline

When you add / remove / rename a file, update the nearest INDEX or `<X>.md`
in the **same PR**. The index chain is the AI's only reliable map — if it
goes stale, every future task burns extra tokens to recover.
