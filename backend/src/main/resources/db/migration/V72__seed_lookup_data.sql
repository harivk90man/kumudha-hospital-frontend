-- ============================================================
-- V73__seed_lookup_data.sql
-- Seed data for allergies_lookup and chronic_conditions_lookup.
-- Admin/owner can add more via data-entry UI; these are the
-- common clinical starters surfaced in the registration picker.
-- ============================================================

DO $$
DECLARE sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- ── Allergies ────────────────────────────────────────────────────────────────
INSERT INTO allergies_lookup (allergy_code, allergy_name, category, created_by) VALUES
  ('PENICILLIN',         'Penicillin',           'drug',          sys),
  ('AMOXICILLIN',        'Amoxicillin',           'drug',          sys),
  ('SULFA',              'Sulfa',                 'drug',          sys),
  ('ASPIRIN',            'Aspirin',               'drug',          sys),
  ('IBUPROFEN',          'Ibuprofen',             'drug',          sys),
  ('NSAIDS',             'NSAIDs',                'drug',          sys),
  ('METFORMIN',          'Metformin',             'drug',          sys),
  ('CODEINE',            'Codeine',               'drug',          sys),
  ('MORPHINE',           'Morphine',              'drug',          sys),
  ('IODINATED_CONTRAST', 'Iodinated contrast',    'environmental', sys),
  ('IODINE',             'Iodine',                'environmental', sys),
  ('LATEX',              'Latex',                 'environmental', sys),
  ('DUST_MITES',         'Dust mites',            'environmental', sys),
  ('POLLEN',             'Pollen',                'environmental', sys),
  ('PEANUTS',            'Peanuts',               'food',          sys),
  ('SHELLFISH',          'Shellfish',             'food',          sys),
  ('EGGS',               'Eggs',                  'food',          sys),
  ('MILK',               'Milk',                  'food',          sys),
  ('TREE_NUTS',          'Tree nuts',             'food',          sys),
  ('WHEAT',              'Wheat / Gluten',        'food',          sys)
ON CONFLICT DO NOTHING;

-- ── Chronic conditions ───────────────────────────────────────────────────────
INSERT INTO chronic_conditions_lookup (condition_code, condition_name, icd_code, category, created_by) VALUES
  ('HYPERTENSION',          'Hypertension',                'I10',   'cardiovascular', sys),
  ('TYPE_2_DIABETES',       'Type 2 Diabetes',             'E11',   'endocrine',      sys),
  ('TYPE_1_DIABETES',       'Type 1 Diabetes',             'E10',   'endocrine',      sys),
  ('HYPERLIPIDEMIA',        'Hyperlipidemia / Dyslipidemia','E78.5','cardiovascular', sys),
  ('CORONARY_ARTERY_DISEASE','Coronary artery disease',    'I25',   'cardiovascular', sys),
  ('HEART_FAILURE',         'Heart failure',               'I50',   'cardiovascular', sys),
  ('ASTHMA',                'Asthma',                      'J45',   'respiratory',    sys),
  ('COPD',                  'COPD',                        'J44',   'respiratory',    sys),
  ('HYPOTHYROIDISM',        'Hypothyroidism',              'E03',   'endocrine',      sys),
  ('HYPERTHYROIDISM',       'Hyperthyroidism',             'E05',   'endocrine',      sys),
  ('CKD',                   'Chronic Kidney Disease (CKD)','N18',   'renal',          sys),
  ('EPILEPSY',              'Epilepsy',                    'G40',   'neurological',   sys),
  ('DEPRESSION',            'Depression',                  'F32',   'mental_health',  sys),
  ('ANXIETY',               'Anxiety disorder',            'F41',   'mental_health',  sys),
  ('RHEUMATOID_ARTHRITIS',  'Rheumatoid Arthritis',        'M05',   'musculoskeletal',sys),
  ('OSTEOARTHRITIS',        'Osteoarthritis',              'M19',   'musculoskeletal',sys),
  ('OBESITY',               'Obesity',                     'E66',   'endocrine',      sys),
  ('ANAEMIA',               'Anaemia',                     'D64',   'haematological', sys),
  ('PSORIASIS',             'Psoriasis',                   'L40',   'dermatological', sys),
  ('GERD',                  'GERD / Acid reflux',          'K21',   'gastrointestinal',sys)
ON CONFLICT DO NOTHING;

END $$;
