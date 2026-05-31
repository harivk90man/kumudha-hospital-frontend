import { useCallback, useEffect, useRef, useState } from 'react';
import {
  amendConsultation,
  clearDraft,
  fetchConsultation,
  fetchDraft,
  lockConsultation,
  restoreDraft as apiRestoreDraft,
  saveDraft,
  updateConsultation,
  updateVitals as apiUpdateVitals,
} from '../consultationApi';
import type {
  ConsultationContext,
  ConsultationContextBase,
  ConsultationDraft,
  Vitals,
} from '../consultationTypes';

interface UseConsultationContextResult {
  data: ConsultationContext | null;
  loading: boolean;
  error: string | null;
  /** True when `data.lockedAt` is set — forms render read-only. */
  isLocked: boolean;
  refresh: () => Promise<void>;
  patch: (partial: Partial<ConsultationContext>) => Promise<void>;
  /** Amend the single OP vitals row (schema-11 §1). Server-side audit captures the diff. */
  updateVitals: (input: Partial<Vitals>) => Promise<void>;
  /* ---- Lock + amend (TSD-07 §4.2) ---- */
  /** Set `lockedAt` and freeze the consultation. */
  lock: () => Promise<void>;
  /** Audit-log a reason and unlock for editing in this session. */
  amend: (reason: string, summary?: string) => Promise<void>;
  /* ---- Draft state (TSD-07 §4.7) ---- */
  /** Outstanding restorable draft, if any. Null when none / already restored / cleared. */
  pendingDraft: ConsultationDraft | null;
  /** When the latest autosave completed (UI shows "Draft saved Xm ago"). */
  draftSavedAt: string | null;
  restoreDraft: () => Promise<void>;
  dismissDraft: () => Promise<void>;
}

const AUTOSAVE_DEBOUNCE_MS = 2000;

/** Pull the draftable subset out of a full context. Skips server-owned fields. */
const toDraftData = (ctx: ConsultationContext): Partial<ConsultationContextBase> => ({
  notes: ctx.notes,
  diagnoses: ctx.diagnoses,
  prescriptionItems: ctx.prescriptionItems,
  followUp: ctx.followUp,
  admission: ctx.admission,
  recommendations: ctx.recommendations,
  nextAction: ctx.nextAction,
});

/**
 * Loads consultation context for the active encounter.
 * Owns the in-flight loading + error UI state for consultation screens
 * AND the draft autosave/restore loop (TSD-07 §4.7).
 *
 * Autosave fires `AUTOSAVE_DEBOUNCE_MS` after the last `patch()` call. The
 * server stores `consultation_drafts` with a 7-day TTL and does NOT audit
 * each autosave (per TSD-07 §6); only restores are audited.
 *
 * Server cache for repeat fetches will move to TanStack Query when wired.
 */
export const useConsultationContext = (opNumber: string): UseConsultationContextResult => {
  const [data, setData] = useState<ConsultationContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<ConsultationDraft | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  /**
   * Per-session amend grant: when the doctor amends, we treat the consultation
   * as editable for the rest of the session even though `lockedAt` stays set.
   * The amendment row carries the reason + audit; the lock itself is permanent.
   */
  const [amendUnlocked, setAmendUnlocked] = useState<boolean>(false);

  // Debounce timer + latest snapshot ref so the timer always sees current data.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<ConsultationContext | null>(null);
  latestDataRef.current = data;

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [ctx, draft] = await Promise.all([
        fetchConsultation(opNumber),
        fetchDraft(opNumber),
      ]);
      setData(ctx);
      // Only surface a draft if it has actual content AND wasn’t already restored.
      const hasContent = draft && Object.keys(draft.draftData).length > 0;
      setPendingDraft(hasContent && !draft.restoredAt ? draft : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load consultation');
    } finally {
      setLoading(false);
    }
  }, [opNumber]);

  const scheduleAutosave = useCallback((): void => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void (async () => {
        const ctx = latestDataRef.current;
        if (!ctx) return;
        const saved = await saveDraft(opNumber, toDraftData(ctx));
        setDraftSavedAt(saved.lastSavedAt);
      })();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [opNumber]);

  const patch = useCallback(
    async (partial: Partial<ConsultationContext>): Promise<void> => {
      const next = await updateConsultation(opNumber, partial);
      setData(next);
      scheduleAutosave();
    },
    [opNumber, scheduleAutosave],
  );

  /**
   * Vitals amend — calls the dedicated PATCH endpoint. No autosave reschedule
   * needed: the PATCH itself persists; the draft autosave only covers fields
   * inside the consultation row (notes / diagnoses / Rx / advice / etc.).
   */
  const updateVitals = useCallback(
    async (input: Partial<Vitals>): Promise<void> => {
      const next = await apiUpdateVitals(opNumber, input);
      setData(next);
    },
    [opNumber],
  );

  const restoreDraft = useCallback(async (): Promise<void> => {
    const draft = await apiRestoreDraft(opNumber);
    if (!draft) {
      setPendingDraft(null);
      return;
    }
    // Apply draft contents on top of whatever the server just returned.
    const merged = await updateConsultation(opNumber, draft.draftData as Partial<ConsultationContext>);
    setData(merged);
    setDraftSavedAt(draft.lastSavedAt);
    setPendingDraft(null);
  }, [opNumber]);

  const dismissDraft = useCallback(async (): Promise<void> => {
    await clearDraft(opNumber);
    setPendingDraft(null);
  }, [opNumber]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cancel any pending autosave on unmount.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const lock = useCallback(async (): Promise<void> => {
    const next = await lockConsultation(opNumber);
    setData(next);
    setAmendUnlocked(false);
  }, [opNumber]);

  const amend = useCallback(
    async (reason: string, summary?: string): Promise<void> => {
      const next = await amendConsultation(opNumber, reason, summary);
      setData(next);
      setAmendUnlocked(true);
    },
    [opNumber],
  );

  const isLocked = Boolean(data?.lockedAt) && !amendUnlocked;

  return {
    data,
    loading,
    error,
    isLocked,
    refresh,
    patch,
    updateVitals,
    lock,
    amend,
    pendingDraft,
    draftSavedAt,
    restoreDraft,
    dismissDraft,
  };
};
