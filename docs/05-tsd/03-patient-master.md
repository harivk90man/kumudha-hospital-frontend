# TSD 03: Patient Master

**Status:** Phase 1 — In Scope  |  **Source of truth:** This document
**Last updated:** 2026-05-10  |  **Schema state:** Tentative

---

## 1. Purpose

Patient identity. The single, durable record of a person who interacts with the hospital — across visits, admissions, departments, and lifetimes. Every clinical and financial table FKs back to `patients(id)`.

Three concerns are isolated here:

1. **UHID generation.** Every new patient is assigned a UHID using a tenant-configurable format (`KH-2026-001854` for Kumudha). The number is minted atomically per tenant per year via `uhid_sequences`.
2. **Government ID storage (KYC).** Aadhaar, PAN and similar identifiers are needed for insurance, claims, and statutory reporting. They are **regulated PII** and are stored in a separate, encryption-protected table (`patient_govt_ids`) — not on the main `patients` row.
3. **Duplicate consolidation.** Emergency intake creates `TEMP-KH-*` provisional UHIDs without full demographics; later, when the patient is identified, those are **merged** into a permanent UHID. `patient_merges` tracks every merge with full audit trail and reverse-able unmerge. The list of patient-FK tables that the merge procedure must repoint lives in `patient_mergeable_tables` so it is impossible to add a new patient-related table without registering it.

Patient state (waiting / with doctor / at lab / …) does **not** live here — it lives in [TSD-04 Patient Journey](04-patient-journey.md).

---

## 2. BRD Flows Covered

- [Patient Identity Model](../01-brd/hospital-flows.md#patient-identity-model) — UHID + Internal App ID + mobile number contract; family-shared mobile rule.
- [1. OPD — Outpatient Visit](../01-brd/hospital-flows.md#1-opd--outpatient-visit) — step 2 (new vs returning patient), step 5 (UHID lookup).
- [4. Appointment Booking](../01-brd/hospital-flows.md#4-appointment-booking-flow) — patient lookup or creation at booking time.
- [5. Doctor Flow](../01-brd/hospital-flows.md#5-doctor-flow) — patient file (history, allergies, chronic conditions).
- [7. Lab & Radiology Flow](../01-brd/hospital-flows.md#7-lab--radiology-flow) — patient identification at sample/test collection (UHID or mobile lookup).
- [8. Pharmacy Flow](../01-brd/hospital-flows.md#8-pharmacy-flow) — UHID/mobile lookup at counter check.
- [9. Billing Flow](../01-brd/hospital-flows.md#9-billing-flow) — bill scoped by patient.
- [11. Insurance / TPA Flow](../01-brd/hospital-flows.md#11-insurance--tpa-flow) *(Phase 2)* — KYC verification reads `patient_govt_ids`; PAN required for high-value claims; Aadhaar required for cashless TPA pre-auth.
- [12. Hospital Owner Flow](../01-brd/hospital-flows.md#12-hospital-owner-flow) — patient activity / OP census on dashboard; targeted communications by area (consume `address_pincode`, `address_city`).
- [13. Platform Admin Flow](../01-brd/hospital-flows.md#13-platform-admin-flow) — UHID config unlock (rare data-correction support).

---

## 3. Tables in This TSD

| Table | One-line purpose |
|---|---|
| `patients` | Patient identity master — UHID, demographics, allergies, chronic conditions, structured address (with indexed pincode/city). |
| `patient_govt_ids` | Encrypted store for Aadhaar / PAN / passport / other KYC identifiers, with verification audit. Row-level access restricted (insurance + owner roles only). |
| `patient_merges` | Audit trail for TEMP-UHID → permanent UHID consolidation; supports unmerge if reversal is needed. **Carries Layer 2 maker-checker columns** for unmerge approval. |
| `patient_mergeable_tables` | Registry of every table that holds a `patient_id` FK; the merge procedure reads this list at runtime so no patient-FK table is forgotten. |
| `uhid_sequences` | Atomic counter per `(tenant, year)` driving the next UHID number. |
| `allergies_lookup` | Reference list of allergens (drug, food, environmental, contrast) used as a picklist for `patients.allergies`. |
| `chronic_conditions_lookup` | Reference list of chronic conditions used as a picklist for `patients.chronic_conditions`. |
| `patient_family_history` | First-degree relatives' conditions for genetic / hereditary risk assessment (diabetes, heart disease, cancer, etc.). |

---

## 4. Table Specifications

### 4.1 `patients`

**Purpose:** The canonical patient record. Created by the front-desk register-patient flow (or the emergency triage flow with a `TEMP-KH-*` UHID). Demographics, allergies, and chronic conditions are clinician-relevant on every encounter. Soft-delete via `is_active=false`; merged duplicates use `merged_into_patient_id` to point to the surviving record.
**Lifecycle:** mutable; soft-delete via `is_active`. **Mobile is indexed but not unique** — family members commonly share a mobile (BRD §Patient Identity Model).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key (Internal App ID; never shown to patient) |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| uhid | varchar | NO | UNIQUE per tenant | — | Patient-facing ID; permanent (`KH-2026-001854`) or provisional (`TEMP-KH-2026-000089`) |
| registration_status | varchar | NO | CHECK ∈ {'provisional','complete','merged'} | 'complete' | Lifecycle marker |
| merged_into_patient_id | UUID | YES | FK → patients(id) | — | When `registration_status='merged'`, points to surviving record |
| first_name | varchar | NO | — | — | Given name |
| last_name | varchar | YES | — | — | Family name |
| gender | varchar | NO | CHECK ∈ {'M','F','O'} | — | Biological sex |
| dob | date | YES | CHECK (dob IS NOT NULL OR age IS NOT NULL) | — | Date of birth |
| age | int | YES | CHECK (dob IS NOT NULL OR age IS NOT NULL) | — | Age at registration (when DOB unknown — common for elderly walk-ins). **Snapshot, not current age** — reading code derives current age from `dob` when present. |
| mobile | varchar | NO | — | — | Indexed, **not** unique (family members share) |
| alt_mobile | varchar | YES | — | — | Secondary contact |
| address | jsonb | YES | conforms to *Address JSONB Schema* below | — | Structured address |
| address_pincode | varchar(6) | YES | GENERATED ALWAYS AS (address->>'pincode') STORED | — | Indexed projection of `address.pincode` for area-targeted queries |
| address_city | varchar | YES | GENERATED ALWAYS AS (address->>'city') STORED | — | Indexed projection of `address.city` for area-targeted comms |
| blood_group | varchar | YES | — | — | A+, O−, etc. |
| marital_status | varchar | YES | — | — | Free text or controlled vocab |
| allergies | text[] | YES | — | '{}' | Array of allergy strings |
| chronic_conditions | text[] | YES | — | '{}' | Array of condition strings |
| emergency_contact | jsonb | YES | — | — | `{name, relation, mobile}` |
| is_active | boolean | NO | — | TRUE | Soft-delete flag |
| created_by | UUID | NO | FK → users(id) | — | Registering staff |
| created_at | timestamptz | NO | — | now() | |

> **Note on `aadhaar_last4`** — earlier versions of the runbook held an `aadhaar_last4` column on `patients`. It has been **moved into `patient_govt_ids`** (§4.2 below) so that all Aadhaar-related fields live behind the same encryption/access boundary. Dedup queries that previously hit `patients.aadhaar_last4` now join `patient_govt_ids` filtered by `id_type='aadhaar'`.

**Address JSONB Schema:**

The `address` column conforms to the following shape. Application validation enforces required fields; a CHECK constraint enforces the pincode pattern.

```jsonc
{
  "line1":    "23 Park Street",          // required
  "line2":    "Near Anna Statue",        // optional
  "city":     "Villupuram",              // required
  "district": "Villupuram",              // optional
  "state":    "Tamil Nadu",              // required
  "pincode":  "605602",                  // required, 6 digits, ^[0-9]{6}$
  "country":  "IN"                       // default "IN"
}
```

CHECK constraint: `address IS NULL OR (address ? 'pincode' AND address->>'pincode' ~ '^[0-9]{6}$')`.

**Key relationships:**
- Self-FK `merged_into_patient_id` for merge consolidation.
- Referenced by every clinical / financial / scheduling table — see Cross-References.

**Indexes / uniqueness:**
- `(tenant_id, uhid)` UNIQUE.
- `(tenant_id, mobile)` indexed (not unique).
- `(tenant_id, lower(first_name), lower(last_name), dob)` — name-based duplicate-detection hint.
- `(tenant_id, address_pincode)` — area-targeted comms; cheap because it's a generated B-tree, not JSONB.
- `(tenant_id, address_city)` — same.
- GIN `(address)` — only if free-form JSON queries are needed. Skip if pincode/city is sufficient.

**State transitions:**
- `provisional` (created via emergency / TEMP-UHID) → `complete` (via merge to a permanent record) → row marked `merged` and points at target via `merged_into_patient_id`.

---

### 4.2 `patient_govt_ids`

**Purpose:** Stores government-issued identifiers (Aadhaar, PAN, passport, driving licence, voter ID) under encryption. Required for insurance pre-authorisation, TPA claims, KYC, and statutory reporting. Strictly access-controlled — only the insurance desk, owner, and platform admin roles can decrypt full values; everyone else sees the masked form.

**Why a separate table** (vs columns on `patients`):

- **PII isolation** — backups, exports, and routine reads of `patients` never expose Aadhaar or PAN.
- **Access control** — Postgres row-level security (RLS) policy is applied to this table only; no need to repeat it on every patient-touching screen.
- **Audit granularity** — every read of a decrypted ID can be logged independently of patient reads.
- **Extensibility** — new ID types (passport, driving licence, voter ID, future OCEN/Account Aggregator IDs) are new rows, not new columns.

**Lifecycle:** mutable; soft-delete via `is_active` so a superseded ID (e.g., reissued PAN) is preserved for audit. Encryption: app-level (AES-GCM with envelope encryption via cloud KMS) **or** Postgres `pgcrypto` PGP_SYM. The decryption key is **not** stored in the database.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| patient_id | UUID | NO | FK → patients(id) | — | Owning patient |
| id_type | varchar | NO | CHECK ∈ {'aadhaar','pan','passport','driving_license','voter_id'} | — | Government ID category |
| id_value_encrypted | bytea | NO | — | — | Encrypted full value — never decrypted on read paths outside insurance/owner roles |
| id_value_last4 | varchar(4) | NO | — | — | Last 4 chars in plaintext for display (`XXXX-XXXX-1234`) and dedup hints |
| id_value_hash | bytea | NO | — | — | HMAC-SHA256 of the full value (with tenant-specific salt). Used for exact-match dedup queries without decrypting. |
| issuing_authority | varchar | YES | — | — | E.g. UIDAI, Income Tax Dept, Passport Office |
| holder_name_on_id | varchar | YES | — | — | Name as printed on the document (used to flag mismatches with `patients.first_name + last_name`) |
| verified | boolean | NO | — | FALSE | TRUE once verified by upload review or OTP |
| verified_at | timestamptz | YES | — | — | Verification timestamp |
| verified_by | UUID | YES | FK → users(id) | — | Verifying user (NULL for OTP-verified Aadhaar) |
| verification_method | varchar | YES | CHECK ∈ {'document_upload','aadhaar_otp','manual','tpa_callback'} | — | How verification was completed |
| verification_notes | text | YES | — | — | Free-form notes (e.g. "name mismatch — accepted on Aadhaar") |
| document_attachment_id | UUID | YES | FK → file_attachments(id) | — | Optional scan/photo of the document |
| is_active | boolean | NO | — | TRUE | Soft-delete (e.g. PAN reissued, old PAN deactivated) |
| created_at | timestamptz | NO | — | now() | |
| created_by | UUID | NO | FK → users(id) | — | Capturing staff |
| updated_at | timestamptz | NO | — | now() | |

**Key relationships:**
- `patient_id → patients(id)` — strict ownership.
- `document_attachment_id → file_attachments(id)` — scan of the ID document, scoped under the same access policy.

**Indexes / uniqueness:**
- `(tenant_id, patient_id, id_type) WHERE is_active = TRUE` partial UNIQUE — at most one active ID of each type per patient.
- `(tenant_id, id_type, id_value_hash) WHERE is_active = TRUE` partial UNIQUE — same Aadhaar/PAN cannot belong to two active patient records (catches duplicate registrations of the same person).
- `(tenant_id, id_type, id_value_last4)` — dedup hint scan.

**Format hints (validated in app, not DB):**
- `aadhaar` — 12 digits.
- `pan` — `[A-Z]{5}[0-9]{4}[A-Z]{1}`.
- `passport` — country-prefixed alphanumeric.
- `driving_license` — state-prefixed alphanumeric.

**Access control:**
- Postgres row-level security policy: rows readable in plaintext only when `current_user` has the `insurance_desk`, `owner`, or `platform_admin` role.
- All other roles see `id_value_encrypted` as `NULL` and `id_value_last4` only.
- Every decrypt operation emits a `domain_events` row of type `GovtIdAccessed` with `aggregate_id = patient_govt_ids.id` for forensic audit.

---

### 4.3 `patient_merges`

**Purpose:** Audit trail for duplicate consolidation. The merge transaction repoints child rows from a duplicate (`source_patient_id`) to the surviving record (`target_patient_id`); this table records the reason, who did it, and a per-child-table count of how many rows were repointed. Unmerge is supported but requires founder approval.
**Lifecycle:** **append-only** for the core merge fields; `unmerged_*` columns are added via a separate unmerge transaction.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| source_patient_id | UUID | NO | FK → patients(id) | — | The duplicate (typically a `TEMP-KH-*` from emergency); marked `is_active=false` after merge |
| target_patient_id | UUID | NO | FK → patients(id) | — | The surviving record; all child rows are repointed here |
| reason | text | NO | — | — | Why these are the same person — audit-critical |
| rows_repointed | jsonb | NO | — | — | Per-child-table repoint count, e.g. `{"op_visits":3,"payments":4,"prescriptions":3}` |
| merged_by | UUID | NO | FK → users(id) | — | The performing user |
| merged_at | timestamptz | NO | — | now() | |
| unmerged_at | timestamptz | YES | — | — | Set when the merge is reversed |
| unmerged_by | UUID | YES | FK → users(id) | — | Reversing user |
| unmerge_reason | text | YES | — | — | Why the merge was undone |

**Maker-checker:** this table carries the Layer 2 columns (`approval_status`, `approved_by`, `approved_at`, `rejection_reason` — see [00-audit-logging.md §3](00-audit-logging.md#3-layer-2--maker-checker-columns-7-sensitive-tables)). **Unmerge requires founder approval** per BRD §13 Platform Admin. The original merge can run with `approval_status='approved'` immediately (no separate approval needed) since the merge itself is operational; unmerge transitions through `pending_approval` first.

**Constraints:**
- `CHECK (source_patient_id <> target_patient_id)`.
- `CHECK (created_by <> approved_by)` — separation of duties (the user who recorded the merge cannot also approve their own unmerge).
- The actual merge work happens in stored procedure `sp_merge_patients(source, target, reason, by_user)`. The procedure now reads the table list dynamically from `patient_mergeable_tables` (§4.4) — there is **no hard-coded list**. Steps in one transaction:
  1. Lock both patient rows.
  2. For each row in `patient_mergeable_tables` ordered by `merge_order`: `UPDATE <table_name> SET <fk_column> = target WHERE <fk_column> = source; GET DIAGNOSTICS row_count = ROW_COUNT;` — accumulate into `rows_repointed`.
  3. Update source `patients`: `registration_status='merged'`, `merged_into_patient_id=target`, `is_active=FALSE`.
  4. Insert the audit row.

**Indexes / uniqueness:**
- `target_patient_id` indexed — "show me all duplicates merged into this patient".
- `merged_by` indexed.

---

### 4.4 `patient_mergeable_tables`

**Purpose:** Authoritative list of every table that holds a `patient_id` FK and must be repointed during a merge. Owned by the patient module; populated by every migration that creates such a table.

**Why it exists:** earlier the merge procedure had a hard-coded list of tables. As the schema grows (insurance, dietetics, physiotherapy, future modules), forgetting to update the procedure causes silent data loss — child rows would stay attached to an inactive duplicate. Lifting the list into a table makes the rule mechanical: no table is mergeable until it is registered here, and every patient-FK table must register itself or break a CI test.

**Lifecycle:** mutable; tenant-agnostic (the list is the same for every hospital instance — no `tenant_id`).

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| module | varchar | NO | — | — | Owning module slug (e.g. `clinical`, `pharmacy`, `radiology`) |
| table_name | varchar | NO | UNIQUE | — | Schema-qualified table name (e.g. `op_visits`, `pharmacy_sales`) |
| fk_column | varchar | NO | — | — | The patient FK column (typically `patient_id`) |
| merge_order | int | NO | — | 100 | Ascending order for repoint operations — lets us repoint parents before children when the order matters |
| is_active | boolean | NO | — | TRUE | If FALSE, the procedure skips this table (used for Phase 2 tables whose tenant doesn't have the module enabled) |
| notes | text | YES | — | — | Free-form (e.g. "uses both `patient_id` and `merged_from_patient_id` — see migration #023") |
| added_at | timestamptz | NO | — | now() | |
| added_by | UUID | YES | FK → users(id) | — | Migration-seeded entries leave this NULL |

**Indexes / uniqueness:**
- `table_name` UNIQUE.
- `(is_active, merge_order)` — covering index for the merge procedure's scan.

**CI / test discipline:**
- A test queries `information_schema.columns` for every table containing a `patient_id` column and asserts that each one is registered here. Adding a new patient-FK table without registering it fails CI.

**Initial seed (Phase 1):** `op_visits`, `appointments`, `tokens`, `vitals`, `consultations`, `prescriptions`, `lab_orders`, `radiology_orders`, `pharmacy_sales`, `payees`, `patient_journey_events`, `patient_govt_ids`, `file_attachments` (where `entity_table='patients'`), `audit_logs` (where `entity_table='patients'`).

---

### 4.5 `uhid_sequences`

**Purpose:** Per-tenant, per-year counter for atomic UHID minting. Read-and-increment under row lock so two simultaneous registrations cannot collide on the same number.
**Lifecycle:** mutable — `last_sequence` increments only.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| tenant_id | UUID | NO | PK, FK → tenants(id) | — | Tenant scope |
| year | int | NO | PK | — | Year component of the UHID |
| last_sequence | int | NO | — | 0 | Last issued sequence number |

**Constraints:**
- Composite PK `(tenant_id, year)`.
- Mint operation: `UPDATE uhid_sequences SET last_sequence = last_sequence + 1 WHERE tenant_id = :t AND year = :y RETURNING last_sequence;` — `RETURNING` gives the new number. The Postgres row lock guarantees atomicity.
- Application guardrail: when `last_sequence > 0` for a tenant, any change to `tenants.uhid_*` (format columns) must be blocked — UHID format is locked once the first patient has been minted (BRD §1 Patient Identity Model).

**Indexes / uniqueness:** Composite PK is sufficient; no other indexes.

---

### 4.6 `allergies_lookup`

**Purpose:** Reference list of allergens that staff can pick from when populating `patients.allergies`. Prevents typos (`pencillin` vs `penicillin`) and lets the prescribing-time alert system match against drug allergen-class. Tenant-scoped because some hospitals add region-specific entries (mango, latex local brands, etc.).
**Lifecycle:** mutable; soft-delete via `is_active=false` so an entry already referenced in a patient's array is not orphaned.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| allergen_name | varchar | NO | UNIQUE per tenant | — | Display label (e.g. `'Penicillin'`, `'Sulfa drugs'`, `'Peanut'`) |
| allergen_class | varchar | NO | CHECK ∈ {'drug','food','environmental','contrast','other'} | — | Category |
| drug_class_code | varchar | YES | — | — | When `allergen_class='drug'` — drug class code matched against `medicines.drug_class` for prescribing alerts |
| description | text | YES | — | — | Free-form clinician note |
| is_active | boolean | NO | — | TRUE | Soft-delete |

*+ standard inline audit columns.*

**Indexes / uniqueness:**
- `(tenant_id, lower(allergen_name))` UNIQUE — case-insensitive uniqueness.
- `(tenant_id, allergen_class, is_active)` — picklist filter.

**Used by:**
- Patient registration / edit screen — picklist for `patients.allergies`.
- Prescribing-time match (TSD-07) — when a doctor selects a medicine, the app cross-references `medicines.drug_class` against patient allergies whose `drug_class_code` matches; warns if hit.

---

### 4.7 `chronic_conditions_lookup`

**Purpose:** Reference list of chronic conditions for `patients.chronic_conditions` picklist. Same rationale as allergies — picklist quality + downstream queries (e.g. Owner dashboard filtering by chronic-disease cohort).
**Lifecycle:** mutable; soft-delete.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| condition_name | varchar | NO | UNIQUE per tenant | — | Display label (e.g. `'Type 2 Diabetes Mellitus'`, `'Hypertension'`, `'Asthma'`) |
| icd10_code | varchar | YES | — | — | Optional ICD-10 mapping (e.g. `E11`, `I10`, `J45`) |
| is_active | boolean | NO | — | TRUE | Soft-delete |

*+ standard inline audit columns.*

**Indexes / uniqueness:**
- `(tenant_id, lower(condition_name))` UNIQUE.
- `(tenant_id, icd10_code) WHERE icd10_code IS NOT NULL` — ICD-10 lookup.

**Used by:**
- Patient registration / edit screen — picklist for `patients.chronic_conditions`.
- Doctor's console (TSD-07) — patient-file ribbon shows chronic conditions prominently.
- Owner dashboard (TSD-14) — chronic-disease cohort filtering.

---

### 4.8 `patient_family_history`

**Purpose:** First-degree relatives' medical history for genetic / hereditary risk assessment. Captured at registration (or updated when a patient discloses new family history). Drives doctor's risk-assessment view (e.g. "father had MI at 52" → flag cardiac risk during consultation).
**Lifecycle:** mutable; soft-delete via `is_active`.

| Column | Type | Null | Constraint | Default | Meaning |
|---|---|---|---|---|---|
| id | UUID | NO | PK | gen_random_uuid() | Surrogate key |
| tenant_id | UUID | NO | FK → tenants(id) | — | Tenant scope |
| patient_id | UUID | NO | FK → patients(id) | — | Subject patient |
| relationship | varchar | NO | CHECK ∈ {'father','mother','sibling','child','grandparent','other'} | — | First-degree (or grandparent) relation |
| relationship_specific | varchar | YES | — | — | Free-form when `relationship='other'` (e.g. `'maternal aunt'`) |
| condition_name | varchar | NO | — | — | Free-text condition (or pick from `chronic_conditions_lookup` — soft reference, not FK) |
| icd10_code | varchar | YES | — | — | Optional ICD-10 if known |
| age_of_onset | int | YES | — | — | Approximate age the relative developed the condition |
| is_deceased | boolean | NO | — | FALSE | Whether the relative is deceased |
| age_at_death | int | YES | — | — | When `is_deceased=TRUE` and known |
| cause_of_death | text | YES | — | — | Free-form when `is_deceased=TRUE` |
| notes | text | YES | — | — | Free-form clinician note |
| is_active | boolean | NO | — | TRUE | Soft-delete |

*+ standard inline audit columns.*

**Indexes / uniqueness:**
- `(tenant_id, patient_id, is_active)` — patient's family-history list.
- `(tenant_id, patient_id, relationship, condition_name) WHERE is_active = TRUE` partial UNIQUE — prevents duplicate `('father','MI')` entries for the same patient.

**Used by:**
- Patient registration extended form.
- Doctor's console patient-file pane (TSD-07) — risk-flag display.
- Future analytics: hereditary-risk cohort analysis.

**Why a separate table** (vs JSONB on `patients`):
- Per-row audit (each entry has its own provenance — when added, by whom).
- Searchable by condition for cohort analysis.
- Multiple entries per patient (typically 3–10) without bloating the `patients` row.

---

## 5. Cross-References

- **UHID format columns are configured in:** [TSD-01 Platform & Tenancy](01-platform-tenancy.md) §4.1 `tenants.uhid_*`.
- **Patient state machine (waiting / with doctor / at lab / …):** TSD-04 Patient Journey *(Batch B)*.
- **Audit row on every write:** [TSD-02 Audit, Events & Notifications](02-audit-events-notifications.md) §4.1 `audit_logs`.
- **Govt-ID document scans:** [TSD-02 Audit, Events & Notifications](02-audit-events-notifications.md) §4.6 `file_attachments` (with `entity_table='patient_govt_ids'`).
- **Govt-ID decrypt audit events:** [TSD-02 Audit, Events & Notifications](02-audit-events-notifications.md) §4.2 `domain_events` (event_type=`GovtIdAccessed`).
- **Encounters anchored to `patients`:** TSD-06 OPD Encounters *(Batch B)* (`op_visits.patient_id`), phase-2/15 IPD (`ip_admissions.patient_id`).
- **Appointments scoped to `patients`:** TSD-05 Appointments *(Batch B)*.
- **Bills scoped to `patients` via `payees`:** TSD-13 Payments *(Batch D)* (`payees.patient_id`).
- **Lab / radiology / pharmacy lookups:** TSD-08 Lab, TSD-09 Radiology, TSD-10 Pharmacy *(Batch C)*.
- **Insurance / TPA reads `patient_govt_ids`:** future Phase 2 TSD (Insurance) — Aadhaar required for cashless TPA pre-auth, PAN for high-value claims.

---

## 6. Schema Review Notes

### Resolved (decisions made 2026-05-10)

- [x] **Aadhaar / PAN handling** — moved out of `patients.aadhaar_last4` into a new dedicated table `patient_govt_ids` with encryption + RLS + audit. Phase 1 (not Phase 2). Carried forward: insurance / TPA flow will read this table.
- [x] **Address JSONB shape** — formal schema locked above (§4.1 *Address JSONB Schema*). Generated columns `address_pincode` and `address_city` added with B-tree indexes for area-targeted comms queries. CHECK constraint enforces 6-digit pincode.
- [x] **`uhid_sequences` location** — kept in patient master (this TSD).
- [x] **Merge mechanism** — adopted Option B: list of mergeable tables lifted into `patient_mergeable_tables` registry; `sp_merge_patients` reads it at runtime; CI test asserts every patient-FK column has a registered row.
- [x] **Allergies / chronic conditions** — kept as `text[]` on `patients`; introduced `allergies_lookup` and `chronic_conditions_lookup` reference tables. `_lookup` naming convention per [00-conventions.md §Naming](00-conventions.md#naming-conventions).
- [x] **Family medical history** — added `patient_family_history` (§4.8) for genetic-risk assessment.
- [x] **Maker-checker on `patient_merges`** — Layer 2 columns added; unmerge requires founder approval.
- [x] **Standard inline audit columns** — applied to every mutable table here per [00-conventions.md](00-conventions.md#standard-audit-columns); not repeated in each column spec.
- [x] **Language preference** — deferred per user decision (cost to add later is low; no historical-data loss for v1).

### Open

- [ ] **suggestion** — `patient_govt_ids` decryption key management is described as "envelope encryption via cloud KMS". For Kumudha's single-on-prem deployment this needs a concrete plan (HashiCorp Vault? Postgres TDE? File-based key with restricted file perms?). Defer to deployment / infra TSD.
- [ ] **suggestion** — `patient_govt_ids.id_value_hash` uses HMAC-SHA256 with a tenant-specific salt. The salt itself must be stored somewhere out of the DB — typically the same KMS as the encryption key. Defer to infra TSD.
- [ ] **question** — When a merge is **unmerged**, the runbook says it's "supported." Does the unmerge procedure (a) restore source `is_active=TRUE` + `registration_status='complete'` and repoint child rows back, or (b) just mark the merge as reversed? Needed before TSD-04 (which writes journey events for merge / unmerge).
- [ ] **suggestion** — `patients.created_by` is NOT NULL. For BRD §4 app-self-service registration we'll need either a synthetic "Self-Service" user or a `created_via` enum (`'staff' | 'self' | 'integration'`). Flagging now to resolve before TSD-05 (Appointments) covers the app-self-service booking path.
- [ ] **suggestion** — `patients.allergies` and `chronic_conditions` are `text[]` of free strings. For BRD §5 Doctor flow's "drug interaction at prescribing" check we'll eventually want coded entries (RxNorm / SNOMED CT). Flag for future clinical-data-quality TSD; no Phase 1 change.
- [ ] **question** — `patient_mergeable_tables.merge_order` defaults to 100. Are there any patient-FK relationships where order matters (parent before child)? If FK constraints don't have ON UPDATE actions, order shouldn't matter. Confirm during migration writing.
