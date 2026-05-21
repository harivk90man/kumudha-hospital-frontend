/**
 * Pure helpers for calculated lab components + flag derivation.
 *
 * The catalogue (docs/02-catalogues/blood-test-catalogues.md) marks
 * several panel components as derived from siblings (e.g. Indirect
 * Bilirubin = Total − Direct). These run live in the tech’s
 * result-entry form so values update as the tech fills the inputs;
 * real backend recomputes server-side at result save so the wire
 * is the single source of truth.
 */

import type { LabResultFlag, LabTestCatalogItem } from './labTypes';

const round = (n: number, dp: number): number => {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
};

/**
 * Compute a calculated component’s value from the current numeric
 * inputs map (component code → numeric value). Returns `null` when
 * any required input is missing or the formula is invalid (e.g.
 * Friedewald LDL when triglycerides ≥ 400 mg/dL).
 */
export const calculateComponent = (
  code: string,
  inputs: Record<string, number | undefined>,
  patient: { ageYears: number; gender: 'm' | 'f' | 'o' },
): number | null => {
  switch (code) {
    case 'BIL_INDIRECT': {
      const t = inputs.BIL_TOTAL;
      const d = inputs.BIL_DIRECT;
      if (t == null || d == null) return null;
      return round(t - d, 2);
    }
    case 'GLOBULIN': {
      const tp = inputs.TOTAL_PROTEIN;
      const alb = inputs.ALBUMIN;
      if (tp == null || alb == null) return null;
      return round(tp - alb, 2);
    }
    case 'AG_RATIO': {
      const alb = inputs.ALBUMIN;
      const tp = inputs.TOTAL_PROTEIN;
      if (alb == null || tp == null) return null;
      const globulin = tp - alb;
      if (globulin === 0) return null;
      return round(alb / globulin, 2);
    }
    case 'BUN': {
      const u = inputs.UREA;
      if (u == null) return null;
      return round(u * 0.467, 1);
    }
    case 'EGFR': {
      // Simplified MDRD: 175 × Scr^-1.154 × Age^-0.203 × (0.742 if F).
      // Real labs use CKD-EPI 2021; close enough for the demo.
      const scr = inputs.CREATININE;
      if (scr == null || scr <= 0) return null;
      const female = patient.gender === 'f' ? 0.742 : 1;
      const egfr =
        175 *
        Math.pow(scr, -1.154) *
        Math.pow(Math.max(patient.ageYears, 1), -0.203) *
        female;
      return Math.round(egfr);
    }
    case 'LDL': {
      // Friedewald: TC − HDL − TG/5. Invalid when TG ≥ 400 (recommends
      // direct LDL instead).
      const tc = inputs.TOTAL_CHOL;
      const hdl = inputs.HDL;
      const tg = inputs.TRIGLYCERIDES;
      if (tc == null || hdl == null || tg == null) return null;
      if (tg >= 400) return null;
      return round(tc - hdl - tg / 5, 1);
    }
    case 'VLDL': {
      const tg = inputs.TRIGLYCERIDES;
      if (tg == null) return null;
      return round(tg / 5, 1);
    }
    case 'TC_HDL_RATIO': {
      const tc = inputs.TOTAL_CHOL;
      const hdl = inputs.HDL;
      if (tc == null || hdl == null || hdl === 0) return null;
      return round(tc / hdl, 2);
    }
    default:
      return null;
  }
};

/**
 * Derive a result flag from a numeric value + the component’s gender-
 * resolved ref range + critical thresholds. Real backend does the
 * same on result save (TSD-08 §4.6).
 */
export const computeFlag = (
  value: number,
  comp: Pick<
    LabTestCatalogItem,
    'refMinMale' | 'refMaxMale' | 'refMinFemale' | 'refMaxFemale' | 'criticalLow' | 'criticalHigh'
  >,
  gender: 'm' | 'f' | 'o',
): LabResultFlag => {
  const refMin = gender === 'f' ? comp.refMinFemale : comp.refMinMale;
  const refMax = gender === 'f' ? comp.refMaxFemale : comp.refMaxMale;
  if (comp.criticalLow != null && value <= comp.criticalLow) return 'critical_low';
  if (comp.criticalHigh != null && value >= comp.criticalHigh) return 'critical_high';
  if (refMin != null && value < refMin) return 'low';
  if (refMax != null && value > refMax) return 'high';
  return 'normal';
};

/** Severity order for picking the "worst" flag across panel components. */
const flagSeverity: Record<LabResultFlag, number> = {
  normal: 0,
  low: 1,
  high: 1,
  critical_low: 2,
  critical_high: 2,
};

export const worstFlag = (flags: Array<LabResultFlag | undefined>): LabResultFlag | undefined => {
  let worst: LabResultFlag | undefined;
  for (const f of flags) {
    if (!f) continue;
    if (!worst || flagSeverity[f] > flagSeverity[worst]) worst = f;
  }
  return worst;
};

/** Display the gender-resolved ref range as "X – Y" or empty if unspecified. */
export const formatRefRange = (
  comp: Pick<
    LabTestCatalogItem,
    'refMinMale' | 'refMaxMale' | 'refMinFemale' | 'refMaxFemale' | 'unit'
  >,
  gender: 'm' | 'f' | 'o',
): string => {
  const refMin = gender === 'f' ? comp.refMinFemale : comp.refMinMale;
  const refMax = gender === 'f' ? comp.refMaxFemale : comp.refMaxMale;
  if (refMin == null && refMax == null) return '';
  const unit = comp.unit ? ` ${comp.unit}` : '';
  if (refMin != null && refMax != null) return `${refMin}–${refMax}${unit}`;
  if (refMin != null) return `≥ ${refMin}${unit}`;
  if (refMax != null) return `≤ ${refMax}${unit}`;
  return '';
};
