-- =====================================================================
-- truncate_all.sql
--
-- WARNING: DESTRUCTIVE — wipes ALL business / clinical / inventory rows.
--
-- Use case: development & demo reset. Lets you re-seed sample_data.sql
-- on a clean slate without losing schema, RBAC, lookups, or the bootstrap
-- tenant + admin + Dr. Priya Iyer rows.
--
-- Idempotent: TRUNCATE on an empty table is a no-op, safe to re-run.
--
-- ---------------------------------------------------------------------
-- PRESERVED (NOT truncated)
-- ---------------------------------------------------------------------
--   tenants                      bootstrap (Kumudha Hospital)
--   users                        admin + doctors keep auth identity
--   doctor_profiles              specialisation, fees, availability
--   departments                  hospital structure
--   roles, permissions,          RBAC catalog
--   role_permissions, user_roles
--   audit_excluded_tables        Tier-3 audit registry
--   patient_mergeable_tables     merge engine registry
--   patient_states               state-machine catalog (100..710)
--   stations                     physical service points catalog
--   allergies_lookup             clinical pickers
--   chronic_conditions_lookup    clinical pickers
--   uhid_sequences               leave counters intact for continuity
--   tenant_holidays              calendar
--   doctor_schedules             availability templates
--   system_config                tenant settings
--   user_preferences             per-user UI prefs
--   user_sessions                JWT sessions (high churn, low value)
--   document_templates           rendering templates
--   diagnosis_templates          consultation templates (clinical catalog)
--
-- ---------------------------------------------------------------------
-- TRUNCATED (CASCADE handles FK ordering automatically)
-- ---------------------------------------------------------------------

set search_path = public;

begin;

truncate table
  -- Patient master & identity
  patient_govt_ids,
  patient_family_history,
  patient_merges,

  -- Encounter & journey
  patient_journey_events,
  patient_queue,
  op_visits,

  -- Clinical
  doctor_recommendations,
  prescription_items,
  prescriptions,
  consultation_drafts,
  consultations,
  vitals,

  -- Lab
  lab_results,
  lab_order_items,
  lab_samples,
  lab_orders,
  lab_test_panels,
  lab_tests,

  -- Radiology
  radiology_reports,
  radiology_studies,
  radiology_orders,
  radiology_procedures,

  -- Inventory
  narcotic_register,
  stock_movements,
  purchase_order_items,
  purchase_orders,
  medicine_batches,
  medicines,
  vendors,

  -- Notifications & audit & events & files
  notification_acknowledgments,
  notifications,
  file_attachments,
  domain_events,
  audit_logs,

  -- Patients last (every clinical/encounter row FKs back here)
  patients
restart identity cascade;

commit;

-- =====================================================================
-- After this script, the DB still has:
--   - 1 tenant (Kumudha Hospital)
--   - admin user + Dr. Priya Iyer (with doctor_profile)
--   - 8 departments, 11 roles, 11 permissions
--   - 33 patient_states, 10 stations
--   - 14 allergies, 15 chronic conditions
-- Re-run sample_data.sql to repopulate clinical data.
-- =====================================================================
