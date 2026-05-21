import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaymentMethod } from './billingTypes';
import type { Uuid } from '@/features/patient';
import {
  ANALYTICS_CATEGORIES,
  emptyCategoryTotals,
  type AnalyticsCategory,
} from './categoryBuckets';
import { DEFAULT_COUNTER_ID } from './currentCounterStore';

/**
 * Shift open/close — kept feature-local because real backend will own
 * the audit-grade ledger (shift_closes table, signed PDFs, variance
 * flag thresholds). This store gives the cashier a working surface to
 * open + close shifts on a counter during demo / mock-mode without a
 * backend.
 *
 * Persisted to localStorage so a shift survives a page reload (the
 * common "browser crashed during count" case) and the cashier can
 * resume the count without losing tallies.
 *
 * **Lock semantics (2026-05 refresh).** A counter starts LOCKED for
 * every active shift — payments fail until an `open_shift`-capable
 * user (owner / chief_doctor) declares an opening float. Closing a
 * shift re-locks the counter until the next opening event. See
 * `isShiftLocked` for the full state machine.
 */

/** Two operational shifts per day. */
export type ShiftType = 'morning' | 'evening';

/** Default window for each shift (24h local). The mock window is
 *  hard-coded; real backend will read tenant-configurable slots. */
export const SHIFT_WINDOWS: Record<ShiftType, { startHour: number; endHour: number }> = {
  morning: { startHour: 6, endHour: 14 },
  evening: { startHour: 14, endHour: 22 },
};

/**
 * Per-method system-vs-declared snapshot. `systemTotal` is what the
 * payments table says was received in this window; `declaredTotal` is
 * what the cashier actually counted. Variance = declared − system.
 */
export interface ShiftMethodTotal {
  method: PaymentMethod;
  systemTotal: number;
  declaredTotal: number;
}

export interface ShiftCloseRecord {
  /** Stable id — used by re-print + audit links. */
  id: string;
  counterId: Uuid;
  shiftType: ShiftType;
  /** Calendar date the shift belongs to (yyyy-mm-dd). */
  shiftDate: string;
  /** ISO timestamps for the wire window the close covers. */
  windowFrom: string;
  windowTo: string;
  /** Cashier-declared opening float (cash they started with). */
  openingFloat: number;
  /** Per-method system-vs-declared snapshot. */
  methodTotals: ShiftMethodTotal[];
  /** Per-category collection totals — snapshot of the analytics view
   *  at close time so historical re-prints stay numerically stable
   *  even if invoice lines are edited later. */
  categoryTotals: Record<AnalyticsCategory, number>;
  /** Sum of systemTotal across methods. */
  systemGrandTotal: number;
  /** Sum of declaredTotal across methods. */
  declaredGrandTotal: number;
  /** declaredGrandTotal − systemGrandTotal. Positive = excess cash, negative = short. */
  variance: number;
  /** Optional cashier note — explanation for variance, batch handover, etc. */
  notes?: string;
  closedAt: string;
  closedByName: string;
  closedByRole: string;
}

/**
 * "Shift opened" event — required to take payments on a counter.
 * Created by owner / chief_doctor at start of shift. Captures the
 * physical cash already in the drawer (`openingFloat`) so the close
 * reconciliation has a baseline.
 */
export interface ShiftOpenRecord {
  id: string;
  counterId: Uuid;
  shiftType: ShiftType;
  shiftDate: string;
  openedAt: string;
  openedByName: string;
  openedByRole: string;
  /** Cash declared in the drawer at open time. */
  openingFloat: number;
  /** Optional notes — handover context, opening crew, etc. */
  notes?: string;
}

interface ShiftCloseState {
  closes: ShiftCloseRecord[];
  opens: ShiftOpenRecord[];
  recordClose: (close: ShiftCloseRecord) => void;
  /** Most-recent close for a given counter+shift+date. */
  closeFor: (
    counterId: Uuid,
    shiftType: ShiftType,
    shiftDate: string,
  ) => ShiftCloseRecord | undefined;
  recordOpen: (open: ShiftOpenRecord) => void;
  openFor: (
    counterId: Uuid,
    shiftType: ShiftType,
    shiftDate: string,
  ) => ShiftOpenRecord | undefined;
  listCloses: (q?: string) => ShiftCloseRecord[];
  clearAll: () => void;
}

export const useShiftCloseStore = create<ShiftCloseState>()(
  persist(
    (set, get) => ({
      closes: [],
      opens: [],
      recordClose: (close) =>
        set((s) => ({ closes: [close, ...s.closes] })),
      closeFor: (counterId, shiftType, shiftDate) =>
        get().closes.find(
          (c) =>
            c.counterId === counterId &&
            c.shiftType === shiftType &&
            c.shiftDate === shiftDate,
        ),
      recordOpen: (open) =>
        set((s) => ({ opens: [open, ...s.opens] })),
      openFor: (counterId, shiftType, shiftDate) =>
        get().opens.find(
          (o) =>
            o.counterId === counterId &&
            o.shiftType === shiftType &&
            o.shiftDate === shiftDate,
        ),
      listCloses: (q) => {
        const all = get().closes;
        if (!q) return all;
        const needle = q.toLowerCase();
        return all.filter((c) =>
          c.id.toLowerCase().includes(needle) ||
          c.closedByName.toLowerCase().includes(needle) ||
          c.shiftDate.toLowerCase().includes(needle),
        );
      },
      clearAll: () => set({ closes: [], opens: [] }),
    }),
    { name: 'cashier-shift-closes-v2' },
  ),
);

/**
 * Compute the next shift after the given one. morning → evening of
 * the same day; evening → morning of the next day. Used by the
 * "Open next shift" action to know which row to write.
 */
export const nextShiftAfter = (
  shiftType: ShiftType,
  shiftDate: string,
): { shiftType: ShiftType; shiftDate: string } => {
  if (shiftType === 'morning') {
    return { shiftType: 'evening', shiftDate };
  }
  const day = dayFromIso(shiftDate);
  day.setDate(day.getDate() + 1);
  return { shiftType: 'morning', shiftDate: isoDay(day) };
};

export interface ResolvedShift {
  shiftType: ShiftType;
  /** yyyy-mm-dd of the shift's owning calendar day. */
  shiftDate: string;
  windowFrom: Date;
  windowTo: Date;
}

const isoDay = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dayFromIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/**
 * Resolve a specific shift+date pair to a window. Used by the page
 * when the user explicitly switches shifts (e.g. closing yesterday's
 * morning at midnight). Different from `resolveActiveShift` which
 * derives the shift from the current time.
 */
export const resolveShift = (
  shiftType: ShiftType,
  shiftDate: string,
): ResolvedShift => {
  const day = dayFromIso(shiftDate);
  const window = SHIFT_WINDOWS[shiftType];
  const windowFrom = new Date(day);
  windowFrom.setHours(window.startHour, 0, 0, 0);
  const windowTo = new Date(day);
  windowTo.setHours(window.endHour, 0, 0, 0);
  return { shiftType, shiftDate, windowFrom, windowTo };
};

/**
 * Resolve the active shift for a given moment. The "active" shift is
 * the one whose window contains `at` — morning before 14:00 local,
 * evening from 14:00 onwards. Times outside both default windows
 * still resolve (the closer of the two so the cashier can close
 * late).
 */
export const resolveActiveShift = (at: Date = new Date()): ResolvedShift => {
  const hour = at.getHours();
  const shiftType: ShiftType = hour < SHIFT_WINDOWS.morning.endHour ? 'morning' : 'evening';
  return resolveShift(shiftType, isoDay(at));
};

/**
 * Why the till is locked. Drives the banner copy + CTA copy.
 *   - `no_open`: the active shift on this counter has never been
 *     opened. Owner / chief doctor must declare an opening float.
 *   - `closed`: the active shift was opened AND closed; the counter is
 *     locked until the next shift's open event.
 */
export type ShiftLockReason = 'no_open' | 'closed';

export interface ShiftLockState {
  /** True when the counter is locked and payments must be blocked. */
  locked: boolean;
  /** Counter the lock is computed for. */
  counterId: Uuid;
  /** The shift the lock applies to (the user's "right now" shift). */
  activeShift: ResolvedShift;
  /** Why the lock is on — drives banner copy. Undefined when unlocked. */
  reason?: ShiftLockReason;
  /** The close record causing the lock (when reason === 'closed'). */
  closedShift?: ShiftCloseRecord;
  /** The open record currently holding the till unlocked. */
  openShift?: ShiftOpenRecord;
  /** Earliest moment the lock can auto-release (closed-shift window end).
   *  Only meaningful when `reason === 'closed'`. */
  unlocksAt?: Date;
}

/**
 * Compute the lock state for a moment in time, on a specific counter.
 *
 * **Locked-by-default**: a counter with no `ShiftOpenRecord` for its
 * active shift starts locked — payments fail until someone with
 * `open_shift` declares an opening float. Closing a shift re-locks the
 * counter until the next shift's open event.
 *
 * State machine for counter C at moment T (with `active = resolveActiveShift(T)`):
 *   1. find any close C/active → if present, `locked: true, reason: 'closed'`
 *   2. find any open  C/active → if present, `locked: false`
 *   3. otherwise → `locked: true, reason: 'no_open'`
 */
export interface IsShiftLockedInput {
  counterId: Uuid;
  at: Date;
  closes: ShiftCloseRecord[];
  opens: ShiftOpenRecord[];
}

export const isShiftLocked = (input: IsShiftLockedInput): ShiftLockState => {
  const { counterId, at, closes, opens } = input;
  const active = resolveActiveShift(at);

  const closed = closes.find(
    (c) =>
      c.counterId === counterId &&
      c.shiftType === active.shiftType &&
      c.shiftDate === active.shiftDate,
  );
  if (closed) {
    return {
      locked: true,
      counterId,
      activeShift: active,
      reason: 'closed',
      closedShift: closed,
      unlocksAt: new Date(closed.windowTo),
    };
  }

  const opened = opens.find(
    (o) =>
      o.counterId === counterId &&
      o.shiftType === active.shiftType &&
      o.shiftDate === active.shiftDate,
  );
  if (opened) {
    return {
      locked: false,
      counterId,
      activeShift: active,
      openShift: opened,
    };
  }

  return {
    locked: true,
    counterId,
    activeShift: active,
    reason: 'no_open',
  };
};

/** Empty totals helper — re-exported for callers that build a close record. */
export const blankCategoryTotals = (): Record<AnalyticsCategory, number> =>
  emptyCategoryTotals();

/** Re-export so consumers don't need to chase the categoryBuckets module. */
export { ANALYTICS_CATEGORIES, DEFAULT_COUNTER_ID };
export type { AnalyticsCategory };
