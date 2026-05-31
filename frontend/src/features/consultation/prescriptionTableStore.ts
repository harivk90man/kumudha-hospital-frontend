import { create } from 'zustand';
import type { PrescriptionItem, PrescriptionItemRow } from './consultationTypes';

// ── Helpers ────────────────────────────────────────────────────────────────────

export const newDraftRow = (): PrescriptionItemRow => ({
  rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  medicineId: '',
  medicineNameSnapshot: '',
  strength: '',
  dosage: '',
  frequency: '',
  route: 'PO',
  durationDays: null,
  foodTiming: 'After food',
  severity: 'ok',
});

const toRow = (item: PrescriptionItem): PrescriptionItemRow => ({
  rowId: item.id,
  id: item.id,
  medicineId: item.medicineId,
  medicineNameSnapshot: item.medicineNameSnapshot,
  strength: item.strength,
  dosage: item.dosage,
  frequency: item.frequency,
  route: item.route,
  durationDays: item.durationDays,
  foodTiming: item.foodTiming ?? 'After food',
  instructions: item.instructions,
  severity: item.severity,
  quantityPrescribed: item.quantityPrescribed,
  dispensedQty: item.dispensedQty,
  overrideReason: item.overrideReason,
  overriddenBy: item.overriddenBy,
  overriddenAt: item.overriddenAt,
});

/** Converts a committed row back to a PrescriptionItem for the server. */
export const toCommittedItem = (row: PrescriptionItemRow): PrescriptionItem => ({
  id: row.id ?? row.rowId,
  medicineId: row.medicineId,
  medicineNameSnapshot: row.medicineNameSnapshot,
  strength: row.strength,
  dosage: row.dosage,
  frequency: row.frequency,
  route: row.route,
  durationDays: row.durationDays ?? 1,
  foodTiming: row.foodTiming,
  instructions: row.instructions || undefined,
  severity: row.severity,
  ...(row.quantityPrescribed != null && { quantityPrescribed: row.quantityPrescribed }),
  ...(row.dispensedQty        != null && { dispensedQty: row.dispensedQty }),
  ...(row.overrideReason               && { overrideReason: row.overrideReason }),
  ...(row.overriddenBy                 && { overriddenBy: row.overriddenBy }),
  ...(row.overriddenAt                 && { overriddenAt: row.overriddenAt }),
});

// ── Store ──────────────────────────────────────────────────────────────────────

interface PrescriptionTableState {
  rows: PrescriptionItemRow[];
  /** Called once on page load to hydrate from server data. Always appends one empty draft row. */
  initRows: (items: PrescriptionItem[]) => void;
  /** Appends a new empty draft row at the bottom. */
  addRow: () => void;
  /** Patches any field(s) on a single row. */
  updateRow: (rowId: string, patch: Partial<PrescriptionItemRow>) => void;
  /** Removes a row. If removing would leave zero rows, replaces with a single empty draft row. */
  removeRow: (rowId: string) => void;
  /** Appends template items as committed rows (used by PrescriptionTemplateSelector). */
  appendCommittedRows: (items: PrescriptionItem[]) => void;
}

export const usePrescriptionTableStore = create<PrescriptionTableState>((set) => ({
  rows: [newDraftRow()],

  initRows: (items) => set({
    rows: items.length > 0 ? [...items.map(toRow), newDraftRow()] : [newDraftRow()],
  }),

  addRow: () => set((s) => ({ rows: [...s.rows, newDraftRow()] })),

  updateRow: (rowId, patch) => set((s) => ({
    rows: s.rows.map((r) => r.rowId === rowId ? { ...r, ...patch } : r),
  })),

  removeRow: (rowId) => set((s) => {
    const filtered = s.rows.filter((r) => r.rowId !== rowId);
    return { rows: filtered.length > 0 ? filtered : [newDraftRow()] };
  }),

  appendCommittedRows: (items) => set((s) => ({
    rows: [...s.rows, ...items.map(toRow)],
  })),
}));
