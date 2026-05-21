# QueuePage

**File:** [QueuePage.tsx](QueuePage.tsx) · **Route:** `/doctor/queue` · **Auth:** required

## Purpose

The doctor's two-tab work surface:

1. **Consultation queue** — patients booked / arrived / waiting / in-consultation today.
2. **Reports to check** — past encounters where ordered reports have come back and need the doctor's review.

Filter state lives in the URL (`?view=&status=&triage=&q=`) so links are shareable
and refresh-safe (CLAUDE.md §3.4 — server-side filter contract).

## Data

- Queue: `fetchQueue({status, triage, q})` from [features/encounter/encounterApi](../../../features/encounter/encounterApi.ts)
- Reports queue: `fetchReportPendingQueue({q})` from same module
- Both reload whenever any URL filter param changes.

## Sections

| Section | Location | Notes |
|---------|----------|-------|
| Page header (title + count) | inline ~L151-164 | Shows "N appointments shown" or "N encounters with reports ready" depending on view. |
| Tab strip (Consultation / Reports) | inline ~L166-196 | URL-synced via `?view=consultation\|reports`. Each tab shows live count + loading dot. |
| Currently-in-consultation banner | inline ~L198-225 | Surfaces when any queue entry has `status.name === 'in_consultation'`. Has "Resume" button. Only on consultation tab. |
| Filter row (search + status + triage) | inline ~L227-269 | All filters round-trip to the server via URL params. Status/triage selects only on consultation tab. |
| Consultation grid | inline ~L271-344 | 1/2/3-column grid of `<li>` cards. Card highlights: red border for `emergencyTriage='red'`, primary tint for `in_consultation`. **Allergies surfaced** if patient has any. Action button = Start (waiting/checked_in) / Resume (in_consultation) / Open (other). |
| Reports grid | inline ~L355-429 | 1/2-column grid. Each card has a list of report rows (lab + radiology) with status pill + reported-time. "Review reports" button opens `/doctor/consultation/<op>?tab=reports`. |
| Empty state | inline ~L276-279 (consultation) / ~L350-353 (reports) | "No appointments match your filters." / "No reports waiting for review." |

## Common edit hotspots

| User says | Open this |
|-----------|-----------|
| "Status filter options" | QueuePage.tsx:32-38 (`statusOptions`) |
| "Triage filter options" | QueuePage.tsx:40-45 (`triageOptions`) |
| "Status badge colors" | [features/encounter/components/QueueStatusBadge.tsx](../../../features/encounter/components/QueueStatusBadge.tsx) |
| "How status maps to int code" | TSD-04 §4.1 + [features/encounter/encounterTypes.ts](../../../features/encounter/encounterTypes.ts) `EncounterStatusName` |
| "Card layout / highlights" | QueuePage.tsx ~L286-340 (consultation card) or ~L356-426 (reports card) |
| "Reports-pending semantics" | [features/encounter/encounterApi.ts](../../../features/encounter/encounterApi.ts) `fetchReportPendingQueue` (filters `readyCount > 0`) |
| "Action button labels" | QueuePage.tsx ~L321-340 (consultation), ~L420-424 (reports) |

## Related

- Types: `QueueEntry`, `ReportPendingEntry`, `EncounterStatusName`, `EmergencyTriage`, `QueueListParams` in [features/encounter/encounterTypes.ts](../../../features/encounter/encounterTypes.ts)
- API: [features/encounter/encounterApi.ts](../../../features/encounter/encounterApi.ts)
- Badge: [features/encounter/components/QueueStatusBadge.tsx](../../../features/encounter/components/QueueStatusBadge.tsx)
- Mock: [features/encounter/__mocks__/encounterMocks.ts](../../../features/encounter/__mocks__/encounterMocks.ts)
- Bottom nav (mobile equivalent of Queue link): [../components/DoctorBottomNav.tsx](../components/DoctorBottomNav.tsx)

## Quirks / TODOs

- Pagination + sort UI not exposed yet — `QueueListParams` accepts `page/limit/sort` but no controls render. CLAUDE.md §3.4 wants both. Add when more than ~30 patients on queue.
- Reports semantics — TSD-06 §6 open question: "ready" should require ALL ordered tests reported, not just at least one. Today the API filter is `readyCount > 0` (loose). Tighten when spec resolves.
- `parent_queue_id` re-queue chain (patient returned from lab back to doctor) not surfaced visually. Spec talks about it; FE doesn't show "Returned from lab" pill yet.
- Triage colour distinction is partial — only red gets a border tint; yellow/green look the same. Add yellow border when designer signs off.
