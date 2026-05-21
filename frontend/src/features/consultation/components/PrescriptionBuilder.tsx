import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Plus, Save, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import {
  prescriptionItemSchema,
  saveTemplateSchema,
  type PrescriptionItemFormValues,
  type SaveTemplateFormValues,
} from '../schemas/prescriptionSchemas';
import { STANDARD_FREQUENCIES, type PrescriptionItem } from '../consultationTypes';
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

const FREQ_SHORT: Record<string, string> = Object.fromEntries(
  FREQUENCY_OPTIONS.map((f) => [f.value, (f.label.split(' — ')[1] ?? f.value)]),
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
const routeShort = (code: string): string =>
  ROUTE_OPTIONS.find((r) => r.value === code)?.short ?? code;

// ── Styles ─────────────────────────────────────────────────────────────────────

const fieldClass =
  'w-full border-0 border-b border-hairline bg-transparent pt-1.5 pb-0.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors';

const cellInput =
  'w-full border-0 border-b border-hairline bg-transparent py-0.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary transition-colors';

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

// ── Helpers ────────────────────────────────────────────────────────────────────

interface PrescriptionBuilderProps {
  items: PrescriptionItem[];
  allergies: PatientAllergy[];
  onAddItem: (item: PrescriptionItem) => Promise<void> | void;
  onRemoveItem: (id: string) => Promise<void> | void;
  /** Atomic in-place update — avoids the stale-closure duplicate when editing. */
  onUpdateItem: (item: PrescriptionItem) => Promise<void> | void;
  onLoadTemplate: (items: PrescriptionItem[]) => Promise<void> | void;
  className?: string;
}


function buildItem(v: PrescriptionItemFormValues, severity: Medicine['severity']): PrescriptionItem {
  return {
    id: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    medicineId: v.medicineId, medicineNameSnapshot: v.medicineNameSnapshot,
    strength: v.strength, dosage: v.dosage, frequency: v.frequency,
    route: v.route, durationDays: v.durationDays, instructions: v.instructions,
    severity,
    ...(typeof v.quantityPrescribed === 'number' && v.quantityPrescribed > 0
      ? { quantityPrescribed: v.quantityPrescribed, dispensedQty: 0 } : {}),
    ...(isStockBlocked(severity) && v.overrideReason
      ? { overrideReason: v.overrideReason, overriddenAt: new Date().toISOString() } : {}),
  };
}

type CellField = 'medicine' | 'dosage' | 'frequency' | 'route' | 'durationDays' | 'instructions';
type EditingCell = { rowId: string; field: CellField };

/**
 * Tick button paired with an active cell editor. `onMouseDown.preventDefault`
 * keeps focus on the input so the input's `onBlur` (which also saves) can't
 * race with this click.
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

// ── PrescriptionBuilder ────────────────────────────────────────────────────────

export function PrescriptionBuilder({
  items, allergies, onAddItem, onRemoveItem, onUpdateItem, onLoadTemplate, className,
}: PrescriptionBuilderProps): JSX.Element {
  // ── Add-row state ───────────────────────────────────────────────────────────
  const [adding,   setAdding]   = useState(false);
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<Medicine[]>([]);
  const [selected, setSelected] = useState<Medicine | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const searchRef               = useRef<HTMLInputElement>(null);

  // ── Per-cell edit state ─────────────────────────────────────────────────────
  const [editingCell,         setEditingCell]         = useState<EditingCell | null>(null);
  const [draft,               setDraft]               = useState<string>('');
  const [medicineEditResults, setMedicineEditResults] = useState<Medicine[]>([]);
  const editSearchRef                                  = useRef<HTMLInputElement>(null);

  const itemForm = useForm<PrescriptionItemFormValues>({
    resolver: zodResolver(prescriptionItemSchema),
    defaultValues: {
      medicineId: '', medicineNameSnapshot: '', strength: '',
      dosage: '', frequency: '', route: '',
      durationDays: undefined as unknown as number,
      instructions: '', overrideReason: '',
    },
  });

  const tplForm = useForm<SaveTemplateFormValues>({
    resolver: zodResolver(saveTemplateSchema),
    defaultValues: { name: '' },
  });

  // ── Dropdown styles (fixed-position to escape overflow:hidden) ──────────────
  const getAddDropdownStyle = (): React.CSSProperties => {
    const rect = searchRef.current?.getBoundingClientRect();
    if (!rect) return { display: 'none' };
    return { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 300), zIndex: 9999 };
  };

  const getEditDropdownStyle = (): React.CSSProperties => {
    const rect = editSearchRef.current?.getBoundingClientRect();
    if (!rect) return { display: 'none' };
    return { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 300), zIndex: 9999 };
  };

  // ── Add handlers ────────────────────────────────────────────────────────────
  const onSearch = (q: string): void => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    void searchMedicines(q).then(setResults);
  };

  const pick = (m: Medicine): void => {
    setSelected(m);
    itemForm.reset({
      medicineId: m.id, medicineNameSnapshot: m.name, strength: m.strength,
      dosage: '', frequency: '', route: '',
      durationDays: undefined as unknown as number,
      instructions: '', overrideReason: '',
    });
    setQuery(`${m.name} ${m.strength}`);
    setResults([]);
  };

  const resetAdd = (): void => {
    setSelected(null); setQuery(''); setResults([]);
    itemForm.reset({
      medicineId: '', medicineNameSnapshot: '', strength: '',
      dosage: '', frequency: '', route: '',
      durationDays: undefined as unknown as number,
      instructions: '', overrideReason: '',
    });
  };

  /** Commit directly — no staging. Row immediately appears in the table above. */
  const submitAdd = itemForm.handleSubmit(async (v) => {
    if (!selected) return;
    const blocked = isStockBlocked(selected.severity);
    if (blocked && (!v.overrideReason || v.overrideReason.trim().length < 8)) {
      itemForm.setError('overrideReason', { message: 'Override reason required (min 8 chars).' });
      return;
    }
    await onAddItem(buildItem(v, selected.severity));
    resetAdd(); // keep add row open for next medicine
  });

  // ── Per-cell edit handlers ──────────────────────────────────────────────────
  const beginEdit = (it: PrescriptionItem, field: CellField): void => {
    setAdding(false);
    const initial =
      field === 'medicine'      ? `${it.medicineNameSnapshot} ${it.strength}` :
      field === 'dosage'        ? it.dosage :
      field === 'frequency'     ? it.frequency :
      field === 'route'         ? it.route :
      field === 'durationDays'  ? String(it.durationDays) :
                                  (it.instructions ?? '');
    setDraft(initial);
    setEditingCell({ rowId: it.id, field });
    setMedicineEditResults([]);
  };

  const cancelEdit = (): void => {
    setEditingCell(null);
    setDraft('');
    setMedicineEditResults([]);
  };

  const onEditMedicineSearch = (q: string): void => {
    setDraft(q);
    if (q.length < 2) { setMedicineEditResults([]); return; }
    void searchMedicines(q).then(setMedicineEditResults);
  };

  /**
   * Commit the currently-edited cell. Required fields revert silently if
   * blanked. Medicine cell is pick-only — manual blur cancels without save.
   */
  const saveCell = async (it: PrescriptionItem): Promise<void> => {
    if (!editingCell || editingCell.rowId !== it.id) return;
    const field = editingCell.field;

    // Medicine swap requires picking a result; raw text isn't a valid identity.
    if (field === 'medicine') return cancelEdit();

    const trimmed = draft.trim();

    // Required-field guards — silent revert keeps the row from getting
    // half-erased by an accidental blur.
    if (field === 'dosage'        && !trimmed) return cancelEdit();
    if (field === 'frequency'     && !trimmed) return cancelEdit();
    if (field === 'route'         && !trimmed) return cancelEdit();
    if (field === 'durationDays') {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 1 || n > 180) return cancelEdit();
    }

    const current =
      field === 'dosage'        ? it.dosage :
      field === 'frequency'     ? it.frequency :
      field === 'route'         ? it.route :
      field === 'durationDays'  ? String(it.durationDays) :
                                  (it.instructions ?? '');
    if (current === trimmed) return cancelEdit();

    const updated: PrescriptionItem = {
      ...it,
      ...(field === 'dosage'        && { dosage: trimmed }),
      ...(field === 'frequency'     && { frequency: trimmed }),
      ...(field === 'route'         && { route: trimmed }),
      ...(field === 'durationDays'  && { durationDays: Number(trimmed) }),
      ...(field === 'instructions'  && { instructions: trimmed || undefined }),
    };
    await onUpdateItem(updated);
    cancelEdit();
  };

  /**
   * Picking a medicine in edit mode atomically rewrites identity + severity.
   * Existing overrideReason is preserved (if any) — switching to a freshly
   * blocked medicine without an override is left to the parent save flow.
   */
  const pickMedicineForEdit = async (it: PrescriptionItem, m: Medicine): Promise<void> => {
    const updated: PrescriptionItem = {
      ...it,
      medicineId: m.id,
      medicineNameSnapshot: m.name,
      strength: m.strength,
      severity: m.severity,
    };
    await onUpdateItem(updated);
    cancelEdit();
  };

  const submitTemplate = tplForm.handleSubmit(async (v) => {
    await savePrescriptionTemplate(v.name, items);
    setSavingTpl(false); tplForm.reset();
  });

  const allergyMatch = selected ? findAllergyMatch(allergies, selected) : null;
  const blocked       = selected ? isStockBlocked(selected.severity) : false;

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className={className} aria-label="Prescription">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className={labelClass}>Prescription</span>
        <div className="flex flex-wrap gap-2">
          <PrescriptionTemplateSelector onLoad={onLoadTemplate} />
          <Button type="button" size="sm" variant="outline"
            onClick={() => setSavingTpl((v) => !v)} disabled={items.length === 0}>
            <Save /> Save as template
          </Button>
        </div>
      </div>

      {/* Save template */}
      {savingTpl && (
        <form onSubmit={submitTemplate} className="flex items-end gap-3 border-b border-hairline pb-4 mb-4">
          <label className="flex flex-1 flex-col gap-1">
            <span className={labelClass}>Template name *</span>
            <input {...tplForm.register('name')} className={fieldClass}
              placeholder="e.g. OA Knee — symptomatic" autoFocus />
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
              <span key={`${a.allergen}-${a.drugClassCode ?? 'na'}`}
                className="inline-flex items-center rounded-full bg-warning/12 px-2 py-px text-xxs font-medium text-warning">
                {a.allergen}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      {(items.length > 0 || adding) && (
        <table className="min-w-full text-sm mb-3">
          <thead>
            <tr className="border-b border-hairline text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-8 py-2 pr-3">#</th>
              <th className="py-2 pr-4">Medicine</th>
              <th className="py-2 pr-4">Dosage</th>
              <th className="py-2 pr-4">Frequency</th>
              <th className="py-2 pr-4">Route</th>
              <th className="py-2 pr-4">Days</th>
              <th className="py-2 pr-4">Instructions</th>
              <th className="w-10 py-2" />
            </tr>
          </thead>

          <tbody>
            {/* ── Committed rows ────────────────────────────────────────── */}
            {items.map((it, idx) => {
              const dispensed = it.dispensedQty ?? 0;
              const fullyDone = typeof it.quantityPrescribed === 'number' && dispensed >= it.quantityPrescribed;
              const partial   = typeof it.quantityPrescribed === 'number' && dispensed > 0 && !fullyDone;

              const isMedicineEdit     = editingCell?.rowId === it.id && editingCell.field === 'medicine';
              const isDosageEdit       = editingCell?.rowId === it.id && editingCell.field === 'dosage';
              const isFrequencyEdit    = editingCell?.rowId === it.id && editingCell.field === 'frequency';
              const isRouteEdit        = editingCell?.rowId === it.id && editingCell.field === 'route';
              const isDaysEdit         = editingCell?.rowId === it.id && editingCell.field === 'durationDays';
              const isInstructionsEdit = editingCell?.rowId === it.id && editingCell.field === 'instructions';

              return (
                <tr key={it.id} className="border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/10">

                  {/* # */}
                  <td className="py-2.5 pr-3 align-top text-xs text-muted-foreground tabular-nums">{idx + 1}</td>

                  {/* Medicine — click name/strength to swap for a search input */}
                  <td className="py-2.5 pr-4 align-top min-w-[170px]">
                    {isMedicineEdit ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={editSearchRef}
                          autoFocus
                          value={draft}
                          onChange={(e) => onEditMedicineSearch(e.target.value)}
                          onBlur={() => cancelEdit()}
                          onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
                          className={cellInput}
                          placeholder="Search medicine…"
                          autoComplete="off"
                        />
                        {medicineEditResults.length > 0 && (
                          <ul
                            style={getEditDropdownStyle()}
                            className="max-h-48 overflow-auto rounded-md border border-hairline bg-background shadow-lg"
                          >
                            {medicineEditResults.map((m) => (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  onMouseDown={(ev) => ev.preventDefault()}
                                  onClick={() => void pickMedicineForEdit(it, m)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
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
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => beginEdit(it, 'medicine')}
                          aria-label={`Change medicine for ${it.medicineNameSnapshot}`}
                          className="rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-muted/30"
                        >
                          <span className="font-medium">{it.medicineNameSnapshot}</span>{' '}
                          <span className="text-xs text-muted-foreground">{it.strength}</span>
                        </button>
                        <MedicineAvailabilityBadge severity={it.severity} compact />
                        {it.overrideReason && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger" title={it.overrideReason}>
                            <ShieldAlert className="h-2.5 w-2.5" /> Override
                          </span>
                        )}
                        {typeof it.quantityPrescribed === 'number' && it.quantityPrescribed > 0 && (
                          <span className={cn(
                            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            fullyDone ? 'bg-success/15 text-success' :
                            partial   ? 'bg-warning/15 text-warning' :
                            'bg-muted text-muted-foreground',
                          )}>
                            {dispensed}/{it.quantityPrescribed}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Dosage */}
                  <td className="py-2.5 pr-4 align-top">
                    {isDosageEdit ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void saveCell(it)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(it);
                          }}
                          className={cellInput}
                          placeholder="1 tab"
                        />
                        <CellSaveButton onSave={() => void saveCell(it)} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(it, 'dosage')}
                        aria-label={`Edit dosage for ${it.medicineNameSnapshot}`}
                        className="w-full rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-muted/30"
                      >
                        {it.dosage}
                      </button>
                    )}
                  </td>

                  {/* Frequency */}
                  <td className="py-2.5 pr-4 align-top min-w-[130px]">
                    {isFrequencyEdit ? (
                      <div className="flex items-center gap-1">
                        <select
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void saveCell(it)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(it);
                          }}
                          className={cellInput}
                        >
                          {FREQUENCY_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                        <CellSaveButton onSave={() => void saveCell(it)} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(it, 'frequency')}
                        aria-label={`Edit frequency for ${it.medicineNameSnapshot}`}
                        className="w-full rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-muted/30"
                      >
                        <div className="font-medium">{it.frequency}</div>
                        {FREQ_SHORT[it.frequency] && (
                          <div className="text-[10px] text-muted-foreground">{FREQ_SHORT[it.frequency]}</div>
                        )}
                      </button>
                    )}
                  </td>

                  {/* Route */}
                  <td className="py-2.5 pr-4 align-top">
                    {isRouteEdit ? (
                      <div className="flex items-center gap-1">
                        <select
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void saveCell(it)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(it);
                          }}
                          className={cellInput}
                        >
                          {ROUTE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <CellSaveButton onSave={() => void saveCell(it)} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(it, 'route')}
                        aria-label={`Edit route for ${it.medicineNameSnapshot}`}
                        className="w-full rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-muted/30"
                      >
                        <div className="font-medium">{it.route}</div>
                        <div className="text-[10px] text-muted-foreground">{routeShort(it.route)}</div>
                      </button>
                    )}
                  </td>

                  {/* Days */}
                  <td className="py-2.5 pr-4 align-top">
                    {isDaysEdit ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={180}
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void saveCell(it)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(it);
                          }}
                          className={cn(cellInput, 'w-14')}
                        />
                        <CellSaveButton onSave={() => void saveCell(it)} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(it, 'durationDays')}
                        aria-label={`Edit duration for ${it.medicineNameSnapshot}`}
                        className="rounded-sm px-1 py-0.5 text-left tabular-nums transition-colors hover:bg-muted/30"
                      >
                        {it.durationDays}d
                      </button>
                    )}
                  </td>

                  {/* Instructions */}
                  <td className="py-2.5 pr-4 align-top">
                    {isInstructionsEdit ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void saveCell(it)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(it);
                          }}
                          className={cellInput}
                          placeholder="After food…"
                        />
                        <CellSaveButton onSave={() => void saveCell(it)} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(it, 'instructions')}
                        aria-label={`Edit instructions for ${it.medicineNameSnapshot}`}
                        className="w-full rounded-sm px-1 py-0.5 text-left text-muted-foreground transition-colors hover:bg-muted/30"
                      >
                        {it.instructions || '—'}
                      </button>
                    )}
                  </td>

                  {/* Row delete — kept */}
                  <td className="py-2.5 pr-4 align-top">
                    <button
                      type="button"
                      aria-label={`Remove ${it.medicineNameSnapshot}`}
                      onClick={() => void onRemoveItem(it.id)}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* ── Add row — whole-row creation flow, unchanged ─────────── */}
            {adding && (
              <>
                <tr className="border-b border-hairline">
                  {/* # */}
                  <td className="py-2.5 pr-4 align-top">
                    <Plus className="h-3.5 w-3.5 text-primary/60" />
                  </td>

                  {/* Medicine search — dropdown uses position:fixed to escape overflow */}
                  <td className="py-2.5 pr-4 align-top min-w-[170px]">
                    {!selected ? (
                      <>
                        <input
                          ref={searchRef}
                          className={cellInput}
                          placeholder="Search medicine…"
                          value={query}
                          onChange={(e) => onSearch(e.target.value)}
                          autoFocus
                        />
                        {results.length > 0 && (
                          <ul
                            style={getAddDropdownStyle()}
                            className="max-h-48 overflow-auto rounded-md border border-hairline bg-background shadow-lg"
                          >
                            {results.map((m) => (
                              <li key={m.id}>
                                <button type="button" onClick={() => pick(m)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
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
                      </>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{selected.name}</span>
                        <span className="text-xs text-muted-foreground">{selected.strength}</span>
                        <button type="button" onClick={resetAdd}
                          className="self-start text-[10px] text-primary hover:underline">
                          change
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Dosage */}
                  <td className="py-2.5 pr-4 align-top">
                    <input {...itemForm.register('dosage')} className={cellInput}
                      placeholder="1 tab" disabled={!selected} />
                  </td>

                  {/* Frequency */}
                  <td className="py-2.5 pr-4 align-top min-w-[130px]">
                    <select {...itemForm.register('frequency')} className={cellInput} disabled={!selected}>
                      <option value="">Select…</option>
                      {FREQUENCY_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* Route */}
                  <td className="py-2.5 pr-4 align-top">
                    <select {...itemForm.register('route')} className={cellInput} disabled={!selected}>
                      <option value="">Select…</option>
                      {ROUTE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* Days */}
                  <td className="py-2.5 pr-4 align-top">
                    <input type="number" min={1} max={180}
                      {...itemForm.register('durationDays')}
                      className={cn(cellInput, 'w-14')}
                      disabled={!selected} />
                  </td>

                  {/* Instructions */}
                  <td className="py-2.5 pr-4 align-top">
                    <input {...itemForm.register('instructions')} className={cellInput}
                      placeholder="After food…" disabled={!selected} />
                  </td>

                  {/* ✓ commit + × cancel */}
                  <td className="py-2.5 pr-4 align-top">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void submitAdd()}
                        disabled={!selected}
                        title="Add to prescription"
                        className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-30">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button"
                        onClick={() => { setAdding(false); resetAdd(); }}
                        title="Close"
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Allergy / stock warnings span full width */}
                {selected && (allergyMatch || selected.severity !== 'ok') && (
                  <tr className="border-b border-hairline">
                    <td colSpan={8} className="pb-3 pt-1 pr-4">
                      {allergyMatch && <AllergyAlertBanner match={allergyMatch} medicine={selected} />}
                      {selected.severity !== 'ok' && (
                        <StockWarningBanner severity={selected.severity} medicineName={selected.name}
                          message={blocked
                            ? 'blocked: enter override reason in the instructions field.'
                            : `available ${selected.availableQty} of ${selected.thresholdQty}; consider an alternative.`}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      )}

      {/* + Add medicine */}
      {!adding && (
        <button
          type="button"
          onClick={() => { cancelEdit(); setAdding(true); }}
          className={cn(
            'mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-medium transition-colors',
            items.length === 0
              ? 'border-primary/40 text-primary hover:border-primary hover:bg-primary/5'
              : 'border-muted-foreground/25 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/[0.03]',
          )}
        >
          <Plus className="h-4 w-4" />
          Add medicine
        </button>
      )}
    </div>
  );
}
