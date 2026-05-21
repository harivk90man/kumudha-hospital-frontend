# HMS v8 — Complete Design & Schema Runbook

**Hospital:** Kumudha Hospital, Villupuram (`tenant_code='KH'`, UHID prefix `KH-YYYY-NNNNNN`)
**Schema version:** v8
**Last updated:** 9 May 2026
**Total:** 17 modules · 117 tables · ~1,220 fields · 7 triggers · 40+ indexes
**Scope:** v1 ships modules 5.1–5.8 + 5.11–5.15 (13 modules). **Phase 2** (deferred): IP, Surgery, HR · Attendance, Payroll. Module structure was reorganised on 9 May 2026 to carve patient identity / journey / inventory out of Core and to fence off out-of-scope work.

> The durable design reference. Read it to understand *why* the schema looks the way it does, *what* each table is for, *which screens* touch each table, and *how* the operational-safety triggers keep the system honest.
>
> **Companion artifacts (paths relative to repo root):**
> - [hms_full_schema_v7.html](hms_full_schema_v7.html) — visual schema browser with field-level help text in a clickable drawer
> - [kumudha_hms_prototype.html](../../kumudha_hms_prototype.html) — interactive 8-persona UI prototype with per-view schema hints showing which tables each screen reads from / writes to. Open in any browser; state persists to localStorage.
> - [SCHEMA_v8_OPTIMIZATIONS.md](../../SCHEMA_v8_OPTIMIZATIONS.md) — review document (47 hospital journeys audited) *(not yet authored)*
> - [db/migrations/V0__schema_v8_upgrade.sql](../../db/migrations/V0__schema_v8_upgrade.sql) — Flyway migration that creates / extends every v8 element *(planned location)*

---

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Cross-Cutting Concerns](#3-cross-cutting-concerns)
   - [Patient identity model](#patient-identity-model)
   - [Hybrid state model](#hybrid-state-model)
   - [Token uniqueness & slot lock](#token-uniqueness--slot-lock)
   - [Payment + payee decoupling](#payment--payee-decoupling)
   - [Polymorphic payment-source bridge](#polymorphic-payment-source-bridge)
   - [Multi-tenancy](#multi-tenancy)
   - [Audit & append-only invariants](#audit--append-only-invariants)
   - [Optimistic locking & idempotency](#optimistic-locking--idempotency)
4. [The Patient Journey (worked example)](#4-the-patient-journey)
5. [Module Deep Dives](#5-module-deep-dives)
   - [5.1 Core / Platform](#51-core--platform)
   - [5.2 Patient Master](#52-patient-master) *(carved out of Core)*
   - [5.3 Patient Journey / Workflow](#53-patient-journey--workflow) *(carved out of Core + Patient Encounters)*
   - [5.4 Scheduling](#54-scheduling)
   - [5.5 Patient Encounters](#55-patient-encounters)
   - [5.6 Clinical](#56-clinical) *(now includes vitals + physio_sessions)*
   - [5.7 Billing](#57-billing)
   - [5.8 Cash & Closure](#58-cash--closure)
   - [5.9 IP](#59-ip) — **Phase 2**
   - [5.10 Surgery](#510-surgery) — **Phase 2**
   - [5.11 Lab](#511-lab)
   - [5.12 Radiology](#512-radiology)
   - [5.13 Pharmacy](#513-pharmacy)
   - [5.14 Inventory](#514-inventory) *(medicines + medicine_batches — kept in scope so doctors can prescribe)*
   - [5.15 Reports / Analytics](#515-reports--analytics) *(was: Admin & Insights)*
   - [5.16 HR · Attendance](#516-hr--attendance) — **Phase 2**
   - [5.17 Payroll](#517-payroll) — **Phase 2**
6. [Operational Safety: Triggers & Invariants](#6-operational-safety-triggers--invariants)
7. [Indexes for Query Patterns](#7-indexes-for-query-patterns)
8. [Compliance Surfaces](#8-compliance-surfaces)
9. [State Catalog Reference (codes 100–710)](#9-state-catalog-reference)
10. [Deferred / Future Extensibility](#10-deferred--future-extensibility)

---

## 1. Project Vision

Kumudha Hospital is a mid-size hospital in Villupuram, Tamil Nadu. The HMS supports the full clinical, operational, and financial workflow.

**Operational scope:**
- 60–70 OP visits per day across multiple specialties
- 10–20 surgeries per month
- ~50 staff across front desk, nursing, doctors, pharmacy, lab, radiology, ward, HR, admin
- Inpatient ward + ICU + 3 operation theatres
- In-house pharmacy, lab, radiology departments

**Design priorities (in order):**
1. **Clinical safety** — accurate vitals, prescriptions, lab results, medication administration logs; critical results acknowledged within SLA
2. **Financial integrity** — every rupee tracked, attributable, audit-ready; GST split enforced; refunds & adjustments via credit notes
3. **Operational visibility** — at-a-glance state of every patient, every queue, every bed
4. **Regulatory compliance** — MLC register, NDPS narcotic register, NABL/audit trails, append-only event logs
5. **AI-friendly extensibility** — schema designed so AI assistants and engineers can extend the system without breaking invariants
6. **Multi-tenant from day 1** — single-hospital deployment now, but `tenant_id` everywhere so SaaS expansion needs zero migration later

---

## 2. Architecture Decisions

### Modular monolith on PostgreSQL

Kumudha chose a **modular monolith** in PostgreSQL with strict folder discipline. Rationale:

- **One database, one deploy** — patient safety > scaling fanciness; no distributed-transaction headaches
- **Module boundaries enforced in code, not network calls** — each module owns its tables and exposes a service API
- **Cross-module references use fully qualified names** — a doctor module accidentally joining `clinical.consultations` to `payroll.payslips` would be a clear smell
- **Materialized views, not microservices, for analytics** — `mv_revenue_daily`, `mv_revenue_by_doctor`, `mv_outstanding_dues`, etc.

### Foreign key style

- **All PKs are UUIDs** — synthetic, never shown in UI
- **Business identifiers (UHID, op_number, ip_number, invoice_number, mlc_number) are UNIQUE columns**, not PKs
- This separates *what the database uses to link rows* from *what humans see and remember*. Format changes to UHID don't cascade through 100 tables.

### Append-only event tables

Five tables are append-only by design:

- `audit_logs` — every CRUD for compliance
- `domain_events` — business events for subscribers
- `patient_journey_events` — patient state transitions
- `narcotic_register` — NDPS Act compliance (7-year retention)
- `service_price_history` — fee/price audit

Rows in these tables are never UPDATEd or DELETEd. Historical truth is preserved.

### Trigger-driven invariants

Critical invariants are enforced by Postgres triggers, not application code:

- Stock decrement on dispense (FEFO)
- Lab result auto-flagging (low/normal/high/critical)
- Critical-result alert generation
- Bed assignment closure on discharge
- Service price history append
- Denormalized state-pointer sync (`op_visits.current_state_code`, `ip_admissions.current_bed_id`)

See [§6 Operational Safety](#6-operational-safety-triggers--invariants).

---

## 3. Cross-Cutting Concerns

These design patterns span multiple modules. Understanding them is prerequisite to understanding individual tables.

### Patient identity model

**`patients.id`** — UUID PK; never shown in UI; used for all FK joins.

**`patients.uhid`** — business identifier shown everywhere (e.g. `KH-2026-001854`). UNIQUE indexed but **not** the PK.

**Provisional UHIDs (`TEMP-KH-2026-000089` for emergency entry)** need to be merged into real UHIDs without rewriting every clinical row. The merge flow:

1. Stored procedure `sp_merge_patients(source_id, target_id, reason, by_user)` runs in a single transaction
2. Repoints child rows (`op_visits`, `payments`, `lab_orders`, `radiology_orders`, `prescriptions`, `patient_journey_events`, `consultations`, `vitals`, `interim_bills`, `discharge_summaries`, `pharmacy_sales`, `surgery_schedules`, `appointments`)
3. Inserts an audit row in `patient_merges` with `rows_repointed` count per child table
4. Sets `patients.merged_into_patient_id` on source row + `is_active=false`

**Unmerge** is supported (`unmerged_at`, `unmerged_by`, `unmerge_reason`) but requires founder approval — used only when wrong identity was assumed.

### Hybrid state model

Patient state lives in **two places**:

| Place | Purpose | When to read |
|---|---|---|
| `patient_journey_events` (append-only) | Truth — every transition with timestamp, station, actor | Audit, timeline, bottleneck analysis |
| `op_visits.current_state_code`, `ip_admissions.current_state_code` (denormalized) | Fast read for dashboards | Live queue, doctor's console, beds |

The denormalized columns are **synced by trigger** (`fn_sync_op_visit_state`) on every `patient_journey_events` insert. Never write to them directly from app code.

### Token uniqueness & slot lock

**Tokens are never reused.** A cancelled token (`tokens.status='cancelled'`) stays in the table forever, and the same `token_sequence` is never reissued for that `(tenant, service_type, provider, date)` tuple.

**v8 fix:** the original UNIQUE constraint broke for non-provider tokens (lab L-04, pharmacy P-08) where `provider_id IS NULL`, because `NULL <> NULL` in SQL. Replaced with two partial unique indexes:

```sql
CREATE UNIQUE INDEX uq_tokens_with_provider
    ON tokens(tenant_id, service_type, provider_id, issue_date, token_sequence)
    WHERE provider_id IS NOT NULL;
CREATE UNIQUE INDEX uq_tokens_no_provider
    ON tokens(tenant_id, service_type, issue_date, token_sequence)
    WHERE provider_id IS NULL;
```

When an appointment is rescheduled, **both** the old token and the old slot are released atomically (in one transaction).

### Payment + payee decoupling

Payments don't FK directly to patients. They go through `payees`:

```
payments.payee_id → payees.id
                   payees.patient_id (nullable)
                   payees.vendor_id (nullable)
                   payees.employee_user_id (nullable)
                   payees.name (nullable, free-text for walk-in/other)
```

Why: not every payment is from a patient. The system handles:
- Patient payments (for OP/IP/pharmacy bills)
- Walk-in OTC pharmacy customers (no UHID)
- Vendor refunds (we paid them too much, they refund)
- Employee advances and salary advances

**Multi-allocation splits** are handled by `payment_allocations`:

```
payments (one row, total amount)
    └─ payment_allocations (multiple rows, split across invoices/advances/refunds)
```

One UPI payment of ₹5,000 from a patient could allocate ₹3,000 to a pharmacy bill and ₹2,000 to an IP advance. `payment_allocations` makes that traceable.

### Polymorphic payment-source bridge

A second, parallel way to look at payments — answers "what did this payment actually pay for?" in one hop, without going through invoices.

```
payments  ──┐
            ├─►  payment_items  ──►  payment_item_types  (lookup: 1=xray, 2=pharma, 3=consult, 4=lab, 5=cafe)
            │         │
            │         └─►  item_record_id  ──►  payment_xray | payment_pharmacy | payment_consultation | payment_lab | payment_cafeteria
```

**Why it exists alongside `invoices` / `invoice_items`:**

- `invoice_items` is invoice-centric (printable bill structure)
- `payment_items` is **payment-centric** — fastest path from a money event back to the service it funded
- The detail tables (`payment_xray`, etc.) hold per-type columns cleanly without NULL sprawl on a single wide line-item table
- Adding a new revenue stream (e.g. ambulance, physio) is just one `INSERT` into `payment_item_types` + one new `payment_<type>` table — no migration of the central table

**Trade-off:** `payment_items.item_record_id` is polymorphic — DB cannot enforce its target. App code must dispatch via `payment_item_types.detail_table`.

**SQL behind revenue-by-source:**
```sql
SELECT pit.code, SUM(pi.amount)
FROM payment_items pi
JOIN payment_item_types pit ON pit.id = pi.payment_type_id
WHERE pi.payment_id IN (SELECT id FROM payments WHERE payment_date BETWEEN :from AND :to)
GROUP BY pit.code;
```

### Multi-tenancy

Even though Kumudha Hospital is single-tenant today, the design assumes a future SaaS rollout. **Every query filters by tenant.** Every FK is implicitly scoped (a `patient_id` only resolves within the same tenant).

In v8, `patient_journey_events.tenant_id` was added to close a gap — multi-tenant audit-trail queries must not scan across tenants.

### Audit & append-only invariants

**Strictly append-only** tables (no UPDATE, no DELETE — errors corrected by appending an adjustment row):

| Table | Retention |
|---|---|
| `audit_logs` | 7 years |
| `domain_events` | 3 years (long enough for replay) |
| `patient_journey_events` | 7 years |
| `narcotic_register` | 7 years (NDPS Act) |

**Closed-period history** (insert + close-period UPDATE only — never DELETE, never edit historical values):

| Table | Retention | Pattern |
|---|---|---|
| `service_price_history` | 10 years | INSERT new row + UPDATE prior row's `effective_to` to close the period |

The closed-period pattern is technically an UPDATE, but only of the period boundary on the *previous* row — historical price values themselves are immutable.

### Optimistic locking & idempotency

Financial and stock-mutating tables carry a `version` column for optimistic locking:

`invoices`, `payments`, `ip_admissions`, `bed_assignments`, `medicine_batches`, `pharmacy_sales`

App pattern:
```sql
SELECT version, ... FROM invoices WHERE id = :id;
-- compute new state
UPDATE invoices SET amount_paid = :p, version = version + 1
 WHERE id = :id AND version = :v;  -- 0 rows updated → conflict, retry
```

Write endpoints accept an **idempotency key** (`payments.idempotency_key`, `pharmacy_sales.idempotency_key`) with a partial UNIQUE index. A retried request with the same key fails fast — no double-charge.

---

## 4. The Patient Journey

A worked example showing how the modules tie together for one patient over one day.

**Patient:** Mrs. Lakshmi G., new walk-in with skin rash. Sees Dr. Priya, gets a chest X-ray ordered alongside Rx, leaves with prescription dispensed.

**Reading rules:**
1. Every state transition is its own `patient_journey_events` row — never compress two transitions into one.
2. Payment timing follows `service_billing_policies`. For `before_service` services (op_consultation, radiology, pharmacy_rx), `awaiting_billing → paid` happens *before* the next service-pending state.
3. Triggers fire AFTER their source insert. The trigger consequence is shown on the line *below* the row that fires it.
4. Tokens are issued at request time, not retroactively at billing.
5. `patient_queue` rows track the patient's physical location — closed when the patient leaves a station, opened at the next.

---

### 08:30 — Front Desk · Latha registers Lakshmi

**What's happening:** Mrs. Lakshmi G. walks in with a skin rash. Latha at the front desk pulls up the registration screen, doesn't find an existing UHID for her mobile number, so creates a new patient. The system mints a fresh UHID by atomically incrementing `uhid_sequences` (so two simultaneous registrations can't clash), inserts the patient row, opens an OP visit shell (with no state code yet — the trigger will fill it in), records the arrival as a `walk_in_arrived` journey event, and immediately progresses through `registered` to `awaiting_billing` because Kumudha's policy is "consultation fee paid before service". A token D-04 is issued for Dr. Priya. Lakshmi is told to step over to the billing counter.

**SQL:**
```sql
UPDATE uhid_sequences SET last_sequence = last_sequence + 1
   WHERE tenant_id = :KH AND year = 2026 RETURNING last_sequence;     -- atomic mint
INSERT patients (uhid='KH-2026-001854', is_active=true, …)
INSERT op_visits (op_number='OP-2026-58821', current_state_code=NULL, …)
INSERT patient_journey_events (NULL → 'walk_in_arrived')              -- code 100
   └─ trigger fn_sync_op_visit_state ⇒ op_visits.current_state_code=100
INSERT patient_journey_events ('walk_in_arrived' → 'registered')      -- code 110
   └─ trigger ⇒ current_state_code=110
INSERT tokens (token_number='D-04', service_type='consultation', provider_id=Priya,
               context_table='op_visits', context_id=<v.id>, status='active')
INSERT patient_journey_events ('registered' → 'awaiting_billing')     -- 200 · before_service policy
   └─ trigger ⇒ current_state_code=200
INSERT patient_queue (station=billing, op_visit_id=<v.id>)
```

### 08:35 — Billing counter · Latha collects ₹400 OP fee

**What's happening:** Lakshmi reaches the billing counter. Latha sees her in the queue, pulls up the open OP visit, generates an invoice for the consultation fee. Healthcare services are GST-exempt so CGST/SGST are zero. Latha takes Lakshmi's UPI payment — the receipt-printer slip carries an idempotency key so accidental retries don't double-charge. The payment is allocated to the invoice. A `payment_consultation` detail row plus a `payment_items` bridge row are written so revenue-by-source reports can answer "how much did consultations earn last month" with one query against `payment_items` later. The invoice update uses optimistic locking — if a parallel cashier had also touched it, this transaction would fail and Latha would be told to retry. Two journey events fire: `awaiting_billing → paid` and `paid → awaiting_vitals`. Latha tells Lakshmi to wait at the vitals room.

**SQL:**
```sql
UPSERT payees (payee_type='patient', patient_id=<lakshmi.id>)
INSERT invoices (invoice_type='OP', balance=400.00, payment_status='finalized', version=0)
INSERT invoice_items (item_type='consultation', cgst_pct=0, sgst_pct=0,    -- healthcare exempt
                      total_price=400.00, reference_id=<v.id>)
INSERT payments (amount=400, payment_direction='in', payment_mode='upi',
                 idempotency_key=<uuid>, session_id=<open session>, version=0)
INSERT payment_allocations (allocation_type='invoice', invoice_id=<inv.id>, amount=400)
INSERT payment_consultation (doctor_id=Priya, visit_type='new', fee=400, amount=400)
INSERT payment_items (payment_type_id=3, item_record_id=<pc.id>, amount=400)
UPDATE invoices SET amount_paid=400, balance=0, payment_status='paid', version=1
                WHERE id=<inv.id> AND version=0;                       -- optimistic lock
INSERT patient_journey_events ('awaiting_billing' → 'paid')           -- 220
INSERT patient_journey_events ('paid' → 'awaiting_vitals')            -- 120
   └─ trigger ⇒ current_state_code=120
UPDATE patient_queue (close billing, served_at=now)
INSERT patient_queue (station=vitals)
```

### 08:38 — Vitals room · Sister Meena captures vitals

**What's happening:** Sister Meena calls Lakshmi into the vitals room. She measures BP (120/78), pulse (72), temperature (98.6), enters them into the tablet. The vitals row goes into the database. The journey event `awaiting_vitals → awaiting_doctor` fires the state-sync trigger which updates `op_visits.current_state_code=140`, so Dr. Priya's console will now show Lakshmi as the next patient. The vitals queue is closed and a new queue row is opened at Dr. Priya's room.

**SQL:**
```sql
INSERT vitals (bp_systolic=120, bp_diastolic=78, pulse_rate=72, temperature_f=98.6,
               recorded_by=Meena)
INSERT patient_journey_events ('awaiting_vitals' → 'awaiting_doctor') -- 140
   └─ trigger ⇒ current_state_code=140
UPDATE patient_queue (close vitals)
INSERT patient_queue (station='doctor:priya')
```

### 09:10 — Dr. Priya calls patient in

**What's happening:** Dr. Priya finishes with her previous patient, looks at her console, sees Lakshmi at the top of the queue with token D-04. She clicks "Call next" — that updates the token's status to `called` so the corridor display board changes "NOW SERVING" to D-04, and writes the journey event `awaiting_doctor → in_consultation`.

**SQL:**
```sql
UPDATE tokens SET status='called', called_at=now WHERE token_number='D-04';
INSERT patient_journey_events ('awaiting_doctor' → 'in_consultation') -- 150
   └─ trigger ⇒ current_state_code=150
```

### 09:14 — Consultation, Rx, X-ray ordered

**What's happening:** Dr. Priya examines Lakshmi, takes history, reaches a working diagnosis of unspecified dermatitis (ICD-10 L30.9), and decides to (a) prescribe three topical medicines and (b) order a chest X-ray to rule out a systemic cause. She writes everything in the consultation screen and clicks "Complete". The system writes a `consultations` row, then a `prescriptions` header with three `prescription_items`, then one `radiology_orders` row in `'ordered'` status with `invoice_id=NULL` (because the X-ray hasn't been billed yet — billing comes next per policy). A new token X-03 is issued *now* for radiology so Lakshmi has a queue position there. Token D-04 is closed. Two journey events fire: `in_consultation → consultation_done` then `consultation_done → awaiting_billing`. The doctor's queue row is closed; a side-trip queue row is opened at billing — `parent_queue_id` points to the just-closed doctor row, so the system knows this is a detour.

**SQL:**
```sql
INSERT consultations (chief_complaint='skin rash …', diagnoses=[{icd10:'L30.9',…}],
                      next_action='lab_ordered')
INSERT prescriptions (consultation_id=<c.id>, status='active')
INSERT prescription_items × 3 (drug, dose, freq, duration, qty)
INSERT radiology_orders (radiology_procedure_id=<CXR PA>, status='ordered',
                         payment_required_before_service=TRUE, invoice_id=NULL)
INSERT tokens (token_number='X-03', service_type='radiology', provider_id=NULL,
               context_table='radiology_orders', context_id=<ro.id>, status='active')
UPDATE tokens SET status='completed', completed_at=now WHERE token_number='D-04';
INSERT patient_journey_events ('in_consultation' → 'consultation_done')  -- 160
INSERT patient_journey_events ('consultation_done' → 'awaiting_billing') -- 200 · X-ray fee
   └─ trigger ⇒ current_state_code=200
UPDATE patient_queue (close doctor:priya)
INSERT patient_queue (station=billing, parent_queue_id=<doctor row>,
                      return_to_provider_id=Priya)                    -- side-trip
```

### 09:18 — Billing · Latha collects ₹350 X-ray fee

**What's happening:** Lakshmi is back at billing for the X-ray fee. Same payment dance as the consultation fee but with a different detail-table — `payment_xray` instead of `payment_consultation`. The chest X-ray (CXR PA) is also a healthcare service, so GST is again zero. Notice that the `radiology_orders` row is updated *retroactively* to set its `invoice_id` — when Dr. Priya ordered it, no invoice existed yet. Two journey events: `awaiting_billing → paid`, `paid → imaging_pending`. Lakshmi walks across to the radiology room.

**SQL:**
```sql
INSERT invoices (invoice_type='OP', balance=350, version=0)
INSERT invoice_items (item_type='radiology', cgst_pct=0, sgst_pct=0, total_price=350,
                      reference_id=<ro.id>)
INSERT payments (amount=350, payment_mode='upi', idempotency_key=<uuid>, version=0)
INSERT payment_allocations (allocation_type='invoice', invoice_id=<inv2.id>)
INSERT payment_xray (radiology_order_id=<ro.id>, procedure_name='CXR PA',
                     modality='xray', rate=350, amount=350)
INSERT payment_items (payment_type_id=1, item_record_id=<px.id>, amount=350)
UPDATE radiology_orders SET invoice_id=<inv2.id>, version=version+1 WHERE id=<ro.id>;
UPDATE invoices SET payment_status='paid', balance=0, version=1;
INSERT patient_journey_events ('awaiting_billing' → 'paid')           -- 220
INSERT patient_journey_events ('paid' → 'imaging_pending')            -- 400
UPDATE patient_queue (close billing side-trip)
INSERT patient_queue (station=radiology)
```

### 09:22 — Radiology · X-ray tech captures study

**What's happening:** The radiology technician (a different person from the radiologist) calls token X-03, positions Lakshmi for a PA chest film, takes the shot. The DICOM image is sent to the PACS server (Orthanc); the system stores the resulting `study_uid` so the radiologist can pull it up later. The order status moves through `in_progress → completed`. The patient's state moves to `imaging_done` — the picture has been taken but no doctor has read it yet. X-03 is closed.

**SQL:**
```sql
UPDATE radiology_orders SET status='in_progress', version=version+1;
INSERT radiology_studies (study_uid=<DICOM>, technician_id=<tech>,
                          study_completed_at=now)
UPDATE radiology_orders SET status='completed', version=version+1;
INSERT patient_journey_events ('imaging_pending' → 'imaging_done')    -- 410
UPDATE tokens SET status='completed' WHERE token_number='X-03';
UPDATE patient_queue (close radiology)
```

### 09:25 — Radiology · Dr. Vinod reports

**What's happening:** Dr. Vinod (radiologist) opens his worklist, sees Lakshmi's just-completed study, pulls up the DICOM viewer. He reads the film, dictates findings ("Lung fields clear. No focal lesion. Cardiac silhouette normal."), and signs the report with an impression of "Normal study". The `radiology_reports` row is written; the order status moves to `reported`. Two journey events fire: `imaging_done → imaging_reported`, then `imaging_reported → rx_pending` (Lakshmi is now ready for her prescription pickup). A pharmacy token P-12 is issued at this moment — *not earlier* — because she couldn't go to pharmacy until imaging was done.

**SQL:**
```sql
INSERT radiology_reports (radiology_order_id=<ro.id>, findings=…, impression='Normal study',
                          reported_by_radiologist_id=Vinod)
UPDATE radiology_orders SET status='reported', version=version+1;
INSERT patient_journey_events ('imaging_done' → 'imaging_reported')   -- 420
INSERT patient_journey_events ('imaging_reported' → 'rx_pending')     -- 500
   └─ trigger ⇒ current_state_code=500
INSERT tokens (token_number='P-12', service_type='pharmacy',
               context_table='prescriptions', context_id=<rx.id>)
INSERT patient_queue (station=pharmacy)
```

### 10:10 — Pharmacy · Karthik dispenses Rx

**What's happening:** Karthik at the pharmacy counter sees P-12 in his queue. He calls the token, looks up Lakshmi's prescription, and starts dispensing. For each of the three medicines, he picks the batch with the earliest expiry (FEFO — First Expiry First Out) — the system enforces this in the UI by sorting `medicine_batches` ascending on `expiry_date`. The pharmacy_sales row carries an idempotency key (so a stuck-button doesn't double-dispense) and is attached to Karthik's currently-open `business_session` (his cash drawer). Inserting each `pharmacy_sale_item` fires the `fn_decrement_stock` trigger, which atomically subtracts the dispensed quantity from `medicine_batches.quantity_available` and writes a `stock_movements` audit row. **If any batch had insufficient stock, the entire transaction would roll back** — Karthik would have to pick a different batch or break the line. Pharmacy products do attract GST (5% / 12% / 18% by HSN code), so the invoice carries proper CGST/SGST. Lakshmi pays ₹248 cash. Three `payment_pharmacy` detail rows + three `payment_items` bridge rows are written. The prescription is marked `dispensed`; each `prescription_item.dispensed_qty` is updated. P-12 is closed. Final journey events: `rx_pending → rx_dispensed → completed`. Lakshmi heads home.

**SQL:**
```sql
UPDATE tokens SET status='called', called_at=now WHERE token_number='P-12';
INSERT pharmacy_sales (sale_type='op_patient', prescription_id=<rx.id>,
                       idempotency_key=<uuid>, session_id=<open>, version=0)
INSERT pharmacy_sale_items × 3 (one per prescription_item, FEFO batch pick)
   └─ trigger fn_decrement_stock × 3:
        UPDATE medicine_batches SET quantity_available=quantity_available-:qty,
                                     version=version+1
                                 WHERE id=<batch> AND quantity_available >= :qty;
        INSERT stock_movements (movement_type='sale_out', quantity=-:qty)
INSERT invoices (invoice_type='PHARMACY', version=0)
INSERT invoice_items × 3 (item_type='drug', with cgst_pct/sgst_pct from medicines.gst_pct)
INSERT payments (amount=248, idempotency_key=<uuid>, version=0)
INSERT payment_allocations × 1 (allocation_type='pharmacy_sale',
                                 pharmacy_sale_id=<ps.id>)
INSERT payment_pharmacy × 3 (one per drug, with batch_no)
INSERT payment_items × 3 (payment_type_id=2)
UPDATE invoices SET payment_status='paid', balance=0, version=1;
UPDATE prescriptions SET status='dispensed';
UPDATE prescription_items SET dispensed_qty=quantity_prescribed (× 3);
UPDATE tokens SET status='completed' WHERE token_number='P-12';
INSERT patient_journey_events ('rx_pending' → 'rx_dispensed')         -- 510
INSERT patient_journey_events ('rx_dispensed' → 'completed')          -- 600
   └─ trigger ⇒ current_state_code=600
UPDATE patient_queue (close pharmacy, status='left')
```

---

### Tally

| Concept | Count |
|---|---:|
| Distinct tables touched | 15 |
| Distinct table operations (INSERT/UPDATE/DELETE) | ~62 |
| `invoices` | 3 (OP consult, X-ray, PHARMACY) |
| `payments` | 3 (₹400 + ₹350 + ₹248 = ₹998) |
| `payment_items` | 5 (1 consultation + 1 xray + 3 pharmacy) |
| Detail rows | 1 `payment_consultation` · 1 `payment_xray` · 3 `payment_pharmacy` |
| `tokens` | 3 (D-04 doctor, X-03 radiology, P-12 pharmacy) |
| `patient_journey_events` | 18 (every transition as its own row) |
| Triggers fired | 9 (state syncs × 6, stock decrement × 3) |

### What this example illustrates

| Mechanism | Where it shows up |
|---|---|
| Atomic UHID minting | 08:30 — `UPDATE uhid_sequences RETURNING` before patient INSERT |
| `service_billing_policies` enforcement | 08:35 (consultation paid before vitals), 09:18 (X-ray paid before service), 10:10 (Rx paid at dispense) |
| Polymorphic payment-source bridge | Every `payment_items` row, with the right `payment_type_id` and detail-row id |
| Optimistic locking | Every UPDATE on `invoices` / `payments` / `radiology_orders` / `medicine_batches` carries `WHERE version=:v` and bumps version |
| Idempotency keys | Three `payments` and one `pharmacy_sales` INSERT — retry-safe |
| Trigger sync of `current_state_code` | After every `patient_journey_events` insert (six times) |
| FEFO atomic stock decrement | At 10:10 in `fn_decrement_stock` — fails fast if stock insufficient |
| Side-trip queue | 09:14–09:25 — `patient_queue.parent_queue_id` + `return_to_provider_id` for the radiology detour |
| Token lifecycle | All three tokens go `active → called → completed`; X-03 issued at request time, not at billing |

### What this example deliberately does NOT show

- An IP admission (covered separately under `ip_admissions` flow)
- A critical lab result with ACK SLA (covered under `notifications` + `notification_acknowledgments`)
- An MLC case (separate flow under `mlc_records`)
- A Schedule X dispense (separate flow under `narcotic_register`)
- A discount with approval audit
- A payment refund via `credit_notes`
- A patient merge (`patient_merges`)

These are documented in their respective module sections and are out of scope for the simple OP visit walkthrough.

---

## 5. Module Deep Dives

### 5.1 Core / Platform

> **Module trimmed (May 2026).** Patient identity (`patients`, `patient_merges`, `uhid_sequences`) was carved out into **5.2 Patient Master**. State machine + queue location (`patient_states`, `stations`, `patient_journey_events`) was carved out into **5.3 Patient Journey / Workflow**. Core now only holds true shared foundation: tenancy, identity/auth, RBAC, audit, events, notifications, config, prefs, plus two cross-cutting utility tables (`document_templates`, `file_attachments`). The deep-dive content for the carved-out tables remains below for now and is referenced from 5.2 / 5.3.

Cross-cutting infrastructure used by every other module: tenancy, staff identity (users, departments, doctor_profiles), security (roles, permissions, sessions), event logs (audit_logs, domain_events, notifications, notification_acknowledgments), config (system_config, user_preferences), and shared assets (document_templates, file_attachments).

**Tables in this module: 17**

| # | Table | Purpose |
|---|---|---|
| 1 | `tenants` | Multi-tenancy root — one row per hospital instance |
| 2 | `users` | Staff identity (login + employment basics) |
| 3 | `departments` | Org structure — Cardiology, Dermatology, etc. |
| 4 | `doctor_profiles` | Doctor-specific extension (specialization, fees, slot duration) |
| 5 | `roles` | RBAC roles (doctor, front_desk, nurse, etc.) |
| 6 | `user_roles` | Many-to-many user → role assignments |
| 7 | `permissions` | Granular permission keys (e.g. `pharmacy.stock.edit`) |
| 8 | `role_permissions` | Permissions granted per role |
| 9 | `user_sessions` | Active login sessions (JWT tracking) |
| 10 | `audit_logs` | Append-only CRUD log for compliance |
| 11 | `domain_events` | Append-only business event bus |
| 12 | `notifications` | In-app + email + SMS notifications queue with ACK + escalation |
| 13 | `notification_acknowledgments` | Per-user explicit ACK of critical notifications |
| 14 | `system_config` | Tenant-level config key/value pairs |
| 15 | `user_preferences` | Per-user settings (theme, language, default landing) |
| 16 | `document_templates` | Reusable templates for prescriptions, receipts, discharge summaries |
| 17 | `file_attachments` | Generic blob storage — used by consultations, lab, IP, HR, etc. |

**Carved out — see other modules:**

| Table | Now lives in |
|---|---|
| `patients` | 5.2 Patient Master |
| `patient_merges` | 5.2 Patient Master |
| `uhid_sequences` | 5.2 Patient Master |
| `patient_states` | 5.3 Patient Journey / Workflow |
| `stations` | 5.3 Patient Journey / Workflow |
| `patient_journey_events` | 5.3 Patient Journey / Workflow *(was in Patient Encounters)* |

#### `tenants`

*Multi-tenancy root — one row per hospital instance*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_code`** — varchar · 'KH' (Kumudha Hospital, Villupuram) — UHID prefix `[UNIQUE]`
- **`hospital_name`** — varchar
- **`address`** — text `[null]`
- **`gst_number`** — varchar `[null]`
- **`license_number`** — varchar `[null]`
- **`logo_path`** — text `[null]`
- **`uhid_prefix`** — varchar DEFAULT 'UHID'
- **`uhid_separator`** — varchar(1) DEFAULT '-'
- **`uhid_sequence_padding`** — int DEFAULT 6
- **`uhid_include_year`** — boolean DEFAULT TRUE
- **`is_active`** — boolean
- **`created_at`** — timestamptz

#### `users`

*Staff identity (login + employment basics)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`employee_id`** — varchar `[UNIQUE]`
- **`full_name`** — varchar
- **`mobile`** — varchar `[UNIQUE]`
- **`email`** — varchar `[null]`
- **`username`** — varchar `[UNIQUE]`
- **`password_hash`** — varchar
- **`department_id`** — uuid `[FK→departments null]`
- **`designation`** — varchar `[null]`
- **`profile_data`** — jsonb · role-specific
- **`status`** — varchar · 'active' \| 'inactive' \| 'suspended'
- **`last_login_at`** — timestamptz `[null]`
- **`created_at`** — timestamptz
- **`updated_at`** — timestamptz

#### `departments`

*Org structure — Cardiology, Dermatology, Lab, Pharmacy, etc.*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`dept_name`** — varchar
- **`dept_code`** — varchar `[UNIQUE per tenant]`
- **`segment`** — varchar · 'ortho' \| 'derma' \| 'lab' \| 'pharma' …
- **`head_doctor_id`** — uuid `[FK→users null]`
- **`is_active`** — boolean

#### `doctor_profiles`

*Doctor-specific extension of users*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[UNIQUE FK→users]`
- **`specialization`** — varchar `[null]`
- **`qualification`** — varchar `[null]`
- **`registration_number`** — varchar `[null]`
- **`consultation_fee`** — decimal `[null]`
- **`follow_up_fee`** — decimal `[null]`
- **`follow_up_window_days`** — int DEFAULT 7
- **`available_days`** — jsonb `[null]`
- **`slot_duration_mins`** — int
- **`signature_path`** — text `[null]`

#### `roles`

*RBAC roles (doctor, front_desk, nurse, etc.)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`role_name`** — varchar `[UNIQUE per tenant]`
- **`description`** — text `[null]`
- **`is_system_role`** — boolean

#### `user_roles`

*Many-to-many user → role assignments*

**Fields:**
- **`user_id`** — uuid `[PK FK→users]`
- **`role_id`** — uuid `[PK FK→roles]`
- **`granted_at`** — timestamptz

#### `permissions`

*Granular permission keys*

**Fields:**
- **`id`** — uuid `[PK]`
- **`permission_key`** — varchar `[UNIQUE]` · e.g. `pharmacy.stock.edit`
- **`description`** — text `[null]`
- **`module`** — varchar

#### `role_permissions`

*Permissions granted per role*

**Fields:**
- **`role_id`** — uuid `[PK FK→roles]`
- **`permission_id`** — uuid `[PK FK→permissions]`

#### `user_sessions`

*Active login sessions (JWT tracking)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users]`
- **`token_hash`** — varchar
- **`refresh_hash`** — varchar `[null]`
- **`issued_at`** — timestamptz
- **`expires_at`** — timestamptz
- **`revoked_at`** — timestamptz `[null]`
- **`user_agent`** — text `[null]`
- **`ip_address`** — varchar `[null]`

#### `audit_logs`

*Append-only CRUD log for compliance — every write to a critical table*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants null]`
- **`user_id`** — uuid `[FK→users null]`
- **`action`** — varchar · 'INSERT' \| 'UPDATE' \| 'DELETE'
- **`entity_table`** — varchar
- **`entity_id`** — uuid
- **`before_state`** — jsonb `[null]`
- **`after_state`** — jsonb `[null]`
- **`ip_address`** — varchar `[null]`
- **`occurred_at`** — timestamptz

**Append-only.** No UPDATE, no DELETE. Partition by `RANGE (occurred_at)` monthly when row count exceeds 10M.

#### `domain_events`

*Append-only business event bus — BillFinalized, SurgeryCompleted, MedicationDispensed, etc.*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`event_type`** — varchar
- **`aggregate_id`** — uuid
- **`payload`** — jsonb
- **`occurred_at`** — timestamptz

#### `notifications`

*In-app + email + SMS notifications queue, with ACK requirement and escalation chain*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users null]`
- **`role_id`** — uuid `[FK→roles null]`
- **`type`** — varchar
- **`title`** — varchar
- **`body`** — text `[null]`
- **`link`** — varchar `[null]`
- **`priority`** — varchar · 'normal' \| 'high' \| 'urgent'
- **`ack_required`** — boolean DEFAULT FALSE
  TRUE for critical clinical alerts (lab criticals, drug interactions, vitals breaches). UI surfaces it until acknowledged. Cannot be silently dismissed.
- **`ack_sla_minutes`** — int `[null]`
  Target acknowledgment time. After this elapses, the escalation worker reads `escalation_chain` and routes to next role.
- **`escalation_chain`** — jsonb `[null]`
  Ordered array like `["doctor:doc1","hod:doc_hod","oncall:doc_emrg"]`. Sets escalation order when SLA is breached.
- **`escalated_at`** — timestamptz `[null]`
- **`escalated_to`** — uuid `[FK→users null]`
- **`read_at`** — timestamptz `[null]`
- **`created_at`** — timestamptz

**Used by these screens:**

| Role | Screen | Operation |
|---|---|---|
| All | Topbar bell icon | READ |
| All | Mark-read action | WRITE (`read_at`) |
| Doctor | Critical lab inbox | READ |
| Admin | SLA compliance dashboard | READ |

#### `notification_acknowledgments`

*Per-user explicit ACK of a critical notification with action text + SLA-breach audit*

**Fields:**
- **`id`** — uuid `[PK]`
- **`notification_id`** — uuid `[FK→notifications]`
- **`acked_by`** — uuid `[FK→users]`
- **`acked_at`** — timestamptz
- **`action_taken`** — text `[null]`
  Free text describing what the acker did. Required for audit — "saw it" is not enough. Critical for malpractice defence.
- **`sla_minutes`** — int `[null]` · target time snapshot from notification
- **`breached_sla`** — boolean DEFAULT FALSE
  Computed on insert: `(acked_at - notifications.created_at) > ack_sla_minutes`. Surfaces in admin compliance reports.

**Constraints:** UNIQUE (notification_id, acked_by) — one ACK per user per notification.

**Used by these screens:**

| Role | Screen | Operation |
|---|---|---|
| Doctor | Lab inbox · ACK button | WRITE |
| Admin | SLA compliance report | READ |
| Founder | Patient-safety dashboard | READ |

#### `system_config`

*Tenant-level config key/value pairs*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`config_key`** — varchar `[UNIQUE per tenant]`
- **`config_value`** — text
- **`description`** — text `[null]`
- **`updated_by`** — uuid `[FK→users]`
- **`updated_at`** — timestamptz

#### `user_preferences`

*Per-user settings (theme, language, default landing page)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[UNIQUE FK→users]`
- **`default_role_id`** — uuid `[FK→roles null]` · which role to assume on login when user has multiple
- **`default_landing_path`** — varchar `[null]`
- **`theme`** — varchar DEFAULT 'system' · 'light' \| 'dark' \| 'system'
- **`language`** — varchar DEFAULT 'en'
- **`date_format`** — varchar DEFAULT 'DD-MM-YYYY'
- **`notifications_email`** — boolean DEFAULT TRUE
- **`notifications_inapp`** — boolean DEFAULT TRUE
- **`notifications_sms`** — boolean DEFAULT FALSE
- **`updated_at`** — timestamptz

#### `uhid_sequences`

*Atomic UHID counter per tenant per year*

**Fields:**
- **`tenant_id`** — uuid `[PK FK→tenants]`
- **`year`** — int `[PK]`
- **`last_sequence`** — int DEFAULT 0

Read-and-increment under row lock to mint a new UHID atomically.

#### `patients`

*Patient identity master*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`uhid`** — varchar `[UNIQUE]` · UHID or TEMP- prefix
- **`registration_status`** — varchar · 'provisional' \| 'complete' \| 'merged'
- **`merged_into_patient_id`** — uuid `[FK→patients null]` · self-ref for merges
- **`first_name`** — varchar
- **`last_name`** —  varchar
- **`gender`** — varchar · 'M' \| 'F' \| 'O'
- **`dob`** — date
- **`age`** — int
- **`mobile`** — varchar · indexed, not unique
- **`alt_mobile`** — varchar `[null]`
- **`address`** — jsonb · line1, city, pincode
- **`blood_group`** — varchar `[null]`
- **`marital_status`** — varchar `[null]`
- **`aadhaar_last4`** — varchar `[null]` · dedup hint
- **`allergies`** — text[]
- **`chronic_conditions`** — text[]
- **`emergency_contact`** — jsonb `[null]`
- **`is_active`** — boolean
- **`created_by`** — uuid `[FK→users]`
- **`created_at`** — timestamptz

**Used by these screens:**

| Role | Screen | Operation |
|---|---|---|
| Front Desk | Register patient | WRITE |
| Front Desk | Live queue | READ |
| Doctor | Console (queue) | READ |
| Doctor | Patient file | READ |
| Doctor | Consultation | READ |
| Pharmacy | Dispense | READ |
| Lab | Worklist | READ |
| Admin | Patient search | READ |

#### `patient_merges`

*Audit trail for TEMP-UHID → permanent UHID merges*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`source_patient_id`** — uuid `[FK→patients]`
  The duplicate that disappears. Typically a `TEMP-KH-*` UHID created by emergency entry. Marked `is_active=false` and `merged_into_patient_id=target` after merge.
- **`target_patient_id`** — uuid `[FK→patients]`
  The surviving record. All child rows get repointed here in the merge transaction.
- **`reason`** — text · why these are the same person (audit-critical)
- **`rows_repointed`** — jsonb · count per child table
- **`merged_by`** — uuid `[FK→users]`
- **`merged_at`** — timestamptz
- **`unmerged_at`** — timestamptz `[null]`
- **`unmerged_by`** — uuid `[FK→users null]`
- **`unmerge_reason`** — text `[null]`

**Constraint:** `CHECK (source_patient_id <> target_patient_id)`
**Procedure:** `sp_merge_patients(source, target, reason, by_user)` performs the FK repoint + audit insert atomically.

**Used by these screens:**

| Role | Screen | Operation |
|---|---|---|
| Admin | Patient merges (v8 Compliance) | WRITE/READ |
| Front Desk | Reconcile TEMP-UHID flow | WRITE |

#### `patient_states`

*State catalog — codes 100..710 with descriptions, SLAs, transitions*

**Fields:**
- **`code`** — int `[PK]` · numeric code 100..710. Phase 0 = ER, 1–6 = OP lifecycle, 7 = IP lifecycle.
- **`label`** — varchar
- **`phase`** — int
- **`phase_label`** — varchar
- **`department`** — varchar `[null]` · which dept owns this state
- **`color`** — varchar `[null]` · UI hint
- **`derived_from`** — varchar `[null]` · which underlying layer this state primarily reflects
- **`sla_minutes`** — int `[null]` · target time before patient should leave this state
- **`is_blocking`** — boolean DEFAULT FALSE · TRUE means patient cannot proceed to the next state until this one resolves
- **`is_terminal`** — boolean DEFAULT FALSE
- **`description`** — text `[null]`

#### `stations`

*Physical station registry (front desk, billing, vitals room, etc.)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`slug`** — varchar `[UNIQUE per tenant]` · e.g. `front_desk`, `billing`, `doctor:naveen`
- **`display_name`** — varchar · e.g. `Front Desk`, `Billing Counter`
- **`station_type`** — varchar
- **`location`** — varchar `[null]`
- **`is_active`** — boolean

#### `document_templates`

*Reusable templates for prescriptions, receipts, discharge summaries*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`template_type`** — varchar · 'consultation' \| 'discharge_summary' \| 'prescription' \| 'receipt' \| 'lab_report'
- **`template_name`** — varchar
- **`body_html`** — text
- **`body_jsonb`** — jsonb
- **`is_default`** — boolean DEFAULT FALSE
- **`is_active`** — boolean

#### `file_attachments`

*Generic blob storage — used by consultations, lab, IP, HR, radiology reports, etc.*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`entity_table`** — varchar · which table this attachment belongs to
- **`entity_id`** — uuid · the row id
- **`file_name`** — varchar
- **`mime_type`** — varchar `[null]`
- **`file_size_bytes`** — bigint
- **`storage_url`** — text
- **`uploaded_by`** — uuid `[FK→users null]`
- **`uploaded_at`** — timestamptz

---

### 5.2 Patient Master

> Patient identity, separated from Core so that patient-data lifecycle (registration, dedup, UHID generation, merges) has its own boundary. **In scope for v1.**

**Tables in this module: 3**

| # | Table | Purpose |
|---|---|---|
| 1 | `patients` | Patient identity master (UHID, demographics, allergies, chronic conditions). Soft-delete via `is_active`. Self-FK `merged_into_patient_id` for post-merge cleanup. |
| 2 | `patient_merges` | Audit trail for duplicate consolidation. Tracks source/target/reason and the row counts repointed in the merge transaction; supports unmerge if reversal is needed. |
| 3 | `uhid_sequences` | Atomic counter per `(tenant_id, year)` driving the next UHID number. PK is the (tenant, year) pair. |

**Deep-dive content:** the *Patient identity model* and *UHID generation* sections that originally lived in 5.1 Core / Platform still apply here verbatim — see [Patient identity model](#patient-identity-model) in section 3 for the cross-cutting design.

---

### 5.3 Patient Journey / Workflow

> The state machine and queue topology, separated from Core (catalog) and Patient Encounters (events) so the workflow layer has its own boundary. **In scope for v1.**

**Tables in this module: 3**

| # | Table | Purpose |
|---|---|---|
| 1 | `patient_states` | State catalog — codes 100..710 with phase, slug, display name, owning department, SLA, allowed next states, display colour. The reference data the state machine validates against. |
| 2 | `stations` | Physical service-point registry (front desk, billing, vitals room, doctor:1, lab, radiology, pharmacy). FK target for `patient_queue.station_id` and `patient_journey_events.station_id`. |
| 3 | `patient_journey_events` | Append-only state-transition log per patient. Source of truth for journey analytics, SLA monitoring, and bottleneck detection. *Moved here from 5.5 Patient Encounters.* |

**Deep-dive content:** the *Hybrid state model* and *State Catalog Reference (codes 100–710)* sections still apply — see [Hybrid state model](#hybrid-state-model) in section 3 and [State Catalog Reference](#9-state-catalog-reference) in section 9.

---

### 5.4 Scheduling

Appointment booking, slot management, and tokens. Tokens are the visible identifier — D-04, L-12, P-08 — that patients hear called out.

**Tables in this module: 3**

| # | Table | Purpose |
|---|---|---|
| 1 | `appointment_slots` | Doctor's daily slot registry (15-min granularity typically) |
| 2 | `appointments` | Booked appointments (one per slot, typically) |
| 3 | `tokens` | Issued service tokens — never reused (UNIQUE prevents reissue after cancellation) |

#### `appointment_slots`

*Doctor's daily slot registry*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`doctor_id`** — uuid `[FK→users]`
- **`slot_date`** — date
- **`slot_time`** — time
- **`duration_mins`** — int DEFAULT 15
- **`status`** — varchar · 'available' \| 'booked' \| 'blocked' \| 'cancelled'
- **`booked_by`** — uuid `[FK→users null]`
- **`created_at`** — timestamptz

**Constraint:** UNIQUE (doctor_id, slot_date, slot_time)

#### `appointments`

*Booked appointments*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`patient_id`** — uuid `[FK→patients]`
- **`doctor_id`** — uuid `[FK→users]`
- **`slot_id`** — uuid `[FK→appointment_slots null]`
- **`appointment_no`** — varchar `[UNIQUE]`
- **`scheduled_at`** — timestamptz
- **`visit_type`** — varchar · 'new' \| 'follow_up' \| 'emergency' \| 'procedure'
- **`status`** — varchar · 'booked' \| 'confirmed' \| 'arrived' \| 'in_consultation' \| 'completed' \| 'cancelled' \| 'no_show'
- **`source`** — varchar · 'walk_in' \| 'phone' \| 'online' \| 'referral'
- **`reason`** — text `[null]`
- **`cancelled_at`** — timestamptz `[null]`
- **`cancelled_by`** — uuid `[FK→users null]`
- **`cancel_reason`** — text `[null]`
- **`created_by`** — uuid `[FK→users null]`
- **`created_at`** — timestamptz
- **`updated_at`** — timestamptz

#### `tokens`

*Issued service tokens — never reused*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`token_number`** — varchar · display string like `D-04`, `L-12`, `P-08`
- **`token_sequence`** — int · sequential per `(tenant, service_type, provider, date)`
- **`service_type`** — varchar · 'consultation' \| 'lab' \| 'pharmacy' \| 'radiology' \| 'billing'
- **`provider_id`** — uuid `[FK→users null]` · NULL for service-counter tokens (lab L-04, pharmacy P-08)
- **`issue_date`** — date
- **`slot_id`** — uuid `[FK→appointment_slots null]` · locks token to a specific slot
- **`context_table`** — varchar · 'appointments' \| 'lab_orders' \| 'pharmacy_sales' \| 'invoices'
- **`context_id`** — uuid · polymorphic FK; resolves through `context_table`
- **`status`** — varchar · 'active' \| 'called' \| 'completed' \| 'cancelled' \| 'no_show'
- **`issued_by`** — uuid `[FK→users null]`
- **`issued_at`** — timestamptz
- **`called_at`** — timestamptz `[null]`
- **`completed_at`** — timestamptz `[null]`

**Uniqueness (v8 fix):** Two partial unique indexes — one for tokens with a provider, one for service-counter tokens without. Cancelled tokens stay forever; same `token_sequence` is never reissued.

---

### 5.5 Patient Encounters

> **Module slimmed** — only the encounter-shell tables remain here (`op_visits`, `patient_queue`, `tokens`, `ip_admissions`). `patient_journey_events` was moved into the new **5.3 Patient Journey / Workflow** module; `mlc_records` was moved into the Phase-2 **5.9 IP** module.



The visit/admission domain. Houses both OP and IP encounters as siblings, plus the live operational machinery (queues, tokens, journey events) that tracks active patients. This is where you look to answer "what's happening with patients right now?"

**Tables in this module: 6**

| # | Table | Purpose |
|---|---|---|
| 1 | `op_visits` | Outpatient visit aggregate (one per OP encounter) |
| 2 | `patient_queue` | Live queue position (which station the patient is at right now) |
| 3 | `tokens` | (defined in §5.2) |
| 4 | `patient_journey_events` | Append-only state transition log (every state change) |
| 5 | `ip_admissions` | Inpatient admission aggregate (one per IP stay) |
| 6 | `mlc_records` | Medico-legal case register (Indian regulatory requirement) |

#### `op_visits`

*Outpatient visit aggregate (one per OP encounter)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`op_number`** — varchar `[UNIQUE]` · human-readable visit identifier (`OP-2026-58821`)
- **`patient_id`** — uuid `[FK→patients]`
- **`appointment_id`** — uuid `[FK→appointments null]`
- **`doctor_id`** — uuid `[FK→users]`
- **`visit_date`** — date
- **`token_number`** — varchar
- **`chief_complaint`** — text `[null]`
- **`is_emergency`** — boolean DEFAULT FALSE
- **`emergency_triage`** — varchar `[null]` · 'red' \| 'yellow' \| 'green'
- **`current_state_code`** — int `[FK→patient_states null]` · 100..602 typically · denormalized for fast lookups · synced by trigger
- **`status`** — varchar · DEPRECATED — derive from `current_state_code`
- **`is_mlc`** — boolean DEFAULT FALSE · medico-legal case
- **`mlc_number`** — varchar `[null]` · links to `mlc_records.mlc_number`
- **`created_by`** — uuid `[FK→users]`
- **`created_at`** — timestamptz

#### `patient_queue`

*Live queue position*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`patient_id`** — uuid `[FK→patients]`
- **`station_id`** — uuid `[FK→stations]`
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`queue_position`** — int
- **`parent_queue_id`** — uuid `[FK→patient_queue null]` · for side-trips (e.g. doctor → lab → back to doctor)
- **`return_to_provider_id`** — uuid `[FK→users null]`
- **`status`** — varchar · 'waiting' \| 'in_service' \| 'completed' \| 'left'
- **`entered_at`** — timestamptz
- **`served_at`** — timestamptz `[null]`
- **`completed_at`** — timestamptz `[null]`

#### `patient_journey_events`

*Append-only state transition log*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]` · multi-tenant safety
- **`patient_id`** — uuid `[FK→patients]`
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`from_state_code`** — int `[FK→patient_states null]`
- **`to_state_code`** — int `[FK→patient_states]`
- **`station_id`** — int `[FK→stations null]` · where the transition physically happened
- **`duration_in_prev_state_seconds`** — int `[null]` · precomputed for fast SLA metrics
- **`from_state`** — varchar `[null]` · DEPRECATED — kept for back-compat
- **`to_state`** — varchar `[null]` · DEPRECATED — kept for back-compat
- **`triggered_by_user_id`** — uuid `[FK→users null]` · who caused the change
- **`reason`** — text `[null]`
- **`metadata`** — jsonb `[null]` · snapshot, e.g. `{invoice_id, return_to_provider_id}`
- **`occurred_at`** — timestamptz · indexed for time-window queries

**Append-only.** No UPDATE, no DELETE. Source of truth for state.

#### `ip_admissions`

*Inpatient admission aggregate (one per IP stay)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`ip_number`** — varchar `[UNIQUE]` · human-readable IP number (`IP-2026-00521`)
- **`patient_id`** — uuid `[FK→patients]`
- **`op_visit_id`** — uuid `[FK→op_visits null]` · link if admitted from OP
- **`admission_date`** — timestamptz
- **`admission_reason`** — text
- **`provisional_diagnosis`** — text `[null]`
- **`admitted_by_doctor_id`** — uuid `[FK→users]`
- **`current_bed_id`** — uuid `[FK→beds]` · denormalized; synced by trigger
- **`expected_discharge_date`** — date `[null]`
- **`discharge_date`** — timestamptz `[null]`
- **`current_state_code`** — int `[FK→patient_states null]` · 701..710 typically · synced by trigger
- **`status`** — varchar · 'admitted' \| 'discharged' \| 'lama' \| 'deceased' \| 'transferred'
- **`is_mlc`** — boolean DEFAULT FALSE
- **`mlc_number`** — varchar `[null]`
- **`version`** — int DEFAULT 0 · optimistic lock
- **`created_by`** — uuid `[FK→users]`

#### `mlc_records`

*Medico-legal case register — Indian regulatory requirement for trauma, assault, suicide, poisoning, burns, sexual assault, animal bites, industrial accidents*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`mlc_number`** — varchar `[UNIQUE]` · `MLC-YYYY-NNNNN`. Mirrored on linked `op_visits.mlc_number` or `ip_admissions.mlc_number`
- **`patient_id`** — uuid `[FK→patients]`
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`incident_type`** — varchar · 'rta' \| 'assault' \| 'self_harm' \| 'poisoning' \| 'burn' \| 'sexual_assault' \| 'animal_bite' \| 'industrial' \| 'other'
- **`incident_datetime`** — timestamptz `[null]`
- **`incident_place`** — text `[null]`
- **`brought_by`** — varchar `[null]`
- **`brought_by_relation`** — varchar `[null]`
- **`brought_by_mobile`** — varchar `[null]`
- **`police_station`** — varchar `[null]`
- **`police_intimated_at`** — timestamptz `[null]` · NULL means police haven't been notified. Discharge is blocked if `closure_status='open'` and this is NULL.
- **`police_fir_number`** — varchar `[null]`
- **`closure_status`** — varchar · 'open' \| 'intimated' \| 'documented' \| 'closed' · patient discharge blocked until closed
- **`notes`** — text `[null]`
- **`created_by`** — uuid `[FK→users]`
- **`created_at`** — timestamptz
- **`updated_at`** — timestamptz

**Used by these screens:**

| Role | Screen | Operation |
|---|---|---|
| Front Desk | Emergency entry · MLC checkbox | WRITE |
| Front Desk | MLC register | READ/WRITE |
| Admin | MLC compliance dashboard | READ/WRITE |
| Doctor | Discharge gate (cannot discharge if `closure_status≠closed`) | READ |

---

### 5.6 Clinical

> **Module updated** — `vitals` and `physio_sessions` moved here from the (now-removed) Nursing & Ward module. They sit alongside the existing consultation/Rx/recommendation tables since vitals are captured during OP visits and physio is shared between OP and IP.



What doctors record. Consultations, diagnoses (using ICD-10), prescriptions, doctor templates, autosave drafts. Excludes operational concerns (queue position, billing) — those live in their respective modules.

**Tables in this module: 6**

| # | Table | Purpose |
|---|---|---|
| 1 | `consultations` | Doctor's consultation record (chief complaint, dx, plan) |
| 2 | `diagnosis_templates` | Reusable diagnosis templates by specialty |
| 3 | `prescriptions` | Prescription header (one per consultation, may have many items) |
| 4 | `prescription_items` | Individual drug entries (drug + dose + frequency + days) |
| 5 | `doctor_recommendations` | Non-prescription recommendations (physio, surgery, follow-up) |
| 6 | `consultation_drafts` | Autosave for in-progress consultations (cleaned up after 7 days) |

#### `consultations`

*Doctor's consultation record*

**Fields:**
- **`id`** — uuid `[PK]`
- **`op_visit_id`** — uuid `[FK→op_visits]`
- **`patient_id`** — uuid `[FK→patients]`
- **`doctor_id`** — uuid `[FK→users]`
- **`chief_complaint`** — text `[null]`
- **`history_of_present_illness`** — text `[null]`
- **`examination_findings`** — jsonb `[null]`
- **`diagnoses`** — jsonb[] · `{icd10, desc, type}` array · GIN-indexed for ICD-10 searches
- **`symptoms`** — text `[null]`
- **`clinical_notes`** — text `[null]`
- **`advice`** — text `[null]`
- **`vitals_snapshot`** — jsonb `[null]`
- **`next_action`** — varchar · 'prescription_only' \| 'lab_ordered' \| 'admit_ip' \| 'surgery_referral' \| 'follow_up' …
- **`follow_up_required`** — boolean
- **`follow_up_date`** — date `[null]`
- **`admission_required`** — boolean
- **`surgery_required`** — boolean
- **`physio_required`** — boolean
- **`created_at`** — timestamptz
- **`updated_at`** — timestamptz

#### `diagnosis_templates`

*Reusable diagnosis templates by specialty*

**Fields:**
- **`id`** — uuid `[PK]`
- **`template_name`** — varchar
- **`department_id`** — uuid `[FK→departments null]`
- **`specialty`** — varchar `[null]`
- **`icd10_code`** — varchar `[null]`
- **`diagnosis_text`** — text
- **`template_json`** — jsonb · default exam, common meds, common tests
- **`default_advice`** — text `[null]`
- **`default_followup_days`** — int `[null]`
- **`created_by`** — uuid `[FK→users null]`
- **`is_active`** — boolean

#### `prescriptions`

*Prescription header (one per consultation, may have many items)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`consultation_id`** — uuid `[FK→consultations]`
- **`patient_id`** — uuid `[FK→patients]`
- **`doctor_id`** — uuid `[FK→users]`
- **`status`** — varchar · 'active' \| 'dispensed' \| 'partially_dispensed' \| 'cancelled'
- **`created_at`** — timestamptz

#### `prescription_items`

*Individual drug entries*

**Fields:**
- **`id`** — uuid `[PK]`
- **`prescription_id`** — uuid `[FK→prescriptions]`
- **`medicine_id`** — uuid `[FK→medicines]`
- **`dosage`** — varchar
- **`frequency`** — varchar · `'1-0-1'`
- **`duration_days`** — int
- **`instructions`** — text `[null]`
- **`quantity_prescribed`** — int
- **`dispensed_qty`** — int DEFAULT 0

#### `doctor_recommendations`

*Non-prescription recommendations (physio, surgery, follow-up referrals)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`consultation_id`** — uuid `[FK→consultations]`
- **`patient_id`** — uuid `[FK→patients]`
- **`recommendation_type`** — varchar · 'physio' \| 'surgery' \| 'admission' \| 'follow_up' \| 'lab' \| 'radiology'
- **`reference_id`** — uuid `[null]` · polymorphic
- **`notes`** — text `[null]`
- **`priority`** — varchar · 'routine' \| 'urgent' \| 'stat'
- **`status`** — varchar
- **`created_at`** — timestamptz

#### `consultation_drafts`

*Autosave for in-progress consultations*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`doctor_id`** — uuid `[FK→users]`
- **`patient_id`** — uuid `[FK→patients]`
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`draft_data`** — jsonb · all consultation fields snapshot
- **`autosave_count`** — int DEFAULT 0
- **`last_saved_at`** — timestamptz
- **`expires_at`** — timestamptz · auto-cleanup after 7 days
- **`restored_at`** — timestamptz `[null]`

---

### 5.7 Billing

Money-related tables. Service catalog with prices, invoices and line items, payments (in and out), payees (decoupled from patients), allocations for splits, billing policies, credit notes for refunds, polymorphic payment-source bridge, and price-history audit.

**Tables in this module: 16**

| # | Table | Purpose |
|---|---|---|
| 1 | `services` | Service catalog with prices (consultation, X-ray, room charges, etc.) |
| 2 | `invoices` | Bill header (OP, IP_INTERIM, IP_FINAL, PHARMACY, LAB_DIRECT) |
| 3 | `invoice_items` | Bill line items with GST split (CGST/SGST/IGST) |
| 4 | `payments` | Payment events (cash/card/UPI/cheque) — direction in or out |
| 5 | `payees` | Who paid (patient, walk-in, vendor, employee, insurance) |
| 6 | `payment_allocations` | Splits — one payment can pay multiple invoices/advances |
| 7 | `service_billing_policies` | Billing rules engine config (when to bill, advance vs after, dept overrides) |
| 8 | `credit_notes` | Refund and adjustment records |
| 9 | `payment_item_types` | Lookup — registry of payment sources (xray, pharmacy, consultation, lab, cafeteria) |
| 10 | `payment_items` | Bridge — links one payment to the per-type detail row that was paid for |
| 11 | `payment_xray` | Per-line detail for X-ray / radiology charges |
| 12 | `payment_pharmacy` | Per-line detail for pharmacy charges |
| 13 | `payment_consultation` | Per-line detail for doctor consultation fees |
| 14 | `payment_lab` | Per-line detail for lab / blood-report charges |
| 15 | `payment_cafeteria` | Per-line detail for cafeteria charges |
| 16 | `service_price_history` | Append-only audit of `services.default_price` changes |

#### `services`

*Service catalog with prices*

**Fields:**
- **`id`** — uuid `[PK]`
- **`service_name`** — varchar
- **`service_type`** — varchar
- **`segment`** — varchar · for revenue analytics
- **`department_id`** — uuid `[FK→departments null]`
- **`hsn_code`** — varchar `[null]` · for goods
- **`sac_code`** — varchar `[null]` · `9993xx` for healthcare services (GST)
- **`gst_pct`** — decimal DEFAULT 0 · DEPRECATED — use line-level GST split
- **`default_price`** — decimal · history kept in `service_price_history`
- **`is_active`** — boolean

#### `invoices`

*Bill header*

**Fields:**
- **`id`** — uuid `[PK]`
- **`invoice_number`** — varchar `[UNIQUE]`
- **`patient_id`** — uuid `[FK→patients]`
- **`invoice_type`** — varchar · 'OP' \| 'IP_INTERIM' \| 'IP_FINAL' \| 'PHARMACY' \| 'LAB_DIRECT'
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`subtotal`** — decimal
- **`total_line_discount`** — decimal DEFAULT 0
- **`total_bill_discount`** — decimal DEFAULT 0
- **`discount_type`** — varchar · 'percentage' \| 'flat'
- **`discount_amount`** — decimal
- **`discount_approved_by`** — uuid `[FK→users null]`
- **`discount_reason`** — text `[null]`
- **`tax_amount`** — decimal
- **`total_amount`** — decimal
- **`net_amount`** — decimal
- **`amount_paid`** — decimal DEFAULT 0
- **`balance`** — decimal
- **`payment_status`** — varchar · 'draft' \| 'finalized' \| 'paid' \| 'partially_paid' \| 'cancelled'
- **`finalized_at`** — timestamptz `[null]`
- **`version`** — int DEFAULT 0 · optimistic lock
- **`created_by`** — uuid `[FK→users]`
- **`created_at`** — timestamptz

#### `invoice_items`

*Bill line items with GST split*

**Fields:**
- **`id`** — uuid `[PK]`
- **`invoice_id`** — uuid `[FK→invoices]`
- **`service_id`** — uuid `[FK→services null]`
- **`item_type`** — varchar · 'consultation' \| 'drug' \| 'lab_test' \| 'radiology' \| 'room_charge' \| 'nursing' \| 'procedure' \| 'surgery' \| 'consumable'
- **`reference_id`** — uuid `[null]` · polymorphic
- **`segment`** — varchar
- **`item_name`** — varchar
- **`hsn_code`** — varchar `[null]`
- **`quantity`** — int
- **`unit_price`** — decimal
- **`discount_pct`** — decimal DEFAULT 0
- **`discount_amount`** — decimal DEFAULT 0
- **`line_discount_reason`** — text `[null]`
- **`line_discount_by`** — uuid `[FK→users null]`
- **`tax_pct`** — decimal DEFAULT 0 · DEPRECATED — use `cgst_pct + sgst_pct + igst_pct`
- **`cgst_pct`** — decimal DEFAULT 0
- **`cgst_amount`** — decimal DEFAULT 0
- **`sgst_pct`** — decimal DEFAULT 0
- **`sgst_amount`** — decimal DEFAULT 0
- **`igst_pct`** — decimal DEFAULT 0 · for inter-state supplies
- **`igst_amount`** — decimal DEFAULT 0
- **`total_price`** — decimal · after discount

#### `payments`

*Payment events (cash/card/UPI/cheque) — direction in or out*

**Fields:**
- **`id`** — uuid `[PK]`
- **`invoice_id`** — uuid `[FK→invoices null]` · nullable when paying via allocation
- **`payee_id`** — uuid `[FK→payees]`
- **`payment_direction`** — varchar · 'in' (collection) \| 'out' (refund/payout)
- **`session_id`** — uuid `[FK→business_sessions]`
- **`payment_mode`** — varchar · 'cash' \| 'card' \| 'upi' \| 'cheque' \| 'insurance'
- **`amount`** — decimal
- **`transaction_ref`** — varchar `[null]`
- **`paid_at`** — timestamptz
- **`received_by`** — uuid `[FK→users]`
- **`idempotency_key`** — varchar `[null]` · UNIQUE partial — prevents double-charge
- **`version`** — int DEFAULT 0 · optimistic lock
- **`notes`** — text `[null]`

#### `payees`

*Who paid (patient, walk-in, vendor, employee, insurance) — decoupled from UHID*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`payee_type`** — varchar · 'patient' \| 'walk_in' \| 'vendor' \| 'employee' \| 'insurance' \| 'other'
- **`patient_id`** — uuid `[FK→patients null]`
- **`vendor_id`** — uuid `[FK→pharmacy_vendors null]`
- **`employee_user_id`** — uuid `[FK→users null]`
- **`name`** — varchar `[null]` · for walk-in or other
- **`mobile`** — varchar `[null]`
- **`gstin`** — varchar `[null]`
- **`notes`** — text `[null]`
- **`created_at`** — timestamptz

#### `payment_allocations`

*Splits — one payment can pay multiple invoices/advances*

**Fields:**
- **`id`** — uuid `[PK]`
- **`payment_id`** — uuid `[FK→payments]`
- **`allocation_type`** — varchar · 'invoice' \| 'pharmacy_sale' \| 'ip_advance' \| 'interim_bill' \| 'refund' \| 'on_account'
- **`invoice_id`** — uuid `[FK→invoices null]`
- **`pharmacy_sale_id`** — uuid `[FK→pharmacy_sales null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]` · for advance
- **`interim_bill_id`** — uuid `[FK→interim_bills null]`
- **`amount`** — decimal
- **`notes`** — text `[null]`
- **`created_at`** — timestamptz

#### `service_billing_policies`

*Billing rules engine config*

**Fields:**
- **`service_type`** — varchar · 'op_consultation' \| 'lab_routine' \| 'lab_stat' \| 'radiology' \| 'pharmacy_rx' \| 'pharmacy_otc' \| 'ip_admission' \| 'surgery'
- **`tenant_id`** — uuid `[FK→tenants]`
- **`department_id`** — uuid `[FK→departments null]` · per-dept override
- **`payment_timing`** — varchar · 'before_service' \| 'after_service' \| 'on_discharge' \| 'split'
- **`advance_required`** — boolean DEFAULT FALSE
- **`advance_percentage`** — decimal `[null]` · % of estimate
- **`min_advance_amount`** — decimal `[null]`
- **`emergency_override`** — boolean DEFAULT TRUE · stat cases bypass
- **`updated_by`** — uuid `[FK→users]`
- **`updated_at`** — timestamptz

**PK:** synthetic over `(tenant_id, service_type, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid))` — allows one default + per-department overrides.

#### `credit_notes`

*Refund and adjustment records*

**Fields:**
- **`id`** — uuid `[PK]`
- **`credit_note_number`** — varchar `[UNIQUE]`
- **`patient_id`** — uuid `[FK→patients null]`
- **`pharmacy_return_id`** — uuid `[FK→pharmacy_returns null]`
- **`invoice_id`** — uuid `[FK→invoices null]`
- **`amount`** — decimal
- **`status`** — varchar · 'pending' \| 'applied' \| 'refunded'
- **`expires_at`** — date `[null]`
- **`reason`** — text `[null]`
- **`created_by`** — uuid `[FK→users]`
- **`created_at`** — timestamptz

#### `payment_item_types`

*Registry of payment sources — the lookup behind `payment_items.payment_type_id`*

**Fields:**
- **`id`** — int `[PK]` · numeric PK (1=xray, 2=pharmacy, 3=consultation, 4=lab, 5=cafeteria…). Stable across deploys; never re-number.
- **`tenant_id`** — uuid `[FK→tenants]`
- **`code`** — varchar · 'xray' \| 'pharmacy' \| 'consultation' \| 'lab' \| 'cafeteria' `[UNIQUE per tenant]`
- **`display_name`** — varchar
- **`detail_table`** — varchar · `payment_xray` \| `payment_pharmacy` \| `payment_consultation` \| `payment_lab` \| `payment_cafeteria` · app dispatches reads via this column
- **`is_active`** — boolean

#### `payment_items`

*Bridge — links one payment to the per-type detail row*

**Fields:**
- **`id`** — uuid `[PK]`
- **`payment_id`** — uuid `[FK→payments]`
- **`payment_type_id`** — int `[FK→payment_item_types]` · discriminator
- **`item_record_id`** — uuid · polymorphic — id of `payment_xray | payment_pharmacy | …` row
- **`amount`** — decimal · line ₹
- **`created_at`** — timestamptz

**Index:** `(payment_type_id, item_record_id)` for reverse lookup.

#### `payment_xray`

*Per-line detail for X-ray / radiology charges*

**Fields:**
- **`id`** — uuid `[PK]`
- **`radiology_order_id`** — uuid `[FK→radiology_orders]`
- **`procedure_name`** — varchar
- **`modality`** — varchar · 'xray' \| 'ct' \| 'mri' \| 'ultrasound'
- **`rate`** — decimal
- **`quantity`** — int DEFAULT 1
- **`discount`** — decimal DEFAULT 0
- **`amount`** — decimal · final ₹

#### `payment_pharmacy`

*Per-line detail for pharmacy charges*

**Fields:**
- **`id`** — uuid `[PK]`
- **`pharmacy_sale_id`** — uuid `[FK→pharmacy_sales]`
- **`medicine_name`** — varchar
- **`batch_no`** — varchar `[null]`
- **`quantity`** — int
- **`unit_price`** — decimal
- **`discount`** — decimal DEFAULT 0
- **`amount`** — decimal

#### `payment_consultation`

*Per-line detail for doctor consultation fees*

**Fields:**
- **`id`** — uuid `[PK]`
- **`consultation_id`** — uuid `[FK→consultations]`
- **`doctor_id`** — uuid `[FK→users]`
- **`visit_type`** — varchar · 'new' \| 'follow_up'
- **`fee`** — decimal
- **`discount`** — decimal DEFAULT 0
- **`amount`** — decimal

#### `payment_lab`

*Per-line detail for lab / blood-report charges*

**Fields:**
- **`id`** — uuid `[PK]`
- **`lab_order_id`** — uuid `[FK→lab_orders]`
- **`test_name`** — varchar
- **`sample_type`** — varchar `[null]`
- **`rate`** — decimal
- **`discount`** — decimal DEFAULT 0
- **`amount`** — decimal

#### `payment_cafeteria`

*Per-line detail for cafeteria charges*

**Fields:**
- **`id`** — uuid `[PK]`
- **`order_ref`** — varchar `[null]` · external POS reference
- **`item_name`** — varchar
- **`quantity`** — int
- **`unit_price`** — decimal
- **`amount`** — decimal

#### `service_price_history`

*Append-only audit of `services.default_price` changes*

**Fields:**
- **`id`** — uuid `[PK]`
- **`service_id`** — uuid `[FK→services]`
- **`price`** — decimal
- **`effective_from`** — date · start date inclusive
- **`effective_to`** — date `[null]` · NULL means currently active. At most one row per service has NULL.
- **`changed_by`** — uuid `[FK→users null]`
- **`changed_at`** — timestamptz
- **`reason`** — text `[null]`

**Trigger:** `fn_log_price_change` on `services AFTER UPDATE` — closes the prior open period and inserts a new row.

---

### 5.8 Cash & Closure

Cashier shift management. Cash counters, business sessions, in/out movements, closure audit. Separate from Billing because session reconciliation is a different operational concern.

**Tables in this module: 4**

| # | Table | Purpose |
|---|---|---|
| 1 | `cash_counters` | Physical cash counters (Front Desk, Pharmacy, IP Billing) |
| 2 | `business_sessions` | Cashier shifts with denomination breakdown and variance |
| 3 | `session_movements` | All in/out movements during a session (refunds, petty cash, deposits) |
| 4 | `session_closure_audit` | Append-only audit of session lifecycle |

#### `cash_counters`

*Physical cash counters*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`name`** — varchar · 'Front Desk' \| 'Pharmacy' \| 'IP Billing'
- **`location`** — varchar `[null]`
- **`is_active`** — boolean

#### `business_sessions`

*Cashier shifts*

**Fields:**
- **`id`** — uuid `[PK]`
- **`counter_id`** — uuid `[FK→cash_counters]`
- **`session_label`** — varchar · 'MORNING' \| 'EVENING' \| 'NIGHT' \| 'FULL_DAY' \| 'CUSTOM'
- **`business_date`** — date
- **`opened_by`** — uuid `[FK→users]`
- **`opened_at`** — timestamptz
- **`closed_by`** — uuid `[FK→users null]`
- **`closed_at`** — timestamptz `[null]`
- **`status`** — varchar · 'OPEN' \| 'CLOSED' \| 'REOPENED' \| 'LOCKED'
- **`opening_float`** — decimal
- **`expected_cash`** — decimal `[null]`
- **`counted_cash`** — decimal `[null]`
- **`variance`** — decimal `[null]` · counted − expected
- **`variance_reason`** — text `[null]` · required if variance ≠ 0
- **`denomination_breakdown`** — jsonb `[null]` · `{2000:5,500:20,200:10,100:50,50:30,20:50,10:100,5:80}`
- **`closure_notes`** — text `[null]`
- **`closure_report_pdf_url`** — text `[null]`
- **`approved_by`** — uuid `[FK→users null]`

#### `session_movements`

*All in/out movements during a session*

**Fields:**
- **`id`** — uuid `[PK]`
- **`session_id`** — uuid `[FK→business_sessions]`
- **`type`** — varchar · 'EXPENSE_PAYOUT' \| 'REFUND_PAYOUT' \| 'PETTY_CASH_OUT' \| 'CASH_DEPOSIT_TO_BANK' \| 'CASH_HANDOVER'
- **`amount`** — decimal
- **`reason`** — text
- **`reference_doc_url`** — text `[null]`
- **`performed_by`** — uuid `[FK→users]`
- **`performed_at`** — timestamptz

#### `session_closure_audit`

*Append-only audit of session lifecycle*

**Fields:**
- **`id`** — uuid `[PK]`
- **`session_id`** — uuid `[FK→business_sessions]`
- **`action`** — varchar · 'opened' \| 'closed' \| 'reopened' \| 'adjusted' \| 'approved' \| 'locked'
- **`performed_by`** — uuid `[FK→users]`
- **`before_state`** — jsonb `[null]`
- **`after_state`** — jsonb `[null]`
- **`ip_address`** — varchar `[null]`
- **`created_at`** — timestamptz

---

### 5.9 IP — Phase 2

> **Out of scope for v1.** Inpatient flows (rooms, beds, ward orders, interim bills, MLC records, nursing notes, medication administrations, discharge summaries, shift handovers, patient handover notes) are deferred to Phase 2.
>
> Note: `ip_admissions` itself stays in **5.5 Patient Encounters** as an encounter-level header (parallel to `op_visits`); the bed/ward/nursing detail lives here.



IP infrastructure: rooms, beds, bed assignments, ward orders (doctor's standing instructions), and interim bills generated during the stay. The admission record itself (`ip_admissions`) lives in §5.3 Patient Encounters.

**Tables in this module: 5**

| # | Table | Purpose |
|---|---|---|
| 1 | `rooms` | Room layout (general ward, private, ICU, etc.) |
| 2 | `beds` | Bed inventory within rooms |
| 3 | `bed_assignments` | Which patient is in which bed (with date range) |
| 4 | `ward_orders` | Standing orders during admission (BP qid, diet, etc.) |
| 5 | `interim_bills` | IP bills generated mid-stay for tracking |

#### `rooms`

*Room layout*

**Fields:**
- **`id`** — uuid `[PK]`
- **`room_number`** — varchar
- **`room_type`** — varchar · 'general' \| 'semi_private' \| 'private' \| 'deluxe' \| 'icu' \| 'nicu' \| 'picu'
- **`floor`** — varchar `[null]`
- **`ward_name`** — varchar `[null]`
- **`bed_count`** — int
- **`price_per_day`** — decimal
- **`status`** — varchar · 'available' \| 'occupied' \| 'cleaning' \| 'maintenance' \| 'blocked'

#### `beds`

*Bed inventory within rooms*

**Fields:**
- **`id`** — uuid `[PK]`
- **`room_id`** — uuid `[FK→rooms]`
- **`bed_number`** — varchar
- **`status`** — varchar · 'available' \| 'occupied' \| 'cleaning' \| 'blocked'

#### `bed_assignments`

*Which patient is in which bed*

**Fields:**
- **`id`** — uuid `[PK]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions]`
- **`bed_id`** — uuid `[FK→beds]`
- **`from_ts`** — timestamptz
- **`to_ts`** — timestamptz `[null]` · NULL = current
- **`transfer_reason`** — text `[null]`
- **`assigned_by`** — uuid `[FK→users]`
- **`version`** — int DEFAULT 0 · optimistic lock

**Trigger:** `fn_sync_current_bed` on INSERT/UPDATE — updates `ip_admissions.current_bed_id` and `beds.status` to keep them in sync.

#### `ward_orders`

*Standing orders during admission*

**Fields:**
- **`id`** — uuid `[PK]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions]`
- **`doctor_id`** — uuid `[FK→users]`
- **`order_type`** — varchar · 'medication' \| 'diet' \| 'procedure' \| 'monitoring' \| 'investigation'
- **`details`** — jsonb
- **`status`** — varchar · 'pending' \| 'in_progress' \| 'completed' \| 'cancelled'
- **`ordered_at`** — timestamptz

#### `interim_bills`

*IP bills generated mid-stay for tracking*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`interim_bill_number`** — varchar `[UNIQUE]` · `IB-2026-00041`
- **`ip_admission_id`** — uuid `[FK→ip_admissions]`
- **`patient_id`** — uuid `[FK→patients]`
- **`snapshot_at`** — timestamptz · charges up to this moment
- **`amount_charged_to_date`** — decimal
- **`advance_paid_to_date`** — decimal
- **`interim_paid_to_date`** — decimal · prior interims
- **`amount_due_now`** — decimal
- **`purpose`** — varchar · 'attender_pharmacy' \| 'family_review' \| 'mid_stay_settlement'
- **`status`** — varchar · 'generated' \| 'paid' \| 'consolidated_into_final' \| 'cancelled'
- **`pdf_url`** — text `[null]`
- **`generated_by`** — uuid `[FK→users]`
- **`created_at`** — timestamptz

---

### 5.10 Surgery — Phase 2

> **Out of scope for v1.** OT scheduling, consumables, and the surgery team roster are deferred to Phase 2.



Operation theatre operations. OT room registry, surgery scheduling, surgery types catalog, team composition per case, and consumables tracking (used for billing).

**Tables in this module: 5**

| # | Table | Purpose |
|---|---|---|
| 1 | `surgery_types` | Surgery catalog (Angioplasty, Knee Arthroscopy, Appendectomy…) |
| 2 | `ot_rooms` | OT room registry |
| 3 | `surgery_schedules` | Per-case schedule |
| 4 | `surgery_team` | Team members per case |
| 5 | `surgery_consumables` | Items consumed during surgery (for billing) |

#### `surgery_types`

*Surgery catalog*

**Fields:**
- **`id`** — uuid `[PK]`
- **`surgery_name`** — varchar
- **`code`** — varchar `[UNIQUE]`
- **`department_id`** — uuid `[FK→departments null]`
- **`default_duration_mins`** — int
- **`default_price`** — decimal
- **`required_equipment`** — jsonb `[null]`

#### `ot_rooms`

*OT room registry*

**Fields:**
- **`id`** — uuid `[PK]`
- **`name`** — varchar · 'OT-1' \| 'OT-2'
- **`equipment`** — jsonb `[null]`
- **`status`** — varchar · 'available' \| 'in_use' \| 'cleaning' \| 'maintenance'

#### `surgery_schedules`

*Per-case schedule*

**Fields:**
- **`id`** — uuid `[PK]`
- **`surgery_number`** — varchar `[UNIQUE]`
- **`patient_id`** — uuid `[FK→patients]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`primary_surgeon_id`** — uuid `[FK→users]`
- **`anesthetist_id`** — uuid `[FK→users null]`
- **`surgery_type_id`** — uuid `[FK→surgery_types]`
- **`ot_room_id`** — uuid `[FK→ot_rooms]`
- **`scheduled_start`** — timestamptz
- **`scheduled_end`** — timestamptz
- **`status`** — varchar · 'scheduled' \| 'pre_op' \| 'in_progress' \| 'completed' \| 'cancelled' \| 'postponed'
- **`pre_op_notes`** — text `[null]`
- **`op_notes`** — text `[null]`
- **`post_op_notes`** — text `[null]`
- **`complications`** — text `[null]`
- **`notes`** — text `[null]`

#### `surgery_team`

*Team members per case*

**Fields:**
- **`id`** — uuid `[PK]`
- **`surgery_schedule_id`** — uuid `[FK→surgery_schedules]`
- **`user_id`** — uuid `[FK→users]`
- **`role_in_surgery`** — varchar · 'surgeon' \| 'assistant' \| 'scrub_nurse' \| 'circulating_nurse' \| 'anesthetist'

#### `surgery_consumables`

*Items consumed during surgery (for billing)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`surgery_schedule_id`** — uuid `[FK→surgery_schedules]`
- **`medicine_batch_id`** — uuid `[FK→medicine_batches null]`
- **`consumable_name`** — varchar
- **`qty_used`** — int
- **`unit_price`** — decimal
- **`total_price`** — decimal
- **`recorded_by`** — uuid `[FK→users]`
- **`recorded_at`** — timestamptz

---

### 5.11 Lab

Pathology lab operations. Test catalog with reference ranges, panel definitions, order header + items, sample tracking with re-collection links, and individual result records with auto-flag.

**Tables in this module: 6**

| # | Table | Purpose |
|---|---|---|
| 1 | `lab_tests` | Test catalog with numeric reference ranges and critical thresholds |
| 2 | `lab_test_panels` | Panel definitions (CBC = WBC + RBC + Platelets + …) |
| 3 | `lab_orders` | Order header (one per ordering event) |
| 4 | `lab_order_items` | Order lines (one per individual test) |
| 5 | `lab_samples` | Sample tracking with re-collection link |
| 6 | `lab_results` | Per-test results with auto-flagged values |

#### `lab_tests`

*Test catalog with reference ranges*

**Fields:**
- **`id`** — uuid `[PK]`
- **`test_code`** — varchar `[UNIQUE]`
- **`test_name`** — varchar
- **`category`** — varchar · 'hematology' \| 'biochemistry' \| 'microbiology' \| 'serology' \| 'pathology'
- **`sample_type`** — varchar
- **`department_id`** — uuid `[FK→departments null]`
- **`default_price`** — decimal
- **`normal_range_male`** — varchar `[null]` · display string (e.g. "13.5 – 17.5 g/dL"). Printing only.
- **`normal_range_female`** — varchar `[null]` · display string
- **`ref_min_male`** — decimal `[null]` · numeric — drives auto-flag
- **`ref_max_male`** — decimal `[null]` · numeric — drives auto-flag
- **`ref_min_female`** — decimal `[null]`
- **`ref_max_female`** — decimal `[null]`
- **`critical_low`** — decimal `[null]` · triggers alert
- **`critical_high`** — decimal `[null]` · triggers alert
- **`unit`** — varchar `[null]`
- **`tat_hours`** — int `[null]` · turn-around time
- **`is_active`** — boolean

#### `lab_test_panels`

*Panel definitions (CBC = WBC + RBC + Platelets + …)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`panel_name`** — varchar · 'CBC' \| 'LFT' \| 'Diabetes Panel'
- **`test_ids`** — uuid[]
- **`package_price`** — decimal
- **`is_active`** — boolean

#### `lab_orders`

*Order header*

**Fields:**
- **`id`** — uuid `[PK]`
- **`patient_id`** — uuid `[FK→patients]`
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`doctor_id`** — uuid `[FK→users]`
- **`priority`** — varchar · 'routine' \| 'urgent' \| 'stat'
- **`invoice_id`** — uuid `[FK→invoices null]`
- **`payment_required_before_service`** — boolean DEFAULT TRUE · stat overrides
- **`status`** — varchar · 'ordered' \| 'sample_collected' \| 'in_progress' \| 'reported' \| …
- **`ordered_at`** — timestamptz
- **`completed_at`** — timestamptz `[null]`

#### `lab_order_items`

*Order lines (one per individual test)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`lab_order_id`** — uuid `[FK→lab_orders]`
- **`lab_test_id`** — uuid `[FK→lab_tests]`
- **`sample_id`** — uuid `[FK→lab_samples null]`
- **`status`** — varchar · 'pending' \| 'in_progress' \| 'completed'

#### `lab_samples`

*Sample tracking with re-collection link*

**Fields:**
- **`id`** — uuid `[PK]`
- **`sample_barcode`** — varchar `[UNIQUE]`
- **`patient_id`** — uuid `[FK→patients]`
- **`lab_order_id`** — uuid `[FK→lab_orders]`
- **`sample_type`** — varchar
- **`status`** — varchar · 'collected' \| 'received' \| 'rejected' \| 'processed' \| 'disposed'
- **`collected_by`** — uuid `[FK→users]`
- **`collected_at`** — timestamptz
- **`received_at`** — timestamptz `[null]`
- **`rejected_at`** — timestamptz `[null]`
- **`rejected_by`** — uuid `[FK→users null]`
- **`rejection_reason`** — text `[null]`
- **`replaces_sample_id`** — uuid `[FK→lab_samples null]` · self-FK for re-collection

#### `lab_results`

*Per-test results with auto-flagged values*

**Fields:**
- **`id`** — uuid `[PK]`
- **`lab_order_item_id`** — uuid `[FK→lab_order_items]`
- **`value`** — varchar · raw display value
- **`value_numeric`** — decimal `[null]` · parsed for trending
- **`value_text`** — varchar `[null]` · for "Positive" / "Reactive"
- **`unit`** — varchar `[null]`
- **`flag`** — varchar · 'normal' \| 'high' \| 'low' \| 'critical' · auto-set by trigger
- **`method`** — varchar `[null]`
- **`comments`** — text `[null]`
- **`report_pdf_url`** — text `[null]`
- **`performed_by`** — uuid `[FK→users]`
- **`verified_by`** — uuid `[FK→users null]`
- **`reported_at`** — timestamptz

**Triggers:**
- `fn_autoflag_lab_result` on BEFORE INSERT — auto-sets `flag` based on `lab_tests` reference ranges
- `fn_critical_lab_alert` on AFTER INSERT — if `flag='critical'`, creates a `notifications` row with `ack_required=TRUE`, `ack_sla_minutes=30`

---

### 5.12 Radiology

Radiology operations. Procedure catalog, order tracking, DICOM study references (linking to Orthanc PACS), and report records. Image files themselves are in PACS, not the database.

**Tables in this module: 4**

| # | Table | Purpose |
|---|---|---|
| 1 | `radiology_procedures` | Procedure catalog (CXR, MRI brain, etc.) |
| 2 | `radiology_orders` | Order tracking + DICOM study UID for PACS link |
| 3 | `radiology_studies` | Study metadata (modality, body part, technique) |
| 4 | `radiology_reports` | Reporter findings + impression |

#### `radiology_procedures`

*Procedure catalog*

**Fields:**
- **`id`** — uuid `[PK]`
- **`procedure_code`** — varchar `[UNIQUE]`
- **`test_name`** — varchar
- **`modality`** — varchar · 'xray' \| 'ultrasound' \| 'ct' \| 'mri'
- **`body_part`** — varchar `[null]`
- **`default_price`** — decimal
- **`is_active`** — boolean

#### `radiology_orders`

*Order tracking*

**Fields:**
- **`id`** — uuid `[PK]`
- **`patient_id`** — uuid `[FK→patients]`
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`doctor_id`** — uuid `[FK→users]`
- **`radiology_procedure_id`** — uuid `[FK→radiology_procedures]`
- **`priority`** — varchar · 'routine' \| 'urgent' \| 'stat'
- **`invoice_id`** — uuid `[FK→invoices null]`
- **`payment_required_before_service`** — boolean DEFAULT TRUE · stat overrides
- **`status`** — varchar · 'ordered' \| 'in_progress' \| 'completed' \| 'reported' \| 'cancelled'
- **`ordered_at`** — timestamptz

#### `radiology_studies`

*Study metadata*

**Fields:**
- **`id`** — uuid `[PK]`
- **`radiology_order_id`** — uuid `[FK→radiology_orders]`
- **`study_uid`** — varchar `[UNIQUE]` · DICOM
- **`images_url`** — text[]
- **`technician_id`** — uuid `[FK→users]`
- **`study_completed_at`** — timestamptz

#### `radiology_reports`

*Reporter findings + impression*

**Fields:**
- **`id`** — uuid `[PK]`
- **`radiology_order_id`** — uuid `[FK→radiology_orders]`
- **`study_id`** — uuid `[FK→radiology_studies null]`
- **`findings`** — text `[null]`
- **`impression`** — text `[null]`
- **`reported_by_radiologist_id`** — uuid `[FK→users null]`
- **`file_attachment_id`** — uuid `[FK→file_attachments null]`
- **`report_pdf_url`** — text `[null]`
- **`uploaded_by`** — uuid `[FK→users]`
- **`uploaded_at`** — timestamptz

---

### 5.13 Pharmacy

> **In scope for v1** (moved back from Phase 2 on the latest scope review). Covers procurement (vendors, POs, stock movements), POS / dispensing (`pharmacy_sales`, `pharmacy_sale_items`), returns, and the NDPS-compliant narcotic register.
> The drug master (`medicines`) and batch stock (`medicine_batches`) live in the separate **5.14 Inventory** module so they can be referenced by Clinical (prescription writing) without depending on POS workflows.
>
> Tables in this module: `vendors`, `purchase_orders`, `purchase_order_items`, `stock_movements`, `pharmacy_sales`, `pharmacy_sale_items`, `pharmacy_returns`, `pharmacy_return_items`, `narcotic_register`.

### 5.14 Inventory

> **In scope for v1 — limited.** Holds only the drug master and batch stock so doctors can prescribe and the prescription UI can show availability. Procurement (POs, vendors, stock movements) lives in Phase 2 Pharmacy.
>
> Tables: `medicines`, `medicine_batches`.

### 5.11 Pharmacy & Inventory (legacy section — retained for reference)

Drug inventory and pharmacy operations. Vendors, medicines catalog, batch-level stock with expiry dates, purchase orders, all stock movements, pharmacy sales, returns, and the NDPS Act narcotic register.

**Tables in this module: 11**

| # | Table | Purpose |
|---|---|---|
| 1 | `vendors` | Pharmacy vendor registry |
| 2 | `medicines` | Drug catalog (generic + brand, strength, form, schedule) |
| 3 | `medicine_batches` | Batch-level stock (expiry, qty, MRP) — auto-decremented by trigger |
| 4 | `purchase_orders` | PO header to vendor |
| 5 | `purchase_order_items` | PO lines with GST split |
| 6 | `stock_movements` | All stock changes (sale/return/expiry/adjustment) |
| 7 | `pharmacy_sales` | Sale header (Rx or OTC) |
| 8 | `pharmacy_sale_items` | Sale lines (drug + batch + qty) — triggers stock decrement |
| 9 | `pharmacy_returns` | Returns header (customer or to vendor) |
| 10 | `pharmacy_return_items` | Returns lines |
| 11 | `narcotic_register` | NDPS Act-mandated Schedule X transactions register |

#### `vendors`

*Pharmacy vendor registry*

**Fields:**
- **`id`** — uuid `[PK]`
- **`vendor_name`** — varchar
- **`contact_person`** — varchar `[null]`
- **`mobile`** — varchar
- **`address`** — text `[null]`
- **`gst_number`** — varchar `[null]`
- **`payment_terms`** — varchar `[null]`
- **`is_active`** — boolean

#### `medicines`

*Drug catalog*

**Fields:**
- **`id`** — uuid `[PK]`
- **`medicine_name`** — varchar
- **`generic_name`** — varchar `[null]`
- **`brand_name`** — varchar `[null]`
- **`manufacturer`** — varchar `[null]`
- **`category`** — varchar
- **`schedule`** — varchar · DEPRECATED — use `drug_schedule`
- **`drug_schedule`** — varchar `[null]` · 'H' \| 'H1' \| 'X' \| 'G' \| 'OTC'
- **`is_narcotic`** — boolean DEFAULT FALSE · NDPS Act · when TRUE, every transaction MUST write a `narcotic_register` row
- **`form`** — varchar · 'tablet' \| 'syrup' \| 'injection'
- **`strength`** — varchar `[null]`
- **`unit`** — varchar
- **`hsn_code`** — varchar `[null]`
- **`gst_pct`** — decimal DEFAULT 0
- **`requires_prescription`** — boolean
- **`reorder_level`** — int
- **`is_active`** — boolean

#### `medicine_batches`

*Batch-level stock*

**Fields:**
- **`id`** — uuid `[PK]`
- **`medicine_id`** — uuid `[FK→medicines]`
- **`batch_number`** — varchar
- **`mfg_date`** — date `[null]`
- **`expiry_date`** — date
- **`purchase_price`** — decimal
- **`mrp_at_purchase`** — decimal
- **`selling_price`** — decimal
- **`quantity_received`** — int
- **`quantity_available`** — int · auto-decremented by `fn_decrement_stock` on dispense
- **`vendor_id`** — uuid `[FK→vendors]`
- **`po_id`** — uuid `[FK→purchase_orders null]`
- **`received_date`** — date
- **`version`** — int DEFAULT 0 · optimistic lock

**FEFO sort:** `ORDER BY expiry_date ASC` for stock pick.

#### `purchase_orders`

*PO header to vendor*

**Fields:**
- **`id`** — uuid `[PK]`
- **`po_number`** — varchar `[UNIQUE]`
- **`vendor_id`** — uuid `[FK→vendors]`
- **`expected_date`** — date `[null]`
- **`status`** — varchar · 'draft' \| 'sent' \| 'partially_received' \| 'received' \| 'cancelled'
- **`total_amount`** — decimal
- **`ordered_by`** — uuid `[FK→users]`
- **`approved_by`** — uuid `[FK→users null]`
- **`ordered_at`** — timestamptz
- **`received_at`** — timestamptz `[null]`

#### `purchase_order_items`

*PO lines with GST split*

**Fields:**
- **`id`** — uuid `[PK]`
- **`purchase_order_id`** — uuid `[FK→purchase_orders]`
- **`medicine_id`** — uuid `[FK→medicines]`
- **`quantity_ordered`** — int
- **`quantity_received`** — int
- **`unit_price`** — decimal
- **`cgst_pct`** — decimal DEFAULT 0
- **`sgst_pct`** — decimal DEFAULT 0
- **`igst_pct`** — decimal DEFAULT 0
- **`total_price`** — decimal

#### `stock_movements`

*All stock changes*

**Fields:**
- **`id`** — uuid `[PK]`
- **`medicine_batch_id`** — uuid `[FK→medicine_batches]`
- **`movement_type`** — varchar · 'purchase_in' \| 'sale_out' \| 'return_in' \| 'return_writeoff' \| 'adjustment' \| 'expiry_writeoff' \| 'surgery_use' \| 'ward_use'
- **`quantity`** — int · signed
- **`reference_type`** — varchar
- **`reference_id`** — uuid
- **`created_by`** — uuid `[FK→users null]`
- **`created_at`** — timestamptz

#### `pharmacy_sales`

*Sale header (Rx or OTC)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`sale_number`** — varchar `[UNIQUE]`
- **`patient_id`** — uuid `[FK→patients null]`
- **`sale_type`** — varchar · 'op_patient' \| 'ip_patient' \| 'walkin_prescription' \| 'walkin_otc'
- **`session_id`** — uuid `[FK→business_sessions]`
- **`customer_name`** — varchar `[null]`
- **`customer_mobile`** — varchar `[null]`
- **`customer_age`** — int `[null]`
- **`external_prescription_ref`** — varchar `[null]`
- **`prescription_id`** — uuid `[FK→prescriptions null]`
- **`invoice_id`** — uuid `[FK→invoices null]`
- **`subtotal`** — decimal
- **`bill_discount_type`** — varchar · 'percentage' \| 'flat'
- **`bill_discount_value`** — decimal DEFAULT 0
- **`bill_discount_amount`** — decimal DEFAULT 0
- **`net_amount`** — decimal
- **`discount_approved_by`** — uuid `[FK→users null]`
- **`discount_reason`** — text `[null]`
- **`printer_target`** — varchar · 'dot_matrix_main'
- **`sale_date`** — timestamptz
- **`idempotency_key`** — varchar `[null]` · UNIQUE partial — prevents double-charge
- **`version`** — int DEFAULT 0 · optimistic lock
- **`created_by`** — uuid `[FK→users]`

#### `pharmacy_sale_items`

*Sale lines*

**Fields:**
- **`id`** — uuid `[PK]`
- **`pharmacy_sale_id`** — uuid `[FK→pharmacy_sales]`
- **`medicine_id`** — uuid `[FK→medicines]`
- **`medicine_batch_id`** — uuid `[FK→medicine_batches]`
- **`quantity`** — int
- **`unit_price`** — decimal
- **`discount_pct`** — decimal DEFAULT 0
- **`discount_amount`** — decimal DEFAULT 0
- **`total_price`** — decimal · after item discount

**Trigger:** `fn_decrement_stock` on AFTER INSERT — atomic FEFO decrement; raises if insufficient stock.

#### `pharmacy_returns`

*Returns header*

**Fields:**
- **`id`** — uuid `[PK]`
- **`return_number`** — varchar `[UNIQUE]`
- **`original_sale_id`** — uuid `[FK→pharmacy_sales]`
- **`patient_id`** — uuid `[FK→patients null]`
- **`customer_name`** — varchar `[null]`
- **`customer_mobile`** — varchar `[null]`
- **`return_type`** — varchar · 'full' \| 'partial'
- **`return_reason`** — text `[null]`
- **`total_return_amount`** — decimal
- **`refund_mode`** — varchar · 'cash' \| 'upi' \| 'card' \| 'credit_note'
- **`refund_amount`** — decimal
- **`session_id`** — uuid `[FK→business_sessions null]`
- **`credit_note_id`** — uuid `[FK→credit_notes null]`
- **`approved_by`** — uuid `[FK→users]`
- **`processed_by`** — uuid `[FK→users]`
- **`created_at`** — timestamptz

#### `pharmacy_return_items`

*Returns lines*

**Fields:**
- **`id`** — uuid `[PK]`
- **`pharmacy_return_id`** — uuid `[FK→pharmacy_returns]`
- **`pharmacy_sale_item_id`** — uuid `[FK→pharmacy_sale_items]`
- **`medicine_id`** — uuid `[FK→medicines]`
- **`medicine_batch_id`** — uuid `[FK→medicine_batches]`
- **`quantity_returned`** — int
- **`unit_price`** — decimal · from original sale
- **`return_amount`** — decimal · qty × price − disc
- **`condition`** — varchar · 'good' \| 'opened' \| 'damaged' \| 'expired'
- **`restock_quantity`** — int · 0 if damaged
- **`notes`** — text `[null]`

#### `narcotic_register`

*NDPS Act-mandated Schedule X transactions register · append-only · 7-year legal retention*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`medicine_id`** — uuid `[FK→medicines]` · must be `is_narcotic=TRUE`
- **`medicine_batch_id`** — uuid `[FK→medicine_batches null]`
- **`pharmacy_sale_id`** — uuid `[FK→pharmacy_sales null]` · only for `dispense_out`
- **`prescription_id`** — uuid `[FK→prescriptions null]` · only for `dispense_out`
- **`transaction_type`** — varchar · 'purchase_in' \| 'dispense_out' \| 'wastage' \| 'transfer' \| 'return' \| 'expired_writeoff'
- **`quantity`** — int · positive; sign implied by transaction_type
- **`balance_after`** — int · running balance — must reconcile with physical stock at audit
- **`prescriber_name`** — varchar `[null]` · required for `dispense_out`
- **`prescriber_reg_no`** — varchar `[null]` · TNMC / MCI registration number
- **`recipient_name`** — varchar `[null]` · required for `dispense_out`
- **`recipient_relation`** — varchar `[null]` · 'self' \| 'mother' \| 'spouse' \| 'attender'
- **`recipient_id_proof`** — varchar `[null]` · Aadhaar last 4 / voter ID / DL · required for `dispense_out` (NDPS Act)
- **`witnessed_by`** — uuid `[FK→users null]` · second pharmacist · two-person rule
- **`performed_by`** — uuid `[FK→users]`
- **`performed_at`** — timestamptz
- **`notes`** — text `[null]`

**Append-only.** Errors are corrected by appending an adjustment row.

---

### 5.12 Nursing & Ward — REDISTRIBUTED

> The former Nursing & Ward module no longer exists as a discrete module. Its tables have been redistributed:
> - **`vitals`, `physio_sessions`** → moved to **5.6 Clinical** (shared OP + IP, in scope for v1).
> - **`nursing_notes`, `medication_administrations`, `discharge_summaries`, `shift_handovers`, `patient_handover_notes`** → moved to **5.9 IP** (Phase 2).
>
> The original deep-dive content for these tables is preserved below for reference.



Nursing-recorded data. Vitals, free-form nursing notes, medication administration logs, physiotherapy sessions, discharge summaries, and shift handovers between nursing teams.

**Tables in this module: 7**

| # | Table | Purpose |
|---|---|---|
| 1 | `vitals` | Recorded vitals (BP, pulse, SpO2, temp, …) |
| 2 | `nursing_notes` | Free-form nursing notes during admission |
| 3 | `medication_administrations` | "Drug given to bed 12 at 14:00" log |
| 4 | `physio_sessions` | Physiotherapy session records |
| 5 | `discharge_summaries` | Discharge summary documents |
| 6 | `shift_handovers` | Outgoing → incoming nurse shift handoff record |
| 7 | `patient_handover_notes` | Per-patient notes during handover |

#### `vitals`

*Recorded vitals*

**Fields:**
- **`id`** — uuid `[PK]`
- **`patient_id`** — uuid `[FK→patients]`
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`bp_systolic`** — int `[null]`
- **`bp_diastolic`** — int `[null]`
- **`pulse_rate`** — int `[null]`
- **`spo2`** — int `[null]`
- **`temperature_f`** — decimal `[null]`
- **`respiratory_rate`** — int `[null]`
- **`weight_kg`** — decimal `[null]`
- **`height_cm`** — decimal `[null]`
- **`bmi`** — decimal `[null]`
- **`pain_score`** — int `[null]` · 0–10
- **`recorded_by`** — uuid `[FK→users]`
- **`recorded_at`** — timestamptz

#### `nursing_notes`

*Free-form nursing notes*

**Fields:**
- **`id`** — uuid `[PK]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions]`
- **`patient_id`** — uuid `[FK→patients]`
- **`note_type`** — varchar
- **`note_text`** — text
- **`vitals_snapshot`** — jsonb `[null]`
- **`intake_output`** — jsonb `[null]`
- **`recorded_by`** — uuid `[FK→users]`
- **`recorded_at`** — timestamptz

#### `medication_administrations`

*Drug administration log*

**Fields:**
- **`id`** — uuid `[PK]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions]`
- **`ward_order_id`** — uuid `[FK→ward_orders null]`
- **`medicine_batch_id`** — uuid `[FK→medicine_batches]`
- **`dose`** — varchar
- **`route`** — varchar · 'oral' \| 'iv' \| 'im' \| 'sc' \| 'topical'
- **`administered_by`** — uuid `[FK→users]`
- **`administered_at`** — timestamptz
- **`notes`** — text `[null]`

#### `physio_sessions`

*Physiotherapy session records*

**Fields:**
- **`id`** — uuid `[PK]`
- **`patient_id`** — uuid `[FK→patients]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions null]`
- **`op_visit_id`** — uuid `[FK→op_visits null]`
- **`therapist_id`** — uuid `[FK→users]`
- **`session_date`** — date
- **`session_time`** — time
- **`duration_minutes`** — int
- **`notes`** — text `[null]`
- **`status`** — varchar

#### `discharge_summaries`

*Discharge summary documents*

**Fields:**
- **`id`** — uuid `[PK]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions]`
- **`patient_id`** — uuid `[FK→patients]`
- **`final_diagnosis`** — text
- **`procedure_done`** — text `[null]`
- **`hospital_course`** — text `[null]`
- **`discharge_advice`** — text
- **`medications`** — text `[null]`
- **`follow_up_date`** — date `[null]`
- **`created_by`** — uuid `[FK→users]`
- **`created_at`** — timestamptz

#### `shift_handovers`

*Outgoing → incoming nurse shift handoff record*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`ward_or_unit`** — varchar · 'ICU' \| 'General' \| 'OT' \| 'ER'
- **`from_user_id`** — uuid `[FK→users]` · outgoing nurse
- **`to_user_id`** — uuid `[FK→users null]` · incoming nurse
- **`shift_date`** — date
- **`shift_label`** — varchar · 'Morning' \| 'Evening' \| 'Night'
- **`status`** — varchar · 'pending' \| 'in_progress' \| 'signed_off' \| 'force_closed'
- **`general_notes`** — text `[null]` · ward-level alerts, supplies, BMS issues
- **`submitted_at`** — timestamptz `[null]`
- **`acknowledged_at`** — timestamptz `[null]` · both nurses signed
- **`created_at`** — timestamptz

#### `patient_handover_notes`

*Per-patient notes during handover*

**Fields:**
- **`id`** — uuid `[PK]`
- **`shift_handover_id`** — uuid `[FK→shift_handovers]`
- **`ip_admission_id`** — uuid `[FK→ip_admissions]`
- **`patient_id`** — uuid `[FK→patients]`
- **`condition_summary`** — varchar · 'stable' \| 'monitoring' \| 'deteriorating' \| 'critical'
- **`pending_meds`** — text `[null]` · meds due in next shift
- **`pending_orders`** — text `[null]` · investigations, procedures
- **`watch_points`** — text `[null]` · what to monitor closely
- **`family_notes`** — text `[null]` · family communication context

---

### 5.16 HR · Attendance — Phase 2

> **Out of scope for v1.** Tables retained in the schema for reference and Phase 2 implementation.



HR and time-tracking. Employee profiles, salary structures and history, shift definitions, duty roster, attendance, leave balances and requests, and the holiday calendar.

**Tables in this module: 9**

| # | Table | Purpose |
|---|---|---|
| 1 | `employee_profiles` | HR-specific attributes for users (PAN, bank, address) |
| 2 | `salary_structures` | Salary band definitions |
| 3 | `employee_salary_revisions` | Salary revision history per employee |
| 4 | `shifts` | Shift definitions (morning, evening, night) |
| 5 | `duty_roster` | Who works which shift on which day |
| 6 | `attendance` | Daily check-in / check-out records |
| 7 | `leave_balances` | Available leave balance per employee |
| 8 | `leave_requests` | Leave applications + approval state |
| 9 | `holidays` | Public holiday calendar |

#### `employee_profiles`

*HR-specific attributes for users*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[UNIQUE FK→users]`
- **`employment_type`** — varchar · 'full_time' \| 'part_time' \| 'contract' \| 'consultant' \| 'visiting'
- **`join_date`** — date
- **`monthly_ctc`** — decimal
- **`pan`** — varchar `[null]`
- **`aadhaar_last4`** — varchar `[null]`
- **`bank_account`** — varchar `[null]`
- **`bank_ifsc`** — varchar `[null]`
- **`address`** — text `[null]`
- **`emergency_contact`** — jsonb `[null]`

#### `salary_structures`

*Salary band definitions*

**Fields:**
- **`id`** — uuid `[PK]`
- **`structure_name`** — varchar · 'Junior Doctor' \| 'Consultant' \| 'Staff Nurse Grade A'
- **`basic_pct`** — decimal
- **`hra_pct`** — decimal
- **`special_allowance_pct`** — decimal
- **`pf_employee_pct`** — decimal
- **`pf_employer_pct`** — decimal
- **`is_active`** — boolean

#### `employee_salary_revisions`

*Salary revision history*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users]`
- **`old_ctc`** — decimal
- **`new_ctc`** — decimal
- **`structure_id`** — uuid `[FK→salary_structures null]`
- **`effective_from`** — date
- **`reason`** — text `[null]`
- **`approved_by`** — uuid `[FK→users null]`
- **`created_at`** — timestamptz

#### `shifts`

*Shift definitions*

**Fields:**
- **`id`** — uuid `[PK]`
- **`shift_name`** — varchar · 'Morning' \| 'Evening' \| 'Night'
- **`start_time`** — time
- **`end_time`** — time
- **`grace_period_mins`** — int

#### `duty_roster`

*Who works which shift on which day*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users]`
- **`shift_id`** — uuid `[FK→shifts]`
- **`duty_date`** — date
- **`assigned_by`** — uuid `[FK→users]`
- **`status`** — varchar · 'planned' \| 'completed' \| 'absent' \| 'swapped'

#### `attendance`

*Daily check-in / check-out*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users]`
- **`attendance_date`** — date
- **`check_in`** — timestamptz `[null]`
- **`check_out`** — timestamptz `[null]`
- **`status`** — varchar · 'present' \| 'late' \| 'absent' \| 'on_leave' \| 'half_day'
- **`source`** — varchar · 'biometric' \| 'manual' \| 'web'

#### `leave_balances`

*Available leave balance per employee*

**Fields:**
- **`user_id`** — uuid `[PK FK→users]`
- **`leave_type`** — varchar `[PK]` · 'casual' \| 'sick' \| 'earned' \| 'maternity' \| 'paternity'
- **`balance_remaining`** — decimal
- **`year`** — int

#### `leave_requests`

*Leave applications + approval state*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users]`
- **`from_date`** — date
- **`to_date`** — date
- **`leave_type`** — varchar · 'casual' \| 'sick' \| 'earned' \| …
- **`reason`** — text
- **`status`** — varchar · 'pending' \| 'approved' \| 'rejected' \| 'cancelled'
- **`approved_by`** — uuid `[FK→users null]`
- **`applied_at`** — timestamptz

#### `holidays`

*Public holiday calendar*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`holiday_date`** — date
- **`holiday_name`** — varchar
- **`is_optional`** — boolean

---

### 5.17 Payroll — Phase 2

> **Out of scope for v1.** Tables retained in the schema for reference and Phase 2 implementation.



Monthly salary processing. Payroll runs (the monthly batch), payslips per employee, reimbursements for expenses, advances and loans, and tax declarations.

**Tables in this module: 5**

| # | Table | Purpose |
|---|---|---|
| 1 | `payroll_runs` | Monthly payroll batch (the run header) |
| 2 | `payslips` | Per-employee payslip from a run |
| 3 | `reimbursements` | Expense reimbursement claims |
| 4 | `advances_loans` | Salary advances and loans (with EMI tracking) |
| 5 | `tds_declarations` | Annual tax declarations |

#### `payroll_runs`

*Monthly payroll batch*

**Fields:**
- **`id`** — uuid `[PK]`
- **`period_month`** — int
- **`period_year`** — int
- **`total_employees`** — int
- **`total_amount`** — decimal
- **`status`** — varchar · 'draft' \| 'finalized' \| 'paid'
- **`run_date`** — date

#### `payslips`

*Per-employee payslip*

**Fields:**
- **`id`** — uuid `[PK]`
- **`payroll_run_id`** — uuid `[FK→payroll_runs]`
- **`user_id`** — uuid `[FK→users]`
- **`gross`** — decimal
- **`basic`** — decimal
- **`hra`** — decimal
- **`special_allowance`** — decimal
- **`pf_employee`** — decimal
- **`tds`** — decimal
- **`advance_deduction`** — decimal
- **`loss_of_pay_days`** — decimal
- **`net_pay`** — decimal
- **`pdf_url`** — text `[null]`

#### `reimbursements`

*Expense reimbursement claims*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users]`
- **`category`** — varchar · 'travel' \| 'food' \| 'mobile' \| 'medical' \| 'other'
- **`amount`** — decimal
- **`receipt_url`** — text `[null]`
- **`status`** — varchar · 'pending' \| 'approved' \| 'rejected' \| 'paid'
- **`submitted_at`** — timestamptz
- **`approved_by`** — uuid `[FK→users null]`

#### `advances_loans`

*Salary advances and loans (with EMI tracking)*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users]`
- **`type`** — varchar · 'advance' \| 'loan'
- **`principal`** — decimal
- **`emi`** — decimal
- **`emi_count_total`** — int
- **`emi_count_paid`** — int DEFAULT 0
- **`balance_remaining`** — decimal
- **`status`** — varchar · 'active' \| 'closed' \| 'written_off'
- **`disbursed_at`** — timestamptz
- **`approved_by`** — uuid `[FK→users null]`

#### `tds_declarations`

*Annual tax declarations*

**Fields:**
- **`id`** — uuid `[PK]`
- **`user_id`** — uuid `[FK→users]`
- **`fy_year`** — int
- **`regime`** — varchar · 'old' \| 'new'
- **`declared_investments`** — jsonb
- **`tds_estimated`** — decimal
- **`submitted_at`** — timestamptz

---

### 5.15 Reports / Analytics

Analytics and configuration. Revenue targets, system-wide announcements, alert rules, and pre-aggregated materialized views for fast dashboards.

**Tables in this module: 9**

| # | Table | Purpose |
|---|---|---|
| 1 | `revenue_targets` | Targets for tracking (per dept, per doctor, per month) |
| 2 | `announcements` | System-wide messages from admin |
| 3 | `alert_rules` | Alert configuration (e.g. "warn if OP queue > 30 min") |
| 4 | `mv_revenue_daily` | Materialized view — daily revenue by tenant/segment |
| 5 | `mv_revenue_by_doctor` | Materialized view — revenue per doctor |
| 6 | `mv_outstanding_dues` | Materialized view — outstanding dues by patient |
| 7 | `mv_bed_occupancy_daily` | Materialized view — daily bed occupancy % |
| 8 | `mv_pharmacy_expiry_loss` | Materialized view — value of expired stock |
| 9 | `mv_payroll_cost_monthly` | Materialized view — payroll cost monthly |

#### `revenue_targets`

*Per-dept / per-doctor monthly revenue targets*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`department_id`** — uuid `[FK→departments null]`
- **`doctor_id`** — uuid `[FK→users null]`
- **`period_month`** — int
- **`period_year`** — int
- **`target_amount`** — decimal
- **`set_by`** — uuid `[FK→users]`

#### `announcements`

*System-wide messages*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`title`** — varchar
- **`body`** — text
- **`target_audience`** — varchar · 'all' \| 'doctors' \| 'nurses' \| …
- **`pinned`** — boolean DEFAULT FALSE
- **`from_user_id`** — uuid `[FK→users]`
- **`created_at`** — timestamptz

#### `alert_rules`

*Alert configuration*

**Fields:**
- **`id`** — uuid `[PK]`
- **`tenant_id`** — uuid `[FK→tenants]`
- **`rule_name`** — varchar
- **`condition_jsonb`** — jsonb · `{metric:"op_queue_minutes", op:">", threshold:30}`
- **`severity`** — varchar · 'info' \| 'warn' \| 'critical'
- **`subscribers_role_ids`** — uuid[] · roles that get notified
- **`is_active`** — boolean

#### Materialized views

| View | Refresh | Drives |
|---|---|---|
| `mv_revenue_daily` | hourly | Founder dashboards, date-range revenue filter |
| `mv_revenue_by_doctor` | hourly | Doctor leaderboards |
| `mv_outstanding_dues` | hourly | AR aging dashboard |
| `mv_bed_occupancy_daily` | daily | Capacity trend |
| `mv_pharmacy_expiry_loss` | daily | Expiry write-off cost |
| `mv_payroll_cost_monthly` | monthly | Founder cost-trend dashboard |

---

## 6. Operational Safety: Triggers & Invariants

Seven triggers enforce critical invariants in v8. They live in the database, not the application — every code path that mutates these tables benefits, including SQL consoles and migrations.

### `fn_sync_op_visit_state` (on `patient_journey_events AFTER INSERT`)

Updates `op_visits.current_state_code` and `ip_admissions.current_state_code` from the latest journey event for that patient. Maps `to_state` → numeric `code` via `patient_states.label`. Keeps the denormalized columns honest.

### `fn_sync_current_bed` (on `bed_assignments AFTER INSERT/UPDATE`)

On INSERT (with `to_ts IS NULL`): sets `ip_admissions.current_bed_id = NEW.bed_id` and `beds.status = 'occupied'`.
On UPDATE (when `to_ts` is set on a previously open assignment): `beds.status = 'cleaning'`.

### `fn_decrement_stock` (on `pharmacy_sale_items AFTER INSERT`)

Atomic decrement of `medicine_batches.quantity_available`. Bumps `version`. RAISES if stock goes negative. Inserts a corresponding `stock_movements` row with `movement_type='sale_out'`.

### `fn_autoflag_lab_result` (on `lab_results BEFORE INSERT`)

Reads `lab_tests.ref_min_male/female`, `ref_max_male/female`, `critical_low`, `critical_high` for the test, joins via `lab_order_items → lab_orders → patients` to get gender, and sets `flag` to one of `low | normal | high | critical`.

### `fn_critical_lab_alert` (on `lab_results AFTER INSERT`)

If `flag='critical'`, inserts a `notifications` row with:
- `user_id` = ordering doctor
- `type='critical_lab'`
- `priority='urgent'`
- `ack_required=TRUE`
- `ack_sla_minutes=30`

### `fn_close_bed_on_discharge` (on `ip_admissions AFTER UPDATE WHEN discharge_date changed`)

Sets `to_ts = NEW.discharge_date` on any open `bed_assignments` for this admission.

### `fn_log_price_change` (on `services AFTER UPDATE WHEN default_price changed`)

Closes the prior open period in `service_price_history` (sets `effective_to = CURRENT_DATE - 1`) and inserts a new row with `effective_from = CURRENT_DATE`.

---

## 7. Indexes for Query Patterns

Standard indexes (PK, UNIQUE constraints, FK targets) are created automatically. Below are the additional indexes that support the common operational query patterns.

### Patient search (fuzzy)
```sql
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_patients_uhid_trgm  ON patients USING gin (uhid gin_trgm_ops);
CREATE INDEX idx_patients_name_trgm  ON patients USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_patients_mobile     ON patients(mobile);
```

### Date-range revenue
```sql
CREATE INDEX idx_payments_date          ON payments(payment_date);
CREATE INDEX idx_payments_tenant_date   ON payments(tenant_id, payment_date);
CREATE INDEX idx_payment_items_payment  ON payment_items(payment_id);
```

### Outstanding dues (aging)
```sql
CREATE INDEX idx_invoices_balance       ON invoices(payment_status, created_at) WHERE balance > 0;
```

### Patient journey timeline
```sql
CREATE INDEX idx_pje_patient_date       ON patient_journey_events(patient_id, occurred_at);
CREATE INDEX idx_pje_tenant_occurred    ON patient_journey_events(tenant_id, occurred_at);
```

### Bed availability + current assignment
```sql
CREATE INDEX idx_beds_available         ON beds(status) WHERE status = 'available';
CREATE INDEX idx_bed_assignments_current ON bed_assignments(bed_id) WHERE to_ts IS NULL;
```

### Worklists
```sql
CREATE INDEX idx_prescriptions_active    ON prescriptions(status, created_at)
    WHERE status IN ('active','partially_dispensed');
CREATE INDEX idx_lab_orders_status       ON lab_orders(status, ordered_at);
CREATE INDEX idx_radiology_orders_status ON radiology_orders(status, ordered_at);
```

### FEFO stock pick
```sql
CREATE INDEX idx_medicine_batches_expiry ON medicine_batches(medicine_id, expiry_date)
    WHERE quantity_available > 0;
```

### Diagnosis search (ICD-10)
```sql
CREATE INDEX idx_consultations_diagnoses_gin ON consultations USING GIN (diagnoses);
```

### Critical unacked notifications (escalation worker)
```sql
CREATE INDEX idx_notifications_unacked_critical
    ON notifications(priority, created_at)
    WHERE ack_required = TRUE AND read_at IS NULL;
```

---

## 8. Compliance Surfaces

### NDPS Act (Schedule X narcotics)

- Every transaction on `medicines` rows where `is_narcotic=TRUE` MUST write a `narcotic_register` row
- Required fields: `prescriber_name + prescriber_reg_no`, `recipient_name + recipient_id_proof`, `witnessed_by`
- Append-only; corrections via adjustment rows
- Quarterly Drug Inspector audits — physical stock must reconcile with `balance_after`
- 7-year retention minimum

### Indian medico-legal cases (MLC)

- Trauma, assault, suicide attempts, poisoning, burns, sexual assault, animal bites, industrial accidents → MUST register MLC
- `mlc_records` row created at registration time; `op_visits.is_mlc=TRUE` and `mlc_number` set
- Police intimation tracked: `police_intimated_at`, `police_fir_number`
- Patient discharge UI **blocks** if `mlc_records.closure_status` is not `'closed'`

### GST (CGST/SGST/IGST)

- `services.sac_code` populated for every service
- `invoice_items.cgst_pct/amount`, `sgst_pct/amount`, `igst_pct/amount` populated at billing time
- Healthcare services typically GST-exempt; pharmacy / lab products are 5%/12%/18% by HSN
- View `v_gstr1_export` aggregates monthly for GSTR-1 filing
- Same split on `purchase_order_items` for input credit tracking

### Critical-result acknowledgment SLA

- `notifications.ack_required=TRUE` for critical alerts
- `notification_acknowledgments` row required before alert is "closed"
- `acked_at - notifications.created_at > ack_sla_minutes` → `breached_sla=TRUE`
- Breach surfaces in admin compliance reports

### Audit & retention

| Table | Retention |
|---|---|
| `audit_logs` | 7 years |
| `domain_events` | 3 years |
| `patient_journey_events` | 7 years |
| `narcotic_register` | 7 years (NDPS Act) |
| `service_price_history` | 10 years |
| `discharge_summaries`, `consultations`, `lab_results`, `radiology_reports` | 10 years (clinical record retention) |

---

## 9. State Catalog Reference

Codes 100–710. Phase 0 = ER, 1–6 = OP lifecycle, 7 = IP lifecycle.

| Code | Label | Phase | Department | SLA (min) | Blocking |
|---:|---|---|---|---:|:---:|
| 100 | walk_in_arrived | 0 | front_desk | — | — |
| 110 | registered | 1 | front_desk | 5 | — |
| 120 | awaiting_vitals | 1 | nursing | 10 | ✓ |
| 130 | vitals_done | 1 | nursing | 2 | — |
| 140 | awaiting_doctor | 2 | doctor | 20 | ✓ |
| 150 | in_consultation | 2 | doctor | 15 | — |
| 160 | consultation_done | 2 | doctor | 2 | — |
| 200 | awaiting_billing | 3 | billing | 10 | ✓ |
| 210 | billed | 3 | billing | 5 | — |
| 220 | paid | 3 | billing | 1 | — |
| 230 | partially_paid | 3 | billing | 60 | ✓ |
| 300 | lab_pending | 4 | lab | 60 | ✓ |
| 310 | lab_collected | 4 | lab | 30 | — |
| 320 | lab_in_progress | 4 | lab | 120 | — |
| 330 | lab_reported | 4 | lab | 2 | — |
| 400 | imaging_pending | 5 | radiology | 30 | ✓ |
| 410 | imaging_done | 5 | radiology | 5 | — |
| 420 | imaging_reported | 5 | radiology | 60 | — |
| 500 | rx_pending | 6 | pharmacy | 10 | ✓ |
| 510 | rx_dispensed | 6 | pharmacy | 1 | — |
| 600 | completed | 7 | — | 0 | — |
| 701 | admission_pending | 8 | inpatient | 60 | ✓ |
| 702 | admitted_ip | 8 | inpatient | — | — |
| 703 | in_treatment | 8 | inpatient | — | — |
| 704 | pre_op | 8 | surgery | 60 | — |
| 705 | in_surgery | 8 | surgery | — | — |
| 706 | post_op | 8 | surgery | — | — |
| 707 | mobilized | 8 | inpatient | — | — |
| 708 | discharge_pending | 8 | inpatient | 60 | ✓ |
| 709 | final_billed | 8 | billing | 30 | ✓ |
| 710 | discharged | 9 | — | 0 | ✓ |

---

## 10. Deferred / Future Extensibility

Items reviewed against 47 hospital journeys and intentionally deferred from v8. Tracked here so future contributors understand what was *considered and deferred*, not *forgotten*.

### Tier 2 — likely needed within 6–12 months

| # | Gap | When to add |
|---|---|---|
| 1 | Reflex testing (auto-trigger confirmation tests, e.g. HIV screen → Western Blot) | Add `lab_orders.triggered_by_result_id` when reflex pattern shows up in a real case |
| 2 | Death certificates / MCCD form | First IP death · add `death_certificates` table |
| 3 | Newborn → mother UHID linking | First maternity discharge · add `patients.mother_patient_id`, `is_newborn`, `birth_weight_grams` |
| 4 | Service packages / camps (e.g. ₹500 eye-camp bundle) | First camp event · add `service_packages` + `service_package_items` |
| 5 | Multi-session treatment packages (physio, dialysis, chemo) | First chronic-treatment patient · add `treatment_packages` + `treatment_package_sessions` |
| 6 | Equipment register + maintenance logs (NABL audit) | NABL accreditation drive · add `equipment`, `maintenance_logs`, `calibration_logs` |
| 7 | Vaccination / immunization records | Pediatric volume increases · add `immunization_records` |
| 8 | Patient feedback / complaints / grievance log | Quality program kickoff · add `patient_feedback`, `complaints`, `complaint_resolutions` |
| 9 | Vendor accounts payable | First non-pharma vendor invoice · add `vendor_invoices`, `vendor_payments` |
| 10 | Cold-chain temperature logs (insulin etc.) | First cold-chain compliance audit · add columns to `medicines` + `medicine_temperature_logs` |
| 11 | External referring physicians (attribution + commission tracking) | First referral commission scenario · add `referring_physicians` |
| 12 | Pricing schemes (corporate / EWS / government) | First corporate-rate patient · add `pricing_schemes` |

### Tier 3 — unlikely needed soon

- Telemedicine consultation flag + recording / consent
- Multi-tenant cross-hospital referrals (only if going SaaS)
- Staff certification / competency tracking (paper register works for now)
- Antenatal multi-month milestone tracking (existing visit + IP tables suffice initially)
- Pediatric growth percentile reference data (paper WHO charts work)
- Bio-medical waste tracking (separate operational concern, not patient-care)
- Backdated entry distinguishing (data created at time X vs ABOUT time Y) — covered enough by `created_at` for now

### Partitioning roadmap

When row counts breach the thresholds below, partition with `RANGE` partitioning by the indicated column:

| Table | Threshold | Partition by | Granularity |
|---|---:|---|---|
| `audit_logs` | 10M rows | `occurred_at` | monthly |
| `patient_journey_events` | 10M rows | `occurred_at` | monthly |
| `domain_events` | 10M rows | `occurred_at` | monthly |
| `lab_results` | 5M rows | `reported_at` | yearly |

---

*Document end. v8 schema is locked as of 9 May 2026. Changes after this point require an explicit version bump and a fresh `Vn__schema_v9_*.sql` migration.*
