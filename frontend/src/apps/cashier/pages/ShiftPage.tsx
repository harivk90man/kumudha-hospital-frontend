import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eraser,
  Lock,
  Sun,
  Sunset,
  Unlock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Breadcrumb, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { FormErrorContainer, FormTextarea } from '@/components/form';
import { Spinner } from '@/components/feedback/Spinner';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn } from '@/utils/cn';
import { homeForRole, useAuth, userHas } from '@/features/auth';
import {
  ANALYTICS_CATEGORIES,
  ANALYTICS_CATEGORY_LABEL,
  DEFAULT_COUNTER_ID,
  fetchInvoices,
  fetchPayments,
  recordShiftCloseInDb,
  recordShiftOpenInDb,
  resolveActiveShift,
  resolveShift,
  SHIFT_WINDOWS,
  sumCategoryAllocations,
  useCurrentCounterStore,
  useShiftCloseStore,
  type AnalyticsCategory,
  type Invoice,
  type Payment,
  type PaymentMethod,
  type ResolvedShift,
  type ShiftCloseRecord,
  type ShiftMethodTotal,
  type ShiftOpenRecord,
  type ShiftType,
} from '@/features/billing';
import { formatCurrency } from '@/utils/formatCurrency';

const METHOD_ORDER: PaymentMethod[] = ['cash', 'upi', 'card', 'netbanking', 'insurance'];

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
  insurance: 'Insurance',
};

const SHIFT_LABEL: Record<ShiftType, string> = {
  morning: 'Morning',
  evening: 'Evening',
};

const SHIFT_ICON: Record<ShiftType, LucideIcon> = {
  morning: Sun,
  evening: Sunset,
};

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatTimeOnly = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

const yesterdayIso = (now: Date): string => {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface SwitcherOption {
  shiftType: ShiftType;
  shiftDate: string;
  label: string;
}

/**
 * Unified cashier-shift page. Replaces the old `ShiftClosePage` —
 * supports both opening (owner / chief_doctor only) and closing
 * (anyone with `close_shift`), shows the per-method tally AND the new
 * per-category breakdown, and persists `categoryTotals` on the close
 * record so historical re-prints stay stable.
 *
 * Layout guard ([CashierLayout](apps/cashier/components/CashierLayout.tsx))
 * admits anyone holding `take_payment | open_shift | close_shift`, so
 * this page itself doesn't redirect — it just disables the action
 * buttons the current user can't perform.
 */
export function ShiftPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [now, setNow] = useState<Date>(() => new Date());
  const counterId = useCurrentCounterStore((s) => s.counterId) || DEFAULT_COUNTER_ID;
  const closeFor = useShiftCloseStore((s) => s.closeFor);
  const recordClose = useShiftCloseStore((s) => s.recordClose);
  const recordOpen = useShiftCloseStore((s) => s.recordOpen);
  const openFor = useShiftCloseStore((s) => s.openFor);
  const closes = useShiftCloseStore((s) => s.closes);

  const canOpen = userHas(user, 'open_shift');
  const canClose = userHas(user, 'close_shift');

  const overrideShiftType = (params.get('shift') as ShiftType | null) ?? null;
  const overrideDate = params.get('date');
  const shift: ResolvedShift = useMemo(() => {
    if (
      (overrideShiftType === 'morning' || overrideShiftType === 'evening') &&
      overrideDate
    ) {
      return resolveShift(overrideShiftType, overrideDate);
    }
    return resolveActiveShift(now);
  }, [now, overrideShiftType, overrideDate]);
  const existingClose = closeFor(counterId, shift.shiftType, shift.shiftDate);
  const existingOpen = openFor(counterId, shift.shiftType, shift.shiftDate);

  const switcherOptions: SwitcherOption[] = useMemo(() => {
    const today = (() => {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    })();
    const yday = yesterdayIso(now);
    return [
      { shiftType: 'morning', shiftDate: today, label: 'Today morning' },
      { shiftType: 'evening', shiftDate: today, label: 'Today evening' },
      { shiftType: 'morning', shiftDate: yday,  label: 'Yesterday morning' },
      { shiftType: 'evening', shiftDate: yday,  label: 'Yesterday evening' },
    ];
  }, [now]);

  const pickShift = (opt: SwitcherOption): void => {
    const np = new URLSearchParams(params);
    np.set('shift', opt.shiftType);
    np.set('date', opt.shiftDate);
    setParams(np, { replace: true });
    setJustClosed(null);
  };

  const clearOverride = (): void => {
    const np = new URLSearchParams(params);
    np.delete('shift');
    np.delete('date');
    setParams(np, { replace: true });
    setJustClosed(null);
  };

  const unclosedPrior = useMemo(() => {
    const candidates = switcherOptions.filter(
      (o) => !(o.shiftType === shift.shiftType && o.shiftDate === shift.shiftDate),
    );
    const out: SwitcherOption[] = [];
    for (const c of candidates) {
      if (!closeFor(counterId, c.shiftType, c.shiftDate)) out.push(c);
    }
    return out.filter((c) => {
      const r = resolveShift(c.shiftType, c.shiftDate);
      return r.windowTo.getTime() < now.getTime();
    });
  }, [switcherOptions, closeFor, counterId, shift.shiftType, shift.shiftDate, now]);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Map<string, Invoice>>(new Map());
  const [loading, setLoading] = useState<boolean>(true);
  const [openingFloat, setOpeningFloat] = useState<number>(existingOpen?.openingFloat ?? 0);
  const [declared, setDeclared] = useState<Record<PaymentMethod, number>>({
    cash: 0,
    upi: 0,
    card: 0,
    netbanking: 0,
    insurance: 0,
  });
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [justClosed, setJustClosed] = useState<ShiftCloseRecord | null>(null);

  useEffect(() => {
    setOpeningFloat(existingOpen?.openingFloat ?? 0);
  }, [existingOpen?.id]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchPayments({ dateFrom: shift.shiftDate, dateTo: shift.shiftDate }),
      fetchInvoices({ dateFrom: shift.shiftDate, dateTo: shift.shiftDate }),
    ])
      .then(([paymentRows, invoiceRows]) => {
        if (!alive) return;
        const inWindow = paymentRows.filter((p) => {
          if (p.counterId !== counterId) return false;
          const t = new Date(p.receivedAt).getTime();
          return (
            t >= shift.windowFrom.getTime() && t <= shift.windowTo.getTime()
          );
        });
        const map = new Map<string, Invoice>();
        for (const inv of invoiceRows) map.set(inv.id, inv);
        setPayments(inWindow);
        setInvoiceMap(map);
        const tally = computeMethodTotals(inWindow);
        // Non-cash methods pre-fill from the system tally so the
        // cashier only needs to type the physical cash count.
        setDeclared((prev) => ({
          ...prev,
          upi: tally.upi,
          card: tally.card,
          netbanking: tally.netbanking,
          insurance: tally.insurance,
        }));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [counterId, shift.shiftDate, shift.windowFrom, shift.windowTo]);

  const systemTotals = useMemo(() => computeMethodTotals(payments), [payments]);

  const categoryTotals = useMemo<Record<AnalyticsCategory, number>>(
    () =>
      sumCategoryAllocations(
        payments
          .filter((p) => p.status === 'succeeded')
          .map((p) => ({
            payment: p,
            lines: invoiceMap.get(p.invoiceId)?.lines ?? [],
          })),
      ),
    [payments, invoiceMap],
  );

  const grand = useMemo(() => {
    let system = 0;
    let dec = 0;
    for (const m of METHOD_ORDER) {
      system += systemTotals[m];
      dec += declared[m];
    }
    return { system, declared: dec, variance: dec - system };
  }, [systemTotals, declared]);

  const onClose = async (): Promise<void> => {
    if (!user) return;
    if (!canClose) {
      setError('You don’t have the close-shift capability.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const methodTotals: ShiftMethodTotal[] = METHOD_ORDER.map((m) => ({
        method: m,
        systemTotal: systemTotals[m],
        declaredTotal: declared[m],
      }));
      const record: ShiftCloseRecord = {
        id: `SHIFT-${shift.shiftDate}-${shift.shiftType.toUpperCase()}-${Date.now().toString(36).slice(-4)}`,
        counterId,
        shiftType: shift.shiftType,
        shiftDate: shift.shiftDate,
        windowFrom: shift.windowFrom.toISOString(),
        windowTo: shift.windowTo.toISOString(),
        openingFloat,
        methodTotals,
        categoryTotals: { ...categoryTotals },
        systemGrandTotal: grand.system,
        declaredGrandTotal: grand.declared,
        variance: grand.variance,
        notes: notes.trim() || undefined,
        closedAt: new Date().toISOString(),
        closedByName: user.fullName,
        closedByRole: user.role,
      };
      recordClose(record);
      // Best-effort DB persistence — local store still drives the UI.
      void recordShiftCloseInDb({
        feCounterId:    counterId,
        shiftType:      shift.shiftType,
        shiftDate:      shift.shiftDate,
        countedCash:    declared.cash,
        expectedCash:   systemTotals.cash,
        varianceReason: notes.trim() || undefined,
        closureNotes:   notes.trim() || undefined,
      });
      setJustClosed(record);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t record the close.');
    } finally {
      setSaving(false);
    }
  };

  const onOpen = (declaredFloat: number): void => {
    if (!user) return;
    if (!canOpen) {
      setError('Only owner or chief doctor can open the shift.');
      return;
    }
    const record: ShiftOpenRecord = {
      id: `OPEN-${shift.shiftDate}-${shift.shiftType.toUpperCase()}-${Date.now().toString(36).slice(-4)}`,
      counterId,
      shiftType: shift.shiftType,
      shiftDate: shift.shiftDate,
      openedAt: new Date().toISOString(),
      openedByName: user.fullName,
      openedByRole: user.role,
      openingFloat: declaredFloat,
    };
    recordOpen(record);
    void recordShiftOpenInDb({
      feCounterId:  counterId,
      shiftType:    shift.shiftType,
      shiftDate:    shift.shiftDate,
      openingFloat: declaredFloat,
      openedByName: user.fullName,
    });
    setOpeningFloat(declaredFloat);
  };

  const recentCloses = closes
    .filter((c) => c.counterId === counterId)
    .slice(0, 8);
  const ShiftIcon = SHIFT_ICON[shift.shiftType];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Cashier shift' }]}
        homeTo={homeForRole(user?.role ?? 'frontdesk')}
        homeLabel="Home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(homeForRole(user?.role ?? 'frontdesk'))}
            className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft /> Back to home
          </Button>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <ShiftIcon className="h-4 w-4 text-primary" />
            {SHIFT_LABEL[shift.shiftType]} shift
          </h1>
          <p className="font-mono text-xxs text-muted-foreground tabular-nums">
            Counter {counterId} · {shift.shiftDate} · {formatTimeOnly(shift.windowFrom.toISOString())} →{' '}
            {formatTimeOnly(shift.windowTo.toISOString())}
            <span className="font-sans"> · </span>
            <span className="font-sans">
              {payments.length} {payments.length === 1 ? 'payment' : 'payments'} in window
            </span>
          </p>
          <p className="text-xxs text-muted-foreground">
            Default schedule: morning {String(SHIFT_WINDOWS.morning.startHour).padStart(2, '0')}:00–{String(SHIFT_WINDOWS.morning.endHour).padStart(2, '0')}:00 · evening {String(SHIFT_WINDOWS.evening.startHour).padStart(2, '0')}:00–{String(SHIFT_WINDOWS.evening.endHour).padStart(2, '0')}:00.
          </p>
        </div>
        {existingClose && !justClosed && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="success" size="sm">
              <Lock className="mr-1 inline h-3 w-3" /> Closed at{' '}
              {formatTimeOnly(existingClose.closedAt)}
            </StatusPill>
          </div>
        )}
        {existingOpen && !existingClose && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="success" size="sm">
              <Unlock className="mr-1 inline h-3 w-3" /> Open since{' '}
              {formatTimeOnly(existingOpen.openedAt)}
            </StatusPill>
          </div>
        )}
      </header>

      {/* Open-shift action — surfaces whenever the active shift has no
          open record yet. Anyone reaches the page; only open_shift
          holders can actually open. */}
      <OpenShiftAction
        shift={shift}
        existingClose={existingClose}
        existingOpen={existingOpen}
        canOpen={canOpen}
        onOpen={onOpen}
      />

      <section
        aria-label="Shift switcher"
        className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card p-2"
      >
        {switcherOptions.map((opt) => {
          const active =
            opt.shiftType === shift.shiftType && opt.shiftDate === shift.shiftDate;
          const closed = closeFor(counterId, opt.shiftType, opt.shiftDate);
          const optShift = resolveShift(opt.shiftType, opt.shiftDate);
          const isCurrent =
            !overrideShiftType &&
            optShift.windowFrom.getTime() <= now.getTime() &&
            optShift.windowTo.getTime() >= now.getTime();
          const Icon = SHIFT_ICON[opt.shiftType];
          return (
            <button
              key={`${opt.shiftDate}-${opt.shiftType}`}
              type="button"
              onClick={() => pickShift(opt)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {opt.label}
              {closed ? (
                <Lock className="h-3 w-3 opacity-70" aria-label="Closed" />
              ) : isCurrent ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px font-mono text-[10px]',
                    active
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-success/20 text-success',
                  )}
                >
                  now
                </span>
              ) : null}
            </button>
          );
        })}
        {overrideShiftType && (
          <button
            type="button"
            onClick={clearOverride}
            className="ml-1 text-xxs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Back to current
          </button>
        )}
      </section>

      {unclosedPrior.length > 0 && !justClosed && (
        <div className="flex flex-wrap items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span>
              {unclosedPrior.length}{' '}
              {unclosedPrior.length === 1 ? 'shift was' : 'shifts were'} not
              closed at the right time. You can still close{' '}
              {unclosedPrior.length === 1 ? 'it' : 'them'} now — system tally
              uses the original window so the audit trail stays intact.
            </span>
            <div className="flex flex-wrap gap-1.5">
              {unclosedPrior.map((opt) => (
                <button
                  key={`unclosed-${opt.shiftDate}-${opt.shiftType}`}
                  type="button"
                  onClick={() => pickShift(opt)}
                  className="rounded-md border border-warning/50 bg-warning/20 px-2 py-0.5 text-xxs font-medium hover:bg-warning/30"
                >
                  Close {opt.label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {justClosed ? (
        <CloseSuccessCard
          record={justClosed}
          onNew={() => {
            setJustClosed(null);
            setNotes('');
            setDeclared((prev) => ({ ...prev, cash: 0 }));
          }}
        />
      ) : existingClose ? (
        <ExistingClosePanel record={existingClose} />
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading shift tally...
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Tally by method</CardTitle>
                <CardLabel>System counts vs your declared count</CardLabel>
              </CardHeader>
              <MethodTallyTable
                systemTotals={systemTotals}
                declared={declared}
                onDeclaredChange={(method, value) =>
                  setDeclared((prev) => ({ ...prev, [method]: value }))
                }
                grand={grand}
              />

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Opening float (cash drawer at start of shift)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={openingFloat || ''}
                    onChange={(e) => setOpeningFloat(Number(e.target.value) || 0)}
                    placeholder="0"
                    disabled={Boolean(existingOpen)}
                    className="h-10 rounded-md border bg-background px-3 text-right font-mono text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  />
                  {existingOpen && (
                    <span className="text-xxs text-muted-foreground">
                      Recorded at open by {existingOpen.openedByName}.
                    </span>
                  )}
                </label>
              </div>

              <FormTextarea
                label="Notes (optional)"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                hint="Explain any variance, batch handover, refund situation, etc."
              />

              {error && (
                <FormErrorContainer
                  title="Couldn’t record the close."
                  description={error}
                />
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Collections by category</CardTitle>
                <CardLabel>Derived from invoice line categories</CardLabel>
              </CardHeader>
              <CategoryTotalsTable totals={categoryTotals} />
            </Card>
          </div>

          <Card className="lg:sticky lg:top-4 lg:self-start">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardLabel>{SHIFT_LABEL[shift.shiftType]} · {shift.shiftDate}</CardLabel>
            </CardHeader>
            <div className="flex flex-col gap-1.5 text-sm">
              <SummaryRow label="System tally" value={formatCurrency(grand.system)} />
              <SummaryRow label="Declared" value={formatCurrency(grand.declared)} />
              <div className="my-1 border-t" />
              <SummaryRow
                label="Variance"
                value={
                  grand.variance === 0
                    ? '—'
                    : `${grand.variance > 0 ? '+' : ''}${formatCurrency(grand.variance)}`
                }
                bold
                tone={
                  grand.variance === 0
                    ? undefined
                    : grand.variance > 0
                      ? 'warning'
                      : 'danger'
                }
              />
              <SummaryRow
                label="Opening float"
                value={formatCurrency(openingFloat)}
              />
            </div>

            {grand.variance !== 0 && (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
                  grand.variance > 0
                    ? 'border-warning/30 bg-warning/10 text-warning'
                    : 'border-danger/30 bg-danger/10 text-danger',
                )}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {grand.variance > 0
                    ? 'Declared more than the system shows — please add a note.'
                    : 'Declared less than the system shows — please add a note.'}
                </span>
              </div>
            )}

            <Button
              type="button"
              onClick={() => void onClose()}
              disabled={saving || !canClose}
              className="w-full"
            >
              {saving ? <Spinner size="sm" /> : <CheckCircle2 />}
              {saving ? 'Closing shift...' : canClose ? 'Close shift' : 'Close (no permission)'}
            </Button>
            <p className="text-xxs text-muted-foreground">
              {canClose
                ? <>Closing as <span className="font-medium">{user?.fullName}</span> ({user?.role}).</>
                : 'Owner / chief doctor / frontdesk can close the shift.'}
            </p>
          </Card>
        </div>
      )}

      {recentCloses.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Recent shift closes</CardTitle>
            <CardLabel>{recentCloses.length}</CardLabel>
          </CardHeader>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Shift</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Closed by</th>
                  <th className="px-3 py-2 text-right font-medium">System</th>
                  <th className="px-3 py-2 text-right font-medium">Declared</th>
                  <th className="px-3 py-2 text-right font-medium">Variance</th>
                  <th className="px-3 py-2 font-medium">Closed at</th>
                </tr>
              </thead>
              <tbody>
                {recentCloses.map((c, idx) => {
                  const Icon = SHIFT_ICON[c.shiftType];
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        'border-b align-middle last:border-b-0',
                        idx % 2 === 1 && 'bg-muted/10',
                      )}
                    >
                      <td className="px-3 py-2 capitalize">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {SHIFT_LABEL[c.shiftType]}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">
                        {c.shiftDate}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {c.closedByName}
                        <span className="ml-1 text-xxs text-muted-foreground">
                          ({c.closedByRole})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                        {formatCurrency(c.systemGrandTotal)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                        {formatCurrency(c.declaredGrandTotal)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-mono text-xs tabular-nums',
                          c.variance === 0
                            ? 'text-muted-foreground'
                            : c.variance > 0
                              ? 'text-warning'
                              : 'text-danger',
                        )}
                      >
                        {c.variance === 0
                          ? '—'
                          : `${c.variance > 0 ? '+' : ''}${formatCurrency(c.variance)}`}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDateTime(c.closedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DemoResetButton />
    </div>
  );
}

/**
 * Demo-only reset — wipes all open/close records on the shift store so
 * a fresh demo can start with the counter locked. Gated by `import.meta.env.DEV`
 * so it's invisible in production builds.
 */
function DemoResetButton(): JSX.Element | null {
  const clearAll = useShiftCloseStore((s) => s.clearAll);
  if (!import.meta.env.DEV) return null;

  const onReset = (): void => {
    const ok = window.confirm(
      'Wipe all shift open/close records on this counter? Payments will lock until a fresh open. Use this to reset the demo.',
    );
    if (!ok) return;
    clearAll();
    // Persist middleware writes asynchronously; also clear the
    // localStorage key directly so a reload picks up an empty store
    // even if the write hasn't flushed.
    try {
      window.localStorage.removeItem('cashier-shift-closes-v2');
    } catch {
      // Storage unavailable (private mode etc.) — clearAll() is enough.
    }
    window.location.reload();
  };

  return (
    <div className="mt-2 flex justify-end border-t border-dashed border-hairline pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="h-7 px-2 text-xxs text-muted-foreground hover:text-danger"
        title="Dev only — wipes the persisted shift store"
      >
        <Eraser className="h-3 w-3" /> Reset shift store (dev)
      </Button>
    </div>
  );
}

function computeMethodTotals(payments: Payment[]): Record<PaymentMethod, number> {
  const acc: Record<PaymentMethod, number> = {
    cash: 0,
    upi: 0,
    card: 0,
    netbanking: 0,
    insurance: 0,
  };
  for (const p of payments) {
    if (p.status !== 'succeeded') continue;
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
  }
  for (const m of METHOD_ORDER) acc[m] = Number(acc[m].toFixed(2));
  return acc;
}

interface MethodTallyTableProps {
  systemTotals: Record<PaymentMethod, number>;
  declared: Record<PaymentMethod, number>;
  onDeclaredChange: (method: PaymentMethod, value: number) => void;
  grand: { system: number; declared: number; variance: number };
}

function MethodTallyTable({
  systemTotals,
  declared,
  onDeclaredChange,
  grand,
}: MethodTallyTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Method</th>
            <th className="px-3 py-2 text-right font-medium">System tally</th>
            <th className="px-3 py-2 text-right font-medium">Declared</th>
            <th className="px-3 py-2 text-right font-medium">Variance</th>
          </tr>
        </thead>
        <tbody>
          {METHOD_ORDER.map((m) => {
            const sys = systemTotals[m];
            const dec = declared[m];
            const variance = dec - sys;
            const tone =
              variance === 0
                ? 'text-muted-foreground'
                : Math.abs(variance) < 1
                  ? 'text-muted-foreground'
                  : variance > 0
                    ? 'text-warning'
                    : 'text-danger';
            return (
              <tr key={m} className="border-b align-middle last:border-b-0">
                <td className="px-3 py-2.5 font-medium">{METHOD_LABEL[m]}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                  {formatCurrency(sys)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={dec || ''}
                    onChange={(e) => onDeclaredChange(m, Number(e.target.value) || 0)}
                    placeholder="0"
                    className="h-9 w-32 rounded-md border bg-background px-2 text-right font-mono text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-right font-mono text-sm tabular-nums',
                    tone,
                  )}
                >
                  {variance === 0
                    ? '—'
                    : `${variance > 0 ? '+' : ''}${formatCurrency(variance)}`}
                </td>
              </tr>
            );
          })}
          <tr className="border-t bg-muted/20 align-middle">
            <td className="px-3 py-2.5 text-sm font-semibold">Total</td>
            <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold tabular-nums">
              {formatCurrency(grand.system)}
            </td>
            <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold tabular-nums">
              {formatCurrency(grand.declared)}
            </td>
            <td
              className={cn(
                'px-3 py-2.5 text-right font-mono text-sm font-semibold tabular-nums',
                grand.variance === 0
                  ? 'text-foreground'
                  : grand.variance > 0
                    ? 'text-warning'
                    : 'text-danger',
              )}
            >
              {grand.variance === 0
                ? '—'
                : `${grand.variance > 0 ? '+' : ''}${formatCurrency(grand.variance)}`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface CategoryTotalsTableProps {
  totals: Record<AnalyticsCategory, number>;
}

function CategoryTotalsTable({ totals }: CategoryTotalsTableProps): JSX.Element {
  const grand = ANALYTICS_CATEGORIES.reduce((s, c) => s + (totals[c] ?? 0), 0);
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 text-right font-medium">Collected</th>
          </tr>
        </thead>
        <tbody>
          {ANALYTICS_CATEGORIES.map((c) => (
            <tr key={c} className="border-b align-middle last:border-b-0">
              <td className="px-3 py-2.5 font-medium">{ANALYTICS_CATEGORY_LABEL[c]}</td>
              <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
                {formatCurrency(totals[c] ?? 0)}
              </td>
            </tr>
          ))}
          <tr className="border-t bg-muted/20 align-middle">
            <td className="px-3 py-2.5 text-sm font-semibold">Total</td>
            <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold tabular-nums">
              {formatCurrency(grand)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'warning' | 'danger';
}

function SummaryRow({ label, value, bold, tone }: SummaryRowProps): JSX.Element {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className={cn('text-muted-foreground', bold && 'text-foreground font-medium')}>
        {label}
      </span>
      <span
        className={cn(
          'font-mono tabular-nums',
          bold && 'text-base font-semibold',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface CloseSuccessCardProps {
  record: ShiftCloseRecord;
  onNew: () => void;
}

function CloseSuccessCard({ record, onNew }: CloseSuccessCardProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Shift closed</CardTitle>
          <CardLabel>{record.id}</CardLabel>
        </div>
        <StatusPill tone="success" size="sm">
          <CheckCircle2 className="mr-1 inline h-3 w-3" /> Recorded
        </StatusPill>
      </CardHeader>
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <SummaryRow label="System tally" value={formatCurrency(record.systemGrandTotal)} />
        <SummaryRow label="Declared" value={formatCurrency(record.declaredGrandTotal)} />
        <SummaryRow
          label="Variance"
          value={
            record.variance === 0
              ? '—'
              : `${record.variance > 0 ? '+' : ''}${formatCurrency(record.variance)}`
          }
          bold
          tone={
            record.variance === 0
              ? undefined
              : record.variance > 0
                ? 'warning'
                : 'danger'
          }
        />
      </div>
      {record.notes && (
        <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
          {record.notes}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Print receipt
        </Button>
        <Button type="button" onClick={onNew}>
          <ArrowLeft className="mr-1 inline h-3 w-3" /> Back to shift
        </Button>
      </div>
    </Card>
  );
}

interface ExistingClosePanelProps {
  record: ShiftCloseRecord;
}

function ExistingClosePanel({ record }: ExistingClosePanelProps): JSX.Element {
  return (
    <EmptyState
      icon={Lock}
      title="This shift has already been closed."
      description={`Closed by ${record.closedByName} (${record.closedByRole}) at ${formatDateTime(record.closedAt)}. System ${formatCurrency(record.systemGrandTotal)} · Declared ${formatCurrency(record.declaredGrandTotal)} · Variance ${record.variance === 0 ? '—' : (record.variance > 0 ? '+' : '') + formatCurrency(record.variance)}.`}
    />
  );
}

interface OpenShiftActionProps {
  shift: ResolvedShift;
  existingClose?: ShiftCloseRecord;
  existingOpen?: ShiftOpenRecord;
  canOpen: boolean;
  onOpen: (openingFloat: number) => void;
}

/**
 * Renders the open-shift CTA whenever the active shift has no open
 * record yet. The button is disabled (with explanatory tooltip text)
 * for users who don't hold `open_shift`. Render nothing if the shift
 * is already opened OR already closed.
 */
function OpenShiftAction({
  shift,
  existingClose,
  existingOpen,
  canOpen,
  onOpen,
}: OpenShiftActionProps): JSX.Element | null {
  const [draftFloat, setDraftFloat] = useState<number>(0);
  if (existingClose) return null;
  if (existingOpen) return null;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-primary/30 bg-primary/[0.05] px-3 py-2.5">
      <Sun className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="text-xs">
          <span className="font-semibold text-foreground">
            Open {SHIFT_LABEL[shift.shiftType].toLowerCase()} shift now.
          </span>{' '}
          <span className="text-muted-foreground">
            Payments are blocked on this counter until the shift is opened.
            Default opening time: {formatTimeOnly(shift.windowFrom.toISOString())}.
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xxs font-medium text-muted-foreground">
              Opening float (cash in drawer)
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={draftFloat || ''}
              onChange={(e) => setDraftFloat(Number(e.target.value) || 0)}
              placeholder="0"
              disabled={!canOpen}
              className="h-9 w-32 rounded-md border bg-background px-2 text-right font-mono text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() => onOpen(draftFloat)}
            disabled={!canOpen}
            title={canOpen ? undefined : 'Owner or chief doctor opens the shift'}
          >
            <CheckCircle2 /> {canOpen ? 'Open shift now' : 'Only owner / chief doctor can open'}
          </Button>
        </div>
        {!canOpen && (
          <p className="text-xxs text-muted-foreground">
            Ask owner or chief doctor to open the shift — they declare the opening float for audit.
          </p>
        )}
      </div>
    </div>
  );
}

