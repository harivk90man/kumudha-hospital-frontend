import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Pill,
  Printer,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Breadcrumb, StatusPill } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { FormErrorContainer, FormSelect, FormInput } from '@/components/form';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  dispenseRx,
  fetchRx,
  resolveDiscount,
  type DiscountInput,
  type DiscountKind,
  type DispenseLineInput,
  type LineDecision,
  type RxQueueEntry,
} from '@/features/pharmacy';
import { PrintableRxReceipt } from '../components/PrintableRxReceipt';
import {
  createInvoice,
  recordPayment,
  ShiftLockedBanner,
  useShiftLock,
  type PaymentMethod,
} from '@/features/billing';

/**
 * True when the Rx has reached a terminal state — dispensed, partially
 * dispensed, or cancelled. The page renders a read-only summary in this
 * mode so a "View" tap can never re-trigger dispense + charge.
 */
const isReadOnly = (rx: RxQueueEntry): boolean =>
  rx.status === 'rx_dispensed' ||
  rx.status === 'rx_partially_dispensed' ||
  rx.status === 'rx_cancelled';

interface LineState {
  rxItemId: string;
  decision: LineDecision;
  qty: number;
  discountKind: DiscountKind;
  discountValue: number;
  notes: string;
}

const toDiscountInput = (kind: DiscountKind, value: number): DiscountInput | undefined =>
  value > 0 ? { kind, value } : undefined;

/**
 * Full-page Rx dispense screen — replaces the right-side drawer.
 * Routed at `/pharmacy/queue/:rxId/dispense`. The previous worklist
 * lives at `/pharmacy/queue` and provides the back link via breadcrumb.
 */
export function RxDispensePage(): JSX.Element {
  const { rxId } = useParams<{ rxId: string }>();
  const navigate = useNavigate();

  const [rx, setRx] = useState<RxQueueEntry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lines, setLines] = useState<LineState[]>([]);
  const [billDiscountKind, setBillDiscountKind] = useState<DiscountKind>('pct');
  const [billDiscountValue, setBillDiscountValue] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const shiftLock = useShiftLock();

  /**
   * Per-Rx items pagination — long prescriptions (chronic-care
   * regimens with 30+ medicines) overrun the dispense table without
   * this. Page size 20 keeps the table compact on a 13" laptop;
   * totals + payment panel always reflect the FULL Rx, not just the
   * visible page.
   */
  const ITEMS_PAGE_SIZE = 20;
  const [itemsPage, setItemsPage] = useState<number>(1);
  const totalItems = rx?.items.length ?? 0;
  const itemsLastPage = Math.max(1, Math.ceil(totalItems / ITEMS_PAGE_SIZE));
  const safeItemsPage = Math.min(Math.max(1, itemsPage), itemsLastPage);
  const itemsStart = (safeItemsPage - 1) * ITEMS_PAGE_SIZE;
  const visibleItems = rx
    ? rx.items.slice(itemsStart, itemsStart + ITEMS_PAGE_SIZE)
    : [];

  useEffect(() => {
    if (!rxId) return;
    let alive = true;
    setLoading(true);
    fetchRx(rxId)
      .then((found) => {
        if (!alive) return;
        setRx(found);
        if (found) {
          setLines(
            found.items.map((it) => ({
              rxItemId: it.id,
              decision:
                it.stockSeverity === 'out_of_stock' || it.stockSeverity === 'expired'
                  ? 'out_of_stock'
                  : 'dispense',
              qty: Math.min(it.quantityPrescribed, it.availableQty),
              discountKind: 'pct',
              discountValue: 0,
              notes: '',
            })),
          );
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [rxId]);

  const setLine = (id: string, patch: Partial<LineState>): void => {
    setLines((prev) => prev.map((l) => (l.rxItemId === id ? { ...l, ...patch } : l)));
  };

  const totals = useMemo(() => {
    const empty = {
      subtotal: 0, itemDiscount: 0, taxableBase: 0, tax: 0,
      preBillTotal: 0, billDiscount: 0, total: 0,
    };
    if (!rx) return empty;
    let subtotal = 0;
    let itemDiscount = 0;
    let taxableBase = 0;
    let tax = 0;
    for (const l of lines) {
      if (l.decision !== 'dispense' || l.qty <= 0) continue;
      const item = rx.items.find((i) => i.id === l.rxItemId);
      if (!item) continue;
      const gross = item.unitPrice * l.qty;
      const lineDisc = resolveDiscount(toDiscountInput(l.discountKind, l.discountValue), gross);
      const lineNet = gross - lineDisc;
      const lineGst = lineNet * (item.gstPct / 100);
      subtotal += gross;
      itemDiscount += lineDisc;
      taxableBase += lineNet;
      tax += lineGst;
    }
    const preBillTotal = taxableBase + tax;
    const billDiscount = resolveDiscount(
      toDiscountInput(billDiscountKind, billDiscountValue),
      preBillTotal,
    );
    const total = preBillTotal - billDiscount;
    return {
      subtotal: Number(subtotal.toFixed(2)),
      itemDiscount: Number(itemDiscount.toFixed(2)),
      taxableBase: Number(taxableBase.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      preBillTotal: Number(preBillTotal.toFixed(2)),
      billDiscount: Number(billDiscount.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }, [lines, rx, billDiscountKind, billDiscountValue]);

  const onSubmit = async (): Promise<void> => {
    if (!rx) return;
    // Hard guard: a terminal-state Rx is a read-only view and must
    // never be re-submitted. Earlier we relied on the row action to
    // route correctly, but a stale tab + a refresh could still land
    // a user on this page with a dispensed Rx — refuse it here.
    if (isReadOnly(rx)) return;
    if (shiftLock.locked) {
      setError('Shift is closed — payments resume when the next shift opens.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dispenseInputs: DispenseLineInput[] = lines.map((l) => ({
        rxItemId: l.rxItemId,
        decision: l.decision,
        quantityDispensed: l.decision === 'dispense' ? l.qty : undefined,
        lineDiscount:
          l.decision === 'dispense'
            ? toDiscountInput(l.discountKind, l.discountValue)
            : undefined,
        notes: l.notes || undefined,
      }));

      await dispenseRx({
        rxId: rx.id,
        lines: dispenseInputs,
        billDiscount: toDiscountInput(billDiscountKind, billDiscountValue),
      });

      const dispensedLines = lines.filter((l) => l.decision === 'dispense' && l.qty > 0);
      if (dispensedLines.length > 0) {
        const placeholderServiceId = 'svc-201';
        const invoice = await createInvoice({
          patientId: rx.patient.id,
          patientSnapshot: rx.patient,
          opNumber: rx.opNumber,
          station: 'pharmacy',
          lines: [
            { serviceId: placeholderServiceId, quantity: 1, notes: `Rx ${rx.prescriptionNumber} dispensed` },
          ],
        });
        await recordPayment({
          invoiceId: invoice.id,
          amount: invoice.total,
          method: paymentMethod,
          referenceNo: paymentRef || undefined,
        });
      }
      navigate('/pharmacy/queue');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dispense failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[
          { label: 'Rx queue', to: '/pharmacy/queue' },
          { label: rx?.prescriptionNumber ?? 'Dispense' },
        ]}
        homeTo="/pharmacy/queue"
        homeLabel="Pharmacy"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/pharmacy/queue')}
            className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft /> Back to queue
          </Button>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <Pill className="h-4 w-4 text-primary" />
            {rx && isReadOnly(rx) ? 'Rx ' : 'Dispense '}
            {rx?.prescriptionNumber ?? '…'}
          </h1>
          {rx && (
            <p className="font-mono text-xxs text-muted-foreground tabular-nums">
              {rx.patient.fullName} · {rx.patient.uhid} · OP {rx.opNumber} · {rx.doctorName}
            </p>
          )}
        </div>
        {rx && !isReadOnly(rx) && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void onSubmit()}
              disabled={busy || shiftLock.locked}
              title={shiftLock.locked ? 'Shift is closed' : undefined}
            >
              {busy ? <Spinner size="sm" /> : <Check />}
              {shiftLock.locked
                ? 'Shift closed'
                : totals.total === 0
                  ? 'Confirm decline'
                  : `Dispense + collect ${formatCurrency(totals.total)}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/pharmacy/queue')}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        )}
        {rx &&
          isReadOnly(rx) &&
          rx.status !== 'rx_cancelled' && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.print()}
              >
                <Printer /> Print receipt
              </Button>
            </div>
          )}
      </header>

      <ShiftLockedBanner lock={shiftLock} />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading prescription…
        </div>
      )}

      {!loading && !rx && (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Prescription not found.
          </p>
        </Card>
      )}

      {rx && isReadOnly(rx) && <RxReadOnlySummary rx={rx} />}

      {rx && !isReadOnly(rx) && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ---- Left: items table ---- */}
          <div className="flex flex-col gap-4">
            {(rx.patient.allergies?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                <span>
                  <strong className="font-semibold">Allergies:</strong>{' '}
                  {rx.patient.allergies?.map((a) => a.allergen).join(', ')}
                </span>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Medicine</th>
                    <th className="px-3 py-2.5 font-medium">Stock</th>
                    <th className="px-3 py-2.5 font-medium">Decision</th>
                    <th className="px-3 py-2.5 font-medium">Qty</th>
                    <th className="px-3 py-2.5 font-medium">Item discount</th>
                    <th className="px-3 py-2.5 font-medium">Notes</th>
                    <th className="px-3 py-2.5 text-right font-medium">Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((it) => {
                    const line = lines.find((l) => l.rxItemId === it.id);
                    if (!line) return null;
                    const gross = it.unitPrice * line.qty;
                    const lineDisc = resolveDiscount(
                      toDiscountInput(line.discountKind, line.discountValue),
                      gross,
                    );
                    const cap = Math.min(it.quantityPrescribed, it.availableQty);
                    return (
                      <tr key={it.id} className="border-b align-top last:border-b-0">
                        <td className="px-3 py-3">
                          <div className="font-medium">
                            {it.medicineName} {it.strength}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {it.dosage} · {it.frequency} · {it.route} · {it.durationDays}d ·
                            ordered {it.quantityPrescribed}
                          </div>
                          {it.genericName && (
                            <div className="text-[11px] text-muted-foreground">
                              gen: {it.genericName}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {(() => {
                            // Stock breakdown — show shelf vs storage so
                            // the pharmacist knows whether to dispense
                            // straight from the counter or fetch from
                            // back-storage. Three cases:
                            //   shelfQty >= prescribed → "On shelf" (immediate)
                            //   total >= prescribed but shelfQty < prescribed
                            //     → "On shelf X, fetch Y from storage"
                            //   total < prescribed → "Short" (decline or partial)
                            const shelf = it.shelfQty ?? it.availableQty;
                            const storage = Math.max(0, it.availableQty - shelf);
                            const enoughOnShelf = shelf >= it.quantityPrescribed;
                            const enoughTotal = it.availableQty >= it.quantityPrescribed;
                            const needsFetch = !enoughOnShelf && enoughTotal;
                            const tone =
                              enoughOnShelf
                                ? 'success'
                                : needsFetch
                                  ? 'warning'
                                  : 'danger';
                            return (
                              <div className="flex flex-col gap-1">
                                <StatusPill tone={tone} size="sm">
                                  {enoughOnShelf
                                    ? `On shelf · ${shelf}`
                                    : needsFetch
                                      ? `Shelf ${shelf} · fetch ${it.quantityPrescribed - shelf}`
                                      : it.availableQty === 0
                                        ? 'Out of stock'
                                        : `Short · ${it.availableQty} total`}
                                </StatusPill>
                                {storage > 0 && !enoughOnShelf && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{storage} in back-storage
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3 w-40">
                          <FormSelect
                            label=""
                            value={line.decision}
                            onChange={(e) =>
                              setLine(it.id, { decision: e.target.value as LineDecision })
                            }
                          >
                            <option value="dispense">Dispense</option>
                            <option value="decline">Declined</option>
                            <option value="out_of_stock">Out of stock</option>
                          </FormSelect>
                        </td>
                        <td className="px-3 py-3 w-24">
                          <FormInput
                            label=""
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={cap}
                            disabled={line.decision !== 'dispense'}
                            value={line.qty}
                            onChange={(e) =>
                              setLine(it.id, { qty: Number(e.target.value) || 0 })
                            }
                            hint={`Max ${cap}`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <div
                              role="group"
                              aria-label="Discount mode"
                              className="inline-flex h-9 overflow-hidden rounded-md border bg-background text-xs"
                            >
                              {(['pct', 'amt'] as const).map((k) => (
                                <button
                                  key={k}
                                  type="button"
                                  disabled={line.decision !== 'dispense'}
                                  onClick={() => setLine(it.id, { discountKind: k })}
                                  className={cn(
                                    'px-2 transition-colors',
                                    line.discountKind === k
                                      ? 'bg-primary text-primary-foreground'
                                      : 'text-muted-foreground hover:bg-muted',
                                    line.decision !== 'dispense' && 'opacity-50',
                                  )}
                                >
                                  {k === 'pct' ? '%' : '₹'}
                                </button>
                              ))}
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              max={line.discountKind === 'pct' ? 100 : gross}
                              disabled={line.decision !== 'dispense'}
                              value={line.discountValue || ''}
                              onChange={(e) =>
                                setLine(it.id, {
                                  discountValue: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="0"
                              className="h-9 w-20 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                            />
                          </div>
                          {line.decision === 'dispense' && line.qty > 0 && lineDisc > 0 && (
                            <div className="mt-1 text-xs text-success">
                              − {formatCurrency(lineDisc)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 min-w-[10rem]">
                          <FormInput
                            label=""
                            value={line.notes}
                            onChange={(e) => setLine(it.id, { notes: e.target.value })}
                            placeholder="Optional"
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          {line.decision === 'dispense' && line.qty > 0 ? (
                            <div>
                              <div className="font-mono tabular-nums">
                                {formatCurrency(gross - lineDisc)}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                + {it.gstPct}% GST
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalItems > 0 && (
                <div className="flex items-center justify-between gap-2 border-t border-hairline bg-card px-3 py-2 text-xxs text-muted-foreground">
                  <span className="tabular-nums">
                    {itemsStart + 1}–
                    {Math.min(itemsStart + visibleItems.length, totalItems)} of{' '}
                    {totalItems} items
                  </span>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setItemsPage((p) => Math.max(1, p - 1))}
                      disabled={safeItemsPage <= 1}
                      className={cn(
                        'rounded p-1 transition',
                        safeItemsPage <= 1
                          ? 'cursor-not-allowed opacity-40'
                          : 'hover:bg-muted hover:text-foreground',
                      )}
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    <span className="px-1 tabular-nums text-foreground">
                      {safeItemsPage} / {itemsLastPage}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setItemsPage((p) => Math.min(itemsLastPage, p + 1))
                      }
                      disabled={safeItemsPage >= itemsLastPage}
                      className={cn(
                        'rounded p-1 transition',
                        safeItemsPage >= itemsLastPage
                          ? 'cursor-not-allowed opacity-40'
                          : 'hover:bg-muted hover:text-foreground',
                      )}
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ---- Right: totals + payment + actions ---- */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
            <Card>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-baseline justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(totals.subtotal)}
                  </span>
                </div>
                {totals.itemDiscount > 0 && (
                  <div className="flex items-baseline justify-between text-success">
                    <span>Item discounts</span>
                    <span className="font-mono tabular-nums">
                      − {formatCurrency(totals.itemDiscount)}
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <span>GST (post item-disc)</span>
                  <span className="font-mono tabular-nums">{formatCurrency(totals.tax)}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Bill discount
                    </span>
                    <div
                      role="group"
                      aria-label="Bill discount mode"
                      className="inline-flex h-8 overflow-hidden rounded-md border bg-background text-xs"
                    >
                      {(['pct', 'amt'] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setBillDiscountKind(k)}
                          className={cn(
                            'px-2 transition-colors',
                            billDiscountKind === k
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {k === 'pct' ? '%' : '₹'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      max={billDiscountKind === 'pct' ? 100 : totals.preBillTotal}
                      value={billDiscountValue || ''}
                      onChange={(e) => setBillDiscountValue(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="h-8 w-20 rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                  {totals.billDiscount > 0 && (
                    <span className="font-mono tabular-nums text-success">
                      − {formatCurrency(totals.billDiscount)}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-baseline justify-between border-t pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(totals.total)}
                  </span>
                </div>
              </div>
            </Card>

            {totals.total > 0 && (
              <Card>
                <h3 className="text-sm font-semibold">Payment</h3>
                <FormSelect
                  label="Method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Net banking</option>
                  <option value="insurance">Insurance</option>
                </FormSelect>
                <FormInput
                  label="Reference (optional)"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="UPI txn id, RRN, …"
                />
              </Card>
            )}

            {totals.total === 0 && (
              <p className="flex items-center gap-1 text-xs text-warning">
                <AlertTriangle className="h-3 w-3" />
                Nothing dispensed. Submit will mark Rx as cancelled.
              </p>
            )}

            {error && (
              <FormErrorContainer
                title="Couldn't record the dispense."
                description={error}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

interface RxReadOnlySummaryProps {
  rx: RxQueueEntry;
}

/**
 * Read-only view for an Rx that has already reached a terminal state.
 * Prevents the "View" row-action from re-rendering the editable
 * dispense form (which would otherwise let a pharmacist re-dispense
 * and re-charge the same prescription).
 */
function RxReadOnlySummary({ rx }: RxReadOnlySummaryProps): JSX.Element {
  const partial = rx.status === 'rx_partially_dispensed';
  const cancelled = rx.status === 'rx_cancelled';

  const banner = cancelled
    ? {
        Icon: XCircle,
        tone: 'border-muted-foreground/30 bg-muted/40 text-foreground',
        title: 'This prescription was cancelled.',
        sub: 'No items were dispensed and nothing was charged.',
      }
    : partial
      ? {
          Icon: AlertTriangle,
          tone: 'border-warning/40 bg-warning/10 text-warning',
          title: 'Partially dispensed — already closed.',
          sub: 'Some items were dispensed; the rest were declined or out of stock.',
        }
      : {
          Icon: CheckCircle2,
          tone: 'border-success/40 bg-success/10 text-success',
          title: 'Already dispensed.',
          sub: 'The payment was collected and the patient received the medicines.',
        };

  return (
    <div className="flex flex-col gap-4">
      <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', banner.tone)}>
        <banner.Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex flex-col">
          <span className="font-semibold">{banner.title}</span>
          <span className="text-xs opacity-80">{banner.sub}</span>
          {rx.dispensedAt && !cancelled && (
            <span className="mt-0.5 text-xxs opacity-70">
              Closed {new Date(rx.dispensedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {(rx.patient.allergies?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <ShieldAlert className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong className="font-semibold">Allergies:</strong>{' '}
            {rx.patient.allergies?.map((a) => a.allergen).join(', ')}
          </span>
        </div>
      )}

      <Card padding="none" elevation="elevated" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Medicine</th>
                <th className="px-3 py-2 font-medium">Dosing</th>
                <th className="px-3 py-2 text-right font-medium">Prescribed</th>
                <th className="px-3 py-2 text-right font-medium">Unit price</th>
              </tr>
            </thead>
            <tbody>
              {rx.items.map((it, idx) => (
                <tr
                  key={it.id}
                  className={cn(
                    'border-b align-middle last:border-b-0',
                    idx % 2 === 1 && 'bg-muted/15',
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium">
                      {it.medicineName}{' '}
                      <span className="text-xs text-muted-foreground">{it.strength}</span>
                    </div>
                    {it.genericName && (
                      <div className="text-xxs text-muted-foreground">
                        gen: {it.genericName}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {it.dosage} · {it.frequency} · {it.route} · {it.durationDays}d
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                    {it.quantityPrescribed}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(it.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Dispense quantities + payment receipts live on the cashier’s pharmacy
        invoice list — this screen is read-only by design once an Rx is closed.
      </div>

      {/* Print-only receipt — hidden on screen; the global print CSS
          in globals.css masks everything else when window.print()
          fires (triggered by the header Print button), so the printer
          receives just this receipt. */}
      {!cancelled && <PrintableRxReceipt rx={rx} />}
    </div>
  );
}
