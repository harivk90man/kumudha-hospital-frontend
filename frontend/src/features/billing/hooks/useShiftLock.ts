import { useEffect, useState } from 'react';
import { isShiftLocked, resolveActiveShift, useShiftCloseStore, type ShiftLockState } from '../shiftCloseStore';
import { useCurrentCounterStore } from '../currentCounterStore';
import { fetchActiveCashSession } from '../billingApi';

/**
 * Live shift-lock subscription. Returns the lock state for "now" on
 * the active counter, recomputed every minute so the lock auto-flips
 * when the active shift's window rolls over (morning → evening at
 * 14:00).
 *
 * Cross-machine sync: every minute we also poll Supabase for the
 * canonical open `cash_sessions` row on this counter. If a different
 * terminal has opened the till and this browser's local Zustand store
 * doesn't reflect it yet, we mirror the open record locally so the
 * lock banner / payment buttons unlock here too. The local store stays
 * as the read source because it's fast + offline-safe; the DB poll is
 * a sync correction, not the primary source.
 *
 * Used by every payment surface to disable the "Record payment" button
 * and surface a `<ShiftLockedBanner>` instead. The lock state carries
 * a `reason` (`'no_open' | 'closed'`) so banners can pick the right
 * copy and CTA.
 */
export function useShiftLock(): ShiftLockState {
  const closes = useShiftCloseStore((s) => s.closes);
  const opens = useShiftCloseStore((s) => s.opens);
  const openFor = useShiftCloseStore((s) => s.openFor);
  const recordOpen = useShiftCloseStore((s) => s.recordOpen);
  const counterId = useCurrentCounterStore((s) => s.counterId);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Hydrate local store from DB so a second machine sees the shift another
  // machine already opened. Cheap query (one row), so polling every minute
  // is fine for the demo.
  //
  // Forgiving label match: ANY open cash_sessions row on this counter
  // for today unlocks the till, regardless of session_label. A cashier
  // who opens "Today morning" by mistake at 4 PM still gets to collect
  // payments — the real-world morning→evening handover distinction is
  // a payroll/audit concern that's not demo-relevant.
  useEffect(() => {
    let alive = true;
    const sync = async (): Promise<void> => {
      const dbSession = await fetchActiveCashSession(counterId);
      if (!alive || !dbSession) return;
      const active = resolveActiveShift(new Date());
      if (openFor(counterId, active.shiftType, active.shiftDate)) return;
      recordOpen({
        id:            dbSession.id,
        counterId,
        shiftType:     active.shiftType,
        shiftDate:     active.shiftDate,
        openedAt:      dbSession.openedAt,
        openedByName:  dbSession.openedByName,
        openedByRole:  'cashier',
        openingFloat:  dbSession.openingFloat,
      });
    };
    void sync();
    const t = window.setInterval(() => { void sync(); }, 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [counterId, openFor, recordOpen]);

  return isShiftLocked({ counterId, at: now, closes, opens });
}
