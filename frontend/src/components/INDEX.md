# Shared UI primitives

These are the cross-feature, cross-role primitives. They render UI only —
no domain knowledge, no feature imports. **Restyling here cascades to every
caller** (CLAUDE.md §3.3). For a one-off variant, add a `cva` variant —
do NOT fork into a feature folder.

## Layout

| Component | Purpose |
|-----------|---------|
| [layout/Card.tsx](layout/Card.tsx) | Surface that floats on the page. `cva` variants for elevation (`flat / card / elevated / hover`) and padding (`none / sm / md / lg`). `asChild` so a `<form>` or `<section>` can adopt the style. Companion: `CardHeader / CardTitle / CardLabel / CardContent / CardFooter`. |
| [layout/InsetGroup.tsx](layout/InsetGroup.tsx) | Settings.app-style rounded container with hairline dividers between rows. Use for any list of similar records (Rx items, lab orders, recommendations, kin, …). |

## Data display

| Component | Purpose |
|-----------|---------|
| [data-display/StatusPill.tsx](data-display/StatusPill.tsx) | Single tone-tinted chip pattern. `tone` variant: neutral / info / success / warning / danger / brand / accent. `size`: sm / md. **Use only this pill style** — no per-feature pill spans. |
| [data-display/StatusDot.tsx](data-display/StatusDot.tsx) | Small color dot for inline status next to neutral text. Use when StatusPill would be too loud. |
| [data-display/Breadcrumb.tsx](data-display/Breadcrumb.tsx) | Generic breadcrumb. Takes `items` + `homeTo` + optional `homeLabel`. Each role app passes its own `/<role>/dashboard` as `homeTo`. |
| [data-display/DashboardStatCard.tsx](data-display/DashboardStatCard.tsx) | KPI tile with optional severity dot (`tone`: default / primary / warning / success / danger). Used by every role's dashboard. |

## Feedback

| Component | Purpose |
|-----------|---------|
| [feedback/Spinner.tsx](feedback/Spinner.tsx) | Hospital-themed `<HeartPulse>` spinner. `size`: sm / md / lg. Use for any loading state. |

## Form (react-hook-form bindings — CLAUDE.md §3.9)

| Component | Purpose |
|-----------|---------|
| [form/FormInput.tsx](form/FormInput.tsx) | Label + input + error/hint, bound by spreading `register('name')`. `requiredMark` adds an asterisk; `trailing` slot for inline icon/unit. |
| [form/FormSelect.tsx](form/FormSelect.tsx) | Same wrapper for `<select>`. Pass `<option>`s as children. |
| [form/FormTextarea.tsx](form/FormTextarea.tsx) | Same wrapper for `<textarea>`; default 3 rows. |

## Overlay

| Component | Purpose |
|-----------|---------|
| [overlay/SettingsSheet.tsx](overlay/SettingsSheet.tsx) | Personal-preferences drawer (theme / accent / font size). Bound to global `preferencesStore`. Opens from any role's sidebar. |

## Visual

| Component | Purpose |
|-----------|---------|
| [visual/EcgTrace.tsx](visual/EcgTrace.tsx) | Ambient PQRST ECG strip animated via pure CSS. Used behind login brand panels for on-brand visual texture. Inherits `currentColor`. |

## UI primitives (shadcn-seeded)

| Component | Purpose |
|-----------|---------|
| [ui/button.tsx](ui/button.tsx) | Button. Variants: `default / destructive / tinted / outline / secondary / ghost / link`. Sizes: `default / sm / lg / icon`. |
| [ui/sheet.tsx](ui/sheet.tsx) | Radix-based slide-in drawer (right side). Used by `AmendWithReasonSheet`, `SettingsSheet`. |

## Adding a new primitive

1. Pick the right subfolder by category (layout / data-display / feedback / overlay / form / icons / ui).
2. cva for variants.
3. Update this index — one-line description per component.
4. Mention it in any feature `PROJECT.md` that adopts it.
