/**
 * Central GST/tax-rate configuration. This is the single place to change
 * a default tax rate for the entire app — pharmacy, lab, radiology,
 * consultation. Catalogue rows can still override per-SKU when needed
 * (e.g. a specific HSN-coded medicine that sits on a different slab).
 *
 * Real backend will own this in a `tax_rates` table joined per service /
 * medicine; this file is the FE-side source of truth until then. When the
 * backend lands, replace the imports with values fetched from
 * `/api/config/tax-rates` and keep this file as the type-only contract.
 */

import type { ServiceCategory } from '@/features/billing';

/** Indian GST slabs used by the app. Numeric value is the percent. */
export const GST_SLABS = {
  EXEMPT: 0,
  ESSENTIAL: 5,   // most lab tests, pharma essentials
  STANDARD: 12,   // most pharma, radiology
  ELEVATED: 18,   // procedures, premium consumables
  LUXURY: 28,     // unused today; placeholder for completeness
} as const;

export type GstSlab = (typeof GST_SLABS)[keyof typeof GST_SLABS];

/**
 * Default GST percent per service category. A catalogue row may override
 * its own `gstPct`; reads SHOULD prefer the row value when present and
 * fall back to this map.
 */
export const DEFAULT_GST_BY_CATEGORY: Record<ServiceCategory, GstSlab> = {
  consultation: GST_SLABS.EXEMPT,
  lab:          GST_SLABS.ESSENTIAL,
  radiology:    GST_SLABS.STANDARD,
  pharmacy:     GST_SLABS.STANDARD,
  procedure:    GST_SLABS.ELEVATED,
  admission:    GST_SLABS.EXEMPT,
  registration: GST_SLABS.EXEMPT,
  other:        GST_SLABS.STANDARD,
};

/** Default GST applied to any medicine that doesn’t carry its own rate. */
export const MEDICINE_DEFAULT_GST: GstSlab = DEFAULT_GST_BY_CATEGORY.pharmacy;

/**
 * Resolve the GST percent for a service category, with an optional
 * row-level override. The override wins so per-SKU oddities (HSN-driven
 * differences) stay correct.
 */
export const resolveGstPct = (
  category: ServiceCategory,
  rowOverride?: number,
): number =>
  typeof rowOverride === 'number' ? rowOverride : DEFAULT_GST_BY_CATEGORY[category];
