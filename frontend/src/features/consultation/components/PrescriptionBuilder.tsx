import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Save, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { Combobox } from '@/components/form';
import { saveTemplateSchema, type SaveTemplateFormValues } from '../schemas/prescriptionSchemas';
import { STANDARD_FREQUENCIES, type FoodTiming, type PrescriptionItem, type PrescriptionItemRow } from '../consultationTypes';
import {
  AllergyAlertBanner,
  MedicineAvailabilityBadge,
  StockWarningBanner,
  findAllergyMatch,
  isStockBlocked,
  searchMedicines,
  type Medicine,
} from '@/features/inventory';
import type { PatientAllergy } from '@/features/patient';
import { PrescriptionTemplateSelector } from './PrescriptionTemplateSelector';
import { savePrescriptionTemplate } from '../consultationApi';
import { usePrescriptionTableStore, toCommittedItem } from '../prescriptionTableStore';

// ── Lookup tables ──────────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: 'OD',    label: 'OD — Once daily'          },
  { value: 'BD',    label: 'BD — Twice daily'          },
  { value: 'TDS',   label: 'TDS — Thrice daily'        },
  { value: 'QID',   label: 'QID — Four times daily'    },
  { value: 'SOS',   label: 'SOS — When needed'         },
  { value: 'HS',    label: 'HS — At bedtime'           },
  { value: 'STAT',  label: 'STAT — Immediately'        },
  { value: '1-0-1', label: '1-0-1 — Morning & night'   },
  { value: '1-1-1', label: '1-1-1 — Three times daily' },
  { value: '1-0-0', label: '1-0-0 — Morning only'      },
  { value: '0-0-1', label: '0-0-1 — Night only'        },
  { value: 'AC',    label: 'AC — Before meals'         },
  { value: 'PC',    label: 'PC — After meals'          },
];
const KNOWN_FREQS = new Set(FREQUENCY_OPTIONS.map((f) => f.value));
STANDARD_FREQUENCIES.filter((f) => !KNOWN_FREQS.has(f)).forEach((f) =>
  FREQUENCY_OPTIONS.push({ value: f, label: f }),
);

const ROUTE_OPTIONS: { value: string; label: string; short: string }[] = [
  { value: 'PO',    label: 'PO — Oral (by mouth)',   short: 'Oral'       },
  { value: 'IV',    label: 'IV — Intravenous',        short: 'IV'         },
  { value: 'IM',    label: 'IM — Intramuscular',      short: 'IM'         },
  { value: 'SC',    label: 'SC — Subcutaneous',       short: 'Subcut.'    },
  { value: 'SL',    label: 'SL — Sublingual',         short: 'Sublingual' },
  { value: 'INH',   label: 'INH — Inhalation',        short: 'Inhaled'    },
  { value: 'TOP',   label: 'TOP — Topical',           short: 'Topical'    },
  { value: 'RECT',  label: 'RECT — Rectal',           short: 'Rectal'     },
  { value: 'OPH',   label: 'OPH — Ophthalmic',        short: 'Eye drops'  },
  { value: 'NASAL', label: 'NASAL — Nasal',           short: 'Nasal'      },
  { value: 'OTIC',  label: 'OTIC — Ear drops',        short: 'Ear drops'  },
];

const FOOD_TIMING_OPTIONS: { value: FoodTiming; label: string }[] = [
  { value: 'After food',    label: 'After food'    },
  { value: 'Before food',   label: 'Before food'   },
  { value: 'With food',     label: 'With food'     },
  { value: 'Empty stomach', label: 'Empty stomach' },
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const fieldClass =
  'w-full border-0 border-b border-hairline bg-transparent pt-1.5 pb-0.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors';

const cellInput =
  'w-full border-0 border-b border-hairline bg-transparent py-0.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary transition-colors ' +
  'disabled:opacity-30 disabled:cursor-not-allowed';

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

// ── MedicineSearchCell ─────────────────────────────────────────────────────────

interface MedicineSearchCellProps {
  row: PrescriptionItemRow;
  onPick: (m: Medicine) => void;
}

function MedicineSearchCell({ row, onPick }: MedicineSearchCellProps): JSX.Element {
  const isDraft = row.medicineId === '';
  const [searching,  setSearching]  = useState(isDraft);
  const [query,      setQuery]      = useState(isDraft ? '' : `${row.medicineNameSnapshot} ${row.strength}`);
  const [results,    setResults]    = useState<Medicine[]>([]);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const searchRef                   = useRef<HTMLInputElement>(null);

  // When the user swaps medicine on a committed row (button → search input),
  // focus the input and pre-select its text so typing replaces it cleanly.
  useEffect(() => {
    if (!searching || isDraft) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [searching, isDraft]);

  const getDropdownStyle = (): React.CSSProperties => {
    const rect = searchRef.current?.getBoundingClientRect();
    if (!rect) return { display: 'none' };
    return { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 300), zIndex: 9999 };
  };

  const handleSearch = (q: string): void => {
    setQuery(q);
    setFocusedIdx(-1);                                  // fresh query → clear highlight
    if (q.length < 2) { setResults([]); return; }
    void searchMedicines(q).then(setResults);
  };

  const handlePick = (m: Medicine): void => {
    setSearching(false);
    setQuery(`${m.name} ${m.strength}`);
    setResults([]);
    setFocusedIdx(-1);
    onPick(m);
  };

  const handleBlur = (): void => {
    if (!isDraft) { setSearching(false); setResults([]); setFocusedIdx(-1); }
  };

  /**
   * ↓/↑ — move the highlight inside the dropdown
   * Enter on a highlighted result — pick it (then bubble so the row's Enter
   *   handler advances focus to the next field, Dosage)
   * Enter with no highlight — bubble untouched so the row handler advances
   * Escape — close the dropdown
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      if (results.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      setFocusedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusedIdx >= 0 && results[focusedIdx]) {
      e.preventDefault();                                // don't stopPropagation — let row advance
      handlePick(results[focusedIdx]);
    } else if (e.key === 'Escape' && results.length > 0) {
      e.stopPropagation();
      setResults([]);
      setFocusedIdx(-1);
    }
  };

  if (searching || isDraft) {
    return (
      <div className="relative">
        <input
          ref={searchRef}
          className={cellInput}
          placeholder="Search medicine…"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus={isDraft}
          autoComplete="off"
        />
        {results.length > 0 && (
          <ul
            style={getDropdownStyle()}
            className="max-h-48 overflow-auto rounded-md border border-hairline bg-background shadow-lg"
          >
            {results.map((m, idx) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  onClick={() => handlePick(m)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                    idx === focusedIdx ? 'bg-muted text-foreground' : 'hover:bg-muted',
                  )}
                >
                  <span>
                    <span className="font-medium">{m.name}</span>{' '}
                    <span className="text-muted-foreground">{m.strength} · {m.form}</span>
                  </span>
                  <MedicineAvailabilityBadge severity={m.severity} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setSearching(true)}
      className="flex flex-col items-start rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-muted/30"
    >
      <span className="font-medium">{row.medicineNameSnapshot}</span>
      <span className="text-xs text-muted-foreground">{row.strength}</span>
    </button>
  );
}

// ── PrescriptionRow ────────────────────────────────────────────────────────────

interface PrescriptionRowProps {
  row: PrescriptionItemRow;
  idx: number;
  allergies: PatientAllergy[];
  onUpdate: (patch: Partial<PrescriptionItemRow>) => void;
  onAddRow: () => void;
  onRemove: () => void;
}

function PrescriptionRow({ row, idx, allergies, onUpdate, onAddRow, onRemove }: PrescriptionRowProps): JSX.Element {
  const isDraft = row.medicineId === '';

  /**
   * View-vs-edit mode for committed rows. Draft rows are always editing.
   * Committed rows start in view mode; clicking any cell promotes to edit
   * mode; blurring out of the row (or focusing into another row, e.g. a
   * newly-added one) demotes back to view mode.
   */
  const [editing,           setEditing]           = useState(isDraft);
  const [pendingFocusCell,  setPendingFocusCell]  = useState<string | null>(null);
  const trRef                                     = useRef<HTMLTableRowElement>(null);

  // After flipping to edit mode, focus the cell the user clicked on.
  useEffect(() => {
    if (!(editing && pendingFocusCell && trRef.current)) return;
    const cell = trRef.current.querySelector<HTMLElement>(`[data-cell="${pendingFocusCell}"]`);
    if (cell) {
      const target = cell.querySelector<HTMLElement>('input, select, button');
      target?.focus();
    }
    setPendingFocusCell(null);
  }, [editing, pendingFocusCell]);

  const handlePickMedicine = (m: Medicine): void => {
    onUpdate({
      medicineId: m.id,
      medicineNameSnapshot: m.name,
      strength: m.strength,
      severity: m.severity,
    });
  };

  const allergyMatch = !isDraft ? findAllergyMatch(allergies, { id: row.medicineId, name: row.medicineNameSnapshot, strength: row.strength, severity: row.severity } as Medicine) : null;
  const blocked = !isDraft && isStockBlocked(row.severity);

  /**
   * Per-row banner dismissal. Banners (stock + allergy) appear by default;
   * doctor can ✕ them — the corresponding badge on the medicine cell stays
   * as the persistent indicator and re-toggles the banner when clicked.
   * Resets whenever the medicine changes (fresh warnings for the new drug).
   */
  const [bannersDismissed, setBannersDismissed] = useState<Set<'stock' | 'allergy'>>(new Set());
  useEffect(() => { setBannersDismissed(new Set()); }, [row.medicineId]);

  const toggleBanner = (type: 'stock' | 'allergy'): void => {
    setBannersDismissed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const showStockBanner   = !isDraft && row.severity !== 'ok' && !bannersDismissed.has('stock');
  const showAllergyBanner = !isDraft && !!allergyMatch       && !bannersDismissed.has('allergy');

  const handleCellClick = (field: string): void => {
    if (!isDraft && !editing) {
      setEditing(true);
      setPendingFocusCell(field);
    }
  };

  /** When focus leaves the row, switch committed rows back to view mode. */
  const handleRowBlur = (e: React.FocusEvent<HTMLTableRowElement>): void => {
    if (isDraft) return;                                                  // drafts always editing
    if (trRef.current?.contains(e.relatedTarget as Node | null)) return;  // focus still inside row
    setEditing(false);
  };

  /**
   * Enter → focus the next input/select in this row.
   * Alt+Enter → append a new row.
   * Enter on the last field is a no-op (stays put).
   */
  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>): void => {
    if (e.key !== 'Enter') return;
    if (e.altKey) {
      e.preventDefault();
      onAddRow();
      return;
    }
    const target = e.target as HTMLElement;
    const tr = target.closest('tr');
    if (!tr) return;
    const fields = Array.from(
      tr.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([disabled]), select:not([disabled])')
    );
    const fieldIdx = fields.indexOf(target as HTMLInputElement | HTMLSelectElement);
    if (fieldIdx >= 0 && fieldIdx + 1 < fields.length) {
      e.preventDefault();
      fields[fieldIdx + 1].focus();
    } else if (fieldIdx === fields.length - 1) {
      e.preventDefault();
    }
  };

  const showEdit = isDraft || editing;
  const viewText = 'block rounded-sm px-1 py-0.5 text-sm cursor-text hover:bg-muted/20';

  return (
    <>
      <tr
        ref={trRef}
        className="border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/10"
        onBlur={handleRowBlur}
        onKeyDown={handleRowKeyDown}
      >

        {/* + add row button */}
        <td className="py-2.5 pr-3 align-top w-8">
          <button
            type="button"
            onClick={onAddRow}
            title="Add new row"
            className="flex h-6 w-6 items-center justify-center rounded text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </td>

        {/* # */}
        <td className="py-2.5 pr-3 align-top w-8 text-xs text-muted-foreground tabular-nums">
          {isDraft ? '' : idx + 1}
        </td>

        {/* Medicine */}
        <td
          className="py-2.5 pr-4 align-top min-w-[170px]"
          data-cell="medicine"
          onClick={() => handleCellClick('medicine')}
        >
          {showEdit ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <MedicineSearchCell row={row} onPick={handlePickMedicine} />
              {!isDraft && (row.severity !== 'ok' ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleBanner('stock'); }}
                  title={bannersDismissed.has('stock') ? 'Show stock warning' : 'Hide stock warning'}
                  className="rounded-full transition-shadow hover:ring-2 hover:ring-current/30"
                >
                  <MedicineAvailabilityBadge severity={row.severity} compact />
                </button>
              ) : (
                <MedicineAvailabilityBadge severity={row.severity} compact />
              ))}
              {!isDraft && allergyMatch && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleBanner('allergy'); }}
                  title={bannersDismissed.has('allergy') ? 'Show allergy alert' : 'Hide allergy alert'}
                  className="inline-flex items-center gap-0.5 rounded-full border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger transition-shadow hover:ring-2 hover:ring-danger/30"
                >
                  <ShieldAlert className="h-2.5 w-2.5" /> Allergy
                </button>
              )}
              {row.overrideReason && (
                <span
                  title={row.overrideReason}
                  className="inline-flex items-center gap-0.5 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger"
                >
                  <ShieldAlert className="h-2.5 w-2.5" /> Override
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={viewText}>
                <span className="font-medium">{row.medicineNameSnapshot}</span>{' '}
                <span className="text-xs text-muted-foreground">{row.strength}</span>
              </span>
              {row.severity !== 'ok' ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleBanner('stock'); }}
                  title={bannersDismissed.has('stock') ? 'Show stock warning' : 'Hide stock warning'}
                  className="rounded-full transition-shadow hover:ring-2 hover:ring-current/30"
                >
                  <MedicineAvailabilityBadge severity={row.severity} compact />
                </button>
              ) : (
                <MedicineAvailabilityBadge severity={row.severity} compact />
              )}
              {allergyMatch && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleBanner('allergy'); }}
                  title={bannersDismissed.has('allergy') ? 'Show allergy alert' : 'Hide allergy alert'}
                  className="inline-flex items-center gap-0.5 rounded-full border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger transition-shadow hover:ring-2 hover:ring-danger/30"
                >
                  <ShieldAlert className="h-2.5 w-2.5" /> Allergy
                </button>
              )}
              {row.overrideReason && (
                <span
                  title={row.overrideReason}
                  className="inline-flex items-center gap-0.5 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger"
                >
                  <ShieldAlert className="h-2.5 w-2.5" /> Override
                </span>
              )}
            </div>
          )}
        </td>

        {/* Dosage */}
        <td
          className="py-2.5 pr-4 align-top"
          data-cell="dosage"
          onClick={() => handleCellClick('dosage')}
        >
          {showEdit ? (
            <input
              className={cellInput}
              placeholder="1 tab"
              value={row.dosage}
              onChange={(e) => onUpdate({ dosage: e.target.value })}
            />
          ) : (
            <span className={viewText}>{row.dosage || '—'}</span>
          )}
        </td>

        {/* Frequency */}
        <td
          className="py-2.5 pr-4 align-top min-w-[130px]"
          data-cell="frequency"
          onClick={() => handleCellClick('frequency')}
        >
          {showEdit ? (
            <Combobox
              className={cellInput}
              placeholder="e.g. 1-0-1, BD"
              value={row.frequency}
              options={FREQUENCY_OPTIONS}
              onChange={(v) => onUpdate({ frequency: v })}
            />
          ) : (
            <span className={viewText}>{row.frequency || '—'}</span>
          )}
        </td>

        {/* Route */}
        <td
          className="py-2.5 pr-4 align-top"
          data-cell="route"
          onClick={() => handleCellClick('route')}
        >
          {showEdit ? (
            <Combobox
              className={cellInput}
              placeholder="e.g. PO"
              value={row.route}
              options={ROUTE_OPTIONS}
              onChange={(v) => onUpdate({ route: v })}
            />
          ) : (
            <span className={viewText}>{row.route || '—'}</span>
          )}
        </td>

        {/* Days */}
        <td
          className="py-2.5 pr-4 align-top"
          data-cell="durationDays"
          onClick={() => handleCellClick('durationDays')}
        >
          {showEdit ? (
            <input
              type="number"
              min={1}
              max={180}
              className={cn(cellInput, 'w-14')}
              placeholder="—"
              value={row.durationDays ?? ''}
              onChange={(e) => onUpdate({ durationDays: e.target.value === '' ? null : Number(e.target.value) })}
            />
          ) : (
            <span className={cn(viewText, 'tabular-nums')}>
              {row.durationDays ? `${row.durationDays}d` : '—'}
            </span>
          )}
        </td>

        {/* Food Timing */}
        <td
          className="py-2.5 pr-4 align-top min-w-[120px]"
          data-cell="foodTiming"
          onClick={() => handleCellClick('foodTiming')}
        >
          {showEdit ? (
            <Combobox
              className={cellInput}
              value={row.foodTiming}
              options={FOOD_TIMING_OPTIONS}
              onChange={(v) => onUpdate({ foodTiming: v as FoodTiming })}
            />
          ) : (
            <span className={viewText}>{row.foodTiming || '—'}</span>
          )}
        </td>

        {/* Instructions */}
        <td
          className="py-2.5 pr-4 align-top"
          data-cell="instructions"
          onClick={() => handleCellClick('instructions')}
        >
          {showEdit ? (
            <input
              className={cellInput}
              placeholder="e.g. Avoid driving"
              value={row.instructions ?? ''}
              onChange={(e) => onUpdate({ instructions: e.target.value || undefined })}
            />
          ) : (
            <span className={cn(viewText, 'text-muted-foreground')}>
              {row.instructions || '—'}
            </span>
          )}
        </td>

        {/* Delete */}
        <td className="py-2.5 align-top">
          <button
            type="button"
            aria-label={isDraft ? 'Remove row' : `Remove ${row.medicineNameSnapshot}`}
            onClick={onRemove}
            title="Remove row"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {/* Allergy / stock warning — spans full row. Each banner is dismissible;
          the badge on the medicine cell remains as the persistent indicator and
          re-toggles the banner when clicked. */}
      {(showAllergyBanner || showStockBanner) && (
        <tr className="border-b border-hairline">
          <td colSpan={10} className="pb-3 pt-1 pr-4">
            {showAllergyBanner && (
              <AllergyAlertBanner
                match={allergyMatch!}
                medicine={{ id: row.medicineId, name: row.medicineNameSnapshot, strength: row.strength, severity: row.severity } as Medicine}
                onDismiss={() => toggleBanner('allergy')}
              />
            )}
            {showStockBanner && row.severity !== 'ok' && (
              <StockWarningBanner
                severity={row.severity}
                medicineName={row.medicineNameSnapshot}
                message={blocked
                  ? 'blocked: enter override reason in the instructions field.'
                  : `stock low — consider an alternative.`}
                onDismiss={() => toggleBanner('stock')}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── PrescriptionBuilder ────────────────────────────────────────────────────────

interface PrescriptionBuilderProps {
  initialItems: PrescriptionItem[];
  allergies: PatientAllergy[];
  /** Called whenever committed rows change — wired to patch() → autosave in ConsultationPage. */
  onPrescriptionChange: (items: PrescriptionItem[]) => void;
  className?: string;
}

export function PrescriptionBuilder({
  initialItems, allergies, onPrescriptionChange, className,
}: PrescriptionBuilderProps): JSX.Element {
  const rows               = usePrescriptionTableStore((s) => s.rows);
  const initRows           = usePrescriptionTableStore((s) => s.initRows);
  const addRow             = usePrescriptionTableStore((s) => s.addRow);
  const updateRow          = usePrescriptionTableStore((s) => s.updateRow);
  const removeRow          = usePrescriptionTableStore((s) => s.removeRow);
  const appendCommittedRows = usePrescriptionTableStore((s) => s.appendCommittedRows);

  const [savingTpl, setSavingTpl] = useState(false);

  const tplForm = useForm<SaveTemplateFormValues>({
    resolver: zodResolver(saveTemplateSchema),
    defaultValues: { name: '' },
  });

  // Hydrate store once on mount
  useEffect(() => {
    initRows(initialItems);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent whenever committed rows change → triggers patch() → 2s debounce autosave
  const prevCommittedRef = useRef('');
  useEffect(() => {
    const committed = rows.filter((r) => r.medicineId !== '').map(toCommittedItem);
    const json = JSON.stringify(committed);
    if (json !== prevCommittedRef.current) {
      prevCommittedRef.current = json;
      onPrescriptionChange(committed);
    }
  }, [rows, onPrescriptionChange]);

  const handleLoadTemplate = (items: PrescriptionItem[]): void => {
    const stamped = items.map((i) => ({
      ...i,
      id: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }));
    appendCommittedRows(stamped);
  };

  const submitTemplate = tplForm.handleSubmit(async (v) => {
    const committed = rows.filter((r) => r.medicineId !== '').map(toCommittedItem);
    await savePrescriptionTemplate(v.name, committed);
    setSavingTpl(false);
    tplForm.reset();
  });

  return (
    <div className={className} aria-label="Prescription">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className={labelClass}>Prescription</span>
        <div className="flex flex-wrap gap-2">
          <PrescriptionTemplateSelector onLoad={handleLoadTemplate} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSavingTpl((v) => !v)}
            disabled={rows.every((r) => r.medicineId === '')}
          >
            <Save /> Save as template
          </Button>
        </div>
      </div>

      {/* Save template form */}
      {savingTpl && (
        <form onSubmit={submitTemplate} className="flex items-end gap-3 border-b border-hairline pb-4 mb-4">
          <label className="flex flex-1 flex-col gap-1">
            <span className={labelClass}>Template name *</span>
            <input
              {...tplForm.register('name')}
              className={fieldClass}
              placeholder="e.g. OA Knee — symptomatic"
              autoFocus
            />
            {tplForm.formState.errors.name && (
              <span className="text-xs text-danger">{tplForm.formState.errors.name.message}</span>
            )}
          </label>
          <Button type="submit" size="sm">Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSavingTpl(false)}>Cancel</Button>
        </form>
      )}

      {/* Allergy banner */}
      {allergies.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm mb-4" role="note">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="font-medium text-warning">Known allergies:</span>
            {allergies.map((a) => (
              <span
                key={`${a.allergen}-${a.drugClassCode ?? 'na'}`}
                className="inline-flex items-center rounded-full bg-warning/12 px-2 py-px text-xxs font-medium text-warning"
              >
                {a.allergen}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <table className="min-w-full text-sm mb-3">
        <thead>
          <tr className="border-b border-hairline text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <th className="w-8 py-2 pr-3" />
            <th className="w-8 py-2 pr-3">#</th>
            <th className="py-2 pr-4">Medicine</th>
            <th className="py-2 pr-4">Dosage</th>
            <th className="py-2 pr-4">Frequency</th>
            <th className="py-2 pr-4">Route</th>
            <th className="py-2 pr-4">Days</th>
            <th className="py-2 pr-4">Food Timing</th>
            <th className="py-2 pr-4">Instructions</th>
            <th className="w-10 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <PrescriptionRow
              key={row.rowId}
              row={row}
              idx={rows.filter((r, i) => !r.medicineId === false && i < idx).length}
              allergies={allergies}
              onUpdate={(patch) => updateRow(row.rowId, patch)}
              onAddRow={addRow}
              onRemove={() => removeRow(row.rowId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
