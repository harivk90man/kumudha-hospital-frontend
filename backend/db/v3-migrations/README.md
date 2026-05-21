# HMS Postgres Migrations — Schema v3 (Supabase-ready)

Hand-written DDL covering the full v3 schema (19 modules) per
`docs/03-schema/v3/CONVENTIONS.md` and the module HTML specs.

The SQL is **plain Postgres** — no Supabase-specific features (no RLS,
no `auth.users`, no Realtime). Supabase is used as plain Postgres; the
Java Spring backend connects with the `postgres` role; PostgREST roles
(`anon`, `authenticated`) are revoked in `999_grants.sql`.

> v3 supersedes v2 (`backend/db/migrations/`). Do **not** mix v2 and v3
> in the same database. Use a fresh Supabase project, or wipe the public
> schema (`drop schema public cascade; create schema public;`) before
> applying v3.

---

## Stack assumptions

- **Postgres 17+** (Supabase default since late 2024 — provides built-in
  `uuidv7()`). On Postgres 15/16, `002_helpers.sql` ships a pl/pgSQL
  fallback so the rest of the migrations stay portable.
- **Single-tenant per deployment** — one Postgres database = one
  hospital. No `tenant_id` columns.
- **Uniform audit + soft-delete block** on every table (7 columns:
  `created_by`, `created_at`, `updated_by`, `updated_at`, `version`,
  `deleted_at`, `deleted_by`). See CONVENTIONS.md §4a.

---

## Run order

Paste each file into the Supabase SQL editor in numeric-prefix order, or
let Flyway pick them up by filename:

| #   | File                                  | Module |
|-----|---------------------------------------|--------|
| 001 | `001_extensions.sql`                  | Postgres extensions |
| 002 | `002_helpers.sql`                     | Shared trigger functions + `uuidv7()` fallback + jsonb validators |
| 010 | `010_01a_identity_auth.sql`           | 01A · hospital_profile, users, user_sessions |
| 011 | `011_01b_organisation.sql`            | 01B · departments, doctor_profiles, doctor_leaves, doctor_registrations, department_heads |
| 012 | `012_01c_rbac.sql`                    | 01C · roles, user_roles, role_permissions |
| 013 | `013_01d_operational_config.sql`      | 01D · system_config, user_preferences, holidays |
| 020 | `020_02_platform_audit.sql`           | 02 · audit_logs, audit_excluded_tables |
| 025 | `025_05_document_templates.sql`       | 05 · document_templates |
| 026 | `026_06_platform_lookups.sql`         | 06 · allergies_lookup, chronic_conditions_lookup |
| 030 | `030_07_patient.sql`                  | 07 · patients, patient_govt_ids, patient_merges, patient_allergies, patient_chronic_conditions |
| 031 | `031_08_journey.sql`                  | 08 · stations, patient_journey_events |
| 032 | `032_09_appointments.sql`             | 09 · appointments, appointment_slots, tokens |
| 033 | `033_10_encounter.sql`                | 10 · op_visits, patient_queue |
| 034 | `034_11_consultation.sql`             | 11 · vitals, consultations, diagnosis_templates, prescriptions, prescription_items, doctor_recommendations |
| 040 | `040_12_lab.sql`                      | 12 · lab_tests, lab_test_groups, lab_test_group_items, lab_orders, lab_order_items, lab_samples, lab_results |
| 041 | `041_13_radiology.sql`                | 13 · radiology_procedures, radiology_orders, radiology_attachments, radiology_reports |
| 042 | `042_14_inventory.sql`                | 14 · vendors, vendor_contacts, drug_catalogue, drug_stock, purchase_orders, purchase_order_items, drug_stock_ledger, narcotic_register |
| 043 | `043_15_pharmacy.sql`                 | 15 · pharmacy_sales, pharmacy_sale_items, pharmacy_returns, pharmacy_return_items |
| 050 | `050_16_pricing.sql`                  | 16 · services, service_price_history |
| 051 | `051_17_billing.sql`                  | 17 · invoices, invoice_items |
| 052 | `052_18_payments.sql`                 | 18 · payments, payment_allocations, cash_counters, cash_sessions, cash_counter_handovers |
| 900 | `900_seed_data.sql`                   | Bootstrap: hospital_profile singleton, departments, roles, admin user, lookups, system_config defaults |
| 999 | `999_grants.sql`                      | Revoke from `anon`/`authenticated`/`PUBLIC` (Supabase hardening) |

Deferred (not generated): Module 03 (`domain_events`), Module 04
(`notifications`), Module 19 (analytics MVs) — see CONVENTIONS.md §13.

---

## Idempotency

Every file is **idempotent where Postgres allows it** —
`create table if not exists`, `create index if not exists`,
`create or replace function`, `drop trigger if exists … create trigger …`,
`insert … on conflict do nothing`. Safe to re-run.

---

## Two ways to apply

### A. Supabase Studio (manual paste, fastest for dev)

1. Open Supabase Studio → **SQL Editor** → **New query**.
2. Open `001_extensions.sql` locally, copy contents, paste, **Run**.
3. Repeat for each numbered file in order.

### B. Supabase CLI (recommended for teams)

```bash
# from repo root — one-time setup
npm install -g supabase
supabase init              # if supabase/ doesn't exist yet
supabase link --project-ref <your-ref>

# every time you change SQL
supabase db push           # applies new migrations to linked project
```

The `supabase/` folder at repo root mirrors these files via `supabase/migrations/`.
See `supabase/README.md` for the CLI workflow.

---

## DBeaver connection

In Supabase Studio → **Project Settings → Database → Connection string**:

```
Host:     db.<your-project-ref>.supabase.co
Port:     5432
Database: postgres
User:     postgres
Password: <set in Supabase dashboard>
SSL mode: require
```

---

## Reverting (dev only — nuclear option)

```sql
drop schema public cascade;
create schema public;
grant usage on schema public to postgres;
```

Then re-apply `001` → `999`. **Never in production.**

---

## Source documents

- HTML schema (authoritative for columns/types): `docs/03-schema/v3/modules/*.html`
- Conventions (uniform rules): `docs/03-schema/v3/CONVENTIONS.md`
- Backend persistence rules: `backend/BACKEND.md`
- Sample data reference (v2, will be ported): `backend/db/sample_data.sql`
