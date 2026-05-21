import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Uuid } from '@/features/patient';

/**
 * Active billing-counter selection for the session. Persisted so a page
 * reload keeps the cashier on the same till — closing one shift and
 * opening another without re-picking the counter each time.
 *
 * Today the app ships with a single counter (`cnt-001`) and the
 * counter-switching UI is deferred — the field is wired end-to-end so
 * shift records and payments carry it, ready for N counters.
 */

export const DEFAULT_COUNTER_ID = 'cnt-001';

interface CurrentCounterState {
  counterId: Uuid;
  setCounter: (id: Uuid) => void;
}

export const useCurrentCounterStore = create<CurrentCounterState>()(
  persist(
    (set) => ({
      counterId: DEFAULT_COUNTER_ID,
      setCounter: (counterId) => set({ counterId }),
    }),
    { name: 'current-counter-v1' },
  ),
);
