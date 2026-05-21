# Indexes & Triggers

> Mirror of [schema runbook §6 + §7](hms_schema_runbook.md#6-operational-safety-triggers--invariants). Held here so BRD authors can reference invariants without opening the full runbook. **Keep in sync** — the runbook is authoritative.

## Triggers (7 in v8)

### `fn_sync_op_visit_state`
Fires: `patient_journey_events AFTER INSERT`
Updates: `op_visits.current_state_code` and `ip_admissions.current_state_code` from the latest journey event. Maps `to_state` → `code` via `patient_states.label`.

### `fn_sync_current_bed`
Fires: `bed_assignments AFTER INSERT/UPDATE`
- INSERT (open assignment): sets `ip_admissions.current_bed_id` and `beds.status='occupied'`
- UPDATE (closing an assignment): sets `beds.status='cleaning'`

### `fn_decrement_stock`
Fires: `pharmacy_sale_items AFTER INSERT`
Atomic decrement of `medicine_batches.quantity_available`; bumps `version`; **raises if stock goes negative**; inserts a `stock_movements` row of type `sale_out`.

### `fn_autoflag_lab_result`
Fires: `lab_results BEFORE INSERT`
Reads `lab_tests.ref_min_male/female`, `ref_max_male/female`, `critical_low`, `critical_high`. Joins via `lab_order_items → lab_orders → patients` to get gender. Sets `flag` to `low | normal | high | critical`.

### `fn_critical_lab_alert`
Fires: `lab_results AFTER INSERT`
If `flag='critical'`, inserts a `notifications` row to the ordering doctor with `priority='urgent'`, `ack_required=TRUE`, `ack_sla_minutes=30`.

### `fn_close_bed_on_discharge`
Fires: `ip_admissions AFTER UPDATE WHEN discharge_date changed`
Sets `to_ts = NEW.discharge_date` on any open `bed_assignments` for the admission.

### `fn_log_price_change`
Fires: `services AFTER UPDATE WHEN default_price changed`
Closes the prior open period in `service_price_history` (`effective_to = CURRENT_DATE - 1`) and inserts a fresh row with `effective_from = CURRENT_DATE`.

---

## Indexes (40+ in v8)

> Standard indexes (PK, UNIQUE, FK targets) are auto-created. Below are the **operational** indexes that support specific query patterns.

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
CREATE INDEX idx_beds_available           ON beds(status) WHERE status = 'available';
CREATE INDEX idx_bed_assignments_current  ON bed_assignments(bed_id) WHERE to_ts IS NULL;
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

### Token uniqueness (v8 fix — replaces a single broken UNIQUE)
```sql
CREATE UNIQUE INDEX uq_tokens_with_provider
    ON tokens(tenant_id, service_type, provider_id, issue_date, token_sequence)
    WHERE provider_id IS NOT NULL;
CREATE UNIQUE INDEX uq_tokens_no_provider
    ON tokens(tenant_id, service_type, issue_date, token_sequence)
    WHERE provider_id IS NULL;
```
