# QueuePage (front-desk)

**File:** [QueuePage.tsx](QueuePage.tsx) · **Route:** `/frontdesk/queue` · **Auth:** required

## Purpose
Live per-doctor queue board. Answers "how many ahead of me for Dr. X?"
for any walk-up patient. Polls the server every 5 s; no manual refresh.

## Sections
| Section | Notes |
|---------|-------|
| Header | Title + `<LiveIndicator>` + last-refresh timestamp. |
| Per-doctor column (one per doctor) | Currently-in-consultation card (pinned), then ordered list of `awaiting_doctor` rows with FIFO 1-based position pill, token, UHID, wait minutes, and triage pill. |

## Data
- `fetchQueueByDoctor()` — server groups `awaiting_doctor` + `in_consultation`
  rows per doctor and sorts FIFO by `appointmentTime`. Wire point
  `GET /api/queue/by-doctor`. Polled every 5 s.

## Notes / limitations
- Polling cadence is `POLL_INTERVAL_MS = 5000`. Switch to WebSocket push
  once `lib/ws/` infra lands.
- Empty doctor columns render so the board layout stays stable even when
  a doctor has nothing in their queue.
