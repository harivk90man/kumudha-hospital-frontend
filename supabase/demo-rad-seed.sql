-- =====================================================================
-- Radiology orders + reports against real op_visits.
-- =====================================================================
do $$
declare
  bs       uuid := '00000000-0000-0000-0000-000000000001';
  gopi     uuid := (select id from users where username = 'gopi');
  kuppan   uuid := (select id from users where username = 'kuppan');
  proc_ids uuid[];
  op_pool record;
  v_order uuid; v_proc uuid;
  order_no_seq int := 2000;
  rec_status text;
  ord_at timestamptz;
begin
  if exists (select 1 from radiology_orders where order_number like 'RAD-2026-BULK-%' limit 1) then
    raise notice 'Radiology orders already seeded; skipping.';
    return;
  end if;

  select array_agg(id) into proc_ids from radiology_procedures where deleted_at is null;
  if proc_ids is null or array_length(proc_ids,1) = 0 then
    raise notice 'No radiology_procedures in DB.';
    return;
  end if;

  for op_pool in
    select id, doctor_id, patient_id, created_at
      from op_visits
     where deleted_at is null and (op_number like 'OP-2026-BULK-%' or op_number like 'OP-2026-LIVE-%')
     order by random() limit 18
  loop
    order_no_seq := order_no_seq + 1;
    v_proc := proc_ids[1 + (random() * (array_length(proc_ids,1) - 1))::int];
    ord_at := op_pool.created_at + interval '45 minutes';

    -- 55% released, 25% reported, 15% in_progress, 5% paid
    rec_status := case
      when random() < 0.05 then 'paid'
      when random() < 0.20 then 'imaging_in_progress'
      when random() < 0.40 then 'reported'
      else 'released'
    end;

    insert into radiology_orders (
      order_number, patient_id, op_visit_id, doctor_id, radiology_procedure_id,
      clinical_question, priority, status, imaging_completed_at, released_at,
      created_by, created_at
    )
    values (
      'RAD-2026-BULK-' || lpad(order_no_seq::text, 4, '0'),
      op_pool.patient_id, op_pool.id, op_pool.doctor_id, v_proc,
      (array['Rule out fracture','Pre-op clearance','Routine screening','Pain workup','Follow-up imaging'])[1 + (random()*4)::int],
      case when random() < 0.85 then 'routine' else 'urgent' end,
      rec_status,
      case when rec_status in ('reported','released') then ord_at + interval '90 minutes' else null end,
      case when rec_status = 'released' then ord_at + interval '3 hours' else null end,
      bs, ord_at
    )
    returning id into v_order;

    -- report for reported / released only
    if rec_status in ('reported','released') then
      insert into radiology_reports (
        radiology_order_id, findings, impression, recommendation,
        reported_by_radiologist_id, dictated_at,
        release_status, approval_status,
        approved_by, approved_at, created_by, created_at
      )
      values (
        v_order,
        (array[
          'No acute fracture identified. Soft tissues unremarkable.',
          'Heart size normal. Lung fields clear. No pleural effusion.',
          'Mild osteoarthritic changes noted.',
          'Liver and gallbladder unremarkable. No free fluid.',
          'No focal lesions. Ventricular system normal.'
        ])[1 + (random()*4)::int],
        (array[
          'Normal study.',
          'Mild degenerative changes; clinically correlate.',
          'No acute pathology.',
          'Findings consistent with chronic changes.',
          'Recommend follow-up in 3-6 months.'
        ])[1 + (random()*4)::int],
        'Clinical correlation advised.',
        gopi, ord_at + interval '2 hours',
        case when rec_status = 'released' then 'released' else 'verified' end,
        case when rec_status = 'released' then 'approved' else 'pending_approval' end,
        case when rec_status = 'released' then kuppan else null end,
        case when rec_status = 'released' then ord_at + interval '3 hours' else null end,
        bs, ord_at + interval '2 hours'
      );
    end if;
  end loop;
end $$;

select 'radiology_orders' as t, count(*)::text as n from radiology_orders where deleted_at is null
union all
select 'radiology_reports', count(*)::text from radiology_reports where deleted_at is null
union all
select 'rad_released', count(*)::text from radiology_orders where status = 'released' and deleted_at is null
order by t;
