# cash — Feature

## Package
[billing](../MODULE.md)

## Tables
`cash_counters`, `cash_sessions`, `cash_counter_handovers`

## Schema reference
[18 · Payments](../../../../../../../../../../../docs/03-schema/v3/modules/18-payments.html#cash_counters)

## Business rules
- `cash_counters` are the physical billing desks — one row per counter; a hospital may have multiple
- `cash_sessions` represent a cashier's shift at a counter — opened with an opening balance, closed with a closing count
- Only one active session per counter at a time — partial unique index on `(counter_id) WHERE closed_at IS NULL`
- All cash payments must reference an active `cash_session_id` — enforced at application level
- `cash_counter_handovers` records shift handovers: the outgoing cashier hands cash to the incoming cashier; `handed_over_by <> received_by` enforced by CHECK
- `cash_sessions.variance` is GENERATED: `closing_balance - expected_closing_balance` — never set directly

## API endpoints
_To be defined during implementation._

## Known constraints
- Session close requires `closing_balance` entry + supervisor acknowledgement — enforced at application level
- `cash_counter_handovers` is append-only — no edits to handover records after creation
