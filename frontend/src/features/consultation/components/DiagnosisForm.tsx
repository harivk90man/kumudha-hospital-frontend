import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Plus, X } from 'lucide-react';
import { StatusPill } from '@/components/data-display';
import type { StatusPillProps } from '@/components/data-display';
import { cn } from '@/utils/cn';
import { diagnosisSchema, type DiagnosisFormValues } from '../schemas/consultationSchemas';
import type { Diagnosis, DiagnosisType } from '../consultationTypes';
import { searchIcd10, type Icd10Entry } from '../consultationApi';

interface DiagnosisFormProps {
  diagnoses: Diagnosis[];
  onAdd: (value: DiagnosisFormValues) => Promise<void> | void;
  onUpdate: (updated: Diagnosis) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
  className?: string;
}

const cellInput =
  'w-full border-0 border-b border-hairline bg-transparent py-0.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary transition-colors';

const typeLabel: Record<DiagnosisType, string> = {
  primary:     'Primary',
  secondary:   'Secondary',
  provisional: 'Provisional',
  rule_out:    'Rule out',
};

const typeTone: Record<DiagnosisType, StatusPillProps['tone']> = {
  primary:     'brand',
  secondary:   'neutral',
  provisional: 'warning',
  rule_out:    'info',
};

type CellField = 'type' | 'icd10' | 'description';
type EditingCell = { rowId: string; field: CellField };

/**
 * Tick button paired with an active cell editor.
 *
 * `onMouseDown` preempts the input's `blur` (which also saves) so the tick
 * click never races with the blur save — keeping focus until `onClick`
 * fires lets us commit deterministically.
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

export function DiagnosisForm({
  diagnoses, onAdd, onUpdate, onRemove, className,
}: DiagnosisFormProps): JSX.Element {
  // ── Add-row state ───────────────────────────────────────────────────────────
  const [open,       setOpen]       = useState(false);
  const [icdQuery,   setIcdQuery]   = useState('');
  const [icdResults, setIcdResults] = useState<Icd10Entry[]>([]);
  const addIcdRef                    = useRef<HTMLInputElement>(null);

  // ── Per-cell edit state ─────────────────────────────────────────────────────
  const [editingCell,    setEditingCell]    = useState<EditingCell | null>(null);
  const [draft,          setDraft]          = useState<string>('');
  const [icdEditResults, setIcdEditResults] = useState<Icd10Entry[]>([]);
  const editIcdRef                          = useRef<HTMLInputElement>(null);

  // ── Add form (creation flow keeps the whole-row pattern) ────────────────────
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } =
    useForm<DiagnosisFormValues>({
      resolver: zodResolver(diagnosisSchema),
      defaultValues: { icd10: '', description: '', type: '' as DiagnosisType },
    });

  // ── Dropdown anchor styles (fixed-position to escape overflow:hidden) ───────
  const getAddDropdownStyle = (): React.CSSProperties => {
    const rect = addIcdRef.current?.getBoundingClientRect();
    if (!rect) return { display: 'none' };
    return { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 320), zIndex: 9999 };
  };

  const getEditDropdownStyle = (): React.CSSProperties => {
    const rect = editIcdRef.current?.getBoundingClientRect();
    if (!rect) return { display: 'none' };
    return { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 320), zIndex: 9999 };
  };

  // ── Add handlers ────────────────────────────────────────────────────────────
  const onIcdSearch = (q: string): void => {
    setIcdQuery(q);
    setValue('icd10', q);
    setIcdResults(q.length >= 2 ? searchIcd10(q) : []);
  };

  const pickIcd = (entry: Icd10Entry): void => {
    setValue('icd10', entry.code);
    setValue('description', entry.description);
    setIcdQuery(entry.code);
    setIcdResults([]);
  };

  const submit = handleSubmit(async (v) => {
    await onAdd(v);
    reset({ icd10: '', description: '', type: '' as DiagnosisType });
    setIcdQuery('');
    setIcdResults([]);
    setOpen(false);
  });

  const cancelAdd = (): void => {
    reset({ icd10: '', description: '', type: '' as DiagnosisType });
    setIcdQuery('');
    setIcdResults([]);
    setOpen(false);
  };

  // ── Per-cell edit handlers ──────────────────────────────────────────────────
  const beginEdit = (d: Diagnosis, field: CellField): void => {
    setOpen(false);
    const initial =
      field === 'type'        ? d.type :
      field === 'icd10'       ? (d.icd10 ?? '') :
                                d.description;
    setDraft(initial);
    setEditingCell({ rowId: d.id, field });
    setIcdEditResults([]);
  };

  const cancelEdit = (): void => {
    setEditingCell(null);
    setDraft('');
    setIcdEditResults([]);
  };

  const onEditIcdSearch = (q: string): void => {
    setDraft(q);
    setIcdEditResults(q.length >= 2 ? searchIcd10(q) : []);
  };

  /**
   * Commit the currently-edited cell. Treats blank required fields as a
   * silent revert (so accidentally clearing description and clicking away
   * doesn't destroy the row).
   */
  const saveCell = async (d: Diagnosis): Promise<void> => {
    if (!editingCell || editingCell.rowId !== d.id) return;
    const field   = editingCell.field;
    const trimmed = draft.trim();

    if (field === 'type'        && !trimmed) return cancelEdit();
    if (field === 'description' && !trimmed) return cancelEdit();

    const current =
      field === 'type'        ? d.type :
      field === 'icd10'       ? (d.icd10 ?? '') :
                                d.description;
    if (current === trimmed) return cancelEdit();

    const updated: Diagnosis = {
      ...d,
      ...(field === 'type'        && { type: trimmed as DiagnosisType }),
      ...(field === 'icd10'       && { icd10: trimmed || undefined }),
      ...(field === 'description' && { description: trimmed }),
    };
    await onUpdate(updated);
    cancelEdit();
  };

  /** Picking an ICD-10 result rewrites BOTH the code and the description. */
  const pickIcdForEdit = async (d: Diagnosis, entry: Icd10Entry): Promise<void> => {
    const updated: Diagnosis = { ...d, icd10: entry.code, description: entry.description };
    await onUpdate(updated);
    cancelEdit();
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className={className} aria-label="Diagnoses">

      {(diagnoses.length > 0 || open) && (
        <table className="min-w-full text-sm mb-3">
          <thead>
            <tr className="border-b border-hairline text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4 font-mono">ICD-10</th>
              <th className="py-2 pr-4">Description</th>
              <th className="w-10 py-2" />
            </tr>
          </thead>

          <tbody>
            {diagnoses.map((d) => {
              const isTypeEdit = editingCell?.rowId === d.id && editingCell.field === 'type';
              const isIcdEdit  = editingCell?.rowId === d.id && editingCell.field === 'icd10';
              const isDescEdit = editingCell?.rowId === d.id && editingCell.field === 'description';

              return (
                <tr key={d.id} className="border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/10">

                  {/* Type cell — click pill to swap for a select */}
                  <td className="py-2.5 pr-4 align-top">
                    {isTypeEdit ? (
                      <div className="flex items-center gap-1">
                        <select
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void saveCell(d)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(d);
                          }}
                          className={cellInput}
                        >
                          <option value="primary">Primary</option>
                          <option value="secondary">Secondary</option>
                          <option value="provisional">Provisional</option>
                          <option value="rule_out">Rule out</option>
                        </select>
                        <CellSaveButton onSave={() => void saveCell(d)} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(d, 'type')}
                        aria-label={`Edit type for ${d.description}`}
                        className="rounded-sm transition-colors hover:bg-muted/30"
                      >
                        <StatusPill tone={typeTone[d.type]} size="sm">{typeLabel[d.type]}</StatusPill>
                      </button>
                    )}
                  </td>

                  {/* ICD-10 cell — click code to swap for a search input */}
                  <td className="py-2.5 pr-4 align-top min-w-[110px]">
                    {isIcdEdit ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={editIcdRef}
                          autoFocus
                          value={draft}
                          onChange={(e) => onEditIcdSearch(e.target.value)}
                          onBlur={() => void saveCell(d)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(d);
                          }}
                          className={cn(cellInput, 'font-mono')}
                          placeholder="Search code…"
                          autoComplete="off"
                        />
                        <CellSaveButton onSave={() => void saveCell(d)} />
                        {icdEditResults.length > 0 && (
                          <ul
                            style={getEditDropdownStyle()}
                            className="max-h-48 overflow-auto rounded-md border border-hairline bg-background shadow-lg"
                          >
                            {icdEditResults.map((e) => (
                              <li key={e.code}>
                                <button
                                  type="button"
                                  onMouseDown={(ev) => ev.preventDefault()}
                                  onClick={() => void pickIcdForEdit(d, e)}
                                  className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                                >
                                  <span className="flex-shrink-0 font-mono text-xs text-muted-foreground w-14">{e.code}</span>
                                  <span>{e.description}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(d, 'icd10')}
                        aria-label={`Edit ICD-10 for ${d.description}`}
                        className="rounded-sm px-1 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted/30"
                      >
                        {d.icd10 || '—'}
                      </button>
                    )}
                  </td>

                  {/* Description cell — click text to swap for an input */}
                  <td className="py-2.5 pr-4 align-top">
                    {isDescEdit ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void saveCell(d)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit();
                            if (e.key === 'Enter')  void saveCell(d);
                          }}
                          className={cellInput}
                        />
                        <CellSaveButton onSave={() => void saveCell(d)} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEdit(d, 'description')}
                        aria-label={`Edit description for ${d.description}`}
                        className="w-full rounded-sm px-1 py-0.5 text-left font-medium transition-colors hover:bg-muted/30"
                      >
                        {d.description}
                      </button>
                    )}
                  </td>

                  {/* Row delete — kept */}
                  <td className="py-2.5 pr-4 align-top">
                    <button
                      type="button"
                      aria-label={`Remove ${d.description}`}
                      onClick={() => void onRemove(d.id)}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* Inline add row — unchanged whole-row pattern (creation flow) */}
            {open && (
              <tr className="border-b border-hairline">
                <td className="py-2.5 pr-4 align-top">
                  <select {...register('type')} className={cellInput} autoFocus>
                    <option value="">Select…</option>
                    <option value="primary">Primary</option>
                    <option value="secondary">Secondary</option>
                    <option value="provisional">Provisional</option>
                    <option value="rule_out">Rule out</option>
                  </select>
                  {errors.type && <span className="text-[10px] text-danger">Required</span>}
                </td>
                <td className="py-2.5 pr-4 align-top min-w-[110px]">
                  <input
                    ref={addIcdRef}
                    className={cn(cellInput, 'font-mono')}
                    placeholder="Search code…"
                    value={icdQuery}
                    onChange={(e) => onIcdSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {icdResults.length > 0 && (
                    <ul
                      style={getAddDropdownStyle()}
                      className="max-h-48 overflow-auto rounded-md border border-hairline bg-background shadow-lg"
                    >
                      {icdResults.map((e) => (
                        <li key={e.code}>
                          <button
                            type="button"
                            onClick={() => pickIcd(e)}
                            className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                          >
                            <span className="flex-shrink-0 font-mono text-xs text-muted-foreground w-14">{e.code}</span>
                            <span>{e.description}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2.5 pr-4 align-top">
                  <input {...register('description')} placeholder="Diagnosis description *" className={cellInput} />
                  {errors.description && <span className="text-[10px] text-danger">{errors.description.message}</span>}
                </td>
                <td className="py-2.5 pr-4 align-top">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={isSubmitting}
                      title="Add diagnosis"
                      className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelAdd}
                      title="Cancel"
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

      {!open && (
        <button
          type="button"
          onClick={() => { cancelEdit(); setOpen(true); }}
          className={cn(
            'mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-medium transition-colors',
            diagnoses.length === 0
              ? 'border-primary/40 text-primary hover:border-primary hover:bg-primary/5'
              : 'border-muted-foreground/25 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/[0.03]',
          )}
        >
          <Plus className="h-4 w-4" />
          Add diagnosis
        </button>
      )}
    </div>
  );
}
