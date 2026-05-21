-- ─────────────────────────────────────────────────────────────────────────────
-- demo-daily-appts-and-variety.sql
--
-- (a) Daily appointments rotated across patients for 2026-05-22 … 2026-05-25
--     (~12 appointments per day, every patient gets exactly one slot).
-- (b) History variety: add a CBC lab order (with sample + result) to a
--     handful of past op_visits that currently have prescriptions only, and
--     a Chest X-Ray radiology order (with report) to another handful — so
--     the doctor's "previous visits" panel shows a mix of: prescription-only
--     / has-blood-report / has-x-ray rows.
--
-- Idempotent: bails out when this seed's signature rows already exist.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  bs           uuid := '00000000-0000-0000-0000-000000000001';
  doctor_ids   uuid[];
  patient_ids  uuid[];
  i            int;
  pos          int;
  v_did        uuid;
  v_pid        uuid;
  v_day        date;
  v_slot       interval;
  v_when       timestamptz;
  v_seq        int := 0;
  per_day      int := 12;
  start_day    date := date '2026-05-22';
  total_days   int := 4;            -- 22, 23, 24, 25
  reasons      text[] := array[
    'BP review','Diabetes follow-up','Joint pain','Cough and fever',
    'Headache','Back pain','Chest discomfort','Skin rash',
    'Stomach pain','General check-up','Thyroid review','Anxiety follow-up'
  ];
begin
  if exists (select 1 from appointments where appointment_no like 'APT-2026-DAILY-%' limit 1) then
    raise notice 'Daily appointments already seeded; skipping.';
    return;
  end if;

  select array_agg(u.id order by u.full_name)
    into doctor_ids
    from users u
    join user_roles ur on ur.user_id = u.id and ur.deleted_at is null
    join roles r       on r.id = ur.role_id and r.deleted_at is null
   where r.role_code in ('doctor','chief_doctor')
     and u.deleted_at is null;

  select array_agg(p.id order by p.uhid)
    into patient_ids
    from patients p
   where p.deleted_at is null;

  if doctor_ids is null or patient_ids is null then
    raise notice 'No doctors or patients found; skipping.';
    return;
  end if;

  for d_idx in 0..(total_days - 1) loop
    v_day := start_day + d_idx;
    for slot_i in 0..(per_day - 1) loop
      v_seq := v_seq + 1;

      -- patient rotation: every patient gets one appointment across the window.
      pos    := ((d_idx * per_day) + slot_i) % array_length(patient_ids, 1);
      v_pid  := patient_ids[1 + pos];
      v_did  := doctor_ids[1 + (slot_i % array_length(doctor_ids, 1))];

      -- 04:00, 04:30, 05:00 … UTC (= 09:30 IST, 10:00 IST …)
      v_slot := interval '4 hours' + (slot_i * interval '30 minutes');
      v_when := (v_day::timestamptz) + v_slot;

      insert into appointments (
        appointment_no, patient_id, doctor_id, slot_id,
        scheduled_at, visit_type, status, source, reason,
        created_by, created_at
      )
      values (
        'APT-2026-DAILY-' || lpad(v_seq::text, 3, '0'),
        v_pid, v_did, null,
        v_when, 'follow_up', 'booked', 'phone',
        reasons[1 + (v_seq % array_length(reasons, 1))],
        bs, now()
      );
    end loop;
  end loop;
end $$;


-- ───────────── History variety: more blood reports + x-rays ─────────────
-- Adds ~8 lab orders + ~8 radiology orders to past op_visits that have a
-- consultation but no existing lab/rad order, so visit-history rows show
-- a mix of rx-only / blood / x-ray.

do $$
declare
  bs              uuid := '00000000-0000-0000-0000-000000000001';
  cbc_test_id     uuid := (select id from lab_tests where test_code='CBC' limit 1);
  xray_chest_id   uuid := (select id from radiology_procedures where procedure_code='XR-CHE' limit 1);
  rec             record;
  lab_seq         int := 0;
  rad_seq         int := 0;
  v_order_id      uuid;
  v_sample_id     uuid;
  v_item_id       uuid;
  v_report_id     uuid;
  v_consult_id    uuid;
  v_approver_id   uuid;
begin
  if exists (select 1 from lab_orders where order_number like 'LAB-2026-VAR-%' limit 1)
  or exists (select 1 from radiology_orders where order_number like 'RAD-2026-VAR-%' limit 1) then
    raise notice 'Variety seed already applied; skipping.';
    return;
  end if;

  -- pick 8 past visits with consultation but no lab order yet
  for rec in
    select opv.id as op_visit_id, opv.patient_id, opv.doctor_id, c.id as consultation_id
      from op_visits opv
      join consultations c on c.op_visit_id = opv.id
     where opv.deleted_at is null
       and opv.visit_date < current_date
       and not exists (select 1 from lab_orders lo where lo.op_visit_id = opv.id)
     order by opv.visit_date desc
     limit 8
  loop
    lab_seq := lab_seq + 1;
    insert into lab_orders (
      order_number, patient_id, op_visit_id, consultation_id, doctor_id,
      priority, status, completed_at, created_by, created_at
    )
    values (
      'LAB-2026-VAR-' || lpad(lab_seq::text, 3, '0'),
      rec.patient_id, rec.op_visit_id, rec.consultation_id, rec.doctor_id,
      'routine', 'released', now() - interval '1 hour', bs, now() - interval '1 day'
    )
    returning id into v_order_id;

    insert into lab_samples (
      sample_number, lab_order_id, patient_id, sample_type,
      collected_by, collected_at, status, created_by, created_at
    )
    values (
      'SAM-2026-VAR-' || lpad(lab_seq::text, 3, '0'),
      v_order_id, rec.patient_id, 'blood',
      bs, now() - interval '6 hours', 'received', bs, now() - interval '6 hours'
    )
    returning id into v_sample_id;

    insert into lab_order_items (
      lab_order_id, lab_test_id, sample_id, status, sequence_no, created_by, created_at
    )
    values (
      v_order_id, cbc_test_id, v_sample_id, 'released', 1, bs, now() - interval '1 day'
    )
    returning id into v_item_id;

    -- pick a different user to satisfy chk_lab_results_sod (created_by != verified_by)
    select id into v_approver_id
      from users where id <> bs and deleted_at is null limit 1;

    insert into lab_results (
      lab_order_item_id, result_data, result_summary, abnormal_flag,
      release_status, entered_by, entered_at, verified_by, verified_at,
      created_by, created_at
    )
    values (
      v_item_id,
      jsonb_build_object(
        'Hemoglobin', jsonb_build_object('value', 13.4, 'unit', 'g/dL', 'range', '13–17'),
        'WBC', jsonb_build_object('value', 7600, 'unit', '/µL', 'range', '4000–11000')
      ),
      'CBC within normal limits',
      'normal',
      'verified',
      bs, now() - interval '3 hours',
      v_approver_id, now() - interval '2 hours',
      bs, now() - interval '3 hours'
    );
  end loop;

  -- pick 8 past visits with consultation but no rad order yet
  for rec in
    select opv.id as op_visit_id, opv.patient_id, opv.doctor_id, c.id as consultation_id
      from op_visits opv
      join consultations c on c.op_visit_id = opv.id
     where opv.deleted_at is null
       and opv.visit_date < current_date
       and not exists (select 1 from radiology_orders ro where ro.op_visit_id = opv.id)
       and not exists (select 1 from lab_orders     lo where lo.op_visit_id = opv.id and lo.order_number like 'LAB-2026-VAR-%')
     order by opv.visit_date desc
     limit 8
  loop
    rad_seq := rad_seq + 1;
    insert into radiology_orders (
      order_number, patient_id, op_visit_id, consultation_id, doctor_id,
      radiology_procedure_id, clinical_question, priority, status,
      imaging_completed_at, released_at, created_by, created_at
    )
    values (
      'RAD-2026-VAR-' || lpad(rad_seq::text, 3, '0'),
      rec.patient_id, rec.op_visit_id, rec.consultation_id, rec.doctor_id,
      xray_chest_id, 'Routine chest screening',
      'routine', 'released',
      now() - interval '4 hours',
      now() - interval '2 hours',
      bs, now() - interval '1 day'
    )
    returning id into v_order_id;

    -- second user for the SoD constraint (created_by <> approved_by)
    select id into v_approver_id
      from users where id <> bs and deleted_at is null limit 1;

    insert into radiology_reports (
      radiology_order_id, findings, impression, recommendations,
      approval_status, approved_by, approved_at,
      release_status, released_at,
      reported_by, reported_at, created_by, created_at
    )
    values (
      v_order_id,
      'Lung fields clear. Cardiac silhouette normal in size. No pleural effusion.',
      'No active disease.',
      'No further imaging required.',
      'approved',
      v_approver_id, now() - interval '3 hours',
      'released',
      now() - interval '2 hours',
      bs, now() - interval '4 hours',
      bs, now() - interval '4 hours'
    );
  end loop;
end $$;


select 'daily_appts_22_25' as t, count(*)::text as n
  from appointments
 where appointment_no like 'APT-2026-DAILY-%'
union all
select 'extra_lab_orders', count(*)::text
  from lab_orders where order_number like 'LAB-2026-VAR-%'
union all
select 'extra_rad_orders', count(*)::text
  from radiology_orders where order_number like 'RAD-2026-VAR-%';
