/**
 * Phase-1 lab catalogue. Source of truth: docs/02-catalogues/blood-test-catalogues.md.
 *
 * Three layers:
 *  1. mockLabCatalog        — what the DOCTOR sees in the order picker
 *                             (panels + standalone tests + qualitatives).
 *  2. mockLabPanels          — the formal panel→tests bundle (lab_test_panels).
 *  3. mockLabComponents      — every lab_tests row, including all panel
 *                             constituents (Hb, WBC, ALT, eGFR, …) with
 *                             gender-resolved ref ranges, units, result_type,
 *                             critical thresholds, and calculated-from
 *                             relationships.
 *
 * Real backend models all of this in the existing schema:
 *   - lab_tests (one row per individual test) holds the per-component data.
 *   - lab_test_panels (one row per bundle) groups them via test_ids[].
 *   - lab_orders → lab_order_items → lab_results captures the actual reads.
 */
import type { LabTestCatalogItem, LabTestPanel } from '../labTypes';

const GRADE_OPTIONS = ['Negative', '+', '++', '+++', '++++'] as const;

/* ---------------------------------------------------------------- */
/* CBC components — Catalogue §1.1                                  */
/* ---------------------------------------------------------------- */
const cbcComponents: LabTestCatalogItem[] = [
  {
    id: 'lab-hb', code: 'HB', name: 'Hb', fullName: 'Haemoglobin',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: 'g/dL',
    refMinMale: 13.5, refMaxMale: 17.5,
    refMinFemale: 12.0, refMaxFemale: 15.5,
    criticalLow: 7.0, criticalHigh: 20.0,
    defaultPrice: 100,
  },
  {
    id: 'lab-rbc', code: 'RBC', name: 'RBC', fullName: 'Red Blood Cell Count',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: 'million/µL',
    refMinMale: 4.5, refMaxMale: 5.9,
    refMinFemale: 4.1, refMaxFemale: 5.1,
    defaultPrice: 60,
  },
  {
    id: 'lab-wbc', code: 'WBC', name: 'WBC', fullName: 'White Blood Cell Count',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: 'cells/µL',
    refMinMale: 4000, refMaxMale: 11000,
    refMinFemale: 4000, refMaxFemale: 11000,
    criticalLow: 1500, criticalHigh: 30000,
    defaultPrice: 80,
  },
  {
    id: 'lab-neut', code: 'NEUT', name: 'Neutrophils',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: '%', refMinMale: 40, refMaxMale: 70, refMinFemale: 40, refMaxFemale: 70,
    defaultPrice: 40,
  },
  {
    id: 'lab-lymph', code: 'LYMPH', name: 'Lymphocytes',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: '%', refMinMale: 20, refMaxMale: 40, refMinFemale: 20, refMaxFemale: 40,
    defaultPrice: 40,
  },
  {
    id: 'lab-mono', code: 'MONO', name: 'Monocytes',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: '%', refMinMale: 2, refMaxMale: 8, refMinFemale: 2, refMaxFemale: 8,
    defaultPrice: 40,
  },
  {
    id: 'lab-eos', code: 'EOS', name: 'Eosinophils',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: '%', refMinMale: 1, refMaxMale: 4, refMinFemale: 1, refMaxFemale: 4,
    defaultPrice: 40,
  },
  {
    id: 'lab-baso', code: 'BASO', name: 'Basophils',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: '%', refMinMale: 0, refMaxMale: 1, refMinFemale: 0, refMaxFemale: 1,
    defaultPrice: 40,
  },
  {
    id: 'lab-plt', code: 'PLT', name: 'Platelets', fullName: 'Platelet Count',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: 'lakhs/µL',
    refMinMale: 1.5, refMaxMale: 4.5, refMinFemale: 1.5, refMaxFemale: 4.5,
    criticalLow: 0.5, criticalHigh: 10.0,
    defaultPrice: 80,
  },
  {
    id: 'lab-pcv', code: 'PCV', name: 'PCV / Hct', fullName: 'Packed Cell Volume',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: '%',
    refMinMale: 41, refMaxMale: 53,
    refMinFemale: 36, refMaxFemale: 46,
    defaultPrice: 60,
  },
  {
    id: 'lab-mcv', code: 'MCV', name: 'MCV', fullName: 'Mean Corpuscular Volume',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: 'fL', refMinMale: 80, refMaxMale: 100, refMinFemale: 80, refMaxFemale: 100,
    defaultPrice: 50,
  },
  {
    id: 'lab-mch', code: 'MCH', name: 'MCH', fullName: 'Mean Corpuscular Haemoglobin',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: 'pg', refMinMale: 27, refMaxMale: 33, refMinFemale: 27, refMaxFemale: 33,
    defaultPrice: 50,
  },
  {
    id: 'lab-mchc', code: 'MCHC', name: 'MCHC', fullName: 'Mean Corpuscular Haemoglobin Concentration',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: 'g/dL', refMinMale: 32, refMaxMale: 36, refMinFemale: 32, refMaxFemale: 36,
    defaultPrice: 50,
  },
];

/* ---------------------------------------------------------------- */
/* LFT components — Catalogue §1.2                                  */
/* ---------------------------------------------------------------- */
const lftComponents: LabTestCatalogItem[] = [
  {
    id: 'lab-bil-tot', code: 'BIL_TOTAL', name: 'Total Bilirubin',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'mg/dL', refMinMale: 0.2, refMaxMale: 1.2, refMinFemale: 0.2, refMaxFemale: 1.2,
    criticalHigh: 15.0,
    defaultPrice: 80,
  },
  {
    id: 'lab-bil-dir', code: 'BIL_DIRECT', name: 'Direct Bilirubin (BD)',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'mg/dL', refMinMale: 0.0, refMaxMale: 0.3, refMinFemale: 0.0, refMaxFemale: 0.3,
    defaultPrice: 80,
  },
  {
    id: 'lab-bil-ind', code: 'BIL_INDIRECT', name: 'Indirect Bilirubin',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'calculated',
    unit: 'mg/dL', refMinMale: 0.1, refMaxMale: 0.8, refMinFemale: 0.1, refMaxFemale: 0.8,
    defaultPrice: 0,
    calculatedFrom: ['BIL_TOTAL', 'BIL_DIRECT'],
    formulaHint: 'Total Bilirubin − Direct Bilirubin',
  },
  {
    id: 'lab-sgot', code: 'SGOT', name: 'SGOT', fullName: 'Aspartate Aminotransferase (AST)',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'U/L', refMinMale: 10, refMaxMale: 40, refMinFemale: 10, refMaxFemale: 40,
    defaultPrice: 100,
  },
  {
    id: 'lab-sgpt', code: 'SGPT', name: 'SGPT', fullName: 'Alanine Aminotransferase (ALT)',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'U/L', refMinMale: 7, refMaxMale: 56, refMinFemale: 7, refMaxFemale: 56,
    defaultPrice: 100,
  },
  {
    id: 'lab-alp', code: 'ALP', name: 'ALP', fullName: 'Alkaline Phosphatase',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'U/L', refMinMale: 44, refMaxMale: 147, refMinFemale: 44, refMaxFemale: 147,
    defaultPrice: 100,
  },
  {
    id: 'lab-tp', code: 'TOTAL_PROTEIN', name: 'Total Protein',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'g/dL', refMinMale: 6.0, refMaxMale: 8.3, refMinFemale: 6.0, refMaxFemale: 8.3,
    defaultPrice: 60,
  },
  {
    id: 'lab-alb', code: 'ALBUMIN', name: 'Albumin',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'g/dL', refMinMale: 3.5, refMaxMale: 5.0, refMinFemale: 3.5, refMaxFemale: 5.0,
    defaultPrice: 60,
  },
  {
    id: 'lab-glob', code: 'GLOBULIN', name: 'Globulin',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'calculated',
    unit: 'g/dL', refMinMale: 2.0, refMaxMale: 3.5, refMinFemale: 2.0, refMaxFemale: 3.5,
    defaultPrice: 0,
    calculatedFrom: ['TOTAL_PROTEIN', 'ALBUMIN'],
    formulaHint: 'Total Protein − Albumin',
  },
  {
    id: 'lab-ag', code: 'AG_RATIO', name: 'A/G Ratio', fullName: 'Albumin-to-Globulin Ratio',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'calculated',
    refMinMale: 1.0, refMaxMale: 2.5, refMinFemale: 1.0, refMaxFemale: 2.5,
    defaultPrice: 0,
    calculatedFrom: ['ALBUMIN', 'GLOBULIN'],
    formulaHint: 'Albumin / Globulin',
  },
];

/* ---------------------------------------------------------------- */
/* RFT components — Catalogue §1.3                                  */
/* ---------------------------------------------------------------- */
const rftComponents: LabTestCatalogItem[] = [
  {
    id: 'lab-creat', code: 'CREATININE', name: 'Creatinine', fullName: 'Serum Creatinine',
    category: 'biochemistry', specimen: 'Serum', tatHours: 4, resultType: 'numeric',
    unit: 'mg/dL',
    refMinMale: 0.7, refMaxMale: 1.3,
    refMinFemale: 0.5, refMaxFemale: 1.1,
    criticalHigh: 7.0,
    defaultPrice: 100,
  },
  {
    id: 'lab-urea', code: 'UREA', name: 'Urea', fullName: 'Blood Urea',
    category: 'biochemistry', specimen: 'Serum', tatHours: 4, resultType: 'numeric',
    unit: 'mg/dL', refMinMale: 15, refMaxMale: 45, refMinFemale: 15, refMaxFemale: 45,
    criticalHigh: 200,
    defaultPrice: 80,
  },
  {
    id: 'lab-bun', code: 'BUN', name: 'BUN', fullName: 'Blood Urea Nitrogen',
    category: 'biochemistry', specimen: 'Serum', tatHours: 4, resultType: 'calculated',
    unit: 'mg/dL', refMinMale: 7, refMaxMale: 20, refMinFemale: 7, refMaxFemale: 20,
    defaultPrice: 0,
    calculatedFrom: ['UREA'],
    formulaHint: 'Urea × 0.467',
  },
  {
    id: 'lab-uric', code: 'URIC_ACID', name: 'Uric Acid', fullName: 'Serum Uric Acid',
    category: 'biochemistry', specimen: 'Serum', tatHours: 4, resultType: 'numeric',
    unit: 'mg/dL',
    refMinMale: 3.5, refMaxMale: 7.2,
    refMinFemale: 2.6, refMaxFemale: 6.0,
    defaultPrice: 100,
  },
  {
    id: 'lab-na', code: 'SODIUM', name: 'Sodium (Na⁺)', fullName: 'Serum Sodium',
    category: 'biochemistry', specimen: 'Serum', tatHours: 2, resultType: 'numeric',
    unit: 'mEq/L', refMinMale: 136, refMaxMale: 145, refMinFemale: 136, refMaxFemale: 145,
    criticalLow: 120, criticalHigh: 160,
    defaultPrice: 100,
  },
  {
    id: 'lab-k', code: 'POTASSIUM', name: 'Potassium (K⁺)', fullName: 'Serum Potassium',
    category: 'biochemistry', specimen: 'Serum', tatHours: 2, resultType: 'numeric',
    unit: 'mEq/L', refMinMale: 3.5, refMaxMale: 5.1, refMinFemale: 3.5, refMaxFemale: 5.1,
    criticalLow: 2.5, criticalHigh: 6.0,
    defaultPrice: 100,
  },
  {
    id: 'lab-cl', code: 'CHLORIDE', name: 'Chloride (Cl⁻)', fullName: 'Serum Chloride',
    category: 'biochemistry', specimen: 'Serum', tatHours: 2, resultType: 'numeric',
    unit: 'mEq/L', refMinMale: 98, refMaxMale: 107, refMinFemale: 98, refMaxFemale: 107,
    defaultPrice: 100,
  },
  {
    id: 'lab-egfr', code: 'EGFR', name: 'eGFR', fullName: 'Estimated Glomerular Filtration Rate',
    category: 'biochemistry', specimen: 'Serum', tatHours: 4, resultType: 'calculated',
    unit: 'mL/min/1.73m²',
    refMinMale: 90, refMaxMale: 999,   // > 90 normal; CKD ranges below
    refMinFemale: 90, refMaxFemale: 999,
    defaultPrice: 0,
    calculatedFrom: ['CREATININE'],
    formulaHint: 'CKD-EPI formula (Creatinine + age + sex)',
  },
];

/* ---------------------------------------------------------------- */
/* Urine Routine components — Catalogue §1.4                        */
/* ---------------------------------------------------------------- */
const urineComponents: LabTestCatalogItem[] = [
  {
    id: 'lab-urn-color', code: 'URN_COLOR', name: 'Colour',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'free_text',
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-appear', code: 'URN_APPEARANCE', name: 'Appearance',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'free_text',
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-ph', code: 'URN_PH', name: 'pH',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'numeric',
    refMinMale: 4.5, refMaxMale: 8.0, refMinFemale: 4.5, refMaxFemale: 8.0,
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-sg', code: 'URN_SG', name: 'Specific Gravity',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'numeric',
    refMinMale: 1.005, refMaxMale: 1.030, refMinFemale: 1.005, refMaxFemale: 1.030,
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-prot', code: 'URN_PROTEIN', name: 'Protein',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'grade',
    gradeOptions: [...GRADE_OPTIONS], defaultPrice: 0,
  },
  {
    id: 'lab-urn-glu', code: 'URN_GLUCOSE', name: 'Glucose',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'grade',
    gradeOptions: [...GRADE_OPTIONS], defaultPrice: 0,
  },
  {
    id: 'lab-urn-ket', code: 'URN_KETONES', name: 'Ketones',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'grade',
    gradeOptions: [...GRADE_OPTIONS], defaultPrice: 0,
  },
  {
    id: 'lab-urn-bil', code: 'URN_BILIRUBIN', name: 'Bilirubin',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'grade',
    gradeOptions: [...GRADE_OPTIONS], defaultPrice: 0,
  },
  {
    id: 'lab-urn-uro', code: 'URN_UROBILIN', name: 'Urobilinogen',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'numeric',
    unit: 'EU/dL', refMinMale: 0.1, refMaxMale: 1.0, refMinFemale: 0.1, refMaxFemale: 1.0,
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-nit', code: 'URN_NITRITES', name: 'Nitrites',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'positive_negative',
    qualitativeOptions: ['Negative', 'Positive'], defaultPrice: 0,
  },
  {
    id: 'lab-urn-le', code: 'URN_LE', name: 'Leucocyte Esterase',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'grade',
    gradeOptions: [...GRADE_OPTIONS], defaultPrice: 0,
  },
  {
    id: 'lab-urn-rbc', code: 'URN_RBC', name: 'RBCs (microscopy)',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'numeric',
    unit: 'cells/HPF', refMinMale: 0, refMaxMale: 2, refMinFemale: 0, refMaxFemale: 2,
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-wbc', code: 'URN_WBC', name: 'WBCs (microscopy)',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'numeric',
    unit: 'cells/HPF', refMinMale: 0, refMaxMale: 5, refMinFemale: 0, refMaxFemale: 5,
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-epi', code: 'URN_EPITHELIAL', name: 'Epithelial Cells',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'free_text',
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-cast', code: 'URN_CASTS', name: 'Casts',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'free_text',
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-cryst', code: 'URN_CRYSTALS', name: 'Crystals',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'free_text',
    defaultPrice: 0,
  },
  {
    id: 'lab-urn-bact', code: 'URN_BACTERIA', name: 'Bacteria',
    category: 'pathology', specimen: 'Urine', tatHours: 3, resultType: 'free_text',
    defaultPrice: 0,
  },
];

/* ---------------------------------------------------------------- */
/* Lipid panel — Catalogue (commonly bundled, not in §1 explicitly  */
/*   but present as a standard panel; ranges below are NCEP/ATP-III)*/
/* ---------------------------------------------------------------- */
const lipidComponents: LabTestCatalogItem[] = [
  {
    id: 'lab-tc', code: 'TOTAL_CHOL', name: 'Total Cholesterol',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'mg/dL', refMinMale: 0, refMaxMale: 200, refMinFemale: 0, refMaxFemale: 200,
    requiresFasting: true, defaultPrice: 120,
  },
  {
    id: 'lab-trig', code: 'TRIGLYCERIDES', name: 'Triglycerides',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'mg/dL', refMinMale: 0, refMaxMale: 150, refMinFemale: 0, refMaxFemale: 150,
    requiresFasting: true, defaultPrice: 120,
  },
  {
    id: 'lab-hdl', code: 'HDL', name: 'HDL Cholesterol',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'mg/dL',
    refMinMale: 40, refMaxMale: 999,
    refMinFemale: 50, refMaxFemale: 999,
    requiresFasting: true, defaultPrice: 120,
  },
  {
    id: 'lab-ldl', code: 'LDL', name: 'LDL Cholesterol',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'calculated',
    unit: 'mg/dL', refMinMale: 0, refMaxMale: 100, refMinFemale: 0, refMaxFemale: 100,
    defaultPrice: 0,
    calculatedFrom: ['TOTAL_CHOL', 'HDL', 'TRIGLYCERIDES'],
    formulaHint: 'Friedewald: TC − HDL − (TG/5)',
  },
  {
    id: 'lab-vldl', code: 'VLDL', name: 'VLDL',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'calculated',
    unit: 'mg/dL', refMinMale: 5, refMaxMale: 40, refMinFemale: 5, refMaxFemale: 40,
    defaultPrice: 0,
    calculatedFrom: ['TRIGLYCERIDES'],
    formulaHint: 'Triglycerides / 5',
  },
  {
    id: 'lab-tc-hdl', code: 'TC_HDL_RATIO', name: 'TC/HDL Ratio',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'calculated',
    refMinMale: 0, refMaxMale: 5, refMinFemale: 0, refMaxFemale: 4.5,
    defaultPrice: 0,
    calculatedFrom: ['TOTAL_CHOL', 'HDL'],
    formulaHint: 'Total Cholesterol / HDL',
  },
];

/* ---------------------------------------------------------------- */
/* Single-value tests — Catalogue §2                                */
/* ---------------------------------------------------------------- */
const singleValueTests: LabTestCatalogItem[] = [
  {
    id: 'lab-crp', code: 'CRP', name: 'CRP', fullName: 'C-Reactive Protein',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6, resultType: 'numeric',
    unit: 'mg/L', refMinMale: 0, refMaxMale: 5, refMinFemale: 0, refMaxFemale: 5,
    defaultPrice: 350, sampleVolumeMl: 2,
  },
  {
    id: 'lab-esr', code: 'ESR', name: 'ESR (1 hour)', fullName: 'Erythrocyte Sedimentation Rate',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'numeric',
    unit: 'mm/hr',
    refMinMale: 0, refMaxMale: 15,
    refMinFemale: 0, refMaxFemale: 20,
    defaultPrice: 150, sampleVolumeMl: 2,
  },
  {
    id: 'lab-hba', code: 'HBA1C', name: 'HbA1C', fullName: 'Glycated Haemoglobin',
    category: 'endocrinology', specimen: 'EDTA Blood', tatHours: 8, resultType: 'numeric',
    unit: '%', refMinMale: 0, refMaxMale: 5.7, refMinFemale: 0, refMaxFemale: 5.7,
    criticalHigh: 10.0,
    defaultPrice: 450, sampleVolumeMl: 2,
  },
  {
    id: 'lab-glu', code: 'GLU', name: 'Glucose', fullName: 'Blood Glucose',
    category: 'biochemistry', specimen: 'Fluoride Blood', tatHours: 2, resultType: 'numeric',
    unit: 'mg/dL', refMinMale: 70, refMaxMale: 100, refMinFemale: 70, refMaxFemale: 100,
    criticalLow: 50, criticalHigh: 400,
    requiresFasting: true, defaultPrice: 80, sampleVolumeMl: 2,
    orderSubtypes: [
      { code: 'fasting', label: 'Fasting' },
      { code: 'random', label: 'Random' },
      { code: 'pp', label: 'Post-Prandial (2hr PP)' },
    ],
  },
  {
    id: 'lab-bt', code: 'BT', name: 'Bleeding Time',
    category: 'hematology', specimen: 'Capillary Blood', tatHours: 1, resultType: 'numeric',
    unit: 'minutes', refMinMale: 2, refMaxMale: 7, refMinFemale: 2, refMaxFemale: 7,
    defaultPrice: 100,
  },
];

/* ---------------------------------------------------------------- */
/* Qualitative tests — Catalogue §3                                 */
/* ---------------------------------------------------------------- */
const qualitativeTests: LabTestCatalogItem[] = [
  {
    id: 'lab-hiv', code: 'HIV', name: 'HIV 1 & 2 Antibody', fullName: 'HIV 1 & 2 Screening',
    category: 'serology', specimen: 'Serum', tatHours: 24, resultType: 'reactive_nonreactive',
    qualitativeOptions: ['Non-Reactive', 'Reactive'],
    defaultPrice: 600, sampleVolumeMl: 2,
  },
  {
    id: 'lab-hcv', code: 'HCV', name: 'Anti-HCV', fullName: 'Hepatitis C Virus Antibody',
    category: 'serology', specimen: 'Serum', tatHours: 24, resultType: 'reactive_nonreactive',
    qualitativeOptions: ['Non-Reactive', 'Reactive'],
    defaultPrice: 600, sampleVolumeMl: 2,
  },
  {
    id: 'lab-hbs', code: 'HBSAG', name: 'HBsAg', fullName: 'Hepatitis B Surface Antigen',
    category: 'serology', specimen: 'Serum', tatHours: 24, resultType: 'reactive_nonreactive',
    qualitativeOptions: ['Non-Reactive', 'Reactive'],
    defaultPrice: 500, sampleVolumeMl: 2,
  },
  {
    id: 'lab-bgr-abo', code: 'ABO_GROUP', name: 'ABO Group',
    category: 'serology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'free_text',
    defaultPrice: 0,
  },
  {
    id: 'lab-bgr-rh', code: 'RH_FACTOR', name: 'Rh Factor',
    category: 'serology', specimen: 'EDTA Blood', tatHours: 4, resultType: 'positive_negative',
    qualitativeOptions: ['Positive', 'Negative'],
    defaultPrice: 0,
  },
];

/* ---------------------------------------------------------------- */
/* Public exports                                                   */
/* ---------------------------------------------------------------- */

/**
 * Every individual lab_tests row — components of every panel + every
 * single-value/qualitative test. ~50 rows, each with its own ref
 * ranges + result_type + unit. The tech’s result-entry form reads
 * from this list when expanding a panel into its constituents.
 */
export const mockLabComponents: LabTestCatalogItem[] = [
  ...cbcComponents,
  ...lftComponents,
  ...rftComponents,
  ...urineComponents,
  ...lipidComponents,
  ...singleValueTests,
  ...qualitativeTests,
];

/**
 * lab_test_panels — the bundles a doctor orders as one item.
 * Backend resolves panel → testCodes → N lab_order_items.
 */
export const mockLabPanels: LabTestPanel[] = [
  {
    id: 'pnl-cbc', panelCode: 'CBC', panelName: 'Complete Blood Count',
    category: 'hematology', specimen: 'EDTA Blood', tatHours: 4,
    testCodes: cbcComponents.map((c) => c.code),
    packagePrice: 350,
    description: 'Hb, RBC, WBC, differential, platelets, indices.',
  },
  {
    id: 'pnl-lft', panelCode: 'LFT', panelName: 'Liver Function Test',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6,
    testCodes: lftComponents.map((c) => c.code),
    packagePrice: 600, requiresFasting: true,
    description: 'Bilirubin (T/D/I), enzymes (SGOT/SGPT/ALP), proteins.',
  },
  {
    id: 'pnl-rft', panelCode: 'RFT', panelName: 'Renal Function Test',
    category: 'biochemistry', specimen: 'Serum', tatHours: 4,
    testCodes: rftComponents.map((c) => c.code),
    packagePrice: 600,
    description: 'Creatinine, Urea, BUN, Uric Acid, electrolytes, eGFR.',
  },
  {
    id: 'pnl-urn', panelCode: 'URN', panelName: 'Urine Routine & Microscopy',
    category: 'pathology', specimen: 'Urine', tatHours: 3,
    testCodes: urineComponents.map((c) => c.code),
    packagePrice: 200,
    description: 'Physical, chemical, and microscopic urine examination.',
  },
  {
    id: 'pnl-lipid', panelCode: 'LIPID', panelName: 'Lipid Profile',
    category: 'biochemistry', specimen: 'Serum', tatHours: 6,
    testCodes: lipidComponents.map((c) => c.code),
    packagePrice: 600, requiresFasting: true,
    description: 'TC, HDL, LDL (calc), VLDL (calc), Triglycerides, ratio.',
  },
  {
    id: 'pnl-bgr', panelCode: 'BGR', panelName: 'Blood Grouping (ABO + Rh)',
    category: 'serology', specimen: 'EDTA Blood', tatHours: 4,
    testCodes: ['ABO_GROUP', 'RH_FACTOR'],
    packagePrice: 200,
    description: 'ABO group + Rh factor — always reported together.',
  },
];

/**
 * What the doctor sees in the order picker — panels + standalone
 * tests they’d typically order on their own (CRP, ESR, HbA1C,
 * Glucose, BT, HIV, HCV, HBsAg, standalone Potassium for emergency).
 *
 * This shape mirrors `LabTestCatalogItem` so the existing OrdersPanel
 * code keeps working; panels are surfaced with `code === panelCode`.
 */
export const mockLabCatalog: LabTestCatalogItem[] = [
  // Panels (orderable as a whole)
  ...mockLabPanels.map<LabTestCatalogItem>((p) => ({
    id: p.id,
    code: p.panelCode,
    name: p.panelName,
    category: p.category,
    specimen: p.specimen,
    tatHours: p.tatHours ?? 6,
    resultType: 'numeric', // panels resolve to multiple results — type at component level
    defaultPrice: p.packagePrice,
    requiresFasting: p.requiresFasting,
  })),
  // Standalone single-value + qualitative tests (CRP, ESR, HbA1C, etc.)
  ...singleValueTests,
  ...qualitativeTests.filter((t) => t.code === 'HIV' || t.code === 'HCV' || t.code === 'HBSAG'),
  // Standalone Potassium (emergency hyperkalaemia rule-out)
  {
    id: 'lab-k-standalone', code: 'POTASSIUM_STAT', name: 'Potassium (STAT)', fullName: 'Serum Potassium',
    category: 'biochemistry', specimen: 'Serum', tatHours: 1, resultType: 'numeric',
    unit: 'mEq/L', refMinMale: 3.5, refMaxMale: 5.1, refMinFemale: 3.5, refMaxFemale: 5.1,
    criticalLow: 2.5, criticalHigh: 6.0,
    defaultPrice: 200, sampleVolumeMl: 2,
  },
];

/** Resolve a panel code → its component test rows (in order). */
export const resolvePanelToComponents = (panelCode: string): LabTestCatalogItem[] => {
  const panel = mockLabPanels.find((p) => p.panelCode === panelCode);
  if (!panel) return [];
  return panel.testCodes
    .map((code) => mockLabComponents.find((c) => c.code === code))
    .filter((c): c is LabTestCatalogItem => Boolean(c));
};
