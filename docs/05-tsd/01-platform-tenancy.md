# TSD 01: Platform & Tenancy

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

Foundational tables that every other module depends on: tenant scoping, staff identity (login + role), departments and doctor profiles, RBAC (roles + permissions), live login sessions, tenant-level configuration, and per-user UI preferences. Nothing here represents clinical or financial business — these tables exist so the rest of the system can answer "who is doing what, on whose hospital instance, with what permissions."

Multi-tenancy is by design even though Kumudha Hospital is the only tenant today. Every business table carries `tenant_id` so a future SaaS rollout requires zero schema migration.

---

## 2. BRD Flows Covered

- [4. Appointment Booking](../01-brd/hospital-flows.md#4-appointment-booking-flow) — receptionist identity, doctor calendar (doctor_profiles)
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — doctor identity, slot duration, follow-up window
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — cashier identity for receipts and audit
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — staff accounts management, doctor schedules, departments, hospital config (UHID prefix, OPD slot duration, approval matrix), system-wide settings
- [13. Platform Admin Flow](../01-brd/hospital-flows.md#13-platform-admin-flow) — tenant lifecycle (create/enable/disable), feature flags via `system_config`, password resets, support sessions

Implicitly used by **every other flow** for actor identity (`*.created_by → users(id)`) and tenant scoping.

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `tenants` | Multi-tenancy root — one row per hospital instance. Holds UHID format config (locked after first patient). |
| `users` | Staff identity — login credentials, employment basics, role-specific JSON profile data. |
| `departments` | Organisational units (Cardiology, Dermatology, Lab, Pharmacy …). |
| `doctor_profiles` | Doctor-specific extension of `users` — specialisation, fees, slot duration, available days. |
| `roles` | RBAC role definitions (doctor, front_desk, nurse, cashier, lab_tech, owner …). |
| `user_roles` | Many-to-many user → role assignments. |
| `permissions` | Granular permission keys (e.g. `pharmacy.stock.edit`, `billing.discount.approve`). |
| `role_permissions` | Permissions granted per role. |
| `user_sessions` | Active login sessions — JWT hash tracking, expiry, revocation. |
| `system_config` | Tenant-level config key/value pairs (feature flags, thresholds, business rules). |
| `user_preferences` | Per-user UI settings (theme, language, default landing path). |
| `tenant_holidays` | Hospital-closure calendar — slot generator skips these days; OP / IP / pharmacy availability flags per holiday. |

---

## 4. Table Specifications

### 4.1 `tenants`

**Purpose:** Multi-tenancy root. One row per hospital instance. The UHID format columns capture each hospital's chosen patient-ID format and are **frozen after the first patient is registered** (BRD §1 Patient Identity Model + §12 Owner Flow step 10).
**Lifecycle:** mutable (UHID format columns are application-locked once `uhid_sequences.last_sequence > 0` for the tenant — a guardrail, not a DB constraint).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_code | varchar | NO | UNIQUE | — | Short code, e.g. `KH` for Kumudha |
| hospital_name | varchar | NO | — | — | Display name |
| address | text | YES | — | — | Postal address |
| gst_number | varchar | YES | — | — | GSTIN for tax invoices |
| license_number | varchar | YES | — | — | Hospital licence number |
| logo_path | text | YES | — | — | Relative path (from web root) to hospital logo. Seed value & file layout: [facility-profile.md §Branding assets](../02-catalogues/facility-profile.md#branding-assets). |
| timezone | varchar | NO | — | 'Asia/Kolkata' | IANA timezone name; drives all "local date" interpretations (visit_date, slot_date, business_date). Changeable per tenant. |
| uhid_prefix | varchar | NO | — | 'UHID' | Prefix for new UHIDs (e.g. `KH`) |
| uhid_separator | varchar(1) | NO | — | '-' | Separator between prefix/year/sequence |
| uhid_sequence_padding | int | NO | — | 6 | Zero-padding width for the sequence number |
| uhid_include_year | boolean | NO | — | TRUE | Whether to embed year in the UHID format |
| is_active | boolean | NO | — | TRUE | Tenant enable/disable flag (Platform Admin) |
| created_at | timestamptz | NO | — | now() | Provisioning timestamp |

**Key relationships:** every other table FKs to `tenants(id)` directly or transitively.

**Indexes / uniqueness:**
- `tenant_code` UNIQUE — used in URL routing and external identifiers.

---

### 4.2 `users`

**Purpose:** Staff identity. Holds login credentials and employment basics. Role-specific data (e.g. nurse skills, cashier till assignments) lives in `profile_data` JSONB; doctor-specific fields are extracted into `doctor_profiles`.
**Lifecycle:** mutable; soft-delete via `status='inactive'`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| employee_id | varchar | NO | UNIQUE | — | Internal HR / payroll ID |
| full_name | varchar | NO | — | — | Display name |
| mobile | varchar | NO | UNIQUE | — | Login alternative + contact |
| email | varchar | YES | — | — | Optional contact |
| username | varchar | NO | UNIQUE | — | Login handle |
| password_hash | varchar | NO | — | — | Argon2/bcrypt hash |
| department_id | UUID | YES | FK → departments(id) | — | Primary department (nullable for cross-cutting roles) |
| designation | varchar | YES | — | — | Job title |
| profile_data | jsonb | NO | — | '{}' | Role-specific fields |
| status | varchar | NO | CHECK ∈ {'active','inactive','suspended'} | 'active' | Account state |
| last_login_at | timestamptz | YES | — | — | Set on each successful login |
| created_at | timestamptz | NO | — | now() | |
| updated_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `(tenant_id, username)` UNIQUE — login lookup.
- `(tenant_id, employee_id)` UNIQUE.
- `mobile` UNIQUE globally (cross-tenant collision check at registration).

---

### 4.3 `departments`

**Purpose:** Organisational structure. Used for routing patients to a department-specific doctor pool, dept-wise revenue rollups, and approval scoping.
**Lifecycle:** mutable; soft-delete via `is_active=false`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| dept_name | varchar | NO | — | — | Display name |
| dept_code | varchar | NO | UNIQUE per tenant | — | Short code (e.g. `CARDIO`, `DERMA`) |
| segment | varchar | NO | — | — | Functional segment: `clinical` / `lab` / `pharma` / `radiology` / `support` |
| head_doctor_id | UUID | YES | FK → users(id) | — | Department head (HOD) |
| is_active | boolean | NO | — | TRUE | Soft-delete flag |

**Indexes / uniqueness:**
- `(tenant_id, dept_code)` UNIQUE.

---

### 4.4 `doctor_profiles`

**Purpose:** Doctor-specific extension of `users`. Drives consultation pricing, appointment slot length, follow-up free-window logic, and the doctor's calendar UI.
**Lifecycle:** mutable; deactivate via parent `users.status`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| user_id | UUID | NO | UNIQUE, FK → users(id) | — | Backing staff record |
| specialization | varchar | YES | — | — | e.g. Dermatology, Paediatrics |
| qualification | varchar | YES | — | — | MBBS, MD, etc. |
| registration_number | varchar | YES | — | — | Medical Council registration |
| consultation_fee | decimal(10,2) | YES | — | — | Standard new-patient fee |
| follow_up_fee | decimal(10,2) | YES | — | — | Reduced fee for follow-ups |
| follow_up_window_days | int | NO | — | 7 | Days within which a return visit qualifies as follow-up |
| available_days | jsonb | YES | — | — | Weekly availability template (e.g. `{"mon":[{"from":"09:00","to":"13:00"}],…}`) |
| slot_duration_mins | int | NO | — | — | Default slot length for appointment generation |
| signature_path | text | YES | — | — | Storage URL for digital signature image |

**Indexes / uniqueness:**
- `user_id` UNIQUE.

---

### 4.5 `roles`

**Purpose:** Named RBAC role bundle. System roles (doctor, front_desk, nurse) ship pre-seeded; tenant admins can create custom roles.
**Lifecycle:** mutable.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| role_name | varchar | NO | UNIQUE per tenant | — | e.g. `doctor`, `front_desk`, `cashier`, `owner` |
| description | text | YES | — | — | Free text |
| is_system_role | boolean | NO | — | FALSE | If TRUE, cannot be deleted by tenant admin |

**Indexes / uniqueness:**
- `(tenant_id, role_name)` UNIQUE.

---

### 4.6 `user_roles`

**Purpose:** Many-to-many bridge — a user may hold multiple roles (e.g. a senior doctor who is also HOD).
**Lifecycle:** mutable.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| user_id | UUID | NO | PK, FK → users(id) | — | |
| role_id | UUID | NO | PK, FK → roles(id) | — | |
| granted_at | timestamptz | NO | — | now() | Audit timestamp |

**Indexes / uniqueness:**
- Composite PK `(user_id, role_id)`.

---

### 4.7 `permissions`

**Purpose:** Granular permission registry. Permission keys are dotted strings like `pharmacy.stock.edit`, `billing.discount.approve`, scanned by app code at every protected action.
**Lifecycle:** mutable; typically seeded from migrations and rarely changed at runtime.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| permission_key | varchar | NO | UNIQUE | — | Dotted permission string |
| description | text | YES | — | — | Free text |
| module | varchar | NO | — | — | Owning module slug, e.g. `pharmacy` |

**Indexes / uniqueness:**
- `permission_key` UNIQUE globally (permissions are not tenant-scoped).

---

### 4.8 `role_permissions`

**Purpose:** Bridge — which permissions does each role grant.
**Lifecycle:** mutable.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| role_id | UUID | NO | PK, FK → roles(id) | — | |
| permission_id | UUID | NO | PK, FK → permissions(id) | — | |

**Indexes / uniqueness:** Composite PK.

---

### 4.9 `user_sessions`

**Purpose:** Live login sessions. Records hashed JWT and refresh-token values for revocation support; backs "log out other devices" and forced sign-out on password change.
**Lifecycle:** mutable; rows pruned by a background sweep after `expires_at + 7 days`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| user_id | UUID | NO | FK → users(id) | — | Owner |
| token_hash | varchar | NO | — | — | SHA-256 of access JWT |
| refresh_hash | varchar | YES | — | — | SHA-256 of refresh JWT |
| issued_at | timestamptz | NO | — | now() | |
| expires_at | timestamptz | NO | — | — | Access-token expiry |
| revoked_at | timestamptz | YES | — | — | Set on explicit logout / password reset |
| user_agent | text | YES | — | — | Client UA string |
| ip_address | varchar | YES | — | — | Source IP at issue time |

**Indexes / uniqueness:**
- `token_hash` indexed for fast revocation check.
- `(user_id, revoked_at)` partial index for active-session listing.

---

### 4.10 `system_config`

**Purpose:** Tenant-level configuration store — feature flags, thresholds, business rules, integration secrets. Read at app startup and on cache-bust events.
**Lifecycle:** mutable; every change is mirrored to `audit_logs`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| config_key | varchar | NO | UNIQUE per tenant | — | e.g. `pharmacy.expiry_warning_days`, `feature.insurance_module` |
| config_value | text | NO | — | — | JSON or scalar string |
| description | text | YES | — | — | Human-readable explanation |
| updated_by | UUID | NO | FK → users(id) | — | Last writer |
| updated_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `(tenant_id, config_key)` UNIQUE.

**Examples:** stock-alert thresholds, OPD slot duration default (per BRD §12 Owner Flow), discount approval matrix, encounter-ID format (locked after first record per BRD §13 Platform Admin), feature flags managed by Platform Admin.

**Maker-checker:** this table carries the Layer 2 `approval_status / approved_by / approved_at / rejection_reason` columns (see [00-audit-logging.md §3](00-audit-logging.md#3-layer-2--maker-checker-columns-7-sensitive-tables)). Tenant-level config changes require approval — owner / platform admin sign-off prevents a single user from silently changing thresholds, approval matrices, or business rules.

---

### 4.11 `user_preferences`

**Purpose:** Per-user UI personalisation. Holds theme, language, date-format, default-role-on-login (when a user holds multiple roles), and per-channel notification opt-ins.
**Lifecycle:** mutable; one row per user, lazily created on first login.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| user_id | UUID | NO | UNIQUE, FK → users(id) | — | Owner |
| default_role_id | UUID | YES | FK → roles(id) | — | Role to assume on login when user has multiple |
| default_landing_path | varchar | YES | — | — | URL/route to land on after login |
| theme | varchar | NO | CHECK ∈ {'light','dark','system'} | 'system' | UI theme |
| language | varchar | NO | — | 'en' | UI language code |
| date_format | varchar | NO | — | 'DD-MM-YYYY' | Display format |
| notifications_email | boolean | NO | — | TRUE | Email channel opt-in |
| notifications_inapp | boolean | NO | — | TRUE | In-app channel opt-in |
| notifications_sms | boolean | NO | — | FALSE | SMS channel opt-in |
| updated_at | timestamptz | NO | — | now() | |

**Indexes / uniqueness:**
- `user_id` UNIQUE.

---

### 4.12 `tenant_holidays`

**Purpose:** Hospital-closure calendar. Drives the appointment-slot generator (skip days the hospital is closed), the IP discharge planner, and pharmacy / lab opening-hours overrides. Tenant-scoped because Kumudha and a future Apollo branch may observe different holidays.
**Lifecycle:** mutable; rows persist for historical reference.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| holiday_date | date | NO | — | — | Local date (interpreted in `tenants.timezone`) |
| holiday_name | varchar | NO | — | — | Display name (e.g. "Diwali", "Pongal", "Republic Day") |
| holiday_type | varchar | NO | CHECK ∈ {'national','state','religious','hospital_specific'} | — | Category |
| affects_op | boolean | NO | — | TRUE | If TRUE, OP slots are not generated and walk-ins are blocked |
| affects_ip | boolean | NO | — | FALSE | If TRUE, IP non-emergency admissions are blocked (emergency always allowed) |
| affects_pharmacy | boolean | NO | — | FALSE | If TRUE, pharmacy is closed (true emergency dispense logged separately) |
| affects_lab | boolean | NO | — | FALSE | If TRUE, lab is closed (stat tests still possible with on-call) |
| affects_radiology | boolean | NO | — | FALSE | If TRUE, radiology is closed |
| notes | text | YES | — | — | Free-form (e.g. "OPD half-day morning only") |

*+ standard inline audit columns (`created_by`, `created_at`, `updated_by`, `updated_at`, `version`) per [00-conventions.md](00-conventions.md#standard-audit-columns).*

**Indexes / uniqueness:**
- `(tenant_id, holiday_date)` UNIQUE — one holiday entry per date per tenant.
- `(tenant_id, holiday_date) WHERE holiday_date >= current_date` — slot generator scan.

**Used by:**
- Slot generator (TSD-05 Appointments) — skips dates where `affects_op=TRUE`.
- Pharmacy / Lab / Radiology workflow guards.
- Hospital Owner dashboard (BRD §12) — overlay of holidays on the daily activity chart.

---

## 5. Cross-References

- **Audit + events for every CRUD here:** [TSD-02 Audit, Events & Notifications](02-audit-events-notifications.md). All writes to `users`, `roles`, `system_config`, etc. should mirror to `audit_logs`.
- **Patient identity (UHID format consumes `tenants.uhid_*`):** [TSD-03 Patient Master](03-patient-master.md).
- **Doctor schedule consumed by appointments:** TSD-05 Appointments *(Batch B)* — `doctor_profiles.available_days` + `slot_duration_mins` drive `appointment_slots` generation.
- **Service pricing references doctors:** TSD-11 Services & Pricing *(Batch D)* — consultation services FK to `doctor_profiles` for fee.
- **Approvals and config drive money flows:** TSD-12 Billing *(Batch D)* and TSD-13 Payments *(Batch D)* read `system_config` for discount thresholds and approval matrix.

---

## 6. Schema Review Notes

Open questions and suggested improvements (impact-tagged per [00-conventions §Schema Review Notes](00-conventions.md#schema-review-notes--what-counts-as-what)).

### Resolved (2026-05-10)
- [x] **`tenants.timezone`** added (default `'Asia/Kolkata'`, changeable). All "local date" reads should be interpreted via this column.
- [x] **`tenant_holidays`** table added (§4.12).
- [x] **`system_config` maker-checker** — Layer 2 columns (`approval_status / approved_by / approved_at / rejection_reason`) carried; tenant-config changes require sign-off.
- [x] **Standard audit columns** (`created_by`, `created_at`, `updated_by`, `updated_at`, `version`) — applied to every mutable table here per [00-conventions.md](00-conventions.md#standard-audit-columns); not repeated in each column spec for readability.

### Open
- [ ] **suggestion** — `tenants.uhid_*` columns model UHID format inline. The runbook describes UHID format as "frozen after first patient." Today there is no DB-level guard; it relies on application logic. Optional: add a CHECK trigger that raises if any of `uhid_prefix`, `uhid_separator`, `uhid_sequence_padding`, `uhid_include_year` is changed while `uhid_sequences.last_sequence > 0` for that tenant. Impact: zero behaviour change in happy path; defends against a Platform Admin support mistake.

- [ ] **suggestion** — `users.profile_data jsonb` is an open-ended grab-bag. Consider a per-role JSON-schema validator or split out high-traffic role fields into typed tables when patterns emerge. Impact: code clarity only; no flow change.

- [ ] **question** — `doctor_profiles.available_days jsonb` template is consumed by appointment-slot generation. The shape isn't standardised in the runbook. Should we lock a JSON schema here in the TSD before TSD-05 (Appointments) is written? Impact: TSD-05 will need to define how it ingests this column; agreeing the shape up front prevents rework.

- [ ] **question** — `permissions.permission_key` is global (no `tenant_id`). For pure platform permissions this is fine, but if a tenant ever wants a custom permission key the model breaks. Worth adding `tenant_id NULL` (NULL = platform-wide) so future custom permissions are possible? Impact: minor; FK from `role_permissions` unaffected.

- [ ] **suggestion** — `system_config.config_value` is `text`. Many keys store JSON; consider `jsonb` for keys flagged as JSON. Alternative: keep `text` and parse in app code (simpler, no DB-level type leakage). The runbook chose text — flagging for visibility, not change.

- [ ] **question** — `user_sessions` stores JWT hashes, so we can revoke. Refresh-token rotation policy isn't captured here. Should there be a `rotated_from_session_id` self-FK to chain rotations for forensic replay? Impact: app-side change; nullable column is additive.

No `[!] blocker` items — all of the above are additive or clarifying.
