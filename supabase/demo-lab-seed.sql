-- =====================================================================
-- demo-lab-seed.sql
-- Convert lab mock data -> lab_orders + lab_samples + lab_order_items + lab_results.
-- Generates ~30 orders against REAL op_visits in DB, mixing statuses
-- (released / reported / in_progress / paid) with realistic results.
-- =====================================================================

do $$
declare
  bs    uuid := '00000000-0000-0000-0000-000000000001';
  gopi  uuid := (select id from users where username = 'gopi');
  drnaveen uuid := (select id from users where username = 'drnaveen');
  test_ids uuid[]; lab_test_pool record;
  op_pool record;
  v_op uuid; v_doc uuid; v_pat uuid;
  v_order_id uuid; v_sample_id uuid; v_item_id uuid;
  i int; j int;
  order_no_seq int := 1000;
  rec_status text; rec_priority text;
  v_test_id uuid; v_test_name text; v_sample_type text;
  result_value numeric; result_flag text;
  is_critical boolean;
  ordered_at timestamptz;
begin
  -- Skip if already seeded
  if exists (select 1 from lab_orders where order_number like 'LAB-2026-BULK-%' limit 1) then
    raise notice 'Lab orders already seeded; skipping.';
    return;
  end if;

  if gopi is null then
    raise notice 'gopi user missing; cannot seed lab orders.';
    return;
  end if;

  -- pick 30 op_visits at random (from the bulk + live seeds)
  for op_pool in
    select id, doctor_id, patient_id, visit_date, created_at
      from op_visits
     where deleted_at is null
       and (op_number like 'OP-2026-BULK-%' or op_number like 'OP-2026-LIVE-%')
     order by random()
     limit 30
  loop
    order_no_seq := order_no_seq + 1;
    v_op := op_pool.id;
    v_doc := op_pool.doctor_id;
    v_pat := op_pool.patient_id;
    ordered_at := op_pool.created_at + interval '30 minutes';

    -- distribute statuses: 60% released, 20% reported, 15% in_progress, 5% paid
    rec_status := case
      when random() < 0.05 then 'paid'
      when random() < 0.20 then 'in_progress'
      when random() < 0.40 then 'reported'
      else 'released'
    end;
    rec_priority := case when random() < 0.85 then 'routine' when random() < 0.95 then 'urgent' else 'stat' end;

    -- order
    insert into lab_orders (
      order_number, patient_id, op_visit_id, doctor_id, priority, status,
      completed_at, created_by, created_at
    )
    values (
      'LAB-2026-BULK-' || lpad(order_no_seq::text, 4, '0'),
      v_pat, v_op, v_doc, rec_priority, rec_status,
      case when rec_status in ('reported','released') then ordered_at + interval '3 hours' else null end,
      bs, ordered_at
    )
    returning id into v_order_id;

    -- 1-3 items per order. Use distinct test ids per order.
    declare
      avail_tests uuid[];
      picked_count int := 0;
      desired int := 1 + (random()*2)::int;
    begin
      select array_agg(lt.id order by random())
        into avail_tests
        from lab_tests lt where lt.deleted_at is null;
    for j in 1..desired loop
      if j > array_length(avail_tests, 1) then exit; end if;
      v_test_id := avail_tests[j];
      select lt.test_name, lt.sample_type into v_test_name, v_sample_type
        from lab_tests lt where lt.id = v_test_id;
      picked_count := picked_count + 1;

      -- sample (one per item for simplicity)
      insert into lab_samples (
        sample_barcode, patient_id, lab_order_id, sample_type, status,
        collected_by, received_at, created_by, created_at
      )
      values (
        'SMPL-' || lpad((order_no_seq * 10 + j)::text, 6, '0'),
        v_pat, v_order_id, v_sample_type,
        case when rec_status in ('reported','released') then 'received'
             when rec_status = 'in_progress' then 'received'
             else 'collected' end,
        gopi, ordered_at + interval '15 minutes', bs, ordered_at
      )
      returning id into v_sample_id;

      -- item — map order_status -> item_status (different enums)
      insert into lab_order_items (
        lab_order_id, lab_test_id, sample_id, status, sequence_no,
        created_by, created_at
      )
      values (
        v_order_id, v_test_id, v_sample_id,
        case rec_status
          when 'paid'        then 'pending'
          when 'in_progress' then 'in_progress'
          when 'reported'    then 'reported'
          when 'released'    then 'released'
          else 'pending'
        end,
        j, bs, ordered_at
      )
      returning id into v_item_id;

      -- result (only for reported/released)
      if rec_status in ('reported','released') then
        is_critical := random() < 0.05;
        result_value := 80 + (random() * 200)::numeric(10,2);
        result_flag := case
          when is_critical then 'critical_high'
          when random() < 0.20 then 'high'
          when random() < 0.10 then 'low'
          else 'normal'
        end;
        insert into lab_results (
          lab_order_item_id, value_raw, value_numeric, unit, flag,
          performed_by, release_status, approval_status,
          verified_by, verified_at, created_by, created_at
        )
        values (
          v_item_id, result_value::text, result_value, 'mg/dL', result_flag,
          gopi,
          case when rec_status = 'released' then 'verified' else 'pending_verification' end,
          'approved',
          gopi, ordered_at + interval '3 hours', bs, ordered_at + interval '3 hours'
        );
      end if;
    end loop;
    end;  -- inner declare block
  end loop;
end $$;

select 'lab_orders' as t, count(*)::text as n from lab_orders where deleted_at is null
union all
select 'lab_order_items', count(*)::text from lab_order_items where deleted_at is null
union all
select 'lab_samples', count(*)::text from lab_samples where deleted_at is null
union all
select 'lab_results', count(*)::text from lab_results where deleted_at is null
union all
select 'lab_results_released', count(*)::text from lab_results where release_status = 'released' and deleted_at is null
order by t;
