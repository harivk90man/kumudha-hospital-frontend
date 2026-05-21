import type { InvoiceLine, Payment } from './billingTypes';
import {
  bucketOf,
  emptyCategoryTotals,
  type AnalyticsCategory,
} from './categoryBuckets';

type LineLike = Pick<InvoiceLine, 'category' | 'lineTotal'>;
type PaymentLike = Pick<Payment, 'amount'>;

/**
 * Allocate a payment amount proportionally across the invoice's line
 * categories. Returns a bucket → ₹ map that sums to `payment.amount`
 * within ₹0.01 (rounding residual lands in the largest bucket).
 *
 * Used by the shift-close + owner-dashboard analytics; the read path
 * keeps allocation derived rather than denormalised so editing an
 * invoice line after a partial payment doesn't drift the per-category
 * totals.
 *
 * Edge cases:
 *   - Invoice with zero gross (refund / advance) → entire amount lands
 *     in `other` so it stays visible in the dashboard.
 *   - Negative `payment.amount` (refund) → allocations are negative
 *     with the same proportional split so the bucket totals deflate
 *     correctly when the dashboard re-aggregates.
 */
export function allocatePaymentToCategories(
  payment: PaymentLike,
  lines: LineLike[],
): Record<AnalyticsCategory, number> {
  const totals = emptyCategoryTotals();
  const grossTotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  if (grossTotal <= 0) {
    totals.other = round2(payment.amount);
    return totals;
  }

  let allocated = 0;
  let largestBucket: AnalyticsCategory = 'other';
  let largestShare = -Infinity;

  for (const line of lines) {
    const bucket = bucketOf(line.category);
    const share = (line.lineTotal / grossTotal) * payment.amount;
    const rounded = round2(share);
    totals[bucket] = round2(totals[bucket] + rounded);
    allocated += rounded;
    if (line.lineTotal > largestShare) {
      largestShare = line.lineTotal;
      largestBucket = bucket;
    }
  }

  const residual = round2(payment.amount - allocated);
  if (residual !== 0) {
    totals[largestBucket] = round2(totals[largestBucket] + residual);
  }
  return totals;
}

/**
 * Sum allocations across a list of (payment, invoice) pairs. Used by
 * the shift-close + owner-dashboard renderers to roll up a window of
 * payments into a single 7-bucket histogram.
 */
export function sumCategoryAllocations(
  rows: { payment: PaymentLike; lines: LineLike[] }[],
): Record<AnalyticsCategory, number> {
  const totals = emptyCategoryTotals();
  for (const row of rows) {
    const split = allocatePaymentToCategories(row.payment, row.lines);
    for (const key of Object.keys(totals) as AnalyticsCategory[]) {
      totals[key] = round2(totals[key] + split[key]);
    }
  }
  return totals;
}

const round2 = (n: number): number => Number(n.toFixed(2));
