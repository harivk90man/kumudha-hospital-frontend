-- =====================================================================
-- demo-bulk-seed.sql
-- Bulk demo data:
--   - rename `naveen` frontdesk user → `janaki`
--   - realistic Indian mobile numbers on all demo patients
--   - 30 more patients (total ~60) for variety
--   - 90 op_visits across 2026-05-21, -22, -23 (30 per day)
--     each with consultation + prescription + invoice + payment
--   - ~25% of visits also get a lab order + results
--   - ~15% of visits get a radiology order + report
--   - 10 future appointments on 2026-05-24, -25
-- Idempotent: re-running is a no-op via `where not exists` guards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Rename `naveen` frontdesk user → `janaki`
-- ---------------------------------------------------------------------
update users
   set username  = 'janaki',
       full_name = 'Janaki',
       email     = 'janaki@example.com'
 where username  = 'naveen'
   and full_name = 'Naveen';

-- ---------------------------------------------------------------------
-- 1. Refresh existing patient mobiles to realistic 10-digit format
--    Indian mobiles start with 6,7,8,9. Replace the sequential
--    9000000XYZ placeholders with random-looking 98 / 99 / 87 prefixes.
-- ---------------------------------------------------------------------
update patients
   set mobile = '98' || lpad(((random() * 100000000)::bigint % 100000000)::text, 8, '0')
 where mobile like '90000%'
   and (mobile not like '9000000001' and mobile not like '9000000002' and mobile not like '9000000003');

-- Keep the 3 family-shared mobiles but make them realistic too — same value across family members.
update patients set mobile = '9876543210' where mobile = '9000000001';
update patients set mobile = '8765432109' where mobile = '9000000002';
update patients set mobile = '7654321098' where mobile = '9000000003';

-- Realistic emergency-contact mobiles too
update patients
   set emergency_contact_mobile = '97' || lpad(((random() * 100000000)::bigint % 100000000)::text, 8, '0')
 where emergency_contact_mobile is not null and emergency_contact_mobile like '90000%';

-- ---------------------------------------------------------------------
-- 2. Add 30 more patients (mix of demographics, caste-neutral names)
-- ---------------------------------------------------------------------
insert into patients (
  uhid, first_name, last_name, gender, date_of_birth, mobile,
  email, address, blood_group, created_by
)
select
  v.uhid, v.first_name, v.last_name, v.gender, v.dob::date, v.mobile,
  nullif(v.email,''),
  jsonb_build_object('line1', v.line1, 'city', 'Chennai', 'state', 'Tamil Nadu',
                     'pincode', v.pincode, 'country', 'IN'),
  nullif(v.bg,''),
  '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('KH-2026-00200','Arjun','P.','m','1990-03-15','9876512301','arjun@example.com','12 Anna Nagar','600040','O+'),
  ('KH-2026-00201','Deepa','S.','f','1985-07-22','9876512302','deepa@example.com','45 T. Nagar','600017','A+'),
  ('KH-2026-00202','Karthik','M.','m','1978-11-08','9876512303','karthik.m@example.com','7 Adyar','600020','B+'),
  ('KH-2026-00203','Lavanya','K.','f','1992-04-30','9876512304','lavanya@example.com','22 Velachery','600042','AB+'),
  ('KH-2026-00204','Mohan','D.','m','1965-09-12','9876512305','mohan@example.com','8 Mylapore','600004','O-'),
  ('KH-2026-00205','Nithya','R.','f','1988-12-25','9876512306','nithya@example.com','55 Anna Nagar West','600040','A-'),
  ('KH-2026-00206','Pradeep','V.','m','1972-06-18','9876512307','pradeep@example.com','19 Saidapet','600015','B-'),
  ('KH-2026-00207','Revathi','S.','f','1958-02-14','9876512308','revathi@example.com','11 Triplicane','600005','AB-'),
  ('KH-2026-00208','Sathish','K.','m','1982-08-09','9876512309','sathish@example.com','77 OMR','600119','O+'),
  ('KH-2026-00209','Thara','M.','f','1995-10-03','9876512310','thara@example.com','33 GST Road','600045','A+'),
  ('KH-2026-00210','Uma','D.','f','1969-05-27','9876512311','uma@example.com','9 T. Nagar','600017','B+'),
  ('KH-2026-00211','Vinay','J.','m','1987-01-19','9876512312','vinay@example.com','41 Porur','600116','AB+'),
  ('KH-2026-00212','Yamuna','P.','f','1973-07-11','9876512313','yamuna@example.com','28 Anna Nagar East','600102','O+'),
  ('KH-2026-00213','Anitha','R.','f','1980-09-04','9876512314','anitha@example.com','15 Adyar Bridge','600020','A+'),
  ('KH-2026-00214','Bala','S.','m','1955-12-21','9876512315','bala@example.com','60 Mylapore','600004','B+'),
  ('KH-2026-00215','Chitra','M.','f','1962-03-08','9876512316','chitra@example.com','22 T. Nagar Mainroad','600017','O-'),
  ('KH-2026-00216','Dinesh','K.','m','1995-11-16','9876512317','dinesh@example.com','7 Velachery 1st Cross','600042','A-'),
  ('KH-2026-00217','Eswari','V.','f','1948-01-25','9876512318','eswari@example.com','11 Mylapore Mada St','600004','B-'),
  ('KH-2026-00218','Farhan','A.','m','2001-04-12','9876512319','farhan@example.com','30 Royapettah','600014','AB+'),
  ('KH-2026-00219','Geetha','J.','f','1974-08-30','9876512320','geetha.j@example.com','45 OMR Sholinganallur','600119','O+'),
  ('KH-2026-00220','Hari','P.','m','1989-05-15','9876512321','hari@example.com','12 Tambaram','600045','A+'),
  ('KH-2026-00221','Indra','S.','f','1953-10-07','9876512322','indra@example.com','5 Anna Nagar','600040','B+'),
  ('KH-2026-00222','Jagan','M.','m','1968-06-13','9876512323','jagan@example.com','19 GST Road','600045','O-'),
  ('KH-2026-00223','Kavitha','D.','f','1990-02-28','9876512324','kavitha@example.com','62 Velachery','600042','A-'),
  ('KH-2026-00224','Manoj','R.','m','1976-11-04','9876512325','manoj@example.com','8 Saidapet','600015','AB-'),
  ('KH-2026-00225','Nandini','K.','f','1996-07-19','9876512326','nandini@example.com','27 OMR','600119','O+'),
  ('KH-2026-00226','Omkar','V.','m','1986-03-22','9876512327','omkar@example.com','15 Porur','600116','A+'),
  ('KH-2026-00227','Pavithra','S.','f','1981-09-14','9876512328','pavithra@example.com','40 Adyar','600020','B+'),
  ('KH-2026-00228','Rajesh','M.','m','1959-04-08','9876512329','rajesh@example.com','11 T. Nagar','600017','AB+'),
  ('KH-2026-00229','Sangeetha','D.','f','1965-12-30','9876512330','sangeetha@example.com','22 Triplicane','600005','O-')
) as v(uhid, first_name, last_name, gender, dob, mobile, email, line1, pincode, bg)
where not exists (select 1 from patients p where p.uhid = v.uhid);

-- ---------------------------------------------------------------------
-- 3. Bulk-generate 90 op_visits across May 21-23, 2026
--    with consultation + prescription + invoice + payment
--    + ~25% lab order, ~15% radiology order
-- ---------------------------------------------------------------------
do $$
declare
  bs        uuid := '00000000-0000-0000-0000-000000000001';
  approver  uuid := (select id from users where username = 'kuppan');
  cashier   uuid := (select id from users where username = 'janaki');
  cs_id     uuid := (select id from cash_sessions where session_number = 'CS-2026-001');

  -- pools we randomly pick from
  doctor_ids uuid[];
  drug_ids   uuid[];
  patient_ids uuid[];
  patient_uhids text[];

  complaints text[] := array[
    'Fever and body pain for 2 days',
    'Persistent cough and sore throat',
    'Knee pain worsening with stairs',
    'Headache and dizziness in mornings',
    'Routine BP follow-up',
    'Diabetes review with blood sugar logs',
    'Skin rash on forearms',
    'Stomach ache after meals',
    'Throat infection, mild fever',
    'Lower back pain for a week',
    'Chest discomfort on exertion',
    'Wound dressing change',
    'Vaccination consultation',
    'Pre-op clearance discussion',
    'Migraine recurrence',
    'Generalized weakness',
    'Cold and cough for 5 days',
    'Allergic reaction follow-up',
    'Asthma exacerbation, mild',
    'Ear pain, possible otitis',
    'Eye redness and watering',
    'Hypertension check-in',
    'Lipid profile review',
    'Antenatal check (1st trimester)',
    'Post-op review week 2'
  ];

  -- diagnosis primary picks (icd10 + text)
  diagnoses text[][] := array[
    array['J06.9','Acute upper respiratory infection'],
    array['I10','Essential hypertension'],
    array['E11','Type 2 diabetes mellitus'],
    array['M54.5','Low back pain'],
    array['M19.91','Osteoarthritis, knee'],
    array['G43.9','Migraine, unspecified'],
    array['J45.20','Mild intermittent asthma'],
    array['K30','Functional dyspepsia'],
    array['L29.9','Pruritus, unspecified'],
    array['H66.9','Otitis media, unspecified'],
    array['H10.9','Conjunctivitis, unspecified'],
    array['Z00.00','General medical examination'],
    array['I25.10','Atherosclerotic heart disease without angina'],
    array['E78.5','Hyperlipidemia, unspecified'],
    array['Z34.0','Antenatal supervision, first trimester'],
    array['Z48.815','Surgical aftercare following non-major surgery']
  ];

  invoice_amounts numeric[] := array[300,400,500,600,700,800,1000,1200,1500];

  d            date;
  i            int;
  visit_idx    int := 0;
  v_pid        uuid;
  v_did        uuid;
  v_op         uuid;
  v_cons       uuid;
  v_rx         uuid;
  v_inv        uuid;
  v_pay        uuid;
  v_drug       uuid;
  cc           text;
  dx           text[];
  inv_amt      numeric;
  rx_count     int;
  k            int;
  op_no        text;
  inv_no       text;
  service_consult_new uuid := (select id from services where service_code = 'CONSULT_NEW');
  service_consult_fu  uuid := (select id from services where service_code = 'CONSULT_FU');
  vt           text;
  visit_dt     timestamptz;
begin
  -- Load pools
  select array_agg(usr.id)
    into doctor_ids
    from users usr
    join user_roles ur on ur.user_id = usr.id and ur.deleted_at is null
    join roles r on r.id = ur.role_id and r.deleted_at is null
   where r.role_code in ('doctor','chief_doctor')
     and usr.deleted_at is null;

  select array_agg(id) into drug_ids from drug_catalogue where deleted_at is null;

  select array_agg(p.id), array_agg(p.uhid) into patient_ids, patient_uhids
    from patients p
   where p.deleted_at is null
     and p.uhid like 'KH-2026-001%' or p.uhid like 'KH-2026-002%';

  if doctor_ids is null or drug_ids is null or patient_ids is null then
    raise notice 'Skipping bulk seed — pools empty (doctors=%, drugs=%, patients=%)',
      doctor_ids is null, drug_ids is null, patient_ids is null;
    return;
  end if;

  -- Idempotency: skip if our bulk op_visits already exist.
  if exists (select 1 from op_visits where op_number like 'OP-2026-BULK-%' limit 1) then
    raise notice 'Bulk op_visits already seeded; skipping.';
    return;
  end if;

  -- 3 days × 30 visits each
  foreach d in array array['2026-05-21'::date, '2026-05-22'::date, '2026-05-23'::date] loop
    for i in 1..30 loop
      visit_idx := visit_idx + 1;
      op_no  := 'OP-2026-BULK-' || lpad(visit_idx::text, 4, '0');
      inv_no := 'INV-2026-BULK-' || lpad(visit_idx::text, 4, '0');

      -- pick a random patient, doctor, complaint, diagnosis, amount
      v_pid := patient_ids[1 + (random() * (array_length(patient_ids,1) - 1))::int];
      v_did := doctor_ids[1 + (random() * (array_length(doctor_ids,1) - 1))::int];
      cc    := complaints[1 + (random() * (array_length(complaints,1) - 1))::int];
      dx    := diagnoses[1 + (random() * (array_length(diagnoses,1) - 1))::int];
      inv_amt := invoice_amounts[1 + (random() * (array_length(invoice_amounts,1) - 1))::int];

      -- spread visits across the day 09:00 to 17:00
      visit_dt := (d::text || ' ' || lpad((9 + (random()*8)::int)::text, 2, '0') || ':' ||
                  lpad((random()*59)::int::text, 2, '0') || ':00+05:30')::timestamptz;
      vt := case when random() < 0.6 then 'new' else 'follow_up' end;

      -- op_visit
      insert into op_visits (op_number, patient_id, doctor_id, visit_date, chief_complaint, closed_at, created_by, created_at)
      values (op_no, v_pid, v_did, d, cc, visit_dt + interval '90 minutes', bs, visit_dt)
      returning id into v_op;

      -- consultation (locked)
      insert into consultations (
        op_visit_id, status, patient_id, doctor_id, chief_complaint,
        history_of_present_illness, diagnoses, clinical_notes, advice,
        next_action, follow_up_required, follow_up_date, locked_at,
        created_by, created_at
      )
      values (
        v_op, 'locked', v_pid, v_did, cc,
        cc || '. No red flag symptoms.',
        jsonb_build_array(jsonb_build_object('icd10', dx[1], 'desc', dx[2], 'type', 'primary')),
        'Reviewed. Plan and discharge advice given.',
        'Take medications regularly. Return if symptoms worsen.',
        case when random() < 0.2 then 'lab_ordered'
             when random() < 0.1 then 'radiology_ordered'
             else 'prescription_only' end,
        true, (d + interval '14 days')::date,
        visit_dt + interval '30 minutes', bs, visit_dt
      )
      returning id into v_cons;

      -- prescription (1-3 items)
      insert into prescriptions (consultation_id, patient_id, doctor_id, status, locked_at, created_by, created_at)
      values (v_cons, v_pid, v_did, 'dispensed', visit_dt + interval '45 minutes', bs, visit_dt)
      returning id into v_rx;

      rx_count := 1 + (random()*2)::int;  -- 1, 2, or 3
      for k in 1..rx_count loop
        v_drug := drug_ids[1 + (random() * (array_length(drug_ids,1) - 1))::int];
        insert into prescription_items (
          prescription_id, medicine_id, medicine_name_snapshot,
          dosage, frequency, duration_days, quantity_prescribed, sequence_no,
          created_by, created_at
        )
        values (
          v_rx, v_drug,
          (select generic_name || coalesce(' '||strength,'') from drug_catalogue where id = v_drug),
          (array['250 mg','500 mg','10 mg','5 mg','1 tablet','2 puffs','40 mg'])[1 + (random()*6)::int],
          (array['1-0-1','0-0-1','1-1-1','SOS','BD','TDS'])[1 + (random()*5)::int],
          (array[3,5,7,10,14,30,90])[1 + (random()*6)::int],
          (array[6,10,14,20,30,60])[1 + (random()*5)::int],
          k, bs, visit_dt
        );
      end loop;

      -- invoice + item
      insert into invoices (
        invoice_number, invoice_type, patient_id, op_visit_id, invoice_date,
        subtotal, total_line_discount, bill_discount_amount, total_tax,
        total_amount, amount_paid,
        payment_status, approval_status, approved_by, approved_at,
        finalized_at, created_by, created_at
      )
      values (
        inv_no, 'op', v_pid, v_op, d,
        inv_amt, 0, 0, 0, inv_amt, inv_amt,
        'paid', 'approved', approver, visit_dt + interval '90 minutes',
        visit_dt + interval '90 minutes', bs, visit_dt
      )
      returning id into v_inv;

      insert into invoice_items (
        invoice_id, service_id, item_type, item_name, sequence_no,
        consultation_id, quantity, unit_price, line_discount_pct, line_discount_amount,
        cgst_pct, cgst_amount, sgst_pct, sgst_amount, igst_pct, igst_amount,
        total_price, created_by, created_at
      )
      values (
        v_inv,
        case when vt = 'new' then service_consult_new else service_consult_fu end,
        'consultation',
        case when vt = 'new' then 'New Consultation' else 'Follow-up Consultation' end,
        1, v_cons, 1, inv_amt, 0, 0, 0, 0, 0, 0, 0, 0,
        inv_amt, bs, visit_dt
      );

      -- payment + allocation
      insert into payments (
        patient_id, payment_direction, payment_mode, amount, received_by,
        cash_session_id, idempotency_key, created_by, created_at
      )
      values (
        v_pid, 'in',
        (array['cash','card','upi'])[1 + (random()*2)::int],
        inv_amt, cashier, cs_id, uuidv7(), bs, visit_dt + interval '90 minutes'
      )
      returning id into v_pay;

      insert into payment_allocations (
        payment_id, allocation_type, invoice_id, amount, created_by, created_at
      )
      values (v_pay, 'invoice', v_inv, inv_amt, bs, visit_dt + interval '90 minutes');

    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Future appointments on May 24 + 25 (5-6 each = 10 total)
-- ---------------------------------------------------------------------
insert into appointments (
  appointment_no, patient_id, doctor_id, scheduled_at, visit_type, status, source, reason, created_by
)
select v.appt_no,
       (select id from patients where uhid = v.uhid),
       (select id from users where username = v.doctor_username),
       v.scheduled_at::timestamptz,
       v.visit_type, 'booked', v.source, v.reason,
       '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('APT-2026-00200', 'KH-2026-00200', 'drnaveen',  '2026-05-24 09:00:00+05:30', 'new',       'phone',  'Knee pain consultation'),
  ('APT-2026-00201', 'KH-2026-00201', 'dranand',   '2026-05-24 09:30:00+05:30', 'follow_up', 'online', 'Diabetes review'),
  ('APT-2026-00202', 'KH-2026-00204', 'dranand',   '2026-05-24 10:00:00+05:30', 'follow_up', 'phone',  'BP and lipids review'),
  ('APT-2026-00203', 'KH-2026-00207', 'drmeera',   '2026-05-24 11:00:00+05:30', 'new',       'walk_in','Dental pain - molar'),
  ('APT-2026-00204', 'KH-2026-00209', 'drlakshmi', '2026-05-24 14:00:00+05:30', 'new',       'phone',  'Antenatal first visit'),
  ('APT-2026-00205', 'KH-2026-00211', 'drravi',    '2026-05-24 15:30:00+05:30', 'new',       'online', 'Lower back physio assessment'),
  ('APT-2026-00206', 'KH-2026-00114', 'dranand',   '2026-05-25 09:00:00+05:30', 'follow_up', 'phone',  'Asthma review'),
  ('APT-2026-00207', 'KH-2026-00215', 'drnaveen',  '2026-05-25 09:30:00+05:30', 'follow_up', 'phone',  'Post-op review week 2'),
  ('APT-2026-00208', 'KH-2026-00103', 'drnaveen',  '2026-05-25 10:30:00+05:30', 'follow_up', 'online', 'BP + diabetes follow-up'),
  ('APT-2026-00209', 'KH-2026-00228', 'drmeera',   '2026-05-25 11:30:00+05:30', 'new',       'walk_in','Tooth extraction discussion')
) as v(appt_no, uhid, doctor_username, scheduled_at, visit_type, source, reason)
where not exists (select 1 from appointments a where a.appointment_no = v.appt_no and a.deleted_at is null);

-- ---------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------
select 'patients_total' as t, count(*)::text as n from patients where deleted_at is null
union all select 'op_visits_may21', count(*)::text from op_visits where visit_date = '2026-05-21' and deleted_at is null
union all select 'op_visits_may22', count(*)::text from op_visits where visit_date = '2026-05-22' and deleted_at is null
union all select 'op_visits_may23', count(*)::text from op_visits where visit_date = '2026-05-23' and deleted_at is null
union all select 'appointments_may24', count(*)::text from appointments where scheduled_at::date = '2026-05-24' and deleted_at is null
union all select 'appointments_may25', count(*)::text from appointments where scheduled_at::date = '2026-05-25' and deleted_at is null
union all select 'consultations_total', count(*)::text from consultations where deleted_at is null
union all select 'prescriptions_total', count(*)::text from prescriptions where deleted_at is null
union all select 'prescription_items_total', count(*)::text from prescription_items where deleted_at is null
union all select 'invoices_total', count(*)::text from invoices where deleted_at is null
union all select 'invoices_paid', count(*)::text from invoices where payment_status = 'paid' and deleted_at is null
union all select 'payments_total', count(*)::text from payments where deleted_at is null
order by t;
