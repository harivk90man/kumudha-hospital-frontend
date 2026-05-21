-- Add ~10 Chest X-Ray radiology orders + approved reports to closed
-- visits that have no rad yet (and weren't picked by the LAB variety
-- pass), so visit history shows a mix that includes x-rays.

do $$
declare
  bs              uuid := '00000000-0000-0000-0000-000000000001';
  xray_chest_id   uuid := (select id from radiology_procedures where procedure_code='XR-CHE' limit 1);
  knee_xr_id      uuid := (select id from radiology_procedures where procedure_code='XR-KNE' limit 1);
  lspine_xr_id    uuid := (select id from radiology_procedures where procedure_code='XR-LSP' limit 1);
  rec             record;
  rad_seq         int := 0;
  v_order_id      uuid;
  v_approver_id   uuid;
  v_proc_id       uuid;
begin
  if exists (select 1 from radiology_orders where order_number like 'RAD-2026-VAR-%' limit 1) then
    raise notice 'Rad variety already applied; skipping.';
    return;
  end if;

  select id into v_approver_id
    from users where id <> bs and deleted_at is null limit 1;

  for rec in
    select opv.id as op_visit_id, opv.patient_id, opv.doctor_id, c.id as consultation_id, c.chief_complaint
      from op_visits opv
      join consultations c on c.op_visit_id = opv.id
     where opv.deleted_at is null
       and opv.closed_at is not null
       and not exists (select 1 from radiology_orders ro where ro.op_visit_id = opv.id)
       and not exists (select 1 from lab_orders     lo where lo.op_visit_id = opv.id and lo.order_number like 'LAB-2026-VAR-%')
     order by opv.closed_at desc
     limit 10
  loop
    rad_seq := rad_seq + 1;
    -- rotate procedure by complaint keyword (best-effort)
    v_proc_id := case
      when rec.chief_complaint ilike '%knee%' or rec.chief_complaint ilike '%joint%' then knee_xr_id
      when rec.chief_complaint ilike '%back%' or rec.chief_complaint ilike '%spine%' then lspine_xr_id
      else xray_chest_id
    end;

    insert into radiology_orders (
      order_number, patient_id, op_visit_id, consultation_id, doctor_id,
      radiology_procedure_id, clinical_question, priority, status,
      imaging_completed_at, released_at, created_by, created_at
    )
    values (
      'RAD-2026-VAR-' || lpad(rad_seq::text, 3, '0'),
      rec.patient_id, rec.op_visit_id, rec.consultation_id, rec.doctor_id,
      v_proc_id, coalesce(rec.chief_complaint, 'Workup'),
      'routine', 'released',
      now() - interval '4 hours',
      now() - interval '2 hours',
      bs, now() - interval '1 day'
    )
    returning id into v_order_id;

    insert into radiology_reports (
      radiology_order_id, findings, impression, recommendation,
      reported_by_radiologist_id, dictated_at,
      approval_status, approved_by, approved_at,
      release_status, created_by, created_at
    )
    values (
      v_order_id,
      'Bony structures and soft tissues unremarkable. No acute findings.',
      'No active disease.',
      'Clinical correlation; no further imaging needed.',
      bs, now() - interval '3 hours',
      'approved', v_approver_id, now() - interval '2 hours',
      'released', bs, now() - interval '3 hours'
    );
  end loop;
end $$;

select 'extra_rad_orders' as t, count(*)::text as n
  from radiology_orders where order_number like 'RAD-2026-VAR-%';
