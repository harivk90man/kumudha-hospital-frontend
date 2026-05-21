# Technical Specification Documents (TSD) — Hospital Management System

> **Purpose.** Each TSD answers one question for a developer or AI assistant: *"For this business entity, which tables exist, what columns do they hold, and which BRD flows touch them?"*
>
> Read alongside the BRD ([../01-brd/hospital-flows.md](../01-brd/hospital-flows.md)). Every BRD flow includes a **📚 Technical Spec** callout that links to the relevant TSDs in this folder.

**Last updated:** 2026-05-10
**Schema state:** Tentative — see [Schema Review Notes](#schema-review-notes-rolling-log) at the bottom of this README.

---

## How to navigate

- **Looking up a table?** Open the TSD that owns it (table-of-contents below).
- **Reading a business flow?** Start in the BRD; click the 📚 callout at the top of the flow to land on the right TSD(s).
- **Building the app?** Open the TSDs for the flows you're implementing — each TSD is **self-contained** (full column specs + relationships). You should not need to open the runbook unless you're investigating a design question.
- **Source of truth.** TSDs in this folder are the canonical implementation spec. The schema runbook ([../03-schema/hms_schema_runbook.md](../03-schema/hms_schema_runbook.md)) remains the *design rationale* — useful for "why is it this way?" but not for "what fields exist?".

See [00-conventions.md](00-conventions.md) for column-spec syntax, status tags, and lifecycle conventions.

---

## TSD Index

### Cross-cutting design
| # | Doc | What it covers |
|---|---|---|
| 00 | [Conventions](00-conventions.md) | Column-spec syntax, lifecycle tags, **FK pattern rule** (separate-column default), **standard audit columns**, naming (`_lookup`), status tags, schema-review note discipline |
| 00 | [Audit Logging Design](00-audit-logging.md) | Three-layer audit model: inline columns / maker-checker / central `audit_logs` (trigger + JSONB before/after); tier classification; partitioning + retention |

### Foundation
| # | TSD | Tables | Status |
|---|---|---|---|
| 01 | [Platform & Tenancy](01-platform-tenancy.md) | tenants *(+ timezone)*, users, departments, doctor_profiles, roles, user_roles, permissions, role_permissions, user_sessions, system_config, user_preferences, **tenant_holidays** | Phase 1 |
| 02 | [Audit, Events & Notifications](02-audit-events-notifications.md) | audit_logs *(trigger-based)*, domain_events, notifications, notification_acknowledgments, document_templates, file_attachments, **audit_excluded_tables** | Phase 1 |

### Patient
| # | TSD | Tables | Status |
|---|---|---|---|
| 03 | [Patient Master](03-patient-master.md) | patients, patient_govt_ids, patient_merges, patient_mergeable_tables, uhid_sequences, **allergies_lookup**, **chronic_conditions_lookup**, **patient_family_history** | Phase 1 |
| 04 | Patient Journey *(Batch B)* | patient_states, stations, patient_journey_events | Phase 1 |

### OPD path
| # | TSD | Tables | Status |
|---|---|---|---|
| 05 | Appointments *(Batch B)* | appointment_slots, appointments, tokens | Phase 1 |
| 06 | OPD Encounters *(Batch B)* | op_visits, patient_queue | Phase 1 |
| 07 | Clinical Consultation *(Batch B)* | vitals, consultations, prescriptions, prescription_items | Phase 1 |

### Ancillary departments
| # | TSD | Tables | Status |
|---|---|---|---|
| 08 | [Lab](08-lab.md) | lab_tests, lab_test_panels, lab_orders, lab_order_items, lab_samples, lab_results *(Layer 2)* | Phase 1 |
| 09 | [Radiology](09-radiology.md) | radiology_procedures, radiology_orders, radiology_studies, radiology_reports *(Layer 2)* | Phase 1 |
| 10 | [Pharmacy & Inventory](10-pharmacy-inventory.md) | vendors, medicines, medicine_batches, purchase_orders *(Layer 2)*, purchase_order_items, stock_movements, pharmacy_sales, pharmacy_sale_items, pharmacy_returns, pharmacy_return_items, narcotic_register *(Layer 2)* | Phase 1 |

### Money
| # | TSD | Tables | Status |
|---|---|---|---|
| 11 | [Services & Pricing](11-services-pricing.md) | services, service_price_history, service_billing_policies | Phase 1 |
| 12 | [Billing & Invoicing](12-billing-invoicing.md) | invoices *(Layer 2)*, invoice_items, credit_notes *(Layer 2)* | Phase 1 |
| 13 | [Payments & Cash](13-payments-cash.md) | payees, payments, payment_allocations, payment_item_types, payment_items *(separate-FK)*, payment_consultation, payment_lab, payment_pharmacy, payment_xray, payment_cafeteria, cash_counters, cash_sessions, session_movements | Phase 1 |

### Analytics
| # | TSD | Tables | Status |
|---|---|---|---|
| 14 | [Reports & Analytics](14-reports-analytics.md) | revenue_targets, announcements, alert_rules, mv_revenue_daily, mv_revenue_by_doctor, mv_outstanding_dues, mv_bed_occupancy_daily, mv_pharmacy_expiry_loss, mv_payroll_cost_monthly | Phase 1 |

### Phase 2 — Reference architecture (deferred)
| # | TSD | Tables | Status |
|---|---|---|---|
| 15 | [phase-2/IPD Admissions](phase-2/15-ipd-admissions.md) *(stub)* | ip_admissions, beds, wards, bed_assignments, interim_bills, discharge_summaries, mlc_records | Phase 2 |
| 16 | [phase-2/Surgery](phase-2/16-surgery.md) *(stub)* | surgery_schedules, operation_theatres, anaesthesia_records, surgical_packages | Phase 2 |
| 17 | [phase-2/HR · Attendance](phase-2/17-hr-attendance.md) *(stub)* | staff_attendance, leave_requests, shift_rosters | Phase 2 |
| 18 | [phase-2/Payroll](phase-2/18-payroll.md) *(stub)* | payslips, salary_components, statutory_deductions | Phase 2 |

---

## Entity ↔ Flow Matrix

Which TSDs back which BRD flow.

| BRD Flow | TSDs |
|---|---|
| 1. OPD — Outpatient Visit `🔒 LOCKED` | 02 audit/notif · 03 patient · 04 journey · 05 appointments · 06 opd-encounters · 07 clinical · 08 lab · 09 radiology · 10 pharmacy · 11 services · 12 billing · 13 payments |
| 2. IPD — Inpatient Admission *(Phase 2)* | phase-2/15 |
| 3. Emergency *(Phase 2)* | phase-2/15 (uses IPD entry-point) |
| 4. Appointment Booking | 02 notif · 03 patient · 05 appointments |
| 5. Doctor | 02 audit · 03 patient · 04 journey · 06 opd-encounters · 07 clinical · 08 lab · 09 radiology · 10 pharmacy (stock-status read) |
| 6. Nurse / Ward *(Phase 2)* | phase-2/15 |
| 7. Lab & Radiology | 02 files/notif · 03 patient · 08 lab · 09 radiology · 11 services · 12 billing · 13 payments |
| 8. Pharmacy | 03 patient · 10 pharmacy-inventory · 11 services · 12 billing · 13 payments |
| 9. Billing | 02 audit · 11 services · 12 billing · 13 payments |
| 10. Discharge *(Phase 2)* | phase-2/15 |
| 11. Insurance / TPA *(Phase 2)* | *(no stub yet — defer until scope firms)* |
| 12. Hospital Owner | 01 platform · 02 audit · 14 reports · all transactional TSDs (read-only consumer) |
| 13. Platform Admin | 01 platform · 02 audit |

---

## Coverage Checklist

To prevent orphan tables, every Phase 1 table from the runbook should appear in **exactly one** TSD. As each batch is written, tick the box.

**Foundation**
- [x] tenants (incl. `timezone`), users, departments, doctor_profiles, roles, user_roles, permissions, role_permissions, user_sessions, system_config, user_preferences, tenant_holidays → TSD-01
- [x] audit_logs, domain_events, notifications, notification_acknowledgments, document_templates, file_attachments, audit_excluded_tables → TSD-02

**Patient**
- [x] patients, patient_govt_ids, patient_merges, patient_mergeable_tables, uhid_sequences, allergies_lookup, chronic_conditions_lookup, patient_family_history → TSD-03
- [x] patient_states, stations, patient_journey_events → TSD-04

**OPD path**
- [x] appointment_slots, appointments, tokens *(separate-FK)* → TSD-05
- [x] op_visits, patient_queue → TSD-06
- [x] vitals, consultations, diagnosis_templates, prescriptions, prescription_items, doctor_recommendations *(separate-FK)*, consultation_drafts → TSD-07

**Ancillary**
- [x] lab_tests, lab_test_panels, lab_orders, lab_order_items, lab_samples, lab_results → TSD-08
- [x] radiology_procedures, radiology_orders, radiology_studies, radiology_reports → TSD-09
- [x] vendors, medicines, medicine_batches, purchase_orders, purchase_order_items, stock_movements, pharmacy_sales, pharmacy_sale_items, pharmacy_returns, pharmacy_return_items, narcotic_register → TSD-10

**Money**
- [x] services, service_price_history, service_billing_policies → TSD-11
- [x] invoices, invoice_items, credit_notes → TSD-12
- [x] payees, payments, payment_allocations, payment_item_types, payment_items, payment_consultation, payment_lab, payment_pharmacy, payment_xray, payment_cafeteria, cash_counters, cash_sessions, session_movements → TSD-13

**Analytics**
- [x] revenue_targets, announcements, alert_rules + 6 materialized views → TSD-14

---

## Schema Review Notes (rolling log)

The schema is **tentative**. As TSDs are authored, candidate improvements over the runbook are flagged in each TSD's *§6 Schema Review Notes*. Decisions land here once the user has reviewed.

| TSD | Note | Status |
|---|---|---|
| 03 | Aadhaar / PAN moved to dedicated encrypted table `patient_govt_ids` | ✅ Resolved 2026-05-10 |
| 03 | Address JSONB schema locked + `address_pincode` / `address_city` generated columns added | ✅ Resolved 2026-05-10 |
| 03 | `uhid_sequences` stays in patient master | ✅ Resolved 2026-05-10 |
| 03 | Merge mechanism: lifted to `patient_mergeable_tables` registry (Option B) | ✅ Resolved 2026-05-10 |
| 03 | Allergies / chronic conditions stay as `text[]`; added `allergies_lookup` + `chronic_conditions_lookup` | ✅ Resolved 2026-05-10 |
| 03 | `patient_family_history` table added for hereditary-risk assessment | ✅ Resolved 2026-05-10 |
| 03 | `patient_merges` carries Layer 2 maker-checker columns (unmerge requires founder approval) | ✅ Resolved 2026-05-10 |
| 01 | `tenants.timezone` added (default `Asia/Kolkata`, changeable) | ✅ Resolved 2026-05-10 |
| 01 | `tenant_holidays` table added | ✅ Resolved 2026-05-10 |
| 01 | `system_config` carries Layer 2 maker-checker columns | ✅ Resolved 2026-05-10 |
| 02 | `audit_logs` redesigned: trigger-based, `changed_fields`, `request_id`, monthly partitioning | ✅ Resolved 2026-05-10 |
| 02 | `audit_excluded_tables` registry added | ✅ Resolved 2026-05-10 |
| 05 | `tokens` polymorphic FK replaced with separate columns + CHECK exactly-one | ✅ Resolved 2026-05-10 |
| 07 | `doctor_recommendations` polymorphic FK replaced with separate columns + CHECK at-most-one | ✅ Resolved 2026-05-10 |
| 00 | FK pattern rule: separate-column default; polymorphic only for `audit_logs` + `file_attachments` (with CI orphan check) | ✅ Resolved 2026-05-10 |
| 00 | Standard audit columns (`created_by/at`, `updated_by/at`, `version`) on every mutable table | ✅ Resolved 2026-05-10 |
| 00 | `_lookup` suffix for reference tables (not `_master`) | ✅ Resolved 2026-05-10 |
| 03, 07 | Language preference deferred to a later phase | ⏸ Deferred |
| Various | Tier 2 compliance items (read-audit, e-invoice IRN/QR, lab QC, MCI verification) deferred | ⏸ Deferred |
| 08 | Lab: Layer 2 maker-checker on `lab_results` (verified / override release per BRD §7) | ✅ Resolved 2026-05-10 |
| 09 | Radiology: Layer 2 maker-checker on `radiology_reports` (junior reads, senior verifies) — proactive add | ✅ Resolved 2026-05-10 |
| 10 | Pharmacy: Layer 2 on `purchase_orders` + two-person witness on `narcotic_register` | ✅ Resolved 2026-05-10 |
| 10 | Pharmacy: `stock_movements` polymorphic FK replaced with separate columns | ✅ Resolved 2026-05-10 |
| 10 | Pharmacy: `medicines.drug_class` added for allergy-alert match | ✅ Resolved 2026-05-10 |
| 08 | Lab: pediatric / pregnancy reference ranges — needs decision (column add vs child table) | 🔵 Open |
| 09 | Radiology: single-radiologist hospitals can't satisfy `created_by <> approved_by` — needs config flag | 🔵 Open |
| 11 | Services: doctor consultation fees in two places (`doctor_profiles` + `services`) — pick one source | 🔵 Open |
| 11 | Services: closed-period UPDATE on `service_price_history.effective_to` — add to audit-excluded? | 🔵 Open |
| 12 | Billing: Layer 2 maker-checker on `invoices` + `credit_notes` | ✅ Resolved 2026-05-10 |
| 12 | Billing: `invoice_items.reference_id` polymorphic → 6 separate-column FKs + CHECK | ✅ Resolved 2026-05-10 |
| 13 | Payments: `payment_items.item_record_id` polymorphic → 5 separate-column FKs + CHECK | ✅ Resolved 2026-05-10 |
| 13 | `business_sessions` renamed to `cash_sessions` for cross-TSD consistency | ✅ Resolved 2026-05-10 |
| 13 | `session_closure_audit` table dropped — central `audit_logs` covers it | ✅ Resolved 2026-05-10 |
| 03 | Unmerge mechanics undefined — needed before any unmerge UI | 🔵 Open |
| 03 | App-self-service `created_via` enum — needed when patient-app booking is built | 🔵 Open |
| 01 | `doctor_profiles.available_days` JSON shape — relevant when slot-generator code is written | 🔵 Open |

When a note materially affects table shape or business-flow complexity, authoring stops and the issue is surfaced to the user for explicit decision before continuing.
