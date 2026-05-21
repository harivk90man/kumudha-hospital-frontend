/* HMS Schema v8 — table → module reverse index. AI: add one line when introducing a new table. Used by renderer.js for cross-module FK links. */
const CATALOG = {
  // ── platform-tenancy ─────────────────────────────────────
  'tenants':'platform-tenancy', 'users':'platform-tenancy', 'departments':'platform-tenancy',
  'doctor_profiles':'platform-tenancy', 'roles':'platform-tenancy', 'user_roles':'platform-tenancy',
  'permissions':'platform-tenancy', 'role_permissions':'platform-tenancy', 'user_sessions':'platform-tenancy',
  'system_config':'platform-tenancy', 'user_preferences':'platform-tenancy', 'tenant_holidays':'platform-tenancy',
  'doctor_schedules':'platform-tenancy',

  // ── platform-audit ───────────────────────────────────────
  'audit_logs':'platform-audit', 'audit_excluded_tables':'platform-audit',

  // ── platform-events ──────────────────────────────────────
  'domain_events':'platform-events',

  // ── platform-notifications ───────────────────────────────
  'notifications':'platform-notifications', 'notification_acknowledgments':'platform-notifications',

  // ── platform-attachments ─────────────────────────────────
  'document_templates':'platform-attachments', 'file_attachments':'platform-attachments',

  // ── platform-lookups ─────────────────────────────────────
  'allergies_lookup':'platform-lookups', 'chronic_conditions_lookup':'platform-lookups',

  // ── patient ──────────────────────────────────────────────
  'patients':'patient', 'patient_govt_ids':'patient', 'patient_merges':'patient',
  'patient_mergeable_tables':'patient', 'uhid_sequences':'patient', 'patient_family_history':'patient',

  // ── journey ──────────────────────────────────────────────
  'patient_states':'journey', 'stations':'journey', 'patient_journey_events':'journey',

  // ── appointments ─────────────────────────────────────────
  'appointment_slots':'appointments', 'appointments':'appointments', 'tokens':'appointments',

  // ── encounter ────────────────────────────────────────────
  'op_visits':'encounter', 'patient_queue':'encounter',

  // ── consultation ─────────────────────────────────────────
  'vitals':'consultation', 'consultations':'consultation', 'consultation_drafts':'consultation',
  'diagnosis_templates':'consultation', 'prescriptions':'consultation',
  'prescription_items':'consultation', 'doctor_recommendations':'consultation',

  // ── lab ──────────────────────────────────────────────────
  'lab_tests':'lab', 'lab_test_panels':'lab', 'lab_orders':'lab',
  'lab_order_items':'lab', 'lab_samples':'lab', 'lab_results':'lab',

  // ── radiology ────────────────────────────────────────────
  'radiology_procedures':'radiology', 'radiology_orders':'radiology',
  'radiology_studies':'radiology', 'radiology_reports':'radiology',

  // ── inventory ────────────────────────────────────────────
  'vendors':'inventory', 'medicines':'inventory', 'medicine_batches':'inventory',
  'purchase_orders':'inventory', 'purchase_order_items':'inventory',
  'stock_movements':'inventory', 'narcotic_register':'inventory',

  // ── pharmacy ─────────────────────────────────────────────
  'pharmacy_sales':'pharmacy', 'pharmacy_sale_items':'pharmacy',
  'pharmacy_returns':'pharmacy', 'pharmacy_return_items':'pharmacy',

  // ── pricing ──────────────────────────────────────────────
  'services':'pricing', 'service_price_history':'pricing', 'service_billing_policies':'pricing',

  // ── billing ──────────────────────────────────────────────
  'invoices':'billing', 'invoice_items':'billing', 'credit_notes':'billing',

  // ── payments ─────────────────────────────────────────────
  'payees':'payments', 'payments':'payments', 'payment_allocations':'payments',
  'payment_item_types':'payments', 'payment_items':'payments',
  'payment_consultation':'payments', 'payment_lab':'payments',
  'payment_pharmacy':'payments', 'payment_xray':'payments', 'payment_cafeteria':'payments',
  'cash_counters':'payments', 'cash_sessions':'payments', 'session_movements':'payments',

  // ── analytics ────────────────────────────────────────────
  'revenue_targets':'analytics', 'announcements':'analytics', 'alert_rules':'analytics',
  'mv_revenue_daily':'analytics', 'mv_revenue_by_doctor':'analytics',
  'mv_outstanding_dues':'analytics', 'mv_bed_occupancy_daily':'analytics',
  'mv_pharmacy_expiry_loss':'analytics', 'mv_payroll_cost_monthly':'analytics',
};
