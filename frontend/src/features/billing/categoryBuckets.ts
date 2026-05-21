import type { ServiceCategory } from './billingTypes';

/**
 * Seven-bucket roll-up used by collection analytics. Independent of the
 * physical-line `ServiceCategory` so the dashboard view can be widened
 * or narrowed without touching invoice data.
 *
 * Today's rules:
 *   - `radiology` lines roll up into the `lab` bucket — small clinics
 *     run them off the same diagnostics workflow and the user spec
 *     called for "Lab" as a single bucket.
 *   - everything else maps 1:1.
 */
export const ANALYTICS_CATEGORIES = [
  'consultation',
  'pharmacy',
  'lab',
  'procedure',
  'admission',
  'registration',
  'other',
] as const;

export type AnalyticsCategory = (typeof ANALYTICS_CATEGORIES)[number];

export const ANALYTICS_CATEGORY_LABEL: Record<AnalyticsCategory, string> = {
  consultation: 'Consultation',
  pharmacy:     'Pharmacy',
  lab:          'Lab',
  procedure:    'Procedure',
  admission:    'Admission',
  registration: 'Registration',
  other:        'Other',
};

export const bucketOf = (category: ServiceCategory): AnalyticsCategory => {
  if (category === 'radiology') return 'lab';
  return category;
};

export const emptyCategoryTotals = (): Record<AnalyticsCategory, number> => ({
  consultation: 0,
  pharmacy:     0,
  lab:          0,
  procedure:    0,
  admission:    0,
  registration: 0,
  other:        0,
});
