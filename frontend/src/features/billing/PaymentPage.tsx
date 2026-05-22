import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { payAppointment, type PayAppointmentResult, type Appointment } from '@/features/appointments';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight,
  Printer, RotateCcw,
} from 'lucide-react';
import { Breadcrumb, StatusPill, type StatusPillProps } from '@/components/data-display';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { FormErrorContainer, FormInput, FormSelect } from '@/components/form';
import { homeForRole, roleHas, useAuth } from '@/features/auth';
import { fetchQueue } from '@/features/encounter';
import {
  createInvoice,
  fetchInvoiceByOpNumber,
  fetchPayments,
  fetchServices,
  recordPayment,
  refundPayment,
  resolveLineDiscount,
  updateInvoice,
} from './billingApi';
import { PrintableInvoice } from './components/PrintableInvoice';
import { ShiftLockedBanner } from './components/ShiftLockedBanner';
import { useShiftLock } from './hooks/useShiftLock';
import type {
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  LineDiscount,
  Payment,
  PaymentMethod,
  Service,
  UpdateInvoiceLineInput,
} from './billingTypes';
import { formatCurrency } from '@/utils/formatCurrency';
import { cn } from '@/utils/cn';

const statusTone: Record<InvoiceStatus, StatusPillProps['tone']> = {
  draft: 'neutral',
  billed: 'info',
  partially_paid: 'warning',
  paid: 'success',
  cancelled: 'neutral',
};

const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  billed: 'Billed',
  partially_paid: 'Partial',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const PAYMENT_FORM_ID = 'invoice-payment-form';
const PAYMENTS_PER_PAGE = 5;

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Required'),
  method: z.enum(['cash', 'upi', 'card', 'netbanking', 'insurance']),
  referenceNo: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.method === 'upi' && !data.referenceNo?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referenceNo'],
      message: 'Required for UPI',
    });
  }
});
type PaymentFormValues = z.infer<typeof paymentSchema>;

export function PaymentPage(): JSX.Element {
  const { opNumber: opNumberParam = '', appointmentId: apptIdParam = '' } =
    useParams<{ opNumber?: string; appointmentId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const homePath = user ? homeForRole(user.role) : '/';
  const allowed = user ? roleHas(user.role, 'take_payment') : false;
  const shiftLock = useShiftLock();

  /* ---------- Appointment-payment mode ---------- */
  // appointmentId comes from the URL param; appt data from router state (for display).
  const appointmentId = apptIdParam;
  const apptData = (location.state as { appt?: Appointment } | null)?.appt;
  const isApptMode = Boolean(appointmentId);
  // apptResult may come from location.state when component remounts after navigate()
  const stateApptResult = (location.state as { apptResult?: PayAppointmentResult } | null)?.apptResult ?? null;
  const [apptResult, setApptResult] = useState<PayAppointmentResult | null>(stateApptResult);
  // Payment values passed via nav state so a post-navigate remount can auto-record them
  const pendingPayValues = useRef<PaymentFormValues | null>(
    (location.state as { pendingPayValues?: PaymentFormValues } | null)?.pendingPayValues ?? null,
  );
  // In appointment mode, opNumber comes from the pay response (not URL)
  const opNumber = isApptMode ? (apptResult?.opNumber ?? '') : opNumberParam;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState<boolean>(!isApptMode);
  const [error, setError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Pre-loaded consultation service shown as a preview before payment is confirmed.
  const [apptPreview, setApptPreview] = useState<Service | null>(null);
  // Discount the cashier can apply on the appointment pre-payment screen.
  const [apptDiscountKind, setApptDiscountKind] = useState<'pct' | 'amt'>('pct');
  const [apptDiscountValue, setApptDiscountValue] = useState<number>(0);
  // Carried through navigation state so the auto-pay effect can patch the invoice line.
  const pendingDiscount = useRef<LineDiscount | null>(
    (location.state as { pendingDiscount?: LineDiscount } | null)?.pendingDiscount ?? null,
  );

  const [rows, setRows] = useState<EditRow[]>([]);
  const rowsRef = useRef<EditRow[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState<boolean>(true);
  const [payPage, setPayPage] = useState(1);
  const [refundExpandedId, setRefundExpandedId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState<string>('');
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const {
    register, handleSubmit, reset, control, setValue,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: 'cash' },
  });

  const watchedMethod = useWatch({ control, name: 'method' });

  const loadPayments = async (inv: Invoice): Promise<void> => {
    setPaymentsLoading(true);
    try {
      const all = await fetchPayments({});
      setPayments(all.filter((p) => p.invoiceId === inv.id));
    } finally {
      setPaymentsLoading(false);
    }
  };

  const reload = async (): Promise<void> => {
    setLoading(true);
    try {
      // op_number -> op_visit_id -> invoices. The old fetchInvoices({q})
      // path substring-matched against invoice_number (INV-…) which
      // could never resolve an op_number (OP-…) — see
      // fetchInvoiceByOpNumber TSDoc for the full story.
      let match = await fetchInvoiceByOpNumber(opNumber);
      if (!match) {
        const queue = await fetchQueue({ q: opNumber });
        const entry = queue.find((q) => q.opNumber === opNumber);
        if (entry) {
          const services = await fetchServices('consultation');
          const consult = services.find((s) => s.code === 'CONS-OPD');
          if (consult) {
            await createInvoice({
              patientId: entry.patient.id,
              patientSnapshot: entry.patient,
              opNumber,
              station: 'front_desk',
              lines: [{ serviceId: consult.id, quantity: 1 }],
            });
            match = await fetchInvoiceByOpNumber(opNumber);
          }
        }
      }
      setInvoice(match);
      setRows(match ? match.lines.map(toEditRow) : []);
      setError(match ? null : `No invoice found for ${opNumber}.`);
      if (match && match.balance > 0) {
        reset({ amount: match.balance, method: 'cash' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    // In appointment mode we have no opNumber yet — skip until payment is confirmed.
    if (isApptMode && !apptResult) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opNumber, allowed, isApptMode, apptResult]);

  useEffect(() => {
    if (invoice) void loadPayments(invoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  // After an appointment pay + navigate, the component may remount at the new
  // URL. pendingPayValues carries the cashier's method/amount from the old
  // instance. Record it exactly once when the invoice first arrives.
  useEffect(() => {
    const pending = pendingPayValues.current;
    if (!invoice || invoice.balance <= 0 || !pending) return;
    pendingPayValues.current = null;
    const disc = pendingDiscount.current;
    pendingDiscount.current = null;
    // Clear from location state so a page refresh doesn't re-trigger
    navigate(location.pathname, { replace: true, state: { apptResult } });
    setSubmitting(true);
    setPayError(null);
    // If cashier applied a discount, patch the invoice line first then record payment.
    const discountStep =
      disc && invoice.lines[0]
        ? updateInvoice(invoice.id, {
            lines: [{ id: invoice.lines[0].id, lineDiscount: disc }],
          }).catch(() => { /* non-fatal */ })
        : Promise.resolve();
    discountStep.then(() => recordPayment({
      invoiceId: invoice.id,
      amount: pending.amount,
      method: pending.method as PaymentMethod,
      referenceNo: pending.referenceNo,
    }))
      .then(({ invoice: updated }) => {
        setInvoice(updated);
        setRows(updated.lines.map(toEditRow));
        return loadPayments(updated);
      })
      .catch((e) => setPayError(e instanceof Error ? e.message : 'Payment failed'))
      .finally(() => setSubmitting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  // In appointment mode, load the default consultation fee so the cashier sees
  // what will be charged before confirming payment.
  useEffect(() => {
    if (!isApptMode || apptResult) return;
    fetchServices('consultation')
      .then((services) => {
        const consult = services.find((s) => s.code === 'CONS-OPD') ?? services[0] ?? null;
        if (consult) {
          setApptPreview(consult);
          reset({ amount: consult.unitPrice, method: 'cash' });
        }
      })
      .catch(() => { /* non-fatal — form still usable */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApptMode, apptResult]);

  const flushLineEdits = async (): Promise<void> => {
    if (!invoice) return;
    const dirtyRows = rowsRef.current.filter(isRowDirty);
    if (dirtyRows.length === 0) return;
    const patch: UpdateInvoiceLineInput[] = dirtyRows.map((r) => ({
      id: r.id,
      quantity: r.quantity,
      lineDiscount: editToDiscount(r) ?? null,
      notes: r.notes,
    }));
    await updateInvoice(invoice.id, { lines: patch });
  };

  const onPay = async (values: PaymentFormValues): Promise<void> => {
    if (shiftLock.locked) return;
    setSubmitting(true);
    setPayError(null);
    try {
      if (isApptMode && !apptResult) {
        // Phase 1 (appointment): generate OP + token, then navigate.
        // Payment recording happens in the auto-pay useEffect once the invoice
        // loads — this avoids a race when the component remounts at the new URL.
        const res = await payAppointment(appointmentId);
        setApptResult(res);
        pendingPayValues.current = values;
        const disc: LineDiscount | null =
          apptDiscountValue > 0 ? { kind: apptDiscountKind, value: apptDiscountValue } : null;
        pendingDiscount.current = disc;
        navigate(`/payment/${encodeURIComponent(res.opNumber)}`, {
          replace: true,
          state: { apptResult: res, pendingPayValues: values, pendingDiscount: disc },
        });
        return;
      }

      // Phase 2 / regular invoice payment
      if (!invoice) { setPayError('Invoice not found.'); return; }
      await flushLineEdits();
      const { invoice: updated } = await recordPayment({
        invoiceId: invoice.id,
        amount: values.amount,
        method: values.method as PaymentMethod,
        referenceNo: values.referenceNo,
      });
      setInvoice(updated);
      setRows(updated.lines.map(toEditRow));
      if (updated.balance > 0) reset({ amount: updated.balance, method: 'cash' });
      await loadPayments(updated);
      setPayPage(1);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRefund = async (paymentId: string): Promise<void> => {
    const reason = refundReason.trim();
    if (!reason || shiftLock.locked) return;
    setRefundingId(paymentId);
    setPayError(null);
    try {
      const { invoice: updated } = await refundPayment({ paymentId, reason });
      setInvoice(updated);
      setRows(updated.lines.map(toEditRow));
      if (updated.balance > 0) {
        reset({ amount: updated.balance, method: 'cash' });
      }
      setRefundExpandedId(null);
      setRefundReason('');
      await loadPayments(updated);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setRefundingId(null);
    }
  };

  const fullyPaid = invoice ? invoice.balance <= 0 : false;

  // After a successful payment / appointment-pay, send the cashier back
  // to the OP coordination page with the op_number so the row can be
  // scrolled into view + flashed. Pre-payment cancellations route to
  // the bare home path so we don't focus a row that hasn't moved yet.
  //
  // Callers from other stations (e.g. radiology desk collecting their
  // own payment) can pass `?returnTo=/diagnostics/radiology` so the
  // post-payment redirect goes back to THEIR page, not front-desk.
  const returnToParam = new URLSearchParams(location.search).get('returnTo');
  const justPaidOpNumber =
    (apptResult?.opNumber) || (invoice && fullyPaid ? opNumber : '');
  const defaultReturnPath = justPaidOpNumber
    ? `/frontdesk/station?focus=${encodeURIComponent(justPaidOpNumber)}`
    : homePath;
  const returnPath = returnToParam
    ? (justPaidOpNumber
        ? `${returnToParam}${returnToParam.includes('?') ? '&' : '?'}focus=${encodeURIComponent(justPaidOpNumber)}`
        : returnToParam)
    : defaultReturnPath;
  const readOnlyLines = invoice
    ? invoice.status === 'paid' || invoice.status === 'cancelled'
    : true;

  const pagedPayments = useMemo(() => {
    const start = (payPage - 1) * PAYMENTS_PER_PAGE;
    return payments.slice(start, start + PAYMENTS_PER_PAGE);
  }, [payments, payPage]);
  const totalPayPages = Math.ceil(payments.length / PAYMENTS_PER_PAGE);

  if (!allowed) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">
          You do not have permission to take payment.
        </p>
        <Button type="button" variant="outline" onClick={() => navigate(homePath)}>
          Back to home
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {invoice && <PrintableInvoice invoice={invoice} rows={rows} />}

      <div className="flex h-full flex-col overflow-hidden print:hidden">
        <div className="px-4 pt-5 md:px-6 md:pt-6">
          <Breadcrumb
            items={[
              { label: 'Billing' },
              { label: invoice ? invoice.invoiceNumber : opNumber },
            ]}
            homeTo={homePath}
            homeLabel="Home"
          />
        </div>

        <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-5 pt-4 md:px-6">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(returnPath)}
              className="-ml-2 mb-1 h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Billing
            </h1>
            <p className="font-mono text-xxs text-muted-foreground tabular-nums">
              {invoice
                ? `${invoice.patient.fullName} · ${invoice.patient.uhid} · OP ${opNumber}`
                : isApptMode && apptData
                ? `${apptData.patient.fullName} · ${apptData.patient.uhid} · ${apptData.doctorName}`
                : opNumber}
            </p>
          </div>
          {(invoice || (isApptMode && !apptResult)) && (
            <div className="flex flex-wrap items-center gap-2">
              {invoice && (
                <StatusPill tone={statusTone[invoice.status]}>
                  {statusLabel[invoice.status]}
                </StatusPill>
              )}
              {invoice && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-44 justify-center"
                  onClick={() => window.print()}
                >
                  <Printer /> Print
                </Button>
              )}
              {(!invoice || !fullyPaid) && (
                <Button
                  type="submit"
                  form={PAYMENT_FORM_ID}
                  className="w-44 justify-center"
                  disabled={submitting || isSubmitting || shiftLock.locked}
                >
                  {submitting || isSubmitting ? <Spinner size="sm" /> : <Check />}
                  {submitting || isSubmitting ? 'Confirming...' : 'Confirm payment'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-44 justify-center"
                onClick={() => navigate(returnPath)}
                disabled={submitting}
              >
                {justPaidOpNumber ? 'Back to queue' : 'Cancel'}
              </Button>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto border-t border-hairline">
          <div className="flex flex-col gap-6 px-4 py-5 md:px-6">
            <ShiftLockedBanner lock={shiftLock} />

            {/* Token + OP banner — shown after appointment payment is confirmed */}
            {apptResult && (
              <div className="flex flex-wrap items-center gap-6 rounded-lg border border-success/30 bg-success/5 px-6 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Payment confirmed</p>
                  <p className="text-xs text-muted-foreground">Token and OP number have been generated</p>
                </div>
                <div className="flex items-center gap-6 font-mono text-sm">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">OP Number</div>
                    <div className="text-base font-bold text-foreground">{apptResult.opNumber}</div>
                  </div>
                  <div className="h-6 w-px bg-border" />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Token</div>
                    <div className="text-base font-bold text-foreground">{apptResult.tokenNumber}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Appointment mode before payment: show charge preview + form */}
            {isApptMode && !apptResult && !loading ? (
              <>
                {/* Method + Ref no on top of the table — matches the
                    invoice-mode layout below so the cashier reaches for
                    the same fields in the same place regardless of
                    entry point. Amount stays at the bottom alongside
                    the discount / pay-in-full link. */}
                <form id={PAYMENT_FORM_ID} onSubmit={handleSubmit(onPay)}>
                  <div className="flex flex-wrap items-end gap-6 pb-4">
                    <div className="min-w-[8rem]">
                      <FormSelect
                        variant="flat" label="Method"
                        error={errors.method?.message}
                        {...register('method')}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="netbanking">Net banking</option>
                        <option value="insurance">Insurance</option>
                      </FormSelect>
                    </div>
                    <div className="min-w-[10rem]">
                      <FormInput
                        variant="flat" label="Ref no."
                        placeholder={watchedMethod === 'upi' ? 'UPI txn ref *' : 'Ref no. (optional)'}
                        error={errors.referenceNo?.message}
                        {...register('referenceNo')}
                      />
                    </div>
                  </div>
                </form>

                {/* Charge preview — read-only, shows what will be billed */}
                {apptPreview && (() => {
                  const gross = apptPreview.unitPrice;
                  const disc = resolveLineDiscount(
                    apptDiscountValue > 0 ? { kind: apptDiscountKind, value: apptDiscountValue } : undefined,
                    gross,
                  );
                  const net = gross - disc;
                  return (
                    <div className="mb-5">
                      <table className="min-w-full table-fixed text-sm">
                        <thead>
                          <tr className="border-b border-hairline text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-4">Service</th>
                            <th className="w-32 py-2 pr-4">Code</th>
                            <th className="w-12 py-2 pr-4 text-right">Qty</th>
                            <th className="w-48 py-2 pr-4">Discount</th>
                            <th className="w-28 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-hairline">
                            <td className="py-2.5 pr-4 font-medium">{apptPreview.name}</td>
                            <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{apptPreview.code}</td>
                            <td className="py-2.5 pr-4 text-right tabular-nums">1</td>
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-1.5">
                                <div role="group" className="inline-flex h-7 overflow-hidden rounded-md border bg-background text-xs">
                                  {(['pct', 'amt'] as const).map((k) => (
                                    <button key={k} type="button"
                                      onClick={() => { setApptDiscountKind(k); setValue('amount', resolveLineDiscount(apptDiscountValue > 0 ? { kind: k, value: apptDiscountValue } : undefined, gross) > 0 ? gross - resolveLineDiscount({ kind: k, value: apptDiscountValue }, gross) : gross); }}
                                      className={cn('px-2 transition-colors', apptDiscountKind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                                    >{k === 'pct' ? '%' : '₹'}</button>
                                  ))}
                                </div>
                                <input
                                  type="number" inputMode="decimal" min={0} step="0.01"
                                  max={apptDiscountKind === 'pct' ? 100 : gross}
                                  value={apptDiscountValue || ''}
                                  onChange={(e) => {
                                    const v = Number(e.target.value) || 0;
                                    setApptDiscountValue(v);
                                    const d = resolveLineDiscount(v > 0 ? { kind: apptDiscountKind, value: v } : undefined, gross);
                                    setValue('amount', gross - d);
                                  }}
                                  placeholder="0"
                                  className="w-16 border-b border-hairline bg-transparent py-1 text-sm outline-none focus:border-primary"
                                />
                              </div>
                              {disc > 0 && (
                                <div className="mt-1 text-xs text-success">−{formatCurrency(disc)}</div>
                              )}
                            </td>
                            <td className="py-2.5 text-right tabular-nums font-medium w-28">{formatCurrency(net)}</td>
                          </tr>
                        </tbody>
                      </table>
                      <BillSummary total={gross} paid={0} balance={net} />
                    </div>
                  );
                })()}

                {payError && (
                  <FormErrorContainer title="Action failed." description={payError} />
                )}
                {/* Amount lives under the table because it depends on the
                    discount the cashier just keyed in. Hooked into the
                    same #PAYMENT_FORM_ID form via the `form` attribute
                    so the top-of-page Confirm-payment toolbar button
                    submits Method + Ref + Amount together. */}
                <div className="flex flex-wrap items-end justify-end gap-6 pb-4">
                  <div className="min-w-[8rem]">
                    <FormInput
                      form={PAYMENT_FORM_ID}
                      variant="flat" label="Amount" type="number"
                      error={errors.amount?.message}
                      {...register('amount')}
                    />
                    {apptPreview && (() => {
                      const gross = apptPreview.unitPrice;
                      const disc = resolveLineDiscount(apptDiscountValue > 0 ? { kind: apptDiscountKind, value: apptDiscountValue } : undefined, gross);
                      const net = gross - disc;
                      return (
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">Balance {formatCurrency(net)}</span>
                          <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setValue('amount', net)}>
                            Pay in full
                          </button>
                        </div>
                      );
                    })()}
                    <span className="text-[11px] text-muted-foreground/70">
                      Enter less for a partial payment — balance stays open.
                    </span>
                  </div>
                </div>
              </>
            ) : loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" /> Loading invoice...
              </div>
            ) : error || !invoice ? (
              <p className="text-sm text-muted-foreground">{error ?? 'Invoice not found.'}</p>
            ) : (
              <>
                {payError && (
                  <FormErrorContainer title="Action failed." description={payError} />
                )}

                <form id={PAYMENT_FORM_ID} onSubmit={handleSubmit(onPay)}>
                  {!fullyPaid && (
                    <div className="flex flex-wrap items-end justify-end gap-6 pb-4">
                      <div className="min-w-[8rem]">
                        <FormSelect
                          variant="flat"
                          label="Method"
                          error={errors.method?.message}
                          {...register('method')}
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                          <option value="netbanking">Net banking</option>
                          <option value="insurance">Insurance</option>
                        </FormSelect>
                      </div>
                      <div className="min-w-[10rem]">
                        <FormInput
                          variant="flat"
                          label="Ref no."
                          placeholder={
                            watchedMethod === 'upi' ? 'UPI txn ref *' : 'Ref no. (optional)'
                          }
                          error={errors.referenceNo?.message}
                          {...register('referenceNo')}
                        />
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto pt-4">
                    <InvoiceLinesTable
                      rows={rows}
                      onChangeRow={(id, patch) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
                        )
                      }
                      readOnly={readOnlyLines}
                    />
                  </div>

                  {/* ── Bill summary strip ── */}
                  <BillSummary
                    total={invoice.total}
                    paid={Number((invoice.total - invoice.balance).toFixed(2))}
                    balance={invoice.balance}
                    status={invoice.status}
                  />

                  {!fullyPaid && (
                    <div className="flex flex-wrap items-end gap-6 border-t border-hairline pt-4">
                      <div className="flex min-w-[9rem] flex-col gap-0.5">
                        <FormInput
                          variant="flat"
                          label="Amount to pay"
                          placeholder="Amount to pay"
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          error={errors.amount?.message}
                          trailing={
                            <span className="text-xs text-muted-foreground">INR</span>
                          }
                          {...register('amount')}
                        />
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            Balance {formatCurrency(invoice.balance)}
                          </span>
                          <button
                            type="button"
                            className="text-xs text-primary underline-offset-2 hover:underline"
                            onClick={() => setValue('amount', invoice.balance)}
                          >
                            Pay in full
                          </button>
                        </div>
                        <span className="text-[11px] text-muted-foreground/70">
                          Enter less for a partial payment — balance stays open.
                        </span>
                      </div>
                    </div>
                  )}
                </form>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Payments on this invoice
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {payments.length}{' '}
                      {payments.length === 1 ? 'payment' : 'payments'}
                    </span>
                  </div>

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
                            <th className="py-2 pr-4">Date</th>
                            <th className="py-2 pr-4">Amount</th>
                            <th className="py-2 pr-4">Method</th>
                            <th className="py-2 pr-4">Ref</th>
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
                                  <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                    <div>
                                      {new Date(p.receivedAt).toLocaleDateString()}
                                    </div>
                                    <div>
                                      {new Date(p.receivedAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <span
                                      className={cn(
                                        'font-mono font-medium tabular-nums',
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
                                      className="ml-2"
                                    >
                                      {p.status === 'refunded'
                                        ? 'Refunded'
                                        : p.amount < 0
                                          ? 'Refund'
                                          : 'Paid'}
                                    </StatusPill>
                                  </td>
                                  <td className="py-2.5 pr-4 capitalize">{p.method}</td>
                                  <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                                    {p.referenceNo ?? '—'}
                                  </td>
                                  <td className="py-2.5">
                                    {p.status === 'succeeded' &&
                                      p.amount > 0 &&
                                      !refundExpanded && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          disabled={
                                            refundingId !== null || shiftLock.locked
                                          }
                                          onClick={() => {
                                            setRefundExpandedId(p.id);
                                            setRefundReason('');
                                          }}
                                        >
                                          <RotateCcw className="h-3.5 w-3.5" /> Refund
                                        </Button>
                                      )}
                                  </td>
                                </tr>
                                {refundExpanded && (
                                  <tr className="border-b">
                                    <td colSpan={5} className="pb-3 pt-1">
                                      <div className="flex flex-col gap-2 rounded-md border border-hairline bg-muted/30 p-3">
                                        <label className="flex flex-col gap-1">
                                          <span className="text-xs font-medium text-muted-foreground">
                                            Reason for refund{' '}
                                            <span className="text-danger">*</span>
                                          </span>
                                          <textarea
                                            value={refundReason}
                                            onChange={(e) =>
                                              setRefundReason(e.target.value)
                                            }
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
                                            disabled={
                                              inFlight || refundReason.trim().length === 0
                                            }
                                          >
                                            {inFlight ? (
                                              <Spinner size="sm" />
                                            ) : (
                                              <RotateCcw className="h-3.5 w-3.5" />
                                            )}
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
                        <div className="flex items-center justify-end gap-2 pt-3">
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
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ---------- Editable invoice lines ---------- */

interface EditRow {
  id: string;
  source: InvoiceLine;
  quantity: number;
  discountKind: 'pct' | 'amt';
  discountValue: number;
  notes: string;
}

const toEditRow = (l: InvoiceLine): EditRow => ({
  id: l.id,
  source: l,
  quantity: l.quantity,
  discountKind: l.lineDiscount?.kind ?? 'pct',
  discountValue: l.lineDiscount?.value ?? 0,
  notes: l.notes ?? '',
});

const editToDiscount = (r: EditRow): LineDiscount | undefined =>
  r.discountValue > 0 ? { kind: r.discountKind, value: r.discountValue } : undefined;

const isRowDirty = (r: EditRow): boolean => {
  const src = r.source;
  if (r.quantity !== src.quantity) return true;
  if ((r.notes || '') !== (src.notes || '')) return true;
  const a = editToDiscount(r);
  const b = src.lineDiscount;
  if (!a && !b) return false;
  if (!a || !b) return true;
  return a.kind !== b.kind || a.value !== b.value;
};

/* ── Bill summary strip ─────────────────────────────────────────────────────── */

interface BillSummaryProps {
  total: number;
  paid: number;
  balance: number;
  status?: InvoiceStatus;
}

function BillSummary({ total, paid, balance, status }: BillSummaryProps): JSX.Element {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-px overflow-hidden rounded-lg border border-hairline text-sm">
      <div className="flex flex-col items-center gap-0.5 bg-muted/20 px-6 py-3">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoice total</span>
        <span className="font-mono font-semibold tabular-nums">{formatCurrency(total)}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5 bg-muted/20 px-6 py-3">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</span>
        <span className={cn('font-mono font-semibold tabular-nums', paid > 0 && 'text-success')}>
          {formatCurrency(paid)}
        </span>
      </div>
      <div className="flex flex-col items-center gap-0.5 bg-muted/20 px-6 py-3">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</span>
        <span className={cn('font-mono font-semibold tabular-nums', balance > 0 && 'text-warning')}>
          {formatCurrency(balance)}
        </span>
      </div>
      {status && (
        <div className="flex flex-col items-center gap-0.5 bg-muted/20 px-6 py-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</span>
          <StatusPill tone={statusTone[status]} size="sm">
            {statusLabel[status]}
          </StatusPill>
        </div>
      )}
    </div>
  );
}

/* ── Editable invoice lines ──────────────────────────────────────────────────── */

function InvoiceLinesTable({
  rows,
  onChangeRow,
  readOnly,
}: {
  rows: EditRow[];
  onChangeRow: (id: string, patch: Partial<EditRow>) => void;
  readOnly: boolean;
}): JSX.Element {
  const preview = useMemo(() => {
    let grossTotal = 0;
    let discountTotal = 0;
    let subtotal = 0;
    let tax = 0;
    for (const r of rows) {
      const gross = r.source.unitPrice * r.quantity;
      const disc = resolveLineDiscount(editToDiscount(r), gross);
      const net = gross - disc;
      grossTotal += gross;
      discountTotal += disc;
      subtotal += net;
      tax += (net * r.source.gstPct) / 100;
    }
    return {
      gross: Number(grossTotal.toFixed(2)),
      discount: Number(discountTotal.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      total: Number((subtotal + tax).toFixed(2)),
    };
  }, [rows]);

  const dirty = rows.some(isRowDirty);

  return (
    <table className="min-w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <th className="py-2.5 pr-4">Service</th>
          <th className="py-2.5 pr-4 w-14">Qty</th>
          <th className="py-2.5 pr-4 w-28">Price</th>
          <th className="py-2.5 pr-4 w-40">Discount</th>
          <th className="py-2.5 pr-4 w-28">Notes</th>
          <th className="py-2.5 w-24">Line</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const gross = r.source.unitPrice * r.quantity;
          const disc = resolveLineDiscount(editToDiscount(r), gross);
          const net = gross - disc;
          return (
            <tr key={r.id} className="border-b align-top last:border-b-0">
              <td className="py-3 pr-4">
                <div className="font-medium">{r.source.serviceName}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {r.source.serviceCode}
                </div>
              </td>
              <td className="py-3 pr-4 w-14">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  disabled={readOnly}
                  value={r.quantity}
                  onChange={(e) =>
                    onChangeRow(r.id, { quantity: Number(e.target.value) || 0 })
                  }
                  className="w-10 border-b border-hairline bg-transparent py-1 text-sm outline-none focus:border-primary disabled:opacity-50"
                />
              </td>
              <td className="py-3 pr-4 tabular-nums">
                {formatCurrency(r.source.unitPrice)}
                <div className="text-[11px] text-muted-foreground">
                  + {r.source.gstPct}% GST
                </div>
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-1.5">
                  <div
                    role="group"
                    aria-label="Discount mode"
                    className="inline-flex h-8 overflow-hidden rounded-md border bg-background text-xs"
                  >
                    {(['pct', 'amt'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        disabled={readOnly}
                        onClick={() => onChangeRow(r.id, { discountKind: k })}
                        className={cn(
                          'px-2 transition-colors',
                          r.discountKind === k
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted',
                          readOnly && 'opacity-50',
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
                    max={r.discountKind === 'pct' ? 100 : gross}
                    disabled={readOnly}
                    value={r.discountValue || ''}
                    onChange={(e) =>
                      onChangeRow(r.id, { discountValue: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-16 border-b border-hairline bg-transparent py-1 text-sm outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
                {disc > 0 && (
                  <div className="mt-1 text-xs text-success">
                    {'−'} {formatCurrency(disc)}
                  </div>
                )}
              </td>
              <td className="py-3 pr-4 w-28">
                <input
                  type="text"
                  value={r.notes}
                  disabled={readOnly}
                  onChange={(e) => onChangeRow(r.id, { notes: e.target.value })}
                  placeholder="Optional"
                  className="w-full border-b border-hairline bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary disabled:opacity-50"
                />
              </td>
              <td className="py-3 w-24 tabular-nums font-medium">
                {formatCurrency(net)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot className="text-sm">
        {preview.discount > 0 && (
          <>
            <tr>
              <td colSpan={5} className="px-0 pt-3 text-right text-muted-foreground">
                Gross
              </td>
              <td className="pt-3 text-right tabular-nums text-muted-foreground">
                {formatCurrency(preview.gross)}
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="px-0 text-right text-success">
                Discount
              </td>
              <td className="text-right tabular-nums text-success">
                −{formatCurrency(preview.discount)}
              </td>
            </tr>
          </>
        )}
        <tr>
          <td colSpan={5} className={cn('px-0 text-right text-muted-foreground', preview.discount === 0 && 'pt-3')}>
            Subtotal
          </td>
          <td className={cn('text-right tabular-nums', preview.discount === 0 && 'pt-3')}>
            {formatCurrency(preview.subtotal)}
          </td>
        </tr>
        <tr>
          <td colSpan={5} className="px-0 text-right text-muted-foreground">Tax</td>
          <td className="text-right tabular-nums">{formatCurrency(preview.tax)}</td>
        </tr>
        <tr className="border-t">
          <td colSpan={5} className="px-0 pt-2 text-right font-semibold">
            Total
            {dirty && (
              <span className="ml-2 text-xxs font-normal text-warning">
                · unsaved — applied with payment
              </span>
            )}
          </td>
          <td className="pt-2 text-right tabular-nums font-semibold">
            {formatCurrency(preview.total)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
