-- ============================================================
-- V71__seed_demo_users.sql
-- Demo users for local development.
--
-- Two sets:
--   Full-name users (pw: 123456) — match the frontend authMocks
--   Short-login users (pw: 123123) — quick dev logins
--
-- Passwords hashed at migration time via pgcrypto crypt().
-- ============================================================

-- ── Hospital profile (singleton) ─────────────────────────────────────────────
INSERT INTO hospital_profile (
    hospital_code, hospital_name,
    address,
    timezone,
    uhid_prefix, uhid_separator, uhid_sequence_padding, uhid_include_year,
    created_by
) VALUES (
    'KH',
    'Kumudha Hospital',
    '{"line1":"14 Gandhi Nagar","city":"Villupuram","state":"Tamil Nadu","pincode":"605602","country":"IN"}'::jsonb,
    'Asia/Kolkata',
    'KH', '-', 5, true,
    '00000000-0000-0000-0000-000000000000'
) ON CONFLICT DO NOTHING;

DO $$
DECLARE
    sys_actor uuid := '00000000-0000-0000-0000-000000000000';
    pw        text := crypt('123456', gen_salt('bf', 10));  -- full-name users
    pw2       text := crypt('123123', gen_salt('bf', 10));  -- short-login users

    -- Role IDs (existing from V7)
    r_admin              uuid;
    r_doctor             uuid;
    r_nurse              uuid;
    r_receptionist       uuid;
    r_cashier            uuid;
    r_pharmacist         uuid;
    r_lab_technician     uuid;

    -- Role IDs (new — inserted in this migration)
    r_radiology_tech     uuid;
    r_inventory_clerk    uuid;
    r_owner              uuid;

    -- Full-name user IDs
    u_doc1   uuid;
    u_doc2   uuid;
    u_doc3   uuid;
    u_doc4   uuid;
    u_doc5   uuid;
    u_rec    uuid;
    u_nurse  uuid;
    u_cash   uuid;
    u_lab    uuid;
    u_rad    uuid;
    u_pharm  uuid;
    u_inv    uuid;
    u_owner  uuid;
    u_admin  uuid;

    -- Short-login user IDs
    u_da uuid;
    u_na uuid;
    u_ca uuid;
    u_la uuid;
    u_pa uuid;
    u_ia uuid;
    u_oa uuid;

BEGIN

    -- ── 1. Add missing roles ──────────────────────────────────────────────────

    INSERT INTO roles (role_code, display_name, system_role, created_by)
        VALUES ('owner', 'Hospital Owner', TRUE, sys_actor)
        RETURNING id INTO r_owner;

    INSERT INTO roles (role_code, display_name, system_role, created_by)
        VALUES ('radiology_technician', 'Radiology Technician', TRUE, sys_actor)
        RETURNING id INTO r_radiology_tech;

    INSERT INTO roles (role_code, display_name, system_role, created_by)
        VALUES ('inventory_clerk', 'Inventory Clerk', TRUE, sys_actor)
        RETURNING id INTO r_inventory_clerk;

    -- ── 2. Fetch existing role IDs ────────────────────────────────────────────

    SELECT id INTO r_admin          FROM roles WHERE role_code = 'admin'          AND deleted_at IS NULL;
    SELECT id INTO r_doctor         FROM roles WHERE role_code = 'doctor'         AND deleted_at IS NULL;
    SELECT id INTO r_nurse          FROM roles WHERE role_code = 'nurse'          AND deleted_at IS NULL;
    SELECT id INTO r_receptionist   FROM roles WHERE role_code = 'receptionist'   AND deleted_at IS NULL;
    SELECT id INTO r_cashier        FROM roles WHERE role_code = 'cashier'        AND deleted_at IS NULL;
    SELECT id INTO r_pharmacist     FROM roles WHERE role_code = 'pharmacist'     AND deleted_at IS NULL;
    SELECT id INTO r_lab_technician FROM roles WHERE role_code = 'lab_technician' AND deleted_at IS NULL;

    -- ── 3. Full-name users (password: 123456) ────────────────────────────────

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP001', 'Dr. K Naveen Kumar', 'naveen.kumar', '9876543001', pw,
                'Orthopaedic Surgeon', 'active',
                '{"type":"doctor","specialization":"Orthopaedics","registrationNo":"KMC-67821"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_doc1;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP002', 'Dr. Anand Krishnan', 'anand.krishnan', '9876543002', pw,
                'Consultant Physician', 'active',
                '{"type":"doctor","specialization":"General Medicine","registrationNo":"KMC-58112"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_doc2;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP003', 'Dr. Meera Suresh', 'meera.suresh', '9876543003', pw,
                'Dental Surgeon', 'active',
                '{"type":"doctor","specialization":"Dental","registrationNo":"KMC-71204"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_doc3;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP004', 'Dr. Lakshmi Iyer', 'lakshmi.iyer', '9876543004', pw,
                'Consultant Gynaecologist', 'active',
                '{"type":"doctor","specialization":"Obstetrics & Gynaecology","registrationNo":"KMC-69045"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_doc4;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP005', 'Dr. Ravi Shankar', 'ravi.shankar', '9876543005', pw,
                'Physiotherapist', 'active',
                '{"type":"doctor","specialization":"Physiotherapy","registrationNo":"KMC-72319"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_doc5;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP006', 'Sita Krishnan', 'sita.krishnan', '9876543006', pw,
                'Receptionist', 'active',
                '{"type":"receptionist","stationSlug":"front_desk"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_rec;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP007', 'Beena Mathew', 'beena.mathew', '9876543007', pw,
                'Staff Nurse', 'active',
                '{"type":"nurse","stationSlug":"vitals"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_nurse;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP008', 'Ravi Subramanian', 'ravi.subramanian', '9876543008', pw,
                'Cashier', 'active',
                '{"type":"cashier","stationSlug":"billing"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_cash;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP009', 'Kavitha Rao', 'kavitha.rao', '9876543009', pw,
                'Lab Technician', 'active',
                '{"type":"lab_technician","stationSlug":"lab_processing"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_lab;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP010', 'Ahmed Khan', 'ahmed.khan', '9876543010', pw,
                'Radiology Technician', 'active',
                '{"type":"radiology_technician","stationSlug":"radiology"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_rad;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP011', 'Nisha Joseph', 'nisha.joseph', '9876543011', pw,
                'Pharmacist', 'active',
                '{"type":"pharmacist","stationSlug":"pharmacy"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_pharm;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP012', 'Manoj Iyer', 'manoj.iyer', '9876543012', pw,
                'Inventory Clerk', 'active',
                '{"type":"inventory_clerk"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_inv;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP013', 'Dr. Suresh Kumar', 'suresh.kumar', '9876543013', pw,
                'Hospital Owner', 'active',
                '{"type":"owner"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_owner;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP014', 'Sysadmin', 'sysadmin', '9876543014', pw,
                'System Administrator', 'active',
                '{"type":"admin"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_admin;

    -- ── 4. Short-login users (password: 123123) ───────────────────────────────

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP101', 'Demo Doctor', 'd.a', '9876540001', pw2,
                'Doctor', 'active',
                '{"type":"doctor","specialization":"General Medicine","registrationNo":"DEMO-001"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_da;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP102', 'Demo Nurse', 'n.a', '9876540002', pw2,
                'Staff Nurse', 'active',
                '{"type":"nurse","stationSlug":"vitals"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_na;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP103', 'Demo Cashier', 'c.a', '9876540003', pw2,
                'Cashier', 'active',
                '{"type":"cashier","stationSlug":"billing"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_ca;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP104', 'Demo Lab Tech', 'l.a', '9876540004', pw2,
                'Lab & Radiology Technician', 'active',
                '{"type":"lab_technician","stationSlug":"lab_processing"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_la;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP105', 'Demo Pharmacist', 'p.a', '9876540005', pw2,
                'Pharmacist', 'active',
                '{"type":"pharmacist","stationSlug":"pharmacy"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_pa;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP106', 'Demo Inventory Clerk', 'i.a', '9876540006', pw2,
                'Inventory Clerk', 'active',
                '{"type":"inventory_clerk"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_ia;

    INSERT INTO users (employee_id, full_name, username, mobile, password_hash,
                       designation, status, profile_data, created_by)
        VALUES ('EMP107', 'Demo Owner', 'o.a', '9876540007', pw2,
                'Hospital Owner', 'active',
                '{"type":"owner"}'::jsonb,
                sys_actor)
        RETURNING id INTO u_oa;

    -- ── 5. Role assignments ───────────────────────────────────────────────────

    INSERT INTO user_roles (user_id, role_id, is_primary, created_by) VALUES
        -- Full-name users
        (u_doc1,  r_doctor,          TRUE,  sys_actor),
        (u_doc2,  r_doctor,          TRUE,  sys_actor),
        (u_doc3,  r_doctor,          TRUE,  sys_actor),
        (u_doc4,  r_doctor,          TRUE,  sys_actor),
        (u_doc5,  r_doctor,          TRUE,  sys_actor),
        (u_rec,   r_receptionist,    TRUE,  sys_actor),
        (u_nurse, r_nurse,           TRUE,  sys_actor),
        (u_cash,  r_cashier,         TRUE,  sys_actor),
        (u_lab,   r_lab_technician,  TRUE,  sys_actor),
        (u_rad,   r_radiology_tech,  TRUE,  sys_actor),
        (u_pharm, r_pharmacist,      TRUE,  sys_actor),
        (u_inv,   r_inventory_clerk, TRUE,  sys_actor),
        (u_owner, r_owner,           TRUE,  sys_actor),
        (u_admin, r_admin,           TRUE,  sys_actor),
        -- Short-login users
        (u_da,    r_doctor,          TRUE,  sys_actor),
        (u_na,    r_nurse,           TRUE,  sys_actor),
        (u_ca,    r_cashier,         TRUE,  sys_actor),
        (u_la,    r_lab_technician,  TRUE,  sys_actor),  -- primary
        (u_la,    r_radiology_tech,  FALSE, sys_actor),  -- secondary
        (u_pa,    r_pharmacist,      TRUE,  sys_actor),
        (u_ia,    r_inventory_clerk, TRUE,  sys_actor),
        (u_oa,    r_owner,           TRUE,  sys_actor);

    -- ── 6. Doctor profiles ────────────────────────────────────────────────────

    INSERT INTO doctor_profiles (user_id, specialization, registration_number,
                                 consultation_fee, follow_up_fee, follow_up_window_days,
                                 available_days, created_by)
    VALUES
        (u_doc1, 'Orthopaedics', 'KMC-67821', 500.00, 300.00, 7,
         '{"mon":[{"from":"09:00","to":"13:00"}],"wed":[{"from":"09:00","to":"13:00"}],"fri":[{"from":"09:00","to":"13:00"}]}'::jsonb,
         sys_actor),
        (u_doc2, 'General Medicine', 'KMC-58112', 400.00, 250.00, 7,
         '{"mon":[{"from":"09:00","to":"13:00"}],"tue":[{"from":"09:00","to":"13:00"}],"wed":[{"from":"09:00","to":"13:00"}],"thu":[{"from":"09:00","to":"13:00"}],"fri":[{"from":"09:00","to":"13:00"}]}'::jsonb,
         sys_actor),
        (u_doc3, 'Dental', 'KMC-71204', 350.00, 200.00, 14,
         '{"tue":[{"from":"10:00","to":"14:00"}],"thu":[{"from":"10:00","to":"14:00"}],"sat":[{"from":"10:00","to":"13:00"}]}'::jsonb,
         sys_actor),
        (u_doc4, 'Obstetrics & Gynaecology', 'KMC-69045', 600.00, 400.00, 7,
         '{"mon":[{"from":"10:00","to":"13:00"}],"wed":[{"from":"10:00","to":"13:00"}],"fri":[{"from":"10:00","to":"13:00"}]}'::jsonb,
         sys_actor),
        (u_doc5, 'Physiotherapy', 'KMC-72319', 300.00, 200.00, 10,
         '{"mon":[{"from":"08:00","to":"12:00"},{"from":"16:00","to":"19:00"}],"tue":[{"from":"08:00","to":"12:00"},{"from":"16:00","to":"19:00"}],"wed":[{"from":"08:00","to":"12:00"},{"from":"16:00","to":"19:00"}],"thu":[{"from":"08:00","to":"12:00"},{"from":"16:00","to":"19:00"}],"fri":[{"from":"08:00","to":"12:00"},{"from":"16:00","to":"19:00"}]}'::jsonb,
         sys_actor),
        (u_da, 'General Medicine', 'DEMO-001', 300.00, 200.00, 7,
         '{"mon":[{"from":"09:00","to":"17:00"}],"tue":[{"from":"09:00","to":"17:00"}],"wed":[{"from":"09:00","to":"17:00"}],"thu":[{"from":"09:00","to":"17:00"}],"fri":[{"from":"09:00","to":"17:00"}]}'::jsonb,
         sys_actor);

END $$;
