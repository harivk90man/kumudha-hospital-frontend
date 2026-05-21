import type { StatusPillProps } from '@/components/data-display';
import type { StockSeverity } from './inventoryTypes';

/**
 * Shared visual mapping for `StockSeverity` so every surface (inventory
 * clerk, pharmacist, doctor) shows the same colour + animation for the
 * same severity. Use these with `<StatusPill tone={...} pulse={...}>`.
 *
 * The breathing pulse is the "this item needs your attention" cue:
 *  - `low` / `near_expiry` → warning tone, breathe pulse
 *  - `out_of_stock` / `expired` → danger tone, breathe pulse
 *  - `ok` → no pulse
 */
export const severityTone: Record<StockSeverity, StatusPillProps['tone']> = {
  ok: 'success',
  low: 'warning',
  near_expiry: 'warning',
  out_of_stock: 'danger',
  expired: 'danger',
};

export const severityPulse: Record<StockSeverity, NonNullable<StatusPillProps['pulse']>> = {
  ok: 'none',
  low: 'breathe',
  near_expiry: 'breathe',
  out_of_stock: 'breathe',
  expired: 'breathe',
};

export const severityLabel: Record<StockSeverity, string> = {
  ok: 'OK',
  low: 'Low stock',
  near_expiry: 'Near expiry',
  out_of_stock: 'Out of stock',
  expired: 'Expired',
};
