import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { FormErrorContainer } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { StatusPill } from '@/components/data-display';
import { fetchPayments, recordPayment, refundPayment } from '../billingApi';
import { allocatePaymentToCategories } from '../paymentAllocation';
import {
  ANALYTICS_CATEGORIES,
  ANALYTICS_CATEGORY_LABEL,
  type AnalyticsCategory,
} from '../categoryBuckets';
import { useCurrentCounterStore } from '../currentCounterStore';
import type { Invoice, Payment, PaymentMethod } from '../billingTypes';
import { formatCurrency } from '@/utils/formatCurrency';
import { useShiftLock } from '../hooks/useShiftLock';
import { ShiftLockedBanner } from './ShiftLockedBanner';
import { cn } from '@/utils/cn';

const PAYMENTS_PER_PAGE = 5;
const TENDER_METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'netbanking', 'insurance'];
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
  insurance: 'Insurance',
};

interface TenderRow {
  rowId: string;
  method: PaymentMethod;
  amount: number;
  referenceNo: string;
}

let tenderRowSeq = 1;
const newTenderRow = (amount: number): TenderRow => ({
  rowId: `tender-${tenderRowSeq++}`,
  method: 'cash',
  amount,
  referenceNo: '',
});

interface InvoicePaymentPanelProps {
  invoice: Invoice;
  onUpdated: () => void | Promise<void>;
}

export function InvoicePaymentPanel({
  invoice,
  onUpdated,
}: InvoicePaymentPanelProps): JSX.Element {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payPage, setPayPage] = useState(1);
  const [refundExpandedId, setRefundExpandedId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState<string>('');
  const shiftLock = useShiftLock();
  const counterId = useCurrentCounterStore((s) => s.counterId);

  const [tenders, setTenders] = useState<TenderRow[]>(() => [
    newTenderRow(invoice.balance > 0 ? invoice.balance : 0),
  ]);

  // Reset tender rows whenever the outstanding balance changes (a
  // partial refund or a different invoice mounted). Default to a
  // single row that covers the whole balance — the "pay in full"
  // happy path. Multi-tender users click "Add tender" to split.
  useEffect(() => {
    setTenders([newTenderRow(invoice.balance > 0 ? invoice.balance : 0)]);
  }, [invoice.id, invoice.balance]);

  const loadPayments = async (): Promise<void> => {
    setPaymentsLoading(true);
    try {
      const all = await fetchPayments({});
      setPayments(all.filter((p) => p.invoiceId === invoice.id));
    } finally {
      setPaymentsLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id]);

  const tenderSum = useMemo(
    () => Number(tenders.reduce((s, t) => s + (Number.isFinite(t.amount) ? t.amount : 0), 0).toFixed(2)),
    [tenders],
  );

  const balanceMatched = Math.abs(tenderSum - invoice.balance) < 0.005;
  const hasInvalidUpiRef = tenders.some(
    (t) => t.method === 'upi' && t.referenceNo.trim().length === 0,
  );
  const hasNonPositiveTender = tenders.some((t) => t.amount <= 0);

  /**
   * Category preview — proportional split of the total payment across
   * the invoice's line categories. Same allocator the dashboard uses
   * on read, so the cashier sees exactly how the collection will tag
   * the analytics buckets before confirming.
   */
  const categoryPreview = useMemo<Record<AnalyticsCategory, number>>(
    () => allocatePaymentToCategories({ amount: tenderSum }, invoice.lines),
    [tenderSum, invoice.lines],
  );
  const nonZeroCategories = ANALYTICS_CATEGORIES.filter(
    (c) => categoryPreview[c] !== 0,
  );

  const onSubmit = async (): Promise<void> => {
    if (shiftLock.locked) {
      setError('Cashier shift is not open on this counter — payments are paused.');
      return;
    }
    if (!balanceMatched) {
      setError(`Tender total must equal the outstanding balance (${formatCurrency(invoice.balance)}).`);
      return;
    }
    if (hasInvalidUpiRef) {
      setError('UPI tenders need a transaction reference.');
      return;
    }
    if (hasNonPositiveTender) {
      setError('Each tender row must be a positive amount.');
      return;
    }

    setBusy(true);
    setError(null);
    let recordedCount = 0;
    try {
      for (const t of tenders) {
        await recordPayment({
          invoiceId: invoice.id,
          amount: t.amount,
          method: t.method,
          referenceNo: t.referenceNo.trim() || undefined,
          counterId,
        });
        recordedCount += 1;
      }
      await loadPayments();
      await onUpdated();
      setPayPage(1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payment failed';
      if (recordedCount > 0) {
        setError(
          `Tender ${recordedCount + 1} failed — tenders 1..${recordedCount} were already recorded. ${msg}`,
        );
        await loadPayments();
        await onUpdated();
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const addTenderRow = (): void => {
    const remaining = Number((invoice.balance - tenderSum).toFixed(2));
    setTenders((prev) => [...prev, newTenderRow(remaining > 0 ? remaining : 0)]);
  };
  const removeTenderRow = (rowId: string): void => {
    setTenders((prev) => (prev.length > 1 ? prev.filter((t) => t.rowId !== rowId) : prev));
  };
  const updateTenderRow = (rowId: string, patch: Partial<TenderRow>): void => {
    setTenders((prev) =>
      prev.map((t) => (t.rowId === rowId ? { ...t, ...patch } : t)),
    );
  };

  const confirmRefund = async (paymentId: string): Promise<void> => {
    const reason = refundReason.trim();
    if (!reason) {
      setError('Reason required to refund.');
      return;
    }
    if (shiftLock.locked) {
      setError('Cashier shift is not open on this counter — refunds are paused.');
      return;
    }
    setRefundingId(paymentId);
    setError(null);
    try {
      await refundPayment({ paymentId, reason });
      setRefundExpandedId(null);
      setRefundReason('');
      await loadPayments();
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setRefundingId(null);
    }
  };

  const fullyPaid = invoice.balance <= 0;
  const pagedPayments = useMemo(() => {
    const start = (payPage - 1) * PAYMENTS_PER_PAGE;
    return payments.slice(start, start + PAYMENTS_PER_PAGE);
  }, [payments, payPage]);
  const totalPayPages = Math.ceil(payments.length / PAYMENTS_PER_PAGE);

  const submitDisabled =
    busy ||
    shiftLock.locked ||
    !balanceMatched ||
    hasInvalidUpiRef ||
    hasNonPositiveTender;

  return (
    <div className="flex flex-col gap-4">
      <ShiftLockedBanner lock={shiftLock} />

      <Card>
        <CardHeader>
          <CardTitle>Confirm payment</CardTitle>
          <CardLabel>{fullyPaid ? 'Settled' : 'Balance pending'}</CardLabel>
        </CardHeader>

        {error && (
          <FormErrorContainer title="Action failed." description={error} />
        )}

        {fullyPaid ? (
          <p className="text-sm text-muted-foreground">
            This invoice is fully paid. Refund individual payments below if needed.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {tenders.map((t, idx) => (
                <TenderRowField
                  key={t.rowId}
                  row={t}
                  index={idx}
                  onChange={(patch) => updateTenderRow(t.rowId, patch)}
                  onRemove={tenders.length > 1 ? () => removeTenderRow(t.rowId) : undefined}
                  disabled={busy || shiftLock.locked}
                />
              ))}
            </div>

            <div className="flex items-center justify-between border-t pt-2 text-xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addTenderRow}
                disabled={busy || shiftLock.locked}
                className="h-7 px-2 text-xxs"
              >
                <Plus className="h-3 w-3" /> Add tender
              </Button>
              <div className="font-mono tabular-nums">
                <span className="text-muted-foreground">Tendered </span>
                <span className={cn('font-semibold', balanceMatched ? 'text-success' : 'text-warning')}>
                  {formatCurrency(tenderSum)}
                </span>
                <span className="text-muted-foreground"> · Balance </span>
                <span className="font-semibold">{formatCurrency(invoice.balance)}</span>
              </div>
            </div>

            {nonZeroCategories.length > 0 && (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-xxs">
                <div className="mb-1 font-semibold text-muted-foreground">
                  Will tag analytics buckets
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {nonZeroCategories.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground">{ANALYTICS_CATEGORY_LABEL[c]}</span>
                      <span className="font-mono tabular-nums font-medium">
                        {formatCurrency(categoryPreview[c])}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              type="button"
              onClick={() => void onSubmit()}
              disabled={submitDisabled}
              className="w-full justify-center"
            >
              {busy ? <Spinner size="sm" /> : <Check />}
              {busy
                ? 'Confirming...'
                : shiftLock.locked
                  ? 'Shift not open'
                  : tenders.length === 1
                    ? 'Confirm payment'
                    : `Confirm ${tenders.length} tenders`}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments on this invoice</CardTitle>
          <CardLabel>{payments.length}</CardLabel>
        </CardHeader>
        {paymentsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" /> Loading...
          </div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pagedPayments.map((p) => {
                  const refundExpanded = refundExpandedId === p.id;
                  const inFlight = refundingId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-b align-top last:border-b-0">
                        <td className="py-2.5 pr-3">
                          <span
                            className={cn(
                              'font-mono font-medium tabular-nums text-xs',
                              p.amount < 0 && 'text-danger',
                            )}
                          >
                            {formatCurrency(p.amount)}
                          </span>
                          <StatusPill
                            tone={
                              p.status === 'refunded'
                                ? 'neutral'
                                : p.amount < 0
                                  ? 'danger'
                                  : 'success'
                            }
                            size="sm"
                            className="ml-1"
                          >
                            {p.status === 'refunded'
                              ? 'Refunded'
                              : p.amount < 0
                                ? 'Refund'
                                : 'Paid'}
                          </StatusPill>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {new Date(p.receivedAt).toLocaleString()}
                            {p.referenceNo ? ` · ${p.referenceNo}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 capitalize text-xs">{p.method}</td>
                        <td className="py-2.5">
                          {p.status === 'succeeded' && p.amount > 0 && !refundExpanded && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={refundingId !== null || shiftLock.locked}
                              onClick={() => {
                                setRefundExpandedId(p.id);
                                setRefundReason('');
                              }}
                            >
                              <RotateCcw className="h-3 w-3" /> Refund
                            </Button>
                          )}
                        </td>
                      </tr>
                      {refundExpanded && (
                        <tr className="border-b">
                          <td colSpan={3} className="pb-3 pt-1">
                            <div className="flex flex-col gap-2 rounded-md border border-hairline bg-muted/30 p-3">
                              <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-muted-foreground">
                                  Reason <span className="text-danger">*</span>
                                </span>
                                <textarea
                                  value={refundReason}
                                  onChange={(e) => setRefundReason(e.target.value)}
                                  autoFocus
                                  rows={2}
                                  placeholder="Why is this being refunded?"
                                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              </label>
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={inFlight}
                                  onClick={() => {
                                    setRefundExpandedId(null);
                                    setRefundReason('');
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void confirmRefund(p.id)}
                                  disabled={inFlight || refundReason.trim().length === 0}
                                >
                                  {inFlight ? <Spinner size="sm" /> : <RotateCcw className="h-3 w-3" />}
                                  {inFlight ? 'Refunding...' : 'Confirm refund'}
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {totalPayPages > 1 && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <span className="text-xs text-muted-foreground">
                  {payPage} / {totalPayPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={payPage === 1}
                  onClick={() => setPayPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={payPage === totalPayPages}
                  onClick={() => setPayPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ---------- TenderRowField ---------- */

interface TenderRowFieldProps {
  row: TenderRow;
  index: number;
  onChange: (patch: Partial<TenderRow>) => void;
  onRemove?: () => void;
  disabled: boolean;
}

function TenderRowField({
  row,
  index,
  onChange,
  onRemove,
  disabled,
}: TenderRowFieldProps): JSX.Element {
  const upiRefMissing = row.method === 'upi' && row.referenceNo.trim().length === 0;
  return (
    <div className="grid grid-cols-[1fr_1.4fr_1.4fr_auto] gap-2 rounded-md border bg-background p-2 text-sm">
      <select
        value={row.method}
        onChange={(e) => onChange({ method: e.target.value as PaymentMethod })}
        disabled={disabled}
        aria-label={`Tender ${index + 1} method`}
        className="h-9 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        {TENDER_METHODS.map((m) => (
          <option key={m} value={m}>
            {METHOD_LABEL[m]}
          </option>
        ))}
      </select>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={row.amount || ''}
        onChange={(e) => onChange({ amount: Number(e.target.value) || 0 })}
        disabled={disabled}
        placeholder="Amount"
        aria-label={`Tender ${index + 1} amount`}
        className="h-9 rounded-md border bg-background px-2 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
      <input
        type="text"
        value={row.referenceNo}
        onChange={(e) => onChange({ referenceNo: e.target.value })}
        disabled={disabled}
        placeholder={row.method === 'upi' ? 'UPI txn ref *' : 'Ref no. (optional)'}
        aria-label={`Tender ${index + 1} reference`}
        className={cn(
          'h-9 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50',
          upiRefMissing && 'border-warning',
        )}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled || !onRemove}
        className="h-9 w-9 text-muted-foreground hover:text-danger"
        aria-label={`Remove tender ${index + 1}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
