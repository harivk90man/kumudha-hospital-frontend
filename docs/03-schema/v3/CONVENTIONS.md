# v3 Schema — Conventions

> Single-page reference of every cross-cutting decision applied across the 19 v3 modules. Each module HTML file assumes these rules. If a column on a table seems to violate a rule, the rule wins — flag it.

**Last updated:** 2026-05-13
**Schema state:** Locked (v3 supersedes the tentative v2 design)

---

## 1. Deployment model — single tenant per deployment

- **One Postgres schema, one hospital per deployment.** All tables live in a single schema (default `public`). No `platform` / `<tenant>` schema split, no `search_path` switching, no `tenant_id` columns.
- **New tenant onboarding = new deployment.** Separate database, separate Spring Boot instance, separate frontend hosting, separate account. Isolation lives at the infrastructure layer.
- **`hospital_profile`** (renamed from v2's `tenants`) is a **singleton** table — one row, enforced by a partial UNIQUE index on a constant `(true)` predicate where `deleted_at IS NULL`. App reads `SELECT * FROM hospital_profile LIMIT 1` at startup.
- **No "Platform Admin" role in the DB.** That persona (developer / AI ops) operates at the deployment level via DevOps tooling.

## 2. Primary keys

- **UUIDv7** for every PK. Default `uuidv7()` (Postgres 17 built-in).
- Time-ordered → B-tree stays sequential → big win on `audit_logs`, `domain_events`, `payments`, `prescriptions`.
- Composite PKs allowed **only** on true M:M bridge tables (`user_roles`, `role_permissions`). Every other table uses a single UUID PK.

### 2a. 1:1 extension tables — shared PK pattern

For strict 1:1 extension tables (e.g. `doctor_profiles` extending `users`, `user_preferences` extending `users`), the child's PK column is **named after the parent** and is **simultaneously the FK** — no separate surrogate `id`:

```sql
CREATE TABLE doctor_profiles (
  user_id  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- … extension columns …
);
```

Benefits:
- Strict 1:1 enforced by the PK itself (a user can have at most one profile).
- One index instead of two (no separate `UNIQUE (user_id)`).
- Hibernate uses `@MapsId` to copy the parent's id automatically.
- 16 bytes smaller per row.

Applies to: `doctor_profiles`, `user_preferences`, and any future 1:1 extension. M:N bridges (`user_roles`, `role_permissions`, `department_heads`) and parent tables (`users`, `departments`) keep the standard `id uuid PK uuidv7()`.

## 3. Audit — three layers

| Layer | Scope | Mechanism |
|---|---|---|
| **Layer 1: inline audit columns** | **every table, uniformly** | `created_by`, `created_at`, `updated_by`, `updated_at`, `version`. Trigger `fn_touch_updated()` bumps `updated_at` + `version` on UPDATE. |
| **Layer 2: maker-checker columns** | 7 sensitive tables (`invoices`, `credit_notes`, `purchase_orders`, `narcotic_register`, `system_config`, `patient_merges`, `lab_results`) | `approval_status`, `approved_by`, `approved_at`, `rejection_reason`. CHECK enforces `created_by <> approved_by`. |
| **Layer 3: central `audit_logs`** | every Tier-1 table | DB trigger `fn_audit_row()` writes JSONB before/after for every INSERT/UPDATE/DELETE. Append-only (BEFORE UPDATE/DELETE trigger raises). Partitioned monthly. |

**Append-only tables** (`audit_logs`, `domain_events`, `patient_journey_events`, `narcotic_register`, `service_price_history`, `notification_acknowledgments`) carry the full Layer 1 column block **uniformly**, but their `fn_append_only_guard` trigger blocks any UPDATE/DELETE — so `updated_*`, `version`, and `deleted_*` stay at insert defaults forever. Cosmetic, but uniform.

## 4. Soft delete (uniform — every table)

- **`deleted_at timestamptz NULL`** + **`deleted_by UUID NULL`** on **every table**. No exceptions.
- `NULL deleted_at` = live row. Every live-query filter: `WHERE deleted_at IS NULL`.
- Partial indexes use `WHERE deleted_at IS NULL` to stay tight.
- Replaces v2's `is_active boolean` everywhere.
- Singletons (`hospital_profile`) and append-only tables get the columns too — they stay NULL forever (the trigger guards prevent meaningful deletion). Cosmetic but consistent.
- For session-style tables (`user_sessions`): "revoked" = `deleted_at IS NOT NULL`; no separate `revoked_at` / `revoked_reason` columns.

## 4a. The uniform "audit + soft-delete" block

Every v3 table carries this 7-column block at the end of its row:

```sql
created_by   UUID         NOT NULL  REFERENCES users(id) ON DELETE SET NULL,
created_at   timestamptz  NOT NULL  DEFAULT now(),
updated_by   UUID                   REFERENCES users(id) ON DELETE SET NULL,
updated_at   timestamptz  NOT NULL  DEFAULT now(),
version      int          NOT NULL  DEFAULT 0,
deleted_at   timestamptz,
deleted_by   UUID                   REFERENCES users(id) ON DELETE SET NULL
```

Triggers attached to every table:
- `tr_<table>_bu_touch` — BEFORE UPDATE → `fn_touch_updated()` (bumps `updated_at` + `version`).
- `tr_<table>_au_audit` — AFTER INSERT/UPDATE/DELETE → `fn_audit_row()` (Layer 3 audit).

## 5. Money

- **`numeric(14,2)`**. Single currency assumption (INR). No `currency_code` column.
- Java side: `BigDecimal`.
- `CHECK (amount >= 0)` by default; signed money (refunds, credit notes) opts out explicitly.

## 6. Foreign keys

- **Default `ON DELETE RESTRICT`.**
- **`ON DELETE CASCADE`** only where parent owns child's full lifecycle: `patients → patient_govt_ids`, `invoices → invoice_items`, `lab_orders → lab_order_items`, `prescriptions → prescription_items`, `pharmacy_sales → pharmacy_sale_items`, `cash_sessions → session_movements`.
- **`ON DELETE SET NULL`** for FKs to `users` (e.g. `*.created_by`, `*.updated_by`, `*.deleted_by`) — deactivating a user must not nuke their authored rows.
- **`audit_logs` carries no FK back to entity rows.** Orphan check is a nightly CI job.

### Polymorphic vs separate-column FKs

- **Separate nullable columns + `CHECK (num_nonnulls(...) = 1)`** for bounded sets (tokens, doctor_recommendations, invoice_items reference, payment_items).
- **Polymorphic `(entity_table, entity_id)`** only for `audit_logs` and `file_attachments`. CI orphan check runs nightly.

## 7. String type

- **`text` everywhere** for plain single-string columns (names, codes, descriptions, notes).
- No `varchar(N)`.
- Length constraints expressed as `CHECK char_length(col) BETWEEN x AND y` only where the domain mandates (UHID, GSTIN, mobile).

## 8. Structured data → JSONB + typed POJO

When the column holds **structured data** (not a single string), use `jsonb` and bind to a Java POJO via Hibernate 6's `@JdbcTypeCode(SqlTypes.JSON)`.

| Pattern | Use when |
|---|---|
| `jsonb` + typed POJO | Shape is stable across rows (e.g. `Address`, `WeekSchedule`). Add CHECK with `fn_validate_<shape>(jsonb)` schema-validator function. Promote query-hot fields to **generated columns** (e.g. `address_pincode GENERATED ALWAYS AS ((address->>'pincode')) STORED`). |
| `jsonb` + `JsonNode` / `Map` | Shape varies row-to-row (`audit_logs.before_state/after_state`, `domain_events.payload`). |
| **Child table** | Each item has its own lifecycle / audit trail. `patient_allergies`, `patient_chronic_conditions` (replacing v2's `text[]` columns). |

## 9. Hibernate-friendliness rules

- **No `text[]` columns on tables Hibernate writes.** Promote to child tables.
- **Composite PKs only on M:M bridges.** Every other entity gets `JpaRepository<Entity, UUID>`.
- **Generated columns** use Hibernate `@Generated(event = {INSERT, UPDATE})`; read-only on Java side.
- **Triggers stay invisible to Hibernate.** Audit + version + price-history fire in DB; Hibernate never knows.
- **`@Version int`** maps to the inline `version` column on every mutable table.

## 10. Naming

| Style | Where |
|---|---|
| snake_case | DB column names, table names, index names, constraint names, function names |
| camelCase | Java identifiers, JSON wire fields |
| PascalCase | Java classes, interfaces, enums, React components |
| SCREAMING_SNAKE | Java compile-time constants and enum constants only |
| `*_lookup` suffix | Reference / catalogue tables (no `_master`) |
| `ix_<table>_<col>` | Index name |
| `uq_<table>_<cols>` | Unique-index name |
| `chk_<table>_<purpose>` | CHECK constraint |
| `fk_<table>_<refTable>` | Foreign-key constraint |
| `pk_<table>` | Primary-key constraint |
| `tr_<table>_<event>_<fn>` | Trigger name |
| `fn_<verb>_<object>` | Function name |

## 11. DB-level documentation

- **`COMMENT ON TABLE` for every table** (one-paragraph purpose).
- **`COMMENT ON COLUMN` for every column** (one-line meaning).
- Sourced mechanically from the TSD column-spec "Meaning" cell during v3 authoring.

## 12. Stack

| Layer | Choice |
|---|---|
| RDBMS | Postgres 17 (`uuidv7()` built-in) |
| Migrations | Flyway. SQL-first (`V<n>__<desc>.sql`). |
| ORM | Hibernate 6 (CRUD), JdbcTemplate (complex queries) per [backend/BACKEND.md](../../backend/BACKEND.md) |
| Language | Java 21 + Spring Boot 3.x |
| ID generation | UUIDv7 (DB-side `DEFAULT uuidv7()`); not `@SequenceGenerator` — BACKEND.md §2.2 needs amending |

## 13. Domain events — deferred

`domain_events` and `domain_event_types_lookup` (Module 03) are **deferred from v3**. `audit_logs` covers forensic needs; Module 19 materialised views cover analytics. Re-introduce when a concrete external subscriber exists (integration webhook, real-time dashboard, HL7/FHIR adapter). The table design is documented in `docs/03-schema/v3/modules/03-platform-events.html` for future reference.

## 14. v2 → v3 deltas at a glance

| v2 | v3 |
|---|---|
| Multi-tenant: `tenant_id` on ~30 tables | Single-tenant per deployment; column dropped |
| `tenants` table | `hospital_profile` singleton |
| `tenant_holidays` | `holidays` |
| `is_active boolean` soft-delete | `deleted_at timestamptz` + `deleted_by UUID` |
| `gen_random_uuid()` PK | `uuidv7()` PK |
| `varchar(N)` | `text` (with optional `char_length` CHECK) |
| `decimal(10,2)` / `decimal(12,2)` money | `numeric(14,2)` uniform |
| `patients.allergies text[]` | `patient_allergies` child table |
| `patients.chronic_conditions text[]` | `patient_chronic_conditions` child table |
| `services.doctor_id` for per-doctor consultation fee | Column dropped; `doctor_profiles.consultation_fee` is source of truth |
| `system_config.config_value text` | `config_value jsonb` |
| `tenants.address text` | `hospital_profile.address jsonb` |
| Some FKs use CASCADE silently | Default RESTRICT; explicit CASCADE on tightly-owned children only |

## 15. Module HTML conventions

- Each module HTML file is **self-contained** — `<link>` to Bootstrap 5 CDN; no custom CSS/JS.
- Sections per table: heading with badges (lifecycle, audit-layer, maker-checker, singleton), purpose narrative, columns table, constraints/indexes, triggers, **sample data**.
- Sample data is sourced from [backend/db/sample_data.sql](../../backend/db/sample_data.sql) for already-built modules; crafted in Kumudha context for future modules.
