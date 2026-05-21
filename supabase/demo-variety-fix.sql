-- Corrected variety seed: add 8 lab orders (CBC + verified result) and
-- 8 radiology orders (Chest X-Ray + approved report) to past op_visits
-- that currently have prescription only, so the doctor's "previous
-- visits" panel shows a mix of rx-only / blood / x-ray rows.

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
  v_approver_id   uuid;
  v_radiologist   uuid;
begin
  if exists (select 1 from lab_orders where order_number like 'LAB-2026-VAR-%' limit 1)
  or exists (select 1 from radiology_orders where order_number like 'RAD-2026-VAR-%' limit 1) then
    raise notice 'Variety seed already applied; skipping.';
    return;
  end if;

  -- second user for SoD constraints (created_by <> verified_by / approved_by)
  select id into v_approver_id
    from users where id <> bs and deleted_at is null limit 1;

  -- 8 lab orders on past visits without any lab yet
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
      sample_barcode, lab_order_id, patient_id, sample_type,
      collected_by, received_at, status, created_by, created_at
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

    insert into lab_results (
      lab_order_item_id, value_raw, value_numeric, unit, flag,
      performed_by, release_status, approval_status,
      verified_by, verified_at, created_by, created_at
    )
    values (
      v_item_id,
      'Hb 13.4 g/dL; WBC 7600 /µL; Platelets 245k /µL — within normal limits',
      13.4, 'g/dL', 'normal',
      bs, 'verified', 'approved',
      v_approver_id, now() - interval '2 hours',
      bs, now() - interval '3 hours'
    );
  end loop;

  -- 8 radiology orders on past visits without any imaging yet
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

    -- The radiologist (reported_by) must differ from the approver to satisfy chk_radiology_reports_sod
    v_radiologist := bs;

    insert into radiology_reports (
      radiology_order_id, findings, impression, recommendation,
      reported_by_radiologist_id, dictated_at,
      approval_status, approved_by, approved_at,
      release_status, created_by, created_at
    )
    values (
      v_order_id,
      'Lung fields clear. Cardiac silhouette normal in size. No pleural effusion.',
      'No active disease.',
      'No further imaging required.',
      v_radiologist, now() - interval '3 hours',
      'approved', v_approver_id, now() - interval '2 hours',
      'released', v_radiologist, now() - interval '3 hours'
    );
  end loop;
end $$;

select 'extra_lab_orders' as t, count(*)::text as n
  from lab_orders where order_number like 'LAB-2026-VAR-%'
union all
select 'extra_rad_orders', count(*)::text
  from radiology_orders where order_number like 'RAD-2026-VAR-%';
