import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { Breadcrumb } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { FormErrorContainer, FormInput, FormSelect } from '@/components/form';
import { cn } from '@/utils/cn';
import {
  createGrn,
  fetchGrn,
  fetchMedicines,
  fetchSuppliers,
  updateGrn,
  type Grn,
  type GrnLineInput,
  type Medicine,
  type Supplier,
} from '@/features/inventory';
import { formatCurrency } from '@/utils/formatCurrency';

interface DraftLine extends GrnLineInput {
  key: string;
}

const blankLine = (): DraftLine => ({
  key: `ln-${Math.random().toString(36).slice(2, 8)}`,
  medicineId: '',
  batchNumber: '',
  expiryDate: '',
  mfgDate: '',
  quantity: 0,
  unitCost: 0,
  unitPrice: 0,
});

const LOW_MARGIN_PCT = 5;
const MIN_FUTURE_EXPIRY_DAYS = 30;

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Goods receive form — spreadsheet-style editable table for high-volume
 * batch entry. Mounts at both `/inventory/grn/new` (create) and
 * `/inventory/grn/:id/edit` (edit). Mode is detected from `:id` so the
 * form, validation, totals, and header layout stay in one place; on
 * Save the page calls `createGrn` or `updateGrn` accordingly.
 *
 * Edit-mode SCOPE LIMITATION: lines are read-only because rewriting
 * per-line batches after a GRN is saved would also have to retire the
 * original `medicine_batches` rows and stamp new ones (TSD-10 §4.3) —
 * out of scope for this pass. Editing top-level metadata (supplier,
 * supplier invoice no., received date, notes) is supported and is what
 * `updateGrn` actually persists. See its TSDoc.
 *
 * Validation surfaces inline per row (create mode):
 *   - missing medicine / batch / EXP / qty / cost
 *   - duplicate (medicineId + batch) within the same GRN
 *   - expiry < today + 30 days (warning, not blocking)
 *   - margin < 5 % or negative (warning, not blocking)
 */
export function GrnNewPage(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState<string>('');
  const [receivedAt, setReceivedAt] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingGrn, setLoadingGrn] = useState<boolean>(isEdit);
  const [loadedGrn, setLoadedGrn] = useState<Grn | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    let alive = true;
    void fetchSuppliers().then((rows) => {
      if (alive) setSuppliers(rows);
    });
    void fetchMedicines().then((rows) => {
      if (alive) setMedicines(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Edit mode — fetch the GRN and prefill the metadata. Lines remain
  // disabled in the editor because the mock (and the planned backend)
  // doesn't yet support batch-level rewrites once a GRN is saved.
  useEffect(() => {
    if (!isEdit || !id) return;
    let alive = true;
    setLoadingGrn(true);
    fetchGrn(id)
      .then((g) => {
        if (!alive) return;
        setLoadedGrn(g);
        if (g) {
          setSupplierId(g.supplierId);
          setSupplierInvoiceNo(g.supplierInvoiceNo);
          setReceivedAt(g.receivedAt.slice(0, 10));
          setNotes(g.notes ?? '');
        }
      })
      .finally(() => {
        if (alive) setLoadingGrn(false);
      });
    return () => {
      alive = false;
    };
  }, [id, isEdit]);

  const medicineById = useMemo(() => {
    const map = new Map<string, Medicine>();
    for (const m of medicines) map.set(m.id, m);
    return map;
  }, [medicines]);

  const lineMetrics = useMemo(
    () =>
      lines.map((l) => {
        const qty = Number(l.quantity) || 0;
        const cost = Number(l.unitCost) || 0;
        const price = Number(l.unitPrice) || 0;
        const lineCost = qty * cost;
        const lineRevenue = qty * price;
        const lineProfit = lineRevenue - lineCost;
        const marginPct = cost > 0 ? ((price - cost) / cost) * 100 : 0;
        return { lineCost, lineRevenue, lineProfit, marginPct };
      }),
    [lines],
  );

  const totals = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    let totalRevenue = 0;
    for (let i = 0; i < lines.length; i += 1) {
      totalQty += Number(lines[i].quantity) || 0;
      totalCost += lineMetrics[i].lineCost;
      totalRevenue += lineMetrics[i].lineRevenue;
    }
    const totalProfit = totalRevenue - totalCost;
    const marginPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
    return { totalQty, totalCost, totalRevenue, totalProfit, marginPct };
  }, [lines, lineMetrics]);

  // Duplicate detection — same medicine + same batch within a single GRN
  // is almost always a fat-finger error (the supplier shipped two cartons
  // of the same lot → still one batch row, just higher qty).
  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    for (const l of lines) {
      if (!l.medicineId || !l.batchNumber) continue;
      const key = `${l.medicineId}::${l.batchNumber.trim().toLowerCase()}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > 1) dupes.add(l.key);
    }
    return dupes;
  }, [lines]);

  const setLine = (key: string, patch: Partial<DraftLine>): void => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addRow = (): void => {
    setLines((prev) => [...prev, blankLine()]);
  };

  const removeRow = (key: string): void => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  // Keyboard helper — Enter on the last cell of the last row appends a
  // fresh row so a bulk-entry session is one long unbroken Tab stream.
  const onLastCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
  ): void => {
    if (e.key !== 'Enter') return;
    if (rowIndex !== lines.length - 1) return;
    e.preventDefault();
    addRow();
    requestAnimationFrame(() => {
      const nextSelect = tableRef.current?.querySelector<HTMLSelectElement>(
        `[data-cell="medicine"][data-row="${rowIndex + 1}"]`,
      );
      nextSelect?.focus();
    });
  };

  const back = (): void => navigate('/inventory/grn');

  const onSubmit = async (): Promise<void> => {
    if (!supplierId) {
      setError('Pick a supplier');
      return;
    }
    if (!supplierInvoiceNo.trim()) {
      setError('Supplier invoice number required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit && id) {
        await updateGrn(id, {
          supplierId,
          supplierInvoiceNo,
          receivedAt: receivedAt
            ? new Date(receivedAt).toISOString()
            : undefined,
          notes: notes || undefined,
        });
        back();
        return;
      }
      const cleaned = lines.filter(
        (l) => l.medicineId && l.batchNumber && l.expiryDate && l.quantity > 0,
      );
      if (cleaned.length === 0) {
        setError('Add at least one batch line');
        return;
      }
      if (duplicateKeys.size > 0) {
        setError(
          'Duplicate (medicine + batch) line — merge or change the batch number before saving',
        );
        return;
      }
      await createGrn({
        supplierId,
        supplierInvoiceNo,
        notes: notes || undefined,
        lines: cleaned.map(({ key: _key, ...rest }) => {
          void _key;
          return {
            medicineId: rest.medicineId,
            batchNumber: rest.batchNumber,
            expiryDate: rest.expiryDate,
            mfgDate: rest.mfgDate || undefined,
            quantity: Number(rest.quantity),
            unitCost: Number(rest.unitCost),
            unitPrice: Number(rest.unitPrice),
          };
        }),
      });
      back();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : isEdit
            ? 'GRN update failed'
            : 'GRN creation failed',
      );
    } finally {
      setBusy(false);
    }
  };

  const minExpiry = today();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[
          { label: 'Goods receive', to: '/inventory/grn' },
          { label: isEdit ? `Edit ${loadedGrn?.grnNumber ?? 'GRN'}` : 'Receive goods' },
        ]}
        homeTo="/inventory/medicines"
        homeLabel="Inventory"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={back}
            className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft /> Back to GRNs
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {isEdit
              ? `Edit GRN ${loadedGrn?.grnNumber ?? ''}`.trim()
              : 'Receive goods'}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {isEdit ? (
              'Edit the supplier, invoice number, received date, or notes. Batch lines are read-only once a GRN is saved (rewrites would have to retire the original batches).'
            ) : (
              <>
                One GRN per supplier invoice. Tab moves cell-to-cell;{' '}
                <kbd className="rounded border bg-muted px-1 text-[10px]">Enter</kbd>{' '}
                on the last row appends a fresh row.
              </>
            )}
          </p>
        </div>
        {(!isEdit || loadedGrn) && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void onSubmit()} disabled={busy}>
              {busy ? <Spinner size="sm" /> : <Check />}
              {busy
                ? isEdit
                  ? 'Saving…'
                  : 'Receiving…'
                : isEdit
                  ? 'Save GRN'
                  : 'Receive goods'}
            </Button>
            <Button type="button" variant="outline" onClick={back} disabled={busy}>
              Cancel
            </Button>
          </div>
        )}
      </header>

      {loadingGrn ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading GRN…
        </div>
      ) : isEdit && !loadedGrn ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            GRN not found.
          </p>
          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={back}>
              Back to GRNs
            </Button>
          </div>
        </Card>
      ) : (
      <div className="flex flex-col gap-4 border-t border-hairline pt-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FormSelect
            label="Supplier"
            requiredMark
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="" disabled>
              Pick a supplier
            </option>
            {suppliers
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </FormSelect>
          <FormInput
            label="Supplier invoice / DC no."
            requiredMark
            value={supplierInvoiceNo}
            onChange={(e) => setSupplierInvoiceNo(e.target.value)}
          />
          {isEdit && (
            <FormInput
              label="Received date"
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          )}
        </div>

        {isEdit ? (
          <div className="rounded-md border bg-muted/15 p-3 text-xs text-muted-foreground">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground">
              Batch lines · {loadedGrn?.lineCount ?? 0} rows ·{' '}
              {(loadedGrn?.totalQuantity ?? 0).toLocaleString()} units ·{' '}
              {formatCurrency(loadedGrn?.totalCost ?? 0)}
            </p>
            <p>
              Per-line batches are read-only once a GRN is saved — rewriting
              them would also have to retire the original{' '}
              <code>medicine_batches</code> rows (TSD-10 §4.3). Use the
              "Receive goods" flow for additional stock.
            </p>
          </div>
        ) : (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Batch lines
            </h3>
            <span className="text-xxs text-muted-foreground">
              {lines.length} {lines.length === 1 ? 'row' : 'rows'}
            </span>
          </div>

          <div className="overflow-x-auto border-b border-gray-100 bg-white shadow-sm">
            <table ref={tableRef} className="min-w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Medicine *</th>
                  <th className="px-2 py-1.5 font-medium">Batch # *</th>
                  <th className="px-2 py-1.5 font-medium">MFG</th>
                  <th className="px-2 py-1.5 font-medium">EXP *</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty *</th>
                  <th className="px-2 py-1.5 text-right font-medium">Unit cost *</th>
                  <th className="px-2 py-1.5 text-right font-medium">Sell price *</th>
                  <th className="px-2 py-1.5 text-right font-medium">Margin</th>
                  <th className="px-2 py-1.5 text-right font-medium">Line total</th>
                  <th className="w-8 px-1 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, rowIdx) => {
                  const metrics = lineMetrics[rowIdx];
                  const med = medicineById.get(l.medicineId);
                  const isDuplicate = duplicateKeys.has(l.key);
                  const expiryEarly =
                    l.expiryDate &&
                    new Date(l.expiryDate).getTime() <
                      Date.now() + MIN_FUTURE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
                  const lowMargin =
                    l.unitCost > 0 &&
                    l.unitPrice > 0 &&
                    metrics.marginPct < LOW_MARGIN_PCT;
                  const negativeMargin =
                    l.unitCost > 0 && l.unitPrice > 0 && metrics.marginPct < 0;
                  return (
                    <tr
                      key={l.key}
                      className={cn(
                        'border-b align-middle last:border-b-0',
                        rowIdx % 2 === 1 && 'bg-muted/15',
                        isDuplicate && 'bg-danger/5',
                      )}
                    >
                      <td className="px-2 py-1">
                        <select
                          data-cell="medicine"
                          data-row={rowIdx}
                          value={l.medicineId}
                          onChange={(e) => setLine(l.key, { medicineId: e.target.value })}
                          className="h-9 w-44 rounded-md border bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="" disabled>
                            Pick…
                          </option>
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} {m.strength}
                            </option>
                          ))}
                        </select>
                        {med && (
                          <div className="mt-0.5 text-xxs text-muted-foreground">
                            stock {med.availableQty}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={l.batchNumber}
                          onChange={(e) => setLine(l.key, { batchNumber: e.target.value })}
                          placeholder="e.g. ABC1234"
                          className={cn(
                            'h-9 w-32 rounded-md border bg-background px-2 font-mono text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
                            isDuplicate && 'border-danger/50',
                          )}
                        />
                        {isDuplicate && (
                          <div className="mt-0.5 inline-flex items-center gap-0.5 text-xxs text-danger">
                            <AlertTriangle className="h-3 w-3" /> Duplicate
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          value={l.mfgDate ?? ''}
                          onChange={(e) => setLine(l.key, { mfgDate: e.target.value })}
                          className="h-9 w-36 rounded-md border bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          min={minExpiry}
                          value={l.expiryDate}
                          onChange={(e) => setLine(l.key, { expiryDate: e.target.value })}
                          className={cn(
                            'h-9 w-36 rounded-md border bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
                            expiryEarly && 'border-warning/60',
                          )}
                        />
                        {expiryEarly && (
                          <div className="mt-0.5 inline-flex items-center gap-0.5 text-xxs text-warning">
                            <AlertTriangle className="h-3 w-3" /> &lt; 30d
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={l.quantity || ''}
                          onChange={(e) =>
                            setLine(l.key, { quantity: Number(e.target.value) || 0 })
                          }
                          className="h-9 w-20 rounded-md border bg-background px-2 text-right font-mono text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          value={l.unitCost || ''}
                          onChange={(e) =>
                            setLine(l.key, { unitCost: Number(e.target.value) || 0 })
                          }
                          className="h-9 w-24 rounded-md border bg-background px-2 text-right font-mono text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          value={l.unitPrice || ''}
                          onChange={(e) =>
                            setLine(l.key, { unitPrice: Number(e.target.value) || 0 })
                          }
                          onKeyDown={(e) => onLastCellKeyDown(e, rowIdx)}
                          className={cn(
                            'h-9 w-24 rounded-md border bg-background px-2 text-right font-mono text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
                            negativeMargin && 'border-danger/60',
                            !negativeMargin && lowMargin && 'border-warning/60',
                          )}
                        />
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1 text-right font-mono text-xs tabular-nums',
                          negativeMargin
                            ? 'text-danger'
                            : lowMargin
                              ? 'text-warning'
                              : 'text-muted-foreground',
                        )}
                      >
                        {l.unitCost > 0 && l.unitPrice > 0 ? (
                          <span className="inline-flex items-center gap-0.5">
                            {(negativeMargin || lowMargin) && (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {metrics.marginPct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-sm tabular-nums">
                        {formatCurrency(metrics.lineCost)}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(l.key)}
                          disabled={lines.length === 1}
                          aria-label="Remove row"
                          className="h-7 w-7 text-muted-foreground hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={addRow}
          >
            <Plus /> Add row
          </Button>
        </div>
        )}

        <FormInput
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {!isEdit && (
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="text-xxs uppercase tracking-wider text-muted-foreground">
              Total units
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {totals.totalQty.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="text-xxs uppercase tracking-wider text-muted-foreground">
              Total cost
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {formatCurrency(totals.totalCost)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="text-xxs uppercase tracking-wider text-muted-foreground">
              Total revenue
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {formatCurrency(totals.totalRevenue)}
            </div>
          </div>
          <div
            className={cn(
              'rounded-lg border p-3 text-sm',
              totals.marginPct < 0
                ? 'border-danger/40 bg-danger/5'
                : totals.marginPct < LOW_MARGIN_PCT
                  ? 'border-warning/40 bg-warning/5'
                  : 'bg-muted/30',
            )}
          >
            <div className="text-xxs uppercase tracking-wider text-muted-foreground">
              Overall margin
            </div>
            <div
              className={cn(
                'mt-1 font-mono text-lg font-semibold tabular-nums',
                totals.marginPct < 0 && 'text-danger',
                totals.marginPct >= 0 && totals.marginPct < LOW_MARGIN_PCT && 'text-warning',
              )}
            >
              {totals.marginPct.toFixed(1)}%
            </div>
          </div>
        </div>
        )}

        {error && (
          <FormErrorContainer
            title={isEdit ? 'Couldn’t save GRN.' : 'Couldn’t receive goods.'}
            description={error}
          />
        )}
      </div>
      )}
    </div>
  );
}
