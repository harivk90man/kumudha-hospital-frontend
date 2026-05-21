import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Recently-viewed patients — feature-local persisted store. Powers the
 * top-bar’s "Recent patients" dropdown so staff can re-enter a patient
 * profile without re-typing the mobile/UHID. Capped at 8 to keep the
 * dropdown scannable; ordered MRU; deduped by UHID.
 *
 * Persistence: localStorage via Zustand `persist` middleware (per
 * CLAUDE.md §3.7). Survives reload + role-app switches.
 *
 * Per CLAUDE.md §3.6 lifting rule, this is feature-local because only
 * the patient feature writes (PatientProfilePage on mount) and only
 * AppTopBar reads. If a second consumer ever needs it (e.g., a
 * "patients I’ve handled today" report), promote to global store at
 * that point — not in anticipation.
 */

const MAX_RECENTS = 8;

export interface RecentPatient {
  uhid: string;
  fullName: string;
  /** ISO timestamp of the last view — drives display order. */
  viewedAt: string;
}

interface RecentsState {
  recent: RecentPatient[];
  /**
   * Prepend (or move-to-front if already present), then trim to MAX.
   * Stamps `viewedAt` server-tz-agnostic so the display can format it
   * relatively ("12m ago") without importing user locale state.
   */
  push: (input: { uhid: string; fullName: string }) => void;
  clear: () => void;
}

export const useRecentPatientsStore = create<RecentsState>()(
  persist(
    (set) => ({
      recent: [],
      push: ({ uhid, fullName }) =>
        set((state) => {
          const filtered = state.recent.filter((r) => r.uhid !== uhid);
          const next: RecentPatient = {
            uhid,
            fullName,
            viewedAt: new Date().toISOString(),
          };
          return { recent: [next, ...filtered].slice(0, MAX_RECENTS) };
        }),
      clear: () => set({ recent: [] }),
    }),
    { name: 'hms.patient.recents.v1' },
  ),
);
