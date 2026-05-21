# HMS Postgres Migrations — Doctor-Flow Scope (Schema v8 / spec v2)

Hand-written DDL covering the doctor-flow slice of the HMS schema:

- Platform foundation: `tenants`, `users`, RBAC, audit, events, notifications, attachments, lookups.
- Feature layer: patient, journey, encounter, inventory, consultation, lab, radiology.

The SQL is **plain Postgres** — no Supabase-specific features (no RLS,
no `auth.users`, no Realtime). The intent is that Supabase is used as
plain Postgres and the Java Spring backend connects with the
`postgres` role; PostgREST roles (`anon`, `authenticated`) are revoked
in `999_grants.sql`.

---

## Run order

Paste these files into the Supabase SQL editor **one at a time, in
order**, and run each. The order is encoded in the numeric prefix:

| # | File                              | What it does |
|---|-----------------------------------|--------------|
| 1 | `001_extensions.sql`              | `pgcrypto`, `pg_trgm`, `uuid-ossp`, `btree_gin`. |
| 2 | `002_helpers.sql`                 | Shared trigger functions (`fn_set_updated_at`, `fn_append_only_guard`). |
| 3 | `010_platform_tenancy.sql`        | `tenants`, `users`, `departments`, `doctor_profiles`, RBAC, sessions, config, prefs, holidays, doctor schedules. |
| 4 | `011_platform_audit.sql`          | `audit_logs` (append-only) + `audit_excluded_tables`. |
| 5 | `012_platform_events.sql`         | `domain_events` (append-only event bus). |
| 6 | `013_platform_notifications.sql`  | `notifications` + `notification_acknowledgments`. |
| 7 | `014_platform_attachments.sql`    | `document_templates` + `file_attachments`. |
| 8 | `015_platform_lookups.sql`        | `allergies_lookup` + `chronic_conditions_lookup`. |
| 9 | `020_patient.sql`                 | `patients`, govt IDs, merges, mergeable-tables registry, UHID sequences, family history. |
|10 | `021_journey.sql`                 | `patient_states` (catalog), `stations`, `patient_journey_events` (append-only). |
|11 | `030_encounter.sql`               | `op_visits`, `patient_queue`, `fn_sync_op_visit_state` trigger. |
|12 | `040_inventory.sql`               | `vendors`, `medicines`, `medicine_batches`, `purchase_orders(_items)`, `stock_movements`, `narcotic_register`. |
|13 | `050_consultation.sql`            | `vitals`, `consultations`, `diagnosis_templates`, `prescriptions(_items)`, `doctor_recommendations`, `consultation_drafts`. |
|14 | `060_lab.sql`                     | `lab_tests`, `lab_test_panels`, `lab_orders(_items)`, `lab_samples`, `lab_results` with auto-flag + critical-alert triggers. |
|15 | `061_radiology.sql`               | `radiology_procedures`, `radiology_orders`, `radiology_studies`, `radiology_reports` with release-event trigger. |
|16 | `900_seed_data.sql`               | Tenant (`KH`), departments, roles, bootstrap admin, `Dr. Priya Iyer` (Orthopaedics, KMC-67821), `patient_states` 100–710, stations, allergy + condition lookups, audit-exclusion + mergeable-tables registry, default permissions. |
|17 | `999_grants.sql`                  | Revoke all rights from `anon`, `authenticated`, and `PUBLIC` on the `public` schema. |

Each script is **idempotent where Postgres allows it** —
`create table if not exists`, `create index if not exists`,
`create or replace function`, `drop trigger if exists … create trigger …`,
`insert … on conflict do nothing`. Re-running a file should be safe.

---

## Pasting into Supabase

1. Open Supabase Studio → **SQL Editor** → **New query**.
2. Open `001_extensions.sql` locally, copy its full contents, paste, click **Run**.
3. Wait for the green tick. Repeat for `002_helpers.sql`, then each numbered file in order.
4. After `999_grants.sql`, you should see a small result set listing any remaining grants on `public` — should be empty for non-`postgres` roles.

> The files cannot be combined into one giant paste reliably — Supabase's
> editor occasionally truncates long pastes. One file per run is the safe path.

---

## DBeaver connection (Spring/Supabase)

In Supabase Studio → **Project Settings → Database → Connection string**, grab the **Session pooler** or **Direct** connection details:

```
Host:     db.<your-project-ref>.supabase.co     (or aws-…-pooler.supabase.com for pooler)
Port:     5432                                  (or 6543 for pooler)
Database: postgres
User:     postgres
Password: <set in Supabase dashboard>
```

In DBeaver:

1. **Database → New Database Connection → PostgreSQL.**
2. Paste the Host / Port / Database / User / Password.
3. Driver Properties → `sslmode = require` (Supabase requires TLS).
4. Test Connection, then Finish.

Once connected you should see every table under
`Databases → postgres → Schemas → public → Tables` with column comments
visible in the "Description" column.

---

## Reverting (development only — nuclear option)

If you want to wipe everything and start over **inside a dev Supabase
project only**:

```sql
drop schema public cascade;
create schema public;
grant usage on schema public to postgres;
```

Then re-run `001_extensions.sql` through `999_grants.sql`.

**Never run this in production.** It deletes every row in every table.

---

## Out-of-scope FK targets

A handful of columns reference tables that are not part of the
doctor-flow scope and therefore have **no FK constraint** on them
(documented inline in the SQL). When those modules land, add the FK
with an `ALTER TABLE … ADD CONSTRAINT …`:

| Column                                          | Will reference                  |
|------------------------------------------------|---------------------------------|
| `op_visits.appointment_id`                     | `appointments(id)`              |
| `consultations.ip_admission_id` (column unused yet) | `ip_admissions(id)`             |
| `doctor_recommendations.follow_up_appointment_id` | `appointments(id)`              |
| `doctor_recommendations.physio_session_id`     | `physio_sessions(id)` (Phase 2) |
| `doctor_recommendations.surgery_schedule_id`   | `surgery_schedules(id)` (Phase 2) |
| `doctor_recommendations.ip_admission_id`       | `ip_admissions(id)` (Phase 2)   |
| `lab_orders.invoice_id` / `radiology_orders.invoice_id` | `invoices(id)`         |
| `stock_movements.pharmacy_sale_item_id`        | `pharmacy_sale_items(id)`       |
| `stock_movements.pharmacy_return_item_id`      | `pharmacy_return_items(id)`     |
| `narcotic_register.pharmacy_sale_id`           | `pharmacy_sales(id)`            |

---

## Triggers cheat-sheet (what fires when)

- **`fn_set_updated_at`** — BEFORE UPDATE on every business table that
  has `updated_at`. Bumps `updated_at` to `now()`.
- **`fn_append_only_guard`** — BEFORE UPDATE OR DELETE on `audit_logs`,
  `domain_events`, `patient_journey_events`, `stock_movements`,
  `narcotic_register`. Raises a `42501` SQLSTATE.
- **`fn_compute_prev_duration`** — BEFORE INSERT on
  `patient_journey_events`. Fills `duration_in_prev_state_seconds`
  from the previous event for the visit.
- **`fn_sync_op_visit_state`** — AFTER INSERT on
  `patient_journey_events`. Updates `op_visits.current_state_code`.
- **`fn_consultations_lock_guard`** — BEFORE UPDATE on `consultations`.
  Once `locked_at` is set, rejects any clinical-field change.
- **`fn_autoflag_lab_result`** — BEFORE INSERT on `lab_results`. Sets
  `flag` from `value_numeric` against `lab_tests` reference + critical
  ranges (gender-aware via `patients.gender`).
- **`fn_critical_lab_alert`** — AFTER INSERT on `lab_results`. Creates
  a `notifications` row + a `domain_events` row when flag is critical.
- **`fn_lab_release_event`** — AFTER UPDATE OF `release_status` on
  `lab_results`. Emits `LabResultReleased` domain event.
- **`fn_radiology_release_event`** — AFTER UPDATE OF `release_status`
  on `radiology_reports`. Emits `RadiologyReportReleased` domain event.

---

## Source documents

- HTML schema (authoritative for column lists & types):
  `docs/03-schema/v2/modules/*.html`
- TSDs (authoritative for triggers, CHECKs, seeds, lifecycle prose):
  `docs/05-tsd/*.md`
- State catalog seed values: `docs/03-schema/v1/state-catalog.md`
