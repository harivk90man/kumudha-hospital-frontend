import { useEffect, useState } from 'react';
import { isShiftLocked, useShiftCloseStore, type ShiftLockState } from '../shiftCloseStore';
import { useCurrentCounterStore } from '../currentCounterStore';

/**
 * Live shift-lock subscription. Returns the lock state for "now" on
 * the active counter, recomputed every minute so the lock auto-flips
 * when the active shift's window rolls over (morning → evening at
 * 14:00).
 *
 * Used by every payment surface to disable the "Record payment" button
 * and surface a `<ShiftLockedBanner>` instead. The lock state carries
 * a `reason` (`'no_open' | 'closed'`) so banners can pick the right
 * copy and CTA.
 */
export function useShiftLock(): ShiftLockState {
  const closes = useShiftCloseStore((s) => s.closes);
  const opens = useShiftCloseStore((s) => s.opens);
  const counterId = useCurrentCounterStore((s) => s.counterId);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return isShiftLocked({ counterId, at: now, closes, opens });
}
