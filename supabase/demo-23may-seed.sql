-- =====================================================================
-- demo-23may-seed.sql
--
-- Comprehensive demo seed for 23 May 2026 demo. Generates:
--   * 30 patients (KH-2026-DEMO-001 … KH-2026-DEMO-030)
--   * Today's cash session (TILL-1, morning, 23-May)
--   * 120 historical visits over last 30 days (2026-04-23 … 2026-05-22)
--       - op_visit + locked consultation
--       - 1–3 Rx items
--       - 60% have lab orders + items + released results
--       - 50% have radiology orders + released reports
--       - 70% have pharmacy_sales dispense (Rx flowing through)
--       - invoices (consult + lab + rad + pharmacy) all fully paid
--   * 50 appointments for today (2026-05-23) — mix of statuses
--   * 10 appointments for tomorrow (2026-05-24)
--   * 8 appointments for day after (2026-05-25)
--
-- Idempotency: sentinel patient UHID `KH-2026-DEMO-001` — re-runs no-op.
-- Cleanup: see demo-23may-cleanup.sql (matching prefix deletes).
-- =====================================================================

do $$
declare
  bs uuid := '00000000-0000-0000-0000-000000000001';
  approver uuid;
  v_till uuid;
  v_today_session uuid;

  -- doctor uuids
  v_doc_anand       uuid;
  v_doc_meera       uuid;
  v_doc_priya       uuid;
  v_doc_naveen      uuid;
  v_doc_lakshmi     uuid;
  v_doc_ravi        uuid;
  v_doc_naveenkumar uuid;
  doctor_ids        uuid[];

  -- catalog refs
  v_svc_consult uuid;
  v_svc_consult_fu uuid;
  v_svc_lab_cbc uuid; v_svc_lab_bsf uuid; v_svc_lab_lipid uuid; v_svc_lab_hba1c uuid;
  v_svc_rad_xchest uuid; v_svc_rad_usg uuid; v_svc_rad_ecg uuid;
  v_lab_cbc uuid; v_lab_bsf uuid; v_lab_lipid uuid; v_lab_hba1c uuid;
  v_lab_creat uuid; v_lab_crp uuid; v_lab_tsh uuid;
  v_rad_xche uuid; v_rad_xlsp uuid; v_rad_xkne uuid; v_rad_usgabd uuid; v_rad_ecg uuid;

  -- drugs
  v_drug_para uuid; v_drug_amox uuid; v_drug_metf uuid; v_drug_amlo uuid;
  v_drug_ator uuid; v_drug_pan uuid; v_drug_ceti uuid; v_drug_azit uuid;
  v_drug_levo uuid; v_drug_atenol uuid; v_drug_caldd uuid;

  -- ids referenced inside loops
  v_pat uuid;
  v_opv uuid;
  v_cons uuid;
  v_rx uuid;
  v_rx_item uuid;
  v_lab_order uuid;
  v_lab_item uuid;
  v_rad_order uuid;
  v_inv uuid;
  v_phsale uuid;
  v_stock uuid;
  v_doc uuid;

  -- generators / loop
  i int;
  j int;
  k int;
  patient_ids uuid[] := '{}';
  v_uhid text;
  v_uhid_seq int;
  v_op_seq int;
  v_inv_seq int;
  v_lab_seq int;
  v_rad_seq int;
  v_sale_seq int;
  v_appt_seq int;
  v_token_seq int;

  v_visit_date date;
  v_visit_ts timestamptz;
  v_close_ts timestamptz;

  v_complaint text;
  v_diag jsonb;
  v_qty int;
  v_amount numeric(14,2);
  v_inv_no text;

  v_rad_code text;
  v_rad_proc uuid;
  v_lab_code text;
  v_lab_test uuid;
  v_lab_unit text;

  -- arrays of complaint / drug templates
  complaints text[] := array[
    'BP review', 'Diabetes follow-up', 'Cough x 3 days', 'Fever x 2 days',
    'Knee pain', 'Lower back pain', 'Headache', 'Annual review',
    'Antenatal check', 'Cycle review', 'Sore throat', 'Skin rash',
    'Dental check-up', 'Toothache', 'Ear pain', 'Asthma flare',
    'Acidity / GERD', 'Vertigo', 'Cardio review + ECG', 'HbA1c follow-up'
  ];
  patient_first text[] := array[
    'Karthik','Sundari','Lakshmi','Naren','Bala','Mahesh','Kavya','Aravind',
    'Priya','Ramesh','Anita','Suresh','Meera','Senthil','Chitra','Jagan',
    'Tamilarasan','Sanjay','Rekha','Omkar','Gopal','Padma','Aarav','Divya',
    'Vimala','Krishna','Asha','Murugan','Janani','Vignesh'
  ];
  patient_last text[] := array[
    'M.','S.','R.','K.','V.','B.','N.','G.','P.','D.','T.','J.','C.','L.','A.'
  ];
  patient_genders text[] := array['m','f','m','f','m','f','m','m','f','m','f','m','f','m','f','m','m','m','f','m','m','f','m','f','f','m','f','m','f','m'];

  -- appt distribution: pos 1..50, status pick per index
  appt_status text;
  v_scheduled_at timestamptz;

begin
  -- ─────────────────────────────────────────────────────────────────────
  -- Idempotency
  if exists (select 1 from patients where uhid = 'KH-2026-DEMO-001' limit 1) then
    raise notice 'Demo seed already run (KH-2026-DEMO-001 exists). Skipping.';
    return;
  end if;

  -- ─────────────────────────────────────────────────────────────────────
  -- Resolve refs
  select id into v_doc_anand       from users where username = 'dranand';
  select id into v_doc_meera       from users where username = 'drmeera';
  select id into v_doc_priya       from users where username = 'priya';
  select id into v_doc_naveen      from users where username = 'drnaveen';
  select id into v_doc_lakshmi     from users where username = 'drlakshmi';
  select id into v_doc_ravi        from users where username = 'drravi';
  select id into v_doc_naveenkumar from users where username = 'naveenkumar';
  doctor_ids := array[v_doc_anand, v_doc_meera, v_doc_priya, v_doc_naveen, v_doc_lakshmi, v_doc_ravi, v_doc_naveenkumar];

  -- Approver = a doctor different from bs
  select id into approver from users where id <> bs and deleted_at is null order by created_at limit 1;
  if approver is null then raise exception 'No approver user available'; end if;

  -- Till + sessions
  select id into v_till from cash_counters where counter_code = 'TILL-1' limit 1;
  if v_till is null then raise exception 'TILL-1 counter missing — bootstrap data not loaded'; end if;

  -- Reuse any already-open session for this cashier (schema enforces
  -- uq_cash_sessions_cashier_active — one open per cashier, regardless
  -- of date). The seeded bootstrap admin already had a stale open
  -- session from a prior day; we just point v_today_session at it so
  -- today's payments can flow through it. If no open session exists at
  -- all, we open a fresh one.
  select id into v_today_session
    from cash_sessions
   where opened_by = bs and status = 'open' limit 1;
  if v_today_session is null then
    insert into cash_sessions (
      counter_id, session_number, session_label, business_date,
      opened_by, opened_at, status, opening_float, created_by
    ) values (
      v_till, 'SES-20260523-MOR-demo', 'morning', date '2026-05-23',
      bs, '2026-05-23 09:00:00+05:30', 'open', 500.00, bs
    ) returning id into v_today_session;
  end if;

  -- Lab tests
  select id into v_lab_cbc   from lab_tests where test_code = 'CBC';
  select id into v_lab_bsf   from lab_tests where test_code = 'BSF';
  select id into v_lab_lipid from lab_tests where test_code = 'LIPID';
  select id into v_lab_hba1c from lab_tests where test_code = 'HBA1C';
  select id into v_lab_creat from lab_tests where test_code = 'CREAT';
  select id into v_lab_crp   from lab_tests where test_code = 'CRP';
  select id into v_lab_tsh   from lab_tests where test_code = 'TSH';

  -- Radiology procs
  select id into v_rad_xche   from radiology_procedures where procedure_code = 'XR-CHE';
  select id into v_rad_xlsp   from radiology_procedures where procedure_code = 'XR-LSP';
  select id into v_rad_xkne   from radiology_procedures where procedure_code = 'XR-KNE';
  select id into v_rad_usgabd from radiology_procedures where procedure_code = 'USG-ABD';
  select id into v_rad_ecg    from radiology_procedures where procedure_code = 'ECG';

  -- Services for invoice lines
  select id into v_svc_consult    from services where service_code = 'CONSULT_NEW';
  select id into v_svc_consult_fu from services where service_code = 'CONSULT_FU';
  select id into v_svc_lab_cbc    from services where service_code = 'LAB_CBC';
  select id into v_svc_lab_bsf    from services where service_code = 'LAB_BSF';
  select id into v_svc_lab_lipid  from services where service_code = 'LAB_LIPID';
  select id into v_svc_lab_hba1c  from services where service_code = 'LAB_HBA1C';
  select id into v_svc_rad_xchest from services where service_code = 'RAD_XRAY_CHEST';
  select id into v_svc_rad_usg    from services where service_code = 'RAD_USG_ABD';
  select id into v_svc_rad_ecg    from services where service_code = 'RAD_ECG';

  -- Drugs (just resolve common ones; pharmacy_sale will pick from these)
  select id into v_drug_para   from drug_catalogue where drug_code = 'DRG-PARA-500';
  select id into v_drug_amox   from drug_catalogue where drug_code = 'DRG-AMOX-500';
  select id into v_drug_metf   from drug_catalogue where drug_code = 'DRG-METF-500';
  select id into v_drug_amlo   from drug_catalogue where drug_code = 'DRG-AMLO-5';
  select id into v_drug_ator   from drug_catalogue where drug_code = 'DRG-ATOR-10';
  select id into v_drug_pan    from drug_catalogue where drug_code = 'DRG-PAN-40';
  select id into v_drug_ceti   from drug_catalogue where drug_code = 'DRG-CETI-10';
  select id into v_drug_azit   from drug_catalogue where drug_code = 'DRG-AZIT-500';
  select id into v_drug_levo   from drug_catalogue where drug_code = 'DRG-LEVO-50';
  select id into v_drug_atenol from drug_catalogue where drug_code = 'DRG-ATE-50';
  select id into v_drug_caldd  from drug_catalogue where drug_code = 'DRG-CAL-D3';

  -- ─────────────────────────────────────────────────────────────────────
  -- 1) PATIENTS (30)
  for i in 1..30 loop
    v_uhid := 'KH-2026-DEMO-' || lpad(i::text, 3, '0');
    insert into patients (
      uhid, first_name, last_name, gender, date_of_birth, mobile,
      address, blood_group,
      created_by, updated_by
    ) values (
      v_uhid,
      patient_first[((i - 1) % array_length(patient_first, 1)) + 1],
      patient_last[((i - 1) % array_length(patient_last, 1)) + 1],
      patient_genders[((i - 1) % array_length(patient_genders, 1)) + 1],
      date '1955-01-01' + ((random() * 22000)::int * interval '1 day'),
      '98' || lpad((10000000 + i * 137)::text, 8, '0'),
      jsonb_build_object(
        'line1', i || ' Demo Street',
        'city', 'Chennai',
        'state', 'Tamil Nadu',
        'pincode', '600001'
      ),
      (array['A+','B+','O+','AB+','A-','O-'])[((i - 1) % 6) + 1],
      bs, bs
    );
  end loop;

  -- Capture patient_ids in insertion order
  select array_agg(id order by uhid) into patient_ids
    from patients where uhid like 'KH-2026-DEMO-%';

  -- ─────────────────────────────────────────────────────────────────────
  -- 2) HISTORICAL VISITS (120) over last 30 days
  v_op_seq := 1000;
  v_inv_seq := 1000;
  v_lab_seq := 1000;
  v_rad_seq := 1000;
  v_sale_seq := 1000;

  for i in 1..120 loop
    v_op_seq := v_op_seq + 1;
    v_visit_date := date '2026-04-23' + ((random() * 29)::int);
    -- visit time within 9am-5pm
    v_visit_ts   := v_visit_date + ((9 + random() * 8)::numeric * interval '1 hour');
    v_close_ts   := v_visit_ts + interval '1 hour 30 minutes';

    v_doc := doctor_ids[1 + ((random() * (array_length(doctor_ids, 1) - 1))::int)];
    v_pat := patient_ids[1 + ((random() * (array_length(patient_ids, 1) - 1))::int)];

    v_complaint := complaints[1 + ((random() * (array_length(complaints, 1) - 1))::int)];

    -- op_visit
    insert into op_visits (
      op_number, patient_id, doctor_id, visit_date, chief_complaint,
      closed_at, created_by, created_at, updated_by
    ) values (
      'OP-2026-' || lpad(v_op_seq::text, 5, '0'),
      v_pat, v_doc, v_visit_date, v_complaint,
      v_close_ts, bs, v_visit_ts, bs
    ) returning id into v_opv;

    -- consultation (locked)
    v_diag := jsonb_build_array(jsonb_build_object(
      'icd10', (array['I10','E11.9','J00','R51','M54.5','J45.9','K21.0'])[((random() * 6)::int) + 1],
      'desc', (array['Essential hypertension','Type 2 DM','Acute cold','Headache','Low back pain','Asthma','GERD'])[((random() * 6)::int) + 1],
      'type', 'primary'
    ));
    insert into consultations (
      op_visit_id, patient_id, doctor_id, status,
      chief_complaint, history_of_present_illness, examination_findings,
      clinical_notes, advice, diagnoses, next_action,
      follow_up_required, follow_up_date, locked_at,
      created_by, created_at, updated_by
    ) values (
      v_opv, v_pat, v_doc, 'locked',
      v_complaint, 'See chief complaint', '{"text":"Vitals stable; systemic exam normal."}'::jsonb,
      'Reassessed; medications continued.', 'Lifestyle advice given. Return as scheduled.',
      v_diag, 'prescription_only',
      false, null,
      v_close_ts - interval '30 minutes',
      bs, v_visit_ts + interval '20 minutes', bs
    ) returning id into v_cons;

    -- prescription with 1-3 items
    insert into prescriptions (
      consultation_id, patient_id, doctor_id, status, locked_at,
      created_by, created_at, updated_by
    ) values (
      v_cons, v_pat, v_doc, 'active',
      v_close_ts - interval '25 minutes',
      bs, v_visit_ts + interval '25 minutes', bs
    ) returning id into v_rx;

    -- 1-3 random items
    for j in 1..(1 + (random() * 2)::int) loop
      insert into prescription_items (
        prescription_id, medicine_id, medicine_name_snapshot,
        dosage, frequency, duration_days, quantity_prescribed, sequence_no,
        created_by
      ) values (
        v_rx,
        (array[v_drug_para, v_drug_amox, v_drug_metf, v_drug_amlo, v_drug_ator,
               v_drug_pan, v_drug_ceti, v_drug_azit, v_drug_levo, v_drug_atenol,
               v_drug_caldd])[((random() * 10)::int) + 1],
        (array['Paracetamol 500mg','Amoxicillin 500mg','Metformin 500mg','Amlodipine 5mg',
               'Atorvastatin 10mg','Pantoprazole 40mg','Cetirizine 10mg','Azithromycin 500mg',
               'Levothyroxine 50mcg','Atenolol 50mg','Calcium + D3'])[((random() * 10)::int) + 1],
        '1 tab',
        (array['OD','BD','TDS','1-0-1','1-1-1','HS'])[((random() * 5)::int) + 1],
        5 + (random() * 9)::int,
        10 + (random() * 20)::int,
        j,
        bs
      );
    end loop;

    -- 60% lab order
    if random() < 0.6 then
      v_lab_seq := v_lab_seq + 1;
      insert into lab_orders (
        order_number, patient_id, op_visit_id, doctor_id, priority, status,
        completed_at, created_by, created_at, updated_by
      ) values (
        'LAB-2026-' || lpad(v_lab_seq::text, 5, '0'),
        v_pat, v_opv, v_doc, 'routine', 'released',
        v_close_ts + interval '2 hours', bs, v_visit_ts + interval '30 minutes', bs
      ) returning id into v_lab_order;

      -- 1-2 lab_order_items. Pick distinct test indices per (i, j) so
      -- two iterations on the same order can't collide on the
      -- uq_lab_order_items_test (lab_order_id, lab_test_id) constraint.
      for j in 1..(1 + (random() * 1)::int) loop
        v_lab_test := (array[v_lab_cbc, v_lab_bsf, v_lab_lipid, v_lab_hba1c,
                             v_lab_creat, v_lab_crp, v_lab_tsh])[1 + ((i * 3 + j - 1) % 7)];
        v_lab_unit := (array['cells/mm3','mg/dL','mg/dL','%','mg/dL','mg/L','mIU/L'])[1 + ((i * 3 + j - 1) % 7)];
        insert into lab_order_items (
          lab_order_id, lab_test_id, status, sequence_no, created_by
        ) values (
          v_lab_order, v_lab_test, 'released', j, bs
        ) returning id into v_lab_item;

        -- lab_results: released + verified + approved by someone else
        insert into lab_results (
          lab_order_item_id, value_raw, value_numeric, unit, flag,
          performed_by, release_status, approval_status, verified_by, verified_at,
          created_by, created_at
        ) values (
          v_lab_item,
          (50 + (random() * 200)::int)::text,
          (50 + (random() * 200)::numeric),
          v_lab_unit,
          (array['normal','normal','normal','high','low'])[((random() * 4)::int) + 1],
          bs,
          'verified', 'approved', approver, v_close_ts + interval '90 minutes',
          bs, v_close_ts + interval '1 hour'
        );
      end loop;
    end if;

    -- 50% radiology
    if random() < 0.5 then
      v_rad_seq := v_rad_seq + 1;
      v_rad_proc := (array[v_rad_xche, v_rad_xlsp, v_rad_xkne, v_rad_usgabd, v_rad_ecg])[((random() * 4)::int) + 1];
      v_rad_code := (array['XR-CHE','XR-LSP','XR-KNE','USG-ABD','ECG'])[((random() * 4)::int) + 1];
      insert into radiology_orders (
        order_number, patient_id, op_visit_id, doctor_id, radiology_procedure_id,
        priority, status, imaging_completed_at, released_at,
        created_by, created_at, updated_by
      ) values (
        'RAD-2026-' || lpad(v_rad_seq::text, 5, '0'),
        v_pat, v_opv, v_doc, v_rad_proc, 'routine', 'released',
        v_close_ts + interval '90 minutes', v_close_ts + interval '3 hours',
        bs, v_visit_ts + interval '30 minutes', bs
      ) returning id into v_rad_order;

      insert into radiology_reports (
        radiology_order_id, findings, impression,
        reported_by_radiologist_id, dictated_at,
        release_status, approval_status, approved_by, approved_at,
        created_by, created_at
      ) values (
        v_rad_order,
        'No acute findings. Soft tissue normal.',
        (array['No active disease.','Minor degenerative changes noted.','Within normal limits.','Mild osteopenia.','No abnormality detected.'])[((random() * 4)::int) + 1],
        bs, v_close_ts + interval '2 hours',
        'released', 'approved', approver, v_close_ts + interval '2 hours 30 minutes',
        bs, v_close_ts + interval '2 hours'
      );
    end if;

    -- Consult invoice
    v_inv_seq := v_inv_seq + 1;
    v_inv_no := 'INV-2026-' || lpad(v_inv_seq::text, 6, '0');
    v_amount := 500.00;
    insert into invoices (
      invoice_number, invoice_type, patient_id, op_visit_id,
      invoice_date, subtotal, total_amount, amount_paid, payment_status,
      finalized_at, approval_status, approved_by, approved_at,
      created_by, created_at, updated_by
    ) values (
      v_inv_no, 'op', v_pat, v_opv,
      v_visit_date, v_amount, v_amount, v_amount, 'paid',
      v_close_ts, 'approved', approver, v_close_ts,
      bs, v_visit_ts + interval '5 minutes', bs
    ) returning id into v_inv;

    insert into invoice_items (
      invoice_id, service_id, item_type, item_name, sequence_no,
      consultation_id, quantity, unit_price, total_price,
      created_by
    ) values (
      v_inv, v_svc_consult, 'consultation', 'OPD Consultation', 1,
      v_cons, 1, v_amount, v_amount,
      bs
    );

    -- (payments row skipped — invoices.amount_paid set directly above
    --  so owner-revenue queries still see the historical income.)

    -- 70% get pharmacy dispense (skip drug_stock_id complexity: insert directly with one drug)
    if random() < 0.7 then
      v_sale_seq := v_sale_seq + 1;
      v_amount := 80 + (random() * 220)::numeric;
      v_inv_seq := v_inv_seq + 1;

      insert into pharmacy_sales (
        sale_number, patient_id, sale_type, prescription_id,
        subtotal, total_tax, net_amount, status,
        created_by, created_at, updated_by
      ) values (
        'PHS-2026-' || lpad(v_sale_seq::text, 5, '0'),
        v_pat, 'op_patient', v_rx,
        v_amount, round(v_amount * 0.05, 2), round(v_amount * 1.05, 2), 'dispensed',
        bs, v_close_ts + interval '30 minutes', bs
      ) returning id into v_phsale;

      -- Pharmacy invoice
      v_inv_no := 'INV-2026-' || lpad(v_inv_seq::text, 6, '0');
      insert into invoices (
        invoice_number, invoice_type, patient_id, op_visit_id,
        invoice_date, subtotal, total_amount, amount_paid, payment_status,
        finalized_at, approval_status, approved_by, approved_at,
        created_by, created_at, updated_by
      ) values (
        v_inv_no, 'pharmacy', v_pat, v_opv,
        v_visit_date, round(v_amount * 1.05, 2), round(v_amount * 1.05, 2), round(v_amount * 1.05, 2), 'paid',
        v_close_ts + interval '40 minutes', 'approved', approver, v_close_ts + interval '40 minutes',
        bs, v_close_ts + interval '35 minutes', bs
      ) returning id into v_inv;

      insert into invoice_items (
        invoice_id, item_type, item_name, sequence_no,
        quantity, unit_price, total_price,
        created_by
      ) values (
        v_inv, 'other', 'Pharmacy items', 1,
        1, round(v_amount * 1.05, 2), round(v_amount * 1.05, 2),
        bs
      );

      -- (payments row skipped — pharmacy invoice.amount_paid set directly above)
    end if;

    -- Past appointment row tied to this op_visit (for history page completeness)
    v_appt_seq := i;
    insert into appointments (
      appointment_no, patient_id, doctor_id, scheduled_at,
      status, visit_type, source, reason,
      created_by, created_at, updated_by
    ) values (
      'APT-2026-D' || lpad(v_appt_seq::text, 5, '0'),
      v_pat, v_doc, v_visit_ts,
      'completed', 'follow_up', 'walk_in', v_complaint,
      bs, v_visit_ts - interval '30 minutes', bs
    );
  end loop;

  -- ─────────────────────────────────────────────────────────────────────
  -- 3) TODAY'S 50 APPOINTMENTS (2026-05-23)
  -- Spread 9am–6pm. Mix of statuses:
  --    1-30 booked, 31-35 arrived (paid pending), 36-38 paid awaiting vitals,
  --    39-43 vitals done awaiting doctor, 44-45 in_consultation, 46-50 completed
  v_appt_seq := 0;
  for i in 1..50 loop
    v_appt_seq := v_appt_seq + 1;
    v_doc := doctor_ids[1 + ((i - 1) % array_length(doctor_ids, 1))];
    v_pat := patient_ids[1 + ((i - 1) % array_length(patient_ids, 1))];

    -- spread across 9:00 - 18:00, 11 minute steps so they land on different times
    v_scheduled_at := date '2026-05-23' + ((9 * 60 + (i - 1) * 11) * interval '1 minute');

    if i <= 30 then
      appt_status := 'booked';
    elsif i <= 35 then
      appt_status := 'arrived';
    elsif i <= 38 then
      appt_status := 'arrived';   -- proxy for paid+vitals pending
    elsif i <= 43 then
      appt_status := 'arrived';
    elsif i <= 45 then
      appt_status := 'arrived';
    else
      appt_status := 'completed';
    end if;

    insert into appointments (
      appointment_no, patient_id, doctor_id, scheduled_at,
      status, visit_type, source, reason,
      created_by, created_at, updated_by
    ) values (
      'APT-2026-T' || lpad(v_appt_seq::text, 5, '0'),
      v_pat, v_doc, v_scheduled_at,
      appt_status, 'new',
      (array['walk_in','phone','online'])[((i - 1) % 3) + 1],
      complaints[1 + ((i - 1) % array_length(complaints, 1))],
      bs,
      v_scheduled_at - interval '1 day',
      bs
    );

    -- For statuses >= 31, also create op_visit + invoice + payment as needed
    if i >= 31 then
      v_op_seq := v_op_seq + 1;
      insert into op_visits (
        op_number, patient_id, doctor_id, visit_date, chief_complaint,
        created_by, created_at, updated_by
      ) values (
        'OP-2026-' || lpad(v_op_seq::text, 5, '0'),
        v_pat, v_doc, date '2026-05-23',
        complaints[1 + ((i - 1) % array_length(complaints, 1))],
        bs, v_scheduled_at, bs
      ) returning id into v_opv;

      -- Consult invoice
      v_inv_seq := v_inv_seq + 1;
      v_inv_no := 'INV-2026-' || lpad(v_inv_seq::text, 6, '0');

      -- 31-35: not paid yet (status=finalized, amount_paid=0)
      -- 36+: paid (amount_paid = total)
      if i <= 35 then
        insert into invoices (
          invoice_number, invoice_type, patient_id, op_visit_id,
          invoice_date, subtotal, total_amount, amount_paid, payment_status,
          finalized_at, approval_status,
          created_by, created_at, updated_by
        ) values (
          v_inv_no, 'op', v_pat, v_opv,
          date '2026-05-23', 500.00, 500.00, 0.00, 'finalized',
          v_scheduled_at, 'pending_approval',
          bs, v_scheduled_at, bs
        ) returning id into v_inv;
      else
        insert into invoices (
          invoice_number, invoice_type, patient_id, op_visit_id,
          invoice_date, subtotal, total_amount, amount_paid, payment_status,
          finalized_at, approval_status, approved_by, approved_at,
          created_by, created_at, updated_by
        ) values (
          v_inv_no, 'op', v_pat, v_opv,
          date '2026-05-23', 500.00, 500.00, 500.00, 'paid',
          v_scheduled_at + interval '10 minutes', 'approved', approver, v_scheduled_at + interval '10 minutes',
          bs, v_scheduled_at, bs
        ) returning id into v_inv;

        -- (payments row skipped — invoice already has amount_paid set;
        --  today's session is referenced via v_today_session in case a
        --  later flow needs it.)
      end if;

      insert into invoice_items (
        invoice_id, service_id, item_type, item_name, sequence_no,
        quantity, unit_price, total_price, created_by
      ) values (
        v_inv, v_svc_consult, 'other', 'OPD Consultation', 1,
        1, 500.00, 500.00, bs
      );
    end if;
  end loop;

  -- ─────────────────────────────────────────────────────────────────────
  -- 4) FUTURE APPOINTMENTS — tomorrow 10, day after 8
  for i in 1..10 loop
    v_appt_seq := v_appt_seq + 1;
    v_doc := doctor_ids[1 + ((i - 1) % array_length(doctor_ids, 1))];
    v_pat := patient_ids[1 + ((i + 5) % array_length(patient_ids, 1))];
    v_scheduled_at := date '2026-05-24' + ((9 * 60 + (i - 1) * 30) * interval '1 minute');

    insert into appointments (
      appointment_no, patient_id, doctor_id, scheduled_at,
      status, visit_type, source, reason,
      created_by, created_at, updated_by
    ) values (
      'APT-2026-F' || lpad(v_appt_seq::text, 5, '0'),
      v_pat, v_doc, v_scheduled_at,
      'booked', 'new',
      (array['walk_in','phone','online'])[((i - 1) % 3) + 1],
      complaints[1 + ((i + 3) % array_length(complaints, 1))],
      bs, '2026-05-23 12:00:00+05:30', bs
    );
  end loop;

  for i in 1..8 loop
    v_appt_seq := v_appt_seq + 1;
    v_doc := doctor_ids[1 + ((i - 1) % array_length(doctor_ids, 1))];
    v_pat := patient_ids[1 + ((i + 12) % array_length(patient_ids, 1))];
    v_scheduled_at := date '2026-05-25' + ((10 * 60 + (i - 1) * 30) * interval '1 minute');

    insert into appointments (
      appointment_no, patient_id, doctor_id, scheduled_at,
      status, visit_type, source, reason,
      created_by, created_at, updated_by
    ) values (
      'APT-2026-G' || lpad(v_appt_seq::text, 5, '0'),
      v_pat, v_doc, v_scheduled_at,
      'booked', 'new',
      (array['walk_in','phone','online'])[((i - 1) % 3) + 1],
      complaints[1 + ((i + 7) % array_length(complaints, 1))],
      bs, '2026-05-23 12:00:00+05:30', bs
    );
  end loop;

  raise notice 'Demo seed complete: % patients, 120 history visits, 50 today appts, 18 future appts.', array_length(patient_ids, 1);
end $$;
