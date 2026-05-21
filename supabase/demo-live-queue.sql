-- Live queue for today (2026-05-21): 8 op_visits with closed_at=NULL,
-- each with a patient_states row whose left_at=NULL — that's the
-- "currently here" marker the queue UI joins against.

do $$
declare
  bs uuid := '00000000-0000-0000-0000-000000000001';
  doctor_ids uuid[];
  patient_pool record;
  station_vitals uuid := (select id from stations where station_type='vitals'    limit 1);
  station_doc    uuid := (select id from stations where station_type='doctor'    limit 1);
  station_bill   uuid := (select id from stations where station_type='billing'   limit 1);
  i int;
  v_pid uuid; v_did uuid; v_op uuid; v_station uuid;
  op_no text; tok_no text;
  picked_uhids text[] := array[
    'KH-2026-00100','KH-2026-00103','KH-2026-00114','KH-2026-00200',
    'KH-2026-00204','KH-2026-00208','KH-2026-00212','KH-2026-00216'
  ];
  picked_complaints text[] := array[
    'Knee pain — second opinion',
    'BP and diabetes review',
    'Asthma exacerbation',
    'Headache and dizziness',
    'Cough for 1 week',
    'Routine BP follow-up',
    'Back pain follow-up',
    'Joint pain'
  ];
begin
  if exists (select 1 from op_visits where op_number like 'OP-2026-LIVE-%' limit 1) then
    raise notice 'Live queue already seeded; skipping.';
    return;
  end if;

  select array_agg(usr.id) into doctor_ids
    from users usr
    join user_roles ur on ur.user_id = usr.id and ur.deleted_at is null
    join roles r on r.id = ur.role_id and r.deleted_at is null
   where r.role_code in ('doctor','chief_doctor') and usr.deleted_at is null;

  for i in 1..array_length(picked_uhids,1) loop
    v_pid := (select id from patients where uhid = picked_uhids[i]);
    v_did := doctor_ids[1 + ((i-1) % array_length(doctor_ids,1))];
    op_no := 'OP-2026-LIVE-' || lpad(i::text, 3, '0');
    tok_no := 'OP-T-' || lpad(i::text, 2, '0');

    insert into op_visits (
      op_number, patient_id, doctor_id, visit_date, chief_complaint,
      closed_at, created_by, created_at
    )
    values (
      op_no, v_pid, v_did, current_date, picked_complaints[i],
      null, bs, (current_date::timestamptz + (i * interval '15 minutes' + interval '9 hours'))
    )
    returning id into v_op;

    -- station: rotate vitals / doctor / billing for visual variety
    v_station := case (i % 3)
      when 0 then station_doc
      when 1 then station_vitals
      else station_bill
    end;

    insert into patient_states (
      patient_id, op_visit_id, station_id, entered_at, left_at, metadata,
      created_by, created_at
    )
    values (
      v_pid, v_op, v_station,
      (current_date::timestamptz + interval '9 hours' + (i * interval '15 minutes')),
      null,
      '{}'::jsonb,
      bs, now()
    );
  end loop;
end $$;

select 'live_op_visits' as t, count(*)::text as n
  from op_visits where closed_at is null and visit_date = current_date and deleted_at is null
union all
select 'active_patient_states', count(*)::text
  from patient_states where left_at is null and deleted_at is null;
