import { useEffect, useRef, useState } from 'react';
import { Check, Paperclip, Plus, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  fetchLabCatalog,
  placeLabOrder,
  updateLabOrderPriority,
  type ClinicalPriority,
  type LabOrder,
  type LabTestCatalogItem,
} from '@/features/lab';
import {
  fetchRadiologyCatalog,
  placeRadiologyOrder,
  updateRadiologyOrderPriority,
  type RadiologyOrder,
  type RadiologyTestCatalogItem,
} from '@/features/radiology';
import type { PatientSummary } from '@/features/patient';
import { ReportViewerDialog, type ReportViewerInput } from './ReportViewerDialog';

interface OrdersPanelProps {
  opNumber: string;
  patient: PatientSummary;
  labOrders: LabOrder[];
  radiologyOrders: RadiologyOrder[];
  onPlacedLab: (orders: LabOrder[]) => void;
  onPlacedRadiology: (orders: RadiologyOrder[]) => void;
  onUpdateLab: (order: LabOrder) => void;
  onUpdateRadiology: (order: RadiologyOrder) => void;
  onRemoveLab: (id: string) => void;
  onRemoveRadiology: (id: string) => void;
  className?: string;
}

type OrderKind = 'lab' | 'rad';

type CombinedOrder =
  | { kind: 'lab'; order: LabOrder }
  | { kind: 'rad'; order: RadiologyOrder };

type EditingCell = { rowId: string; kind: OrderKind; field: 'priority' };

const cellInput =
  'w-full border-0 border-b border-hairline bg-transparent py-0.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary transition-colors';

const PRIORITY_OPTIONS: { value: ClinicalPriority; label: string }[] = [
  { value: 'routine', label: 'Routine' },
  { value: 'urgent',  label: 'Urgent'  },
  { value: 'stat',    label: 'STAT'    },
];

const priorityLabel = (p: ClinicalPriority | undefined): string => {
  if (!p) return '—';
  return PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? p;
};

const priorityToneClass = (p: ClinicalPriority | undefined): string => {
  if (p === 'stat')    return 'text-danger';
  if (p === 'urgent')  return 'text-warning';
  return 'text-foreground';
};

/** Human-readable status (snake_case → Title Case). */
const statusLabel = (s: string): string =>
  s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/**
 * Tick button paired with an active cell editor. `onMouseDown.preventDefault`
 * keeps focus on the editor so its `onBlur` (which also saves) can't race
 * with this click.
 */
function CellSaveButton({ onSave }: { onSave: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSave}
      title="Save"
      aria-label="Save"
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-primary/10 text-primary transition-colors hover:bg-primary/20"
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

export function OrdersPanel({
  opNumber,
  patient,
  labOrders,
  radiologyOrders,
  onPlacedLab,
  onPlacedRadiology,
  onUpdateLab,
  onUpdateRadiology,
  onRemoveLab,
  onRemoveRadiology,
  className,
}: OrdersPanelProps): JSX.Element {

  // ── Catalogs (fetched once) ─────────────────────────────────────────────────
  const [labCatalog, setLabCatalog] = useState<LabTestCatalogItem[]>([]);
  const [radCatalog, setRadCatalog] = useState<RadiologyTestCatalogItem[]>([]);

  useEffect(() => {
    void fetchLabCatalog().then(setLabCatalog);
    void fetchRadiologyCatalog().then(setRadCatalog);
  }, []);

  // ── Add-row state ───────────────────────────────────────────────────────────
  const [addOpen,     setAddOpen]     = useState(false);
  const [addType,     setAddType]     = useState<OrderKind>('lab');
  const [addQuery,    setAddQuery]    = useState('');
  const [addSelected, setAddSelected] = useState<LabTestCatalogItem | RadiologyTestCatalogItem | null>(null);
  const [addPriority, setAddPriority] = useState<ClinicalPriority>('routine');
  const [submitting,  setSubmitting]  = useState(false);
  const addSearchRef                  = useRef<HTMLInputElement>(null);

  // ── Per-cell edit state ─────────────────────────────────────────────────────
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draft,       setDraft]       = useState<string>('');

  // ── Report-viewer modal state ───────────────────────────────────────────────
  const [viewingReport, setViewingReport] = useState<ReportViewerInput>(null);

  // ── Derived: combined placed-orders list (newest at bottom) ─────────────────
  const allOrders: CombinedOrder[] = [
    ...labOrders.map((o) => ({ kind: 'lab' as const, order: o })),
    ...radiologyOrders.map((o) => ({ kind: 'rad' as const, order: o })),
  ].sort((a, b) => a.order.orderedAt.localeCompare(b.order.orderedAt));

  // ── Add handlers ────────────────────────────────────────────────────────────
  const activeCatalog: (LabTestCatalogItem | RadiologyTestCatalogItem)[] =
    addType === 'lab' ? labCatalog : radCatalog;

  const addResults: (LabTestCatalogItem | RadiologyTestCatalogItem)[] = (() => {
    const q = addQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return activeCatalog
      .filter((it) =>
        it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q),
      )
      .slice(0, 10);
  })();

  const getAddDropdownStyle = (): React.CSSProperties => {
    const rect = addSearchRef.current?.getBoundingClientRect();
    if (!rect) return { display: 'none' };
    return {
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 320),
      zIndex: 9999,
    };
  };

  const resetAdd = (): void => {
    setAddSelected(null);
    setAddQuery('');
    setAddPriority('routine');
  };

  const pickAddResult = (it: LabTestCatalogItem | RadiologyTestCatalogItem): void => {
    setAddSelected(it);
    setAddQuery(`${it.name} (${it.code})`);
  };

  const switchAddType = (next: OrderKind): void => {
    setAddType(next);
    // Switching catalog invalidates any prior pick + search.
    resetAdd();
  };

  /** Commit the add-row: places the order against the catalog item. */
  const submitAdd = async (): Promise<void> => {
    if (!addSelected) return;
    setSubmitting(true);
    try {
      if (addType === 'lab') {
        const labItem = addSelected as LabTestCatalogItem;
        // Default to the first subtype when the test has them (e.g. glucose).
        const subtypeMap: Record<string, string> = {};
        if (labItem.orderSubtypes?.length) {
          subtypeMap[labItem.code] = labItem.orderSubtypes[0].code;
        }
        onPlacedLab(
          await placeLabOrder(opNumber, [labItem.id], addPriority, patient, subtypeMap),
        );
      } else {
        const radItem = addSelected as RadiologyTestCatalogItem;
        onPlacedRadiology(
          await placeRadiologyOrder(opNumber, [radItem.id], addPriority, patient),
        );
      }
      // Leave add row open with reset state so the doctor can fire off
      // multiple orders in a row without re-opening.
      resetAdd();
    } finally {
      setSubmitting(false);
    }
  };

  const cancelAdd = (): void => {
    resetAdd();
    setAddOpen(false);
  };

  // ── Per-cell edit handlers ──────────────────────────────────────────────────
  const beginEdit = (kind: OrderKind, order: LabOrder | RadiologyOrder): void => {
    setAddOpen(false);
    setDraft(order.clinicalPriority ?? 'routine');
    setEditingCell({ rowId: order.id, kind, field: 'priority' });
  };

  const cancelEdit = (): void => {
    setEditingCell(null);
    setDraft('');
  };

  /** Commit the priority change for the currently-edited row. */
  const saveCell = async (kind: OrderKind, order: LabOrder | RadiologyOrder): Promise<void> => {
    if (!editingCell || editingCell.rowId !== order.id) return;
    const trimmed = draft.trim() as ClinicalPriority;
    if (!PRIORITY_OPTIONS.some((p) => p.value === trimmed)) return cancelEdit();
    if (order.clinicalPriority === trimmed) return cancelEdit();

    // Optimistic UI: update the consultation context immediately so the
    // pill repaints without waiting for the round-trip. Persist to
    // Supabase in the background — a synthetic (mock) id silently no-ops
    // inside the API helper, so doctor-side drafts still behave.
    if (kind === 'lab') {
      onUpdateLab({ ...(order as LabOrder), clinicalPriority: trimmed });
      void updateLabOrderPriority(order.id, trimmed);
    } else {
      onUpdateRadiology({ ...(order as RadiologyOrder), clinicalPriority: trimmed });
      void updateRadiologyOrderPriority(order.id, trimmed);
    }
    cancelEdit();
  };

  const removeOrder = (kind: OrderKind, id: string): void => {
    if (kind === 'lab') onRemoveLab(id);
    else                onRemoveRadiology(id);
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className={className} aria-label="Orders and investigations">

      {(allOrders.length > 0 || addOpen) && (
        <table className="min-w-full text-sm mb-3">
          <thead>
            <tr className="border-b border-hairline text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-8 py-2 pr-3">#</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Test</th>
              <th className="py-2 pr-4 font-mono">Code</th>
              <th className="py-2 pr-4">Priority</th>
              <th className="py-2 pr-4">Status</th>
              <th className="w-10 py-2" />
            </tr>
          </thead>

          <tbody>
            {allOrders.map(({ kind, order }, idx) => {
              const isPriorityEdit =
                editingCell?.rowId === order.id && editingCell.field === 'priority';

              return (
                <tr key={`${kind}-${order.id}`} className="border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/10">

                  {/* # */}
                  <td className="py-2.5 pr-3 align-top text-xs text-muted-foreground tabular-nums">
                    {idx + 1}
                  </td>

                  {/* Type */}
                  <td className="py-2.5 pr-4 align-top">
                    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {kind === 'lab' ? 'Lab' : 'Radiology'}
                    </span>
                  </td>

                  {/* Test name — identity, not editable */}
                  <td className="py-2.5 pr-4 align-top">
                    <span className="font-medium">{order.testName}</span>
                  </td>

                  {/* Code — derived from test, read-only */}
                  <td className="py-2.5 pr-4 align-top font-mono text-xs text-muted-foreground">
                    {order.testCode}
                  </td>

                  {/* Priority — click to edit */}
                  <td className="py-2.5 pr-4 align-top">
                    {isPriorityEdit ? (
                      <div className="flex items-center gap-1">
                        <select
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void saveCell(kind, order)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(kind, order);
                          }}
                          className={cellInput}
                        >
                          {PRIORITY_OPTIONS.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                        <CellSaveButton onSave={() => void saveCell(kind, order)} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(kind, order)}
                        aria-label={`Edit priority for ${order.testName}`}
                        className={cn(
                          'rounded-sm px-1 py-0.5 text-left font-medium transition-colors hover:bg-muted/30',
                          priorityToneClass(order.clinicalPriority),
                        )}
                      >
                        {priorityLabel(order.clinicalPriority)}
                      </button>
                    )}
                  </td>

                  {/* Status — workflow-driven, read-only */}
                  <td className="py-2.5 pr-4 align-top text-xs text-muted-foreground">
                    {statusLabel(order.status)}
                  </td>

                  {/* Row actions — paperclip when a result is available, plus delete.
                      "Available" means the order has reached a reported/released
                      state OR has a saved summary/pdf. Gating on reportPdfUrl
                      alone hid the button on past-visit rows that never got an
                      uploaded PDF but DO have a stored result the dialog can
                      render from order fields. */}
                  <td className="py-2.5 pr-4 align-top">
                    <div className="flex items-center gap-0.5">
                      {(order.status === 'reported'
                        || order.status === 'released'
                        || order.status === 'partially_reported'
                        || Boolean(order.resultSummary)
                        || Boolean(order.reportPdfUrl)) && (
                        <button
                          type="button"
                          onClick={() =>
                            setViewingReport(
                              kind === 'lab'
                                ? { kind: 'lab',       order: order as LabOrder,       patient }
                                : { kind: 'radiology', order: order as RadiologyOrder, patient },
                            )
                          }
                          aria-label={`Open report for ${order.testName}`}
                          title="Open report"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${order.testName}`}
                        onClick={() => removeOrder(kind, order.id)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Inline add row — creation flow with full-width search + selects */}
            {addOpen && (
              <tr className="border-b border-hairline">
                <td className="py-2.5 pr-3 align-top">
                  <Plus className="h-3.5 w-3.5 text-primary/60" />
                </td>

                {/* Type select */}
                <td className="py-2.5 pr-4 align-top">
                  <select
                    value={addType}
                    onChange={(e) => switchAddType(e.target.value as OrderKind)}
                    className={cellInput}
                    aria-label="Order type"
                  >
                    <option value="lab">Lab</option>
                    <option value="rad">Radiology</option>
                  </select>
                </td>

                {/* Test search */}
                <td className="py-2.5 pr-4 align-top min-w-[180px]" colSpan={2}>
                  {!addSelected ? (
                    <>
                      <input
                        ref={addSearchRef}
                        className={cellInput}
                        placeholder="Search test by name or code…"
                        value={addQuery}
                        onChange={(e) => setAddQuery(e.target.value)}
                        autoComplete="off"
                        autoFocus
                      />
                      {addResults.length > 0 && (
                        <ul
                          style={getAddDropdownStyle()}
                          className="max-h-48 overflow-auto rounded-md border border-hairline bg-background shadow-lg"
                        >
                          {addResults.map((it) => (
                            <li key={it.id}>
                              <button
                                type="button"
                                onClick={() => pickAddResult(it)}
                                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                              >
                                <span>
                                  <span className="font-medium">{it.name}</span>
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">{it.code}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{addSelected.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{addSelected.code}</span>
                      <button
                        type="button"
                        onClick={resetAdd}
                        className="text-[10px] text-primary hover:underline"
                      >
                        change
                      </button>
                    </div>
                  )}
                </td>

                {/* Priority */}
                <td className="py-2.5 pr-4 align-top">
                  <select
                    value={addPriority}
                    onChange={(e) => setAddPriority(e.target.value as ClinicalPriority)}
                    className={cellInput}
                    aria-label="Priority"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </td>

                {/* Status placeholder during add */}
                <td className="py-2.5 pr-4 align-top text-xs text-muted-foreground">
                  —
                </td>

                {/* ✓ commit + × cancel */}
                <td className="py-2.5 pr-4 align-top">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void submitAdd()}
                      disabled={!addSelected || submitting}
                      title="Place order"
                      className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-30"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelAdd}
                      title="Close"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* + Add test */}
      {!addOpen && (
        <button
          type="button"
          onClick={() => { cancelEdit(); setAddOpen(true); }}
          className={cn(
            'mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-medium transition-colors',
            allOrders.length === 0
              ? 'border-primary/40 text-primary hover:border-primary hover:bg-primary/5'
              : 'border-muted-foreground/25 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/[0.03]',
          )}
        >
          <Plus className="h-4 w-4" />
          Add test
        </button>
      )}

      <ReportViewerDialog value={viewingReport} onClose={() => setViewingReport(null)} />
    </div>
  );
}
