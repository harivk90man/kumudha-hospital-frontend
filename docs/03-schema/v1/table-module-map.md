# Table → Module Map

> Cross-reference of every v8 table to its owning module. Source of truth is the [schema runbook](hms_schema_runbook.md) §5 *Module Deep Dives*; this file is the at-a-glance index.

| # | Module | Status | Tables (high-level) |
|---|---|---|---|
| 5.1 | Core / Platform | v1 | `tenants`, `users`, `roles`, `user_roles`, `audit_logs`, `domain_events`, `notifications`, `notification_acknowledgments`, `document_templates`, `file_attachments` |
| 5.2 | Patient Master | v1 | `patients`, `patient_merges`, `uhid_sequences` |
| 5.3 | Patient Journey / Workflow | v1 | `patient_states`, `stations`, `patient_journey_events` |
| 5.4 | Scheduling | v1 | `appointment_slots`, `appointments`, `tokens` |
| 5.5 | Patient Encounters | v1 | `op_visits`, `patient_queue`, `tokens` (ref), `ip_admissions`, `mlc_records` |
| 5.6 | Clinical | v1 | `vitals`, `consultations`, `prescriptions`, `prescription_items`, `physio_sessions` |
| 5.7 | Billing | v1 | `services`, `service_price_history`, `service_billing_policies`, `invoices`, `invoice_items` |
| 5.8 | Cash & Closure | v1 | `payees`, `payments`, `payment_allocations`, `payment_items`, `payment_item_types`, `payment_consultation`, `payment_lab`, `payment_pharmacy`, `payment_xray`, `payment_cafeteria`, `cash_sessions` |
| 5.9 | IP | **Phase 2** | `ip_admissions` (ref), `bed_assignments`, `beds`, `wards`, `interim_bills`, `discharge_summaries`, `mlc_records` (ref) |
| 5.10 | Surgery | **Phase 2** | `surgery_schedules`, `operation_theatres`, `anaesthesia_records`, `surgical_packages` |
| 5.11 | Lab | v1 | `lab_tests`, `lab_orders`, `lab_order_items`, `lab_results`, `lab_result_panels` |
| 5.12 | Radiology | v1 | `radiology_studies`, `radiology_orders`, `radiology_reports` |
| 5.13 | Pharmacy | v1 | `pharmacy_sales`, `pharmacy_sale_items`, `narcotic_register` |
| 5.14 | Inventory | v1 | `medicines`, `medicine_batches`, `stock_movements`, `purchase_orders`, `purchase_order_items` |
| 5.15 | Reports / Analytics | v1 | Materialized views: `mv_revenue_daily`, `mv_revenue_by_doctor`, `mv_outstanding_dues`, … |
| 5.16 | HR · Attendance | **Phase 2** | `staff_attendance`, `leave_requests`, `shift_rosters` |
| 5.17 | Payroll | **Phase 2** | `payslips`, `salary_components`, `statutory_deductions` |

> ⚠️ The exact table list per module above is summarised — the runbook is authoritative. After every schema change, refresh this file's lists from the runbook's §5 deep dives.

## Cross-cutting tables (referenced from many modules)

- `tenants` — every table FKs here
- `users` — `created_by`, `updated_by`, `dispensed_by`, etc.
- `file_attachments` — polymorphic (`entity_table`, `entity_id`)
- `notifications` — used by lab critical alerts, IP discharge gating, etc.
- `audit_logs`, `domain_events`, `patient_journey_events` — append-only event streams
