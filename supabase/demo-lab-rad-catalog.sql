-- Seed lab_tests and radiology_procedures so the walk-in / catalog pages show real data.

insert into lab_tests (
  test_code, test_name, category, sample_type, service_id, unit, result_type,
  ref_min_male, ref_max_male, ref_min_female, ref_max_female,
  tat_hours, requires_fasting, sample_volume_ml, created_by
)
select v.code, v.name, v.cat, v.sample,
       (select id from services where service_code = v.svc),
       nullif(v.unit,''), v.rt,
       nullif(v.refmin_m,'')::numeric, nullif(v.refmax_m,'')::numeric,
       nullif(v.refmin_f,'')::numeric, nullif(v.refmax_f,'')::numeric,
       v.tat, v.fast, nullif(v.vol,'')::numeric,
       '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('CBC',     'Complete Blood Count',  'hematology',    'EDTA Blood',  'LAB_CBC',   'cells/mm3', 'numeric',           '4500',  '11000', '4500',  '11000', 4,  false, '3'),
  ('HB',      'Haemoglobin',           'hematology',    'EDTA Blood',  'LAB_CBC',   'g/dL',      'numeric',           '13',    '17',    '12',    '16',    4,  false, '2'),
  ('BSF',     'Blood Sugar Fasting',   'biochemistry',  'Fluoride',    'LAB_BSF',   'mg/dL',     'numeric',           '70',    '99',    '70',    '99',    2,  true,  '2'),
  ('HBA1C',   'HbA1c',                 'biochemistry',  'EDTA Blood',  'LAB_HBA1C', '%',         'numeric',           '4',     '5.6',   '4',     '5.6',   8,  false, '2'),
  ('LIPID',   'Lipid Profile',         'biochemistry',  'Serum',       'LAB_LIPID', 'mg/dL',     'numeric',           '0',     '200',   '0',     '200',   6,  true,  '3'),
  ('CREAT',   'Serum Creatinine',      'biochemistry',  'Serum',       'LAB_CBC',   'mg/dL',     'numeric',           '0.7',   '1.3',   '0.6',   '1.1',   4,  false, '2'),
  ('TSH',     'Thyroid Stimulating Hormone','endocrinology', 'Serum',  'LAB_CBC',   'mIU/L',     'numeric',           '0.4',   '4',     '0.4',   '4',     12, false, '2'),
  ('CRP',     'C-Reactive Protein',    'biochemistry',  'Serum',       'LAB_CBC',   'mg/L',      'numeric',           '0',     '10',    '0',     '10',    4,  false, '2'),
  ('URINE',   'Urine Routine',         'biochemistry',  'Urine',       'LAB_CBC',   '',          'free_text',         '',      '',      '',      '',      2,  false, '10'),
  ('HIV',     'HIV Test',              'serology',      'Serum',       'LAB_CBC',   '',          'reactive_nonreactive','',    '',      '',      '',      24, false, '2')
) as v(code, name, cat, sample, svc, unit, rt, refmin_m, refmax_m, refmin_f, refmax_f, tat, fast, vol)
where not exists (select 1 from lab_tests t where t.test_code = v.code and t.deleted_at is null);

-- ---------------------------------------------------------------------
-- radiology_procedures
-- ---------------------------------------------------------------------
insert into radiology_procedures (
  procedure_code, procedure_name, modality, body_part, service_id,
  typical_duration_mins, requires_fasting, created_by
)
select v.code, v.name, v.mod, v.body,
       (select id from services where service_code = v.svc),
       v.dur, v.fast,
       '00000000-0000-0000-0000-000000000001'::uuid
from (values
  ('XR-CHE',  'Chest X-Ray PA View',         'xray',        'Chest',      'RAD_XRAY_CHEST', 10, false),
  ('XR-KNE',  'Knee X-Ray AP+Lat',           'xray',        'Knee',       'RAD_XRAY_CHEST', 10, false),
  ('XR-LSP',  'Lumbar Spine X-Ray',          'xray',        'Lumbar Spine','RAD_XRAY_CHEST',10, false),
  ('USG-ABD', 'Abdominal Ultrasound',        'ultrasound',  'Abdomen',    'RAD_USG_ABD',    20, true),
  ('USG-PEL', 'Pelvic Ultrasound',           'ultrasound',  'Pelvis',     'RAD_USG_ABD',    20, true),
  ('CT-HD',   'CT Head (plain)',             'ct',          'Head',       'RAD_USG_ABD',    25, false),
  ('MR-LSP',  'MRI Lumbar Spine',            'mri',         'Lumbar Spine','RAD_USG_ABD',   45, false),
  ('ECG',     'ECG 12-Lead',                 'other',       'Chest',      'RAD_ECG',         5, false)
) as v(code, name, mod, body, svc, dur, fast)
where not exists (select 1 from radiology_procedures rp where rp.procedure_code = v.code and rp.deleted_at is null);

select 'lab_tests' as t, count(*) as n from lab_tests where deleted_at is null
union all
select 'radiology_procedures', count(*) from radiology_procedures where deleted_at is null;
