import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { StatusPill, type StatusPillProps } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { FormTextarea } from '@/components/form';
import { cn } from '@/utils/cn';
import {
  fetchLabComponents,
  fetchPanelComponents,
  recordLabResult,
  type LabComponentResult,
  type LabOrderQueueEntry,
  type LabResultFlag,
  type LabTestCatalogItem,
} from '@/features/lab';
import { calculateComponent, computeFlag, formatRefRange, worstFlag } from '@/features/lab/labFormulas';

/**
 * Inline lab-result entry panel — extracted from `LabResultEntryPage`
 * so the same form can be mounted inside an expandable worklist row
 * (the primary tech workflow) and on the standalone `/diagnostics/lab/
 * :orderId/result` route (back-compat / direct deep link).
 *
 * Owns: per-component value state, real-time auto-flag + auto-calculate,
 * panel vs single-test wiring, reactive-confirm guard, save action.
 * Does NOT own page chrome (header, breadcrumb, back button) — the
 * mounting surface provides those.
 *
 * Keyboard model: Tab moves between fields; Enter / ↓ jumps to the
 * next non-calculated row; ↑ jumps to the previous one.
 */

type RowState = {
  raw: string;
  flagOverride?: LabResultFlag;
};

const flagTone: Record<LabResultFlag, StatusPillProps['tone']> = {
  normal: 'success',
  low: 'warning',
  high: 'warning',
  critical_low: 'danger',
  critical_high: 'danger',
};

const flagLabel: Record<LabResultFlag, string> = {
  normal: 'Normal',
  low: 'Low',
  high: 'High',
  critical_low: 'Critical low',
  critical_high: 'Critical high',
};

interface LabResultEntryPanelProps {
  order: LabOrderQueueEntry;
  /** Called after a successful save (parent typically refreshes worklist + collapses the row). */
  onSaved: () => void;
  /** Optional cancel/back action shown next to the Save button. */
  onCancel?: () => void;
  /** Render the inline kbd shortcut hint above the table. Defaults true. */
  showShortcutHint?: boolean;
  /**
   * Optional `id` on the wrapping `<form>` element so an external Save
   * button (e.g. in a page header) can trigger this form natively via
   * the HTML `form="..."` attribute. Pair with `hideActions` to remove
   * the inline Save / Cancel row.
   */
  formId?: string;
  /** Hide the inline Save / Cancel row — caller renders its own CTAs. */
  hideActions?: boolean;
  /** Mirrors submitting state to the parent so external CTAs can disable. */
  onSubmittingChange?: (busy: boolean) => void;
}

export function LabResultEntryPanel({
  order,
  onSaved,
  onCancel,
  showShortcutHint = true,
  formId,
  hideActions = false,
  onSubmittingChange,
}: LabResultEntryPanelProps): JSX.Element {
  const [components, setComponents] = useState<LabTestCatalogItem[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [confirmation, setConfirmation] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<string>(order.notes ?? '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Mirror submitting state to parent so external CTAs (page-header
  // Save button when `hideActions` is set) can disable while in flight.
  useEffect(() => {
    onSubmittingChange?.(submitting);
  }, [submitting, onSubmittingChange]);

  const tableRef = useRef<HTMLTableElement>(null);
  const focusRow = useCallback((idx: number): void => {
    if (idx < 0) return;
    const cell = tableRef.current?.querySelector<HTMLElement>(
      `[data-row-cell="${idx}"]`,
    );
    if (!cell) return;
    const tag = cell.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      cell.focus();
    } else {
      const inner = cell.querySelector<HTMLElement>(
        'input, textarea, button[tabindex="0"]',
      );
      inner?.focus();
    }
  }, []);

  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, rowIdx: number): void => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        for (let i = rowIdx + 1; i < components.length; i += 1) {
          if (components[i].resultType !== 'calculated') {
            e.preventDefault();
            focusRow(i);
            return;
          }
        }
      } else if (e.key === 'ArrowUp') {
        for (let i = rowIdx - 1; i >= 0; i -= 1) {
          if (components[i].resultType !== 'calculated') {
            e.preventDefault();
            focusRow(i);
            return;
          }
        }
      }
    },
    [components, focusRow],
  );

  // Resolve components on mount / order change. Single tests resolve
  // to a one-component list; panels resolve via fetchPanelComponents.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const cs = order.panelCode
        ? await fetchPanelComponents(order.panelCode)
        : await fetchLabComponents().then(async (all) => {
            const direct = all.find((c) => c.code === order.testCode);
            if (direct) return [direct];
            return fetchPanelComponents(order.testCode);
          });
      if (!alive) return;
      setComponents(cs);
      const initial: Record<string, RowState> = {};
      for (const c of cs) {
        const prior = order.componentResults?.find((r) => r.componentCode === c.code);
        initial[c.code] = { raw: prior?.value ?? '' };
      }
      setRows(initial);
      setConfirmation({});
      setNotes(order.notes ?? '');
      setLoading(false);
      // Auto-focus first non-calculated row so the tech can start typing
      // immediately after a row expands.
      requestAnimationFrame(() => {
        const firstEditable = cs.findIndex((c) => c.resultType !== 'calculated');
        if (firstEditable >= 0) focusRow(firstEditable);
      });
    })();
    return () => {
      alive = false;
    };
  }, [order, focusRow]);

  const numericInputs = useMemo<Record<string, number | undefined>>(() => {
    const out: Record<string, number | undefined> = {};
    for (const c of components) {
      if (c.resultType === 'calculated') continue;
      const raw = rows[c.code]?.raw ?? '';
      if (raw === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n)) out[c.code] = n;
    }
    return out;
  }, [components, rows]);

  const computed = useMemo(() => {
    const map = new Map<string, { value: number | null; flag?: LabResultFlag }>();
    const gender = order.patient.gender;
    for (const c of components) {
      let value: number | null = null;
      if (c.resultType === 'calculated') {
        value = calculateComponent(c.code, numericInputs, {
          ageYears: order.patient.ageYears,
          gender,
        });
      } else if (c.resultType === 'numeric') {
        value = numericInputs[c.code] ?? null;
      }
      const auto =
        value != null && (c.resultType === 'numeric' || c.resultType === 'calculated')
          ? computeFlag(value, c, gender)
          : undefined;
      map.set(c.code, {
        value,
        flag: rows[c.code]?.flagOverride ?? auto,
      });
    }
    return map;
  }, [components, numericInputs, rows, order]);

  const pendingConfirmations = useMemo(() => {
    const list: LabTestCatalogItem[] = [];
    for (const c of components) {
      if (c.resultType !== 'reactive_nonreactive') continue;
      if (rows[c.code]?.raw !== 'Reactive') continue;
      if (!confirmation[c.code]) list.push(c);
    }
    return list;
  }, [components, rows, confirmation]);

  const isPanel = Boolean(order.panelCode);
  const setRow = (code: string, raw: string): void =>
    setRows((prev) => ({ ...prev, [code]: { ...prev[code], raw } }));

  const onSubmit = async (): Promise<void> => {
    if (pendingConfirmations.length > 0) return;
    setSubmitting(true);
    try {
      const componentResults: LabComponentResult[] = [];
      for (const c of components) {
        const calc = computed.get(c.code);
        const raw = rows[c.code]?.raw ?? '';
        const display =
          c.resultType === 'calculated' && calc?.value != null
            ? String(calc.value)
            : raw;
        if (display === '') continue;
        const numeric =
          calc?.value != null
            ? calc.value
            : Number.isFinite(Number(raw))
              ? Number(raw)
              : undefined;
        const result: LabComponentResult = {
          componentCode: c.code,
          componentName: c.fullName ?? c.name,
          value: display,
        };
        if (numeric !== undefined) result.valueNumeric = numeric;
        if (c.unit) result.unit = c.unit;
        if (calc?.flag) result.flag = calc.flag;
        componentResults.push(result);
      }

      const overallFlag = worstFlag(componentResults.map((r) => r.flag));
      const summary = componentResults
        .slice(0, 5)
        .map((r) => `${r.componentName}: ${r.value}${r.unit ? ' ' + r.unit : ''}`)
        .join(' · ');
      const primary = componentResults[0];
      await recordLabResult({
        orderId: order.id,
        resultSummary: summary,
        resultNumeric: primary?.valueNumeric,
        resultText: !isPanel ? primary?.value : undefined,
        resultUnit: primary?.unit,
        flag: overallFlag,
        notes: notes || undefined,
        componentResults: isPanel ? componentResults : undefined,
      });
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Spinner size="sm" /> Loading test parameters...
      </div>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]"
    >
      <div className="flex flex-col gap-2">
        {showShortcutHint && (
          <p className="text-xxs text-muted-foreground">
            <kbd className="rounded border bg-muted px-1 text-[10px]">Tab</kbd> next field
            · <kbd className="rounded border bg-muted px-1 text-[10px]">Enter</kbd> /
            <kbd className="ml-1 rounded border bg-muted px-1 text-[10px]">↓</kbd> next row
            · <kbd className="rounded border bg-muted px-1 text-[10px]">↑</kbd> previous row
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table ref={tableRef} className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Parameter</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Ref. range</th>
                <th className="px-3 py-2 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c, rowIdx) => {
                const state = rows[c.code] ?? { raw: '' };
                const calc = computed.get(c.code);
                const ref = formatRefRange(c, order.patient.gender);
                const isCalculated = c.resultType === 'calculated';
                const cellHandlers = {
                  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) =>
                    onCellKeyDown(e, rowIdx),
                };
                return (
                  <tr key={c.code} className="border-b align-middle last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.name}</div>
                      {c.formulaHint && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Sparkles className="h-2.5 w-2.5" /> {c.formulaHint}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isCalculated ? (
                        <span
                          className={cn(
                            'inline-flex h-9 min-w-[5rem] items-center rounded-md border bg-muted/30 px-3 font-mono text-sm tabular-nums',
                            calc?.value == null && 'text-muted-foreground',
                          )}
                          aria-label={`${c.name} (auto-calculated)`}
                        >
                          {calc?.value ?? '—'}
                        </span>
                      ) : c.resultType === 'numeric' ? (
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={state.raw}
                          onChange={(e) => setRow(c.code, e.target.value)}
                          data-row-cell={rowIdx}
                          {...cellHandlers}
                          className="h-9 w-28 rounded-md border bg-background px-2 font-mono text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      ) : c.resultType === 'grade' ? (
                        <div data-row-cell={rowIdx} {...cellHandlers}>
                          <SegmentedControl
                            value={state.raw}
                            options={c.gradeOptions ?? []}
                            onChange={(v) => setRow(c.code, v)}
                          />
                        </div>
                      ) : c.resultType === 'positive_negative' ||
                        c.resultType === 'reactive_nonreactive' ? (
                        <div data-row-cell={rowIdx} {...cellHandlers}>
                          <SegmentedControl
                            value={state.raw}
                            options={c.qualitativeOptions ?? []}
                            onChange={(v) => setRow(c.code, v)}
                          />
                        </div>
                      ) : (
                        <textarea
                          rows={1}
                          value={state.raw}
                          onChange={(e) => setRow(c.code, e.target.value)}
                          data-row-cell={rowIdx}
                          {...cellHandlers}
                          className="w-full min-w-[12rem] rounded-md border bg-background px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {c.unit ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {ref || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {calc?.flag ? (
                        <StatusPill
                          tone={flagTone[calc.flag]}
                          size="sm"
                          pulse={calc.flag.startsWith('critical') ? 'ripple' : 'none'}
                        >
                          {flagLabel[calc.flag]}
                        </StatusPill>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="flex flex-col gap-3">
        {pendingConfirmations.length > 0 && (
          <Card padding="sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-warning">
                Confirm reactive results
              </h3>
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                {pendingConfirmations.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              A "Reactive" first read must be confirmed by a second test
              before reporting.
            </p>
            <div className="flex flex-col gap-2">
              {pendingConfirmations.map((c) => (
                <div key={c.code} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{c.name}:</span>
                  <SegmentedControl
                    value={confirmation[c.code] ?? ''}
                    options={['Non-Reactive', 'Reactive']}
                    onChange={(v) => setConfirmation((p) => ({ ...p, [c.code]: v }))}
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card padding="sm">
          <FormTextarea
            label="Notes (optional)"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            hint="Tech-side comments — visible to the doctor on the report."
          />
        </Card>

        {!hideActions && (
          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={submitting || pendingConfirmations.length > 0}
            >
              {submitting ? <Spinner size="sm" /> : <Check />}
              Save {isPanel ? 'panel' : 'result'}
            </Button>
          </div>
        )}
      </aside>
    </form>
  );
}

/* ---------- inline radio-group with roving tabindex ---------- */

interface SegmentedControlProps {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}

function SegmentedControl({ value, options, onChange }: SegmentedControlProps): JSX.Element {
  const activeIdx = Math.max(0, options.indexOf(value));

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') {
      return;
    }
    e.preventDefault();
    let nextIdx = activeIdx;
    if (e.key === 'ArrowRight') nextIdx = (activeIdx + 1) % options.length;
    else if (e.key === 'ArrowLeft') nextIdx = (activeIdx - 1 + options.length) % options.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = options.length - 1;
    const next = options[nextIdx];
    onChange(next);
    const target = e.currentTarget.querySelector<HTMLButtonElement>(
      `[data-segmented-value="${next}"]`,
    );
    target?.focus();
  };

  return (
    <div
      role="radiogroup"
      onKeyDown={onKeyDown}
      className="inline-flex flex-wrap gap-1 rounded-md bg-muted p-0.5"
    >
      {options.map((opt, i) => {
        const active = value === opt;
        const isTabStop = i === activeIdx;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={isTabStop ? 0 : -1}
            data-segmented-value={opt}
            onClick={() => onChange(opt)}
            className={cn(
              'rounded px-2 py-1 text-xs font-medium transition',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
