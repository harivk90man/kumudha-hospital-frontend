import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  FlaskConical,
  HeartPulse,
  IndianRupee,
  PackageX,
  Pill,
  Receipt,
  Scan,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Breadcrumb, DateRangePicker, LiveIndicator } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import { useAuth } from '@/features/auth';
import {
  ANALYTICS_CATEGORIES,
  ANALYTICS_CATEGORY_LABEL,
  DEFAULT_COUNTER_ID,
  fetchInvoices,
  fetchPayments,
  isShiftLocked,
  sumCategoryAllocations,
  useCurrentCounterStore,
  useShiftCloseStore,
  type AnalyticsCategory,
  type Invoice,
  type Payment,
  type PaymentMethod,
  type ShiftLockState,
} from '@/features/billing';
import { fetchQueue, type QueueEntry } from '@/features/encounter';
import { fetchLabOrderQueue, type LabOrderQueueEntry } from '@/features/lab';
import { fetchPharmacyAlerts, type PharmacyAlert } from '@/features/inventory';
import { formatCurrency } from '@/utils/formatCurrency';
import { resolveDateRange, type DateRangePreset } from '@/utils/dateRange';
import { AreaChart, Donut, Funnel, HourHeatmap, Sparkline } from '@/components/charts';
import { downloadCsv, type CsvRow } from '@/components/charts/exportCsv';
import { NotificationBell } from '@/components/overlay';

interface DashboardData {
  invoices: Invoice[];
  payments: Payment[];
  queue: QueueEntry[];
  labOrders: LabOrderQueueEntry[];
  alerts: PharmacyAlert[];
  invoicesPrior: Invoice[];
  paymentsPrior: Payment[];
}

interface AlertItem {
  severity: 'critical' | 'warning' | 'info';
  Icon: LucideIcon;
  message: string;
  href: string;
}

/**
 * Owner 360° dashboard. The single screen the owner walks into to
 * answer "how is the hospital doing right now". Layered intentionally:
 *
 *   1. KPI band       — five hero numbers with delta + sparkline trend.
 *   2. Alerts ribbon  — what's broken, ranked by urgency.
 *   3. Insights       — derived narrative ("X drove Y% of collection").
 *   4. Revenue chart  — area chart by counter over the active range.
 *   5. Patient flow   — funnel + by-counter donut + day-shape heatmap.
 *   6. Live ops grid  — per-station status (waiting / in-flight / done).
 *
 * Everything is read-only — no write actions; alert chips are just
 * pointers to the operational page that owns the action.
 *
 * Charts are pure inline SVG (no chart-lib dep) — see
 * `apps/owner/components/charts/` for the primitives.
 */
export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const counterId = useCurrentCounterStore((s) => s.counterId) || DEFAULT_COUNTER_ID;
  const shiftCloses = useShiftCloseStore((s) => s.closes);
  const shiftOpens = useShiftCloseStore((s) => s.opens);
  const [params, setParams] = useSearchParams();
  const preset = (params.get('range') as DateRangePreset) || 'today';
  const customFrom = params.get('from') ?? '';
  const customTo = params.get('to') ?? '';
  const range = useMemo(
    () =>
      resolveDateRange(
        preset,
        customFrom && customTo ? { from: customFrom, to: customTo } : undefined,
      ),
    [preset, customFrom, customTo],
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchInvoices({ dateFrom: range.from, dateTo: range.to }),
      fetchPayments({ dateFrom: range.from, dateTo: range.to }),
      fetchQueue(),
      fetchLabOrderQueue({}),
      fetchPharmacyAlerts(),
      fetchInvoices({ dateFrom: range.previous.from, dateTo: range.previous.to }),
      fetchPayments({ dateFrom: range.previous.from, dateTo: range.previous.to }),
    ])
      .then(
        ([
          invoices,
          payments,
          queue,
          labOrders,
          alerts,
          invoicesPrior,
          paymentsPrior,
        ]) => {
          if (alive) {
            setData({
              invoices,
              payments,
              queue,
              labOrders,
              alerts,
              invoicesPrior,
              paymentsPrior,
            });
          }
        },
      )
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range.from, range.to, range.previous.from, range.previous.to]);

  const onRangeChange = (next: {
    preset: DateRangePreset;
    custom?: { from: string; to: string };
  }): void => {
    const np = new URLSearchParams(params);
    np.set('range', next.preset);
    if (next.preset === 'custom' && next.custom) {
      np.set('from', next.custom.from);
      np.set('to', next.custom.to);
    } else {
      np.delete('from');
      np.delete('to');
    }
    setParams(np, { replace: true });
  };

  const metrics = useMemo(() => {
    if (!data) return null;
    const succeeded = data.payments.filter((p) => p.status === 'succeeded');
    const gross = succeeded.reduce((s, p) => s + Math.max(p.amount, 0), 0);
    const refunds = succeeded
      .filter((p) => p.amount < 0)
      .reduce((s, p) => s + p.amount, 0);
    const net = gross + refunds;
    const billed = data.invoices.reduce((s, i) => s + i.total, 0);
    const outstanding = data.invoices.reduce((s, i) => s + i.balance, 0);
    const realisationPct = billed > 0 ? (gross / billed) * 100 : 0;

    const succeededP = data.paymentsPrior.filter((p) => p.status === 'succeeded');
    const grossPrior = succeededP.reduce((s, p) => s + Math.max(p.amount, 0), 0);
    const refundsPrior = succeededP
      .filter((p) => p.amount < 0)
      .reduce((s, p) => s + p.amount, 0);
    const netPrior = grossPrior + refundsPrior;
    const billedPrior = data.invoicesPrior.reduce((s, i) => s + i.total, 0);
    const realisationPctPrior =
      billedPrior > 0 ? (grossPrior / billedPrior) * 100 : 0;
    const outstandingPrior = data.invoicesPrior.reduce((s, i) => s + i.balance, 0);

    return {
      gross,
      refunds,
      net,
      billed,
      outstanding,
      realisationPct,
      grossPrior,
      refundsPrior,
      netPrior,
      realisationPctPrior,
      outstandingPrior,
    };
  }, [data]);

  const flow = useMemo(() => {
    if (!data) return null;
    const total = data.queue.length;
    const awaitingVitals = data.queue.filter((q) => q.status.name === 'awaiting_vitals').length;
    const awaitingDoctor = data.queue.filter((q) => q.status.name === 'awaiting_doctor').length;
    const inConsultation = data.queue.filter((q) => q.status.name === 'in_consultation').length;
    const consultationDone = data.queue.filter(
      (q) => q.status.name === 'consultation_done',
    ).length;
    const registered = data.queue.filter((q) => q.status.name === 'registered').length;
    return {
      total,
      registered,
      awaitingVitals,
      awaitingDoctor,
      inConsultation,
      consultationDone,
    };
  }, [data]);

  /**
   * Per-station revenue split. Tone-mapped to a consistent palette
   * (front_desk = info, lab = warning, radiology = brand, pharmacy =
   * success, billing = primary) so the same colour reads consistently
   * across the donut + area chart.
   */
  const STATION_PALETTE: Record<
    Invoice['station'],
    { stroke: string; fill: string; dot: string; label: string }
  > = {
    front_desk: {
      stroke: 'stroke-primary text-primary',
      fill:   'fill-primary text-primary',
      dot:    'bg-primary',
      label:  'Front desk',
    },
    lab: {
      stroke: 'stroke-warning text-warning',
      fill:   'fill-warning text-warning',
      dot:    'bg-warning',
      label:  'Lab',
    },
    radiology: {
      stroke: 'stroke-info text-info',
      fill:   'fill-info text-info',
      dot:    'bg-info',
      label:  'Radiology',
    },
    pharmacy: {
      stroke: 'stroke-success text-success',
      fill:   'fill-success text-success',
      dot:    'bg-success',
      label:  'Pharmacy',
    },
    billing: {
      stroke: 'stroke-brandAccent text-brandAccent',
      fill:   'fill-brandAccent text-brandAccent',
      dot:    'bg-brandAccent',
      label:  'Billing',
    },
  };

  const byStationDonut = useMemo(() => {
    if (!data) return [];
    const succeeded = data.payments.filter(
      (p) => p.status === 'succeeded' && p.amount > 0,
    );
    const acc: Record<Invoice['station'], number> = {
      front_desk: 0,
      lab: 0,
      radiology: 0,
      pharmacy: 0,
      billing: 0,
    };
    for (const p of succeeded) {
      const inv = data.invoices.find((i) => i.id === p.invoiceId);
      const st = inv?.station ?? 'billing';
      acc[st] += p.amount;
    }
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .map(([station, value]) => ({
        key: station,
        label: STATION_PALETTE[station as Invoice['station']].label,
        value,
        stroke: STATION_PALETTE[station as Invoice['station']].stroke,
        dot: STATION_PALETTE[station as Invoice['station']].dot,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  /**
   * Category-mix breakdown — derives per-bucket totals from the active
   * date range's payments, allocated proportionally across the invoice
   * lines they paid for. Drives the new "Collections by category" tile.
   */
  const categoryTotals = useMemo<Record<AnalyticsCategory, number>>(() => {
    if (!data) {
      return {
        consultation: 0,
        pharmacy: 0,
        lab: 0,
        procedure: 0,
        admission: 0,
        registration: 0,
        other: 0,
      };
    }
    const invoiceById = new Map(data.invoices.map((i) => [i.id, i] as const));
    return sumCategoryAllocations(
      data.payments
        .filter((p) => p.status === 'succeeded' && p.amount > 0)
        .map((p) => ({
          payment: p,
          lines: invoiceById.get(p.invoiceId)?.lines ?? [],
        })),
    );
  }, [data]);

  const categoryMixMax = useMemo(
    () => Math.max(1, ...ANALYTICS_CATEGORIES.map((c) => categoryTotals[c])),
    [categoryTotals],
  );

  /**
   * Live shift status on the active counter — drives the "Today's
   * cashier shift" card. Re-evaluates when the persisted store
   * mutates (open / close events) so the card reflects the latest
   * state without polling.
   */
  const shiftStatus: ShiftLockState = useMemo(
    () =>
      isShiftLocked({
        counterId,
        at: new Date(),
        closes: shiftCloses,
        opens: shiftOpens,
      }),
    [counterId, shiftCloses, shiftOpens],
  );

  const byPaymentMethodDonut = useMemo(() => {
    if (!data) return [];
    const acc = {} as Record<PaymentMethod, number>;
    for (const p of data.payments) {
      if (p.status !== 'succeeded' || p.amount <= 0) continue;
      acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    }
    const PALETTE: Record<PaymentMethod, { stroke: string; dot: string; label: string }> = {
      cash:        { stroke: 'stroke-success text-success', dot: 'bg-success', label: 'Cash' },
      upi:         { stroke: 'stroke-info text-info',       dot: 'bg-info',    label: 'UPI' },
      card:        { stroke: 'stroke-primary text-primary', dot: 'bg-primary', label: 'Card' },
      netbanking:  { stroke: 'stroke-warning text-warning', dot: 'bg-warning', label: 'Net banking' },
      insurance:   { stroke: 'stroke-brandAccent text-brandAccent', dot: 'bg-brandAccent', label: 'Insurance' },
    };
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .map(([method, value]) => ({
        key: method,
        label: PALETTE[method as PaymentMethod].label,
        value,
        stroke: PALETTE[method as PaymentMethod].stroke,
        dot: PALETTE[method as PaymentMethod].dot,
      }));
  }, [data]);

  /**
   * Day-shape heatmap: total succeeded gross by hour-of-day across
   * the active range. Renders as a single 24-cell strip via the
   * `<HourHeatmap>` primitive.
   */
  const hourBuckets = useMemo<number[]>(() => {
    const buckets = Array(24).fill(0);
    if (!data) return buckets;
    for (const p of data.payments) {
      if (p.status !== 'succeeded' || p.amount <= 0) continue;
      const h = new Date(p.receivedAt).getHours();
      buckets[h] += p.amount;
    }
    return buckets;
  }, [data]);

  /**
   * Multi-series area chart: one bucket per day of the range, one
   * series per station. For 'today' / single-day ranges we fall back
   * to per-hour buckets so the chart still has shape.
   */
  const revenueOverTime = useMemo<{
    xLabels: string[];
    series: { key: string; label: string; values: number[]; stroke: string; fill: string; dot: string }[];
  } | null>(() => {
    if (!data) return null;
    const succeeded = data.payments.filter(
      (p) => p.status === 'succeeded' && p.amount > 0,
    );
    if (succeeded.length === 0) {
      return { xLabels: [], series: [] };
    }
    const fromTime = new Date(`${range.from}T00:00:00`).getTime();
    const toTime = new Date(`${range.to}T23:59:59`).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.max(1, Math.round((toTime - fromTime + 1) / dayMs));
    const useHours = days <= 1;

    const stationKeys: Invoice['station'][] = [
      'front_desk', 'lab', 'radiology', 'pharmacy', 'billing',
    ];
    const buckets: Record<Invoice['station'], number[]> = Object.fromEntries(
      stationKeys.map((k) => [k, Array(useHours ? 24 : days).fill(0)]),
    ) as Record<Invoice['station'], number[]>;

    for (const p of succeeded) {
      const inv = data.invoices.find((i) => i.id === p.invoiceId);
      const station = inv?.station ?? 'billing';
      const t = new Date(p.receivedAt).getTime();
      const idx = useHours
        ? new Date(p.receivedAt).getHours()
        : Math.max(0, Math.floor((t - fromTime) / dayMs));
      if (idx >= 0 && idx < buckets[station].length) {
        buckets[station][idx] += p.amount;
      }
    }
    const xLabels = useHours
      ? Array.from({ length: 24 }, (_, i) =>
          i === 0 ? '12a' : i === 12 ? '12p' : i < 12 ? `${i}a` : `${i - 12}p`,
        )
      : Array.from({ length: days }, (_, i) => {
          const d = new Date(fromTime + i * dayMs);
          return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
        });
    const series = stationKeys
      .filter((k) => buckets[k].some((v) => v > 0))
      .map((k) => ({
        key: k,
        label: STATION_PALETTE[k].label,
        values: buckets[k],
        stroke: STATION_PALETTE[k].stroke,
        fill: STATION_PALETTE[k].fill,
        dot: STATION_PALETTE[k].dot,
      }));
    return { xLabels, series };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, range.from, range.to]);

  /** Net revenue per day (or hour) for the hero-card sparkline. */
  const netSparkValues = useMemo<number[]>(() => {
    if (!revenueOverTime) return [];
    const len = revenueOverTime.series[0]?.values.length ?? 0;
    if (len === 0) return [];
    const out = Array(len).fill(0);
    for (const s of revenueOverTime.series) {
      s.values.forEach((v, i) => {
        out[i] += v;
      });
    }
    return out;
  }, [revenueOverTime]);

  /** Outstanding-balance trend per day across the range. */
  const outstandingSparkValues = useMemo<number[]>(() => {
    if (!data || !revenueOverTime) return [];
    const len = revenueOverTime.xLabels.length;
    // Mock backend doesn't expose a daily-outstanding history, so we
    // approximate by holding the current outstanding flat — the
    // sparkline reads as a trend chip, not as exact-history. Real
    // backend would return per-day balance snapshots.
    return Array(len).fill(metrics?.outstanding ?? 0);
  }, [data, metrics, revenueOverTime]);

  const alerts = useMemo<AlertItem[]>(() => {
    if (!data || !flow || !metrics) return [];
    const list: AlertItem[] = [];

    const stuckLab = data.labOrders.filter((o) => {
      if (
        o.status !== 'paid' &&
        o.status !== 'sample_collection' &&
        o.status !== 'sample_collected' &&
        o.status !== 'in_progress'
      )
        return false;
      const t = new Date(o.orderedAt).getTime();
      return Date.now() - t > 2 * 60 * 60 * 1000;
    });
    if (stuckLab.length > 0) {
      list.push({
        severity: 'warning',
        Icon: FlaskConical,
        message: `${stuckLab.length} lab ${stuckLab.length === 1 ? 'order is' : 'orders are'} pending > 2 hrs`,
        href: '/diagnostics/lab',
      });
    }

    const criticalUnreleased = data.labOrders.filter(
      (o) => o.status === 'reported' && (o.flag === 'critical_low' || o.flag === 'critical_high'),
    );
    if (criticalUnreleased.length > 0) {
      list.push({
        severity: 'critical',
        Icon: AlertTriangle,
        message: `${criticalUnreleased.length} critical lab ${criticalUnreleased.length === 1 ? 'result' : 'results'} reported but not released`,
        href: '/diagnostics/lab?statuses=reported',
      });
    }

    if (metrics.outstanding > 0) {
      list.push({
        severity: 'warning',
        Icon: Wallet,
        message: `${formatCurrency(metrics.outstanding)} pending collection across ${data.invoices.filter((i) => i.balance > 0).length} invoices`,
        href: '/cashier/invoices',
      });
    }

    const blocking = data.alerts.filter(
      (a) => a.severity === 'out_of_stock' || a.severity === 'expired',
    );
    if (blocking.length > 0) {
      list.push({
        severity: 'critical',
        Icon: PackageX,
        message: `${blocking.length} ${blocking.length === 1 ? 'medicine' : 'medicines'} blocking dispense (out of stock / expired)`,
        href: '/pharmacy/alerts',
      });
    }
    const expiring = data.alerts.filter((a) => a.severity === 'near_expiry');
    if (expiring.length > 0) {
      list.push({
        severity: 'info',
        Icon: PackageX,
        message: `${expiring.length} ${expiring.length === 1 ? 'medicine' : 'medicines'} nearing expiry`,
        href: '/pharmacy/alerts',
      });
    }

    if (flow.awaitingDoctor > 10) {
      list.push({
        severity: 'warning',
        Icon: Stethoscope,
        message: `${flow.awaitingDoctor} patients waiting for a doctor — consider adding a slot`,
        href: '/owner/operations',
      });
    }

    return list;
  }, [data, flow, metrics]);

  const insights = useMemo<string[]>(() => {
    if (!data || !metrics) return [];
    const lines: string[] = [];
    const priorLabel = range.previous.label.toLowerCase();

    if (metrics.grossPrior > 0) {
      const delta = ((metrics.gross - metrics.grossPrior) / metrics.grossPrior) * 100;
      const dir = delta >= 0 ? 'up' : 'down';
      lines.push(
        `Net revenue is ${dir} ${Math.abs(delta).toFixed(0)}% vs ${priorLabel} (${formatCurrency(metrics.net)} vs ${formatCurrency(metrics.netPrior)}).`,
      );
    }
    if (byStationDonut.length > 0) {
      const top = [...byStationDonut].sort((a, b) => b.value - a.value)[0];
      const stTotal = byStationDonut.reduce((s, x) => s + x.value, 0);
      const pct = (top.value / stTotal) * 100;
      lines.push(
        `${top.label} drove ${pct.toFixed(0)}% of collection in ${range.label.toLowerCase()} (${formatCurrency(top.value)}).`,
      );
    }
    if (metrics.realisationPct < metrics.realisationPctPrior - 5) {
      lines.push(
        `Realisation slipped to ${metrics.realisationPct.toFixed(0)}% from ${metrics.realisationPctPrior.toFixed(0)}% in ${priorLabel} — pending invoices climbing.`,
      );
    }
    if (hourBuckets.length === 24) {
      const peak = hourBuckets.indexOf(Math.max(...hourBuckets));
      const peakLabel = peak === 0 ? '12a' : peak === 12 ? '12p' : peak < 12 ? `${peak}a` : `${peak - 12}p`;
      const peakAmt = hourBuckets[peak];
      if (peakAmt > 0) {
        lines.push(`Peak collection hour was ${peakLabel} (${formatCurrency(peakAmt)}).`);
      }
    }
    return lines;
  }, [data, metrics, byStationDonut, hourBuckets, range.label, range.previous.label]);

  const exportPayments = (): void => {
    if (!data) return;
    const rows: CsvRow[] = data.payments
      .filter((p) => p.status === 'succeeded')
      .map((p) => {
        const inv = data.invoices.find((i) => i.id === p.invoiceId);
        return {
          received_at: p.receivedAt,
          invoice_no: p.invoiceNumber,
          patient: p.patient.fullName,
          uhid: p.patient.uhid,
          op_number: inv?.opNumber ?? '',
          station: inv?.station ?? '',
          method: p.method,
          amount: p.amount,
          reference_no: p.referenceNo ?? '',
        };
      });
    const filename = `revenue-${range.from}-to-${range.to}.csv`;
    downloadCsv(filename, rows);
  };

  if (loading || !data || !metrics || !flow) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Spinner size="sm" className="mr-2" /> Loading dashboard...
      </div>
    );
  }

  const stationDonutTotal = byStationDonut.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Dashboard' }]}
        homeTo="/owner/dashboard"
        homeLabel="Owner home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live overview
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Good day, {user?.fullName ?? 'Owner'}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Operational pulse across billing, diagnostics, pharmacy and the
            patient queue.
          </p>
          <p className="font-mono text-xxs text-muted-foreground tabular-nums">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bell-style notification widget — replaces the always-on
              "Needs attention" ribbon. Shows a count badge tinted to
              the highest-severity alert; click to open a popover with
              the full list. Empty state still renders the bell so the
              control's position is stable across renders. */}
          <NotificationBell items={alerts} />
          <Button type="button" variant="outline" onClick={exportPayments}>
            <Download /> Export revenue CSV
          </Button>
        </div>
      </header>

      <DateRangePicker
        value={preset}
        custom={
          customFrom && customTo ? { from: customFrom, to: customTo } : undefined
        }
        onChange={onRangeChange}
      />

      {/* ───────── Cashier shift + category-mix tiles ───────── */}
      <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ShiftStatusCard status={shiftStatus} counterId={counterId} />
        <CategoryMixCard totals={categoryTotals} max={categoryMixMax} />
      </section>

      {/* ───────── Hero KPI band — four numbers + sparkline trends ───────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label={`Net revenue · ${range.label}`}
          value={formatCurrency(metrics.net)}
          icon={IndianRupee}
          delta={metrics.net - metrics.netPrior}
          deltaLabel={`vs ${range.previous.label.toLowerCase()}`}
          tone="success"
          spark={netSparkValues}
        />
        <KpiTile
          label="Realisation %"
          value={`${metrics.realisationPct.toFixed(0)}%`}
          icon={TrendingUp}
          deltaPct={metrics.realisationPct - metrics.realisationPctPrior}
          deltaLabel={`vs ${range.previous.label.toLowerCase()}`}
          tone={
            metrics.realisationPct >= 90
              ? 'success'
              : metrics.realisationPct >= 70
                ? 'default'
                : 'warning'
          }
        />
        <KpiTile
          label="Pending collection"
          value={formatCurrency(metrics.outstanding)}
          icon={Wallet}
          delta={metrics.outstanding - metrics.outstandingPrior}
          deltaLabel={`vs ${range.previous.label.toLowerCase()}`}
          deltaInverted
          tone={metrics.outstanding > 0 ? 'warning' : 'default'}
          spark={outstandingSparkValues}
        />
        <KpiTile
          label="Patients in flow"
          value={String(flow.total)}
          icon={Users}
          tone="default"
        />
      </section>

      {insights.length > 0 && (
        <section className="rounded-xl border bg-primary/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2 text-xxs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Insights
          </div>
          <ul className="flex flex-col gap-1">
            {insights.map((line, i) => (
              <li key={i} className="text-sm leading-snug text-foreground">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ───────── Big revenue chart — by counter, over time ───────── */}
      <Card padding="md">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Revenue by counter
            </h3>
            <p className="text-xxs text-muted-foreground">
              Stacked by source · {range.label.toLowerCase()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xxs">
            {revenueOverTime?.series.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
                <span className="text-muted-foreground">{s.label}</span>
              </span>
            ))}
          </div>
        </div>
        {revenueOverTime && revenueOverTime.series.length > 0 ? (
          <AreaChart
            xLabels={revenueOverTime.xLabels}
            series={revenueOverTime.series}
            format={(v) => formatCurrency(v)}
            height={200}
          />
        ) : (
          <p className="py-6 text-center text-xxs text-muted-foreground">
            No revenue recorded for {range.label.toLowerCase()} yet.
          </p>
        )}
      </Card>

      {/* ───────── Patient flow + station revenue donut + payment method donut ───────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Patient flow</h3>
            <p className="text-xxs text-muted-foreground">
              {flow.total} patients in the system right now
            </p>
          </div>
          <Funnel
            stages={[
              { key: 'reg',  label: 'Registered',          value: flow.registered + flow.awaitingVitals + flow.awaitingDoctor + flow.inConsultation + flow.consultationDone, fill: 'bg-primary/80' },
              { key: 'vit',  label: 'Awaiting vitals',     value: flow.awaitingVitals + flow.awaitingDoctor + flow.inConsultation + flow.consultationDone, fill: 'bg-info/70' },
              { key: 'doc',  label: 'Awaiting doctor',     value: flow.awaitingDoctor + flow.inConsultation + flow.consultationDone, fill: 'bg-warning/70' },
              { key: 'con',  label: 'In consultation',     value: flow.inConsultation + flow.consultationDone, fill: 'bg-success/70' },
              { key: 'done', label: 'Consultation done',   value: flow.consultationDone, fill: 'bg-success' },
            ]}
          />
        </Card>

        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">
              Revenue by counter
            </h3>
            <p className="text-xxs text-muted-foreground">
              Share of collection · {range.label.toLowerCase()}
            </p>
          </div>
          {byStationDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              No revenue yet.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut
                slices={byStationDonut}
                size={170}
                centreLabel={formatCurrency(stationDonutTotal)}
                centreSub="Total"
              />
              <ul className="w-full space-y-1 text-xxs">
                {byStationDonut
                  .sort((a, b) => b.value - a.value)
                  .map((s) => {
                    const pct = stationDonutTotal > 0 ? (s.value / stationDonutTotal) * 100 : 0;
                    return (
                      <li key={s.key} className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
                        <span className="flex-1 truncate text-muted-foreground">
                          {s.label}
                        </span>
                        <span className="font-mono tabular-nums text-foreground">
                          {formatCurrency(s.value)}
                        </span>
                        <span className="w-10 text-right font-mono tabular-nums text-muted-foreground">
                          {pct.toFixed(0)}%
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </Card>

        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">
              Payment methods
            </h3>
            <p className="text-xxs text-muted-foreground">
              Cash vs digital mix · {range.label.toLowerCase()}
            </p>
          </div>
          {byPaymentMethodDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              No payments yet.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut
                slices={byPaymentMethodDonut}
                size={170}
                centreLabel={String(
                  data.payments.filter((p) => p.status === 'succeeded' && p.amount > 0).length,
                )}
                centreSub="Payments"
              />
              <ul className="w-full space-y-1 text-xxs">
                {byPaymentMethodDonut
                  .sort((a, b) => b.value - a.value)
                  .map((s) => {
                    const total = byPaymentMethodDonut.reduce((acc, x) => acc + x.value, 0);
                    const pct = total > 0 ? (s.value / total) * 100 : 0;
                    return (
                      <li key={s.key} className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
                        <span className="flex-1 truncate text-muted-foreground">
                          {s.label}
                        </span>
                        <span className="font-mono tabular-nums text-foreground">
                          {formatCurrency(s.value)}
                        </span>
                        <span className="w-10 text-right font-mono tabular-nums text-muted-foreground">
                          {pct.toFixed(0)}%
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </Card>
      </section>

      {/* ───────── Day-shape heatmap — when does the money come in ───────── */}
      <Card padding="md">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Revenue by hour of day
            </h3>
            <p className="text-xxs text-muted-foreground">
              Where the money lands across the working day · {range.label.toLowerCase()}
            </p>
          </div>
          <span className="text-xxs text-muted-foreground tabular-nums">
            Peak {(() => {
              const peak = hourBuckets.indexOf(Math.max(...hourBuckets));
              if (hourBuckets[peak] === 0) return '—';
              const label = peak === 0 ? '12a' : peak === 12 ? '12p' : peak < 12 ? `${peak}a` : `${peak - 12}p`;
              return label;
            })()}
          </span>
        </div>
        <HourHeatmap
          values={hourBuckets}
          toneClass="bg-primary"
          format={(v) => formatCurrency(v)}
        />
      </Card>

      {/* ───────── Live ops grid — per-station status cards ───────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-tight">
          Live operations
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <OpsTile
            icon={Users}
            label="Front desk"
            value={String(flow.registered + flow.awaitingVitals)}
            sub="awaiting registration / vitals"
            href="/frontdesk/station"
          />
          <OpsTile
            icon={Stethoscope}
            label="Doctor queue"
            value={String(flow.awaitingDoctor + flow.inConsultation)}
            sub={`${flow.inConsultation} currently consulting`}
            href="/doctor/queue"
          />
          <OpsTile
            icon={FlaskConical}
            label="Lab"
            value={String(
              data.labOrders.filter(
                (o) => o.status !== 'released' && o.status !== 'cancelled',
              ).length,
            )}
            sub={`${data.labOrders.filter((o) => o.status === 'reported').length} ready to release`}
            href="/diagnostics/lab"
          />
          <OpsTile
            icon={Scan}
            label="Radiology"
            value="—"
            sub="reports surface in worklist"
            href="/diagnostics/radiology"
          />
          <OpsTile
            icon={Pill}
            label="Pharmacy"
            value="—"
            sub="see pharmacy queue"
            href="/pharmacy/queue"
          />
          <OpsTile
            icon={CreditCard}
            label="Cashier"
            value={String(data.invoices.filter((i) => i.balance > 0).length)}
            sub="invoices with balance"
            href="/cashier/invoices"
          />
          <OpsTile
            icon={HeartPulse}
            label="Stock alerts"
            value={String(data.alerts.length)}
            sub="needs attention"
            href="/pharmacy/alerts"
            tone={data.alerts.some((a) => a.severity === 'out_of_stock' || a.severity === 'expired') ? 'danger' : 'default'}
          />
          <OpsTile
            icon={Receipt}
            label="Today’s invoices"
            value={String(data.invoices.length)}
            sub={`${data.invoices.filter((i) => i.balance <= 0).length} settled`}
            href="/cashier/invoices"
          />
        </div>
      </section>
    </div>
  );
}

/* ─────────────────── KPI hero tile ─────────────────── */

interface KpiTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: number;
  deltaPct?: number;
  deltaLabel?: string;
  /** When true, a positive delta reads as bad (e.g. growing pending). */
  deltaInverted?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  spark?: number[];
}

function KpiTile({
  label,
  value,
  icon: Icon,
  delta,
  deltaPct,
  deltaLabel,
  deltaInverted = false,
  tone = 'default',
  spark,
}: KpiTileProps): JSX.Element {
  const hasDelta = delta !== undefined || deltaPct !== undefined;
  const positive = (delta ?? deltaPct ?? 0) >= 0;
  // "good" = positive when not inverted, negative when inverted.
  const goodMove = deltaInverted ? !positive : positive;
  const deltaText = (() => {
    if (delta !== undefined) {
      const sign = delta >= 0 ? '+' : '−';
      return `${sign}${formatCurrency(Math.abs(delta))}`;
    }
    if (deltaPct !== undefined) {
      const sign = deltaPct >= 0 ? '+' : '−';
      return `${sign}${Math.abs(deltaPct).toFixed(0)} pts`;
    }
    return '';
  })();
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-hairline shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              'text-xl font-semibold tabular-nums leading-tight',
              tone === 'success' && 'text-success',
              tone === 'warning' && 'text-warning',
              tone === 'danger' && 'text-danger',
            )}
          >
            {value}
          </span>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
      </div>
      {hasDelta && (
        <div className="flex items-baseline gap-1.5 text-xxs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium tabular-nums',
              goodMove ? 'text-success' : 'text-danger',
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {deltaText}
          </span>
          {deltaLabel && (
            <span className="text-muted-foreground">{deltaLabel}</span>
          )}
        </div>
      )}
      {spark && spark.length > 0 && (
        <div
          className={cn(
            tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-primary',
          )}
        >
          <Sparkline values={spark} height={28} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Live ops tile ─────────────────── */

function OpsTile({
  icon: Icon,
  label,
  value,
  sub,
  href,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  href: string;
  tone?: 'default' | 'danger';
}): JSX.Element {
  const hasNumeric = value !== '—' && Number(value) > 0;
  return (
    <Link
      to={href}
      className={cn(
        'flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-hairline shadow-card transition-shadow hover:shadow-card-hover',
        tone === 'danger' && hasNumeric && 'ring-danger/30',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {label}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono text-2xl font-semibold tabular-nums',
            tone === 'danger' && hasNumeric && 'text-danger',
          )}
        >
          {value}
        </span>
        {hasNumeric && tone !== 'danger' && (
          <CheckCircle2 className="h-3.5 w-3.5 text-success/0" aria-hidden="true" />
        )}
      </div>
      <span className="text-xxs text-muted-foreground">{sub}</span>
    </Link>
  );
}

/* ─────────────── Shift status card ─────────────── */

interface ShiftStatusCardProps {
  status: ShiftLockState;
  counterId: string;
}

function ShiftStatusCard({ status, counterId }: ShiftStatusCardProps): JSX.Element {
  const isOpen = !status.locked;
  const isClosed = status.reason === 'closed';
  const isNoOpen = status.reason === 'no_open';
  return (
    <Link
      to="/cashier/shift"
      className={cn(
        'flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 shadow-card transition-shadow hover:shadow-card-hover',
        isOpen && 'ring-success/30',
        isNoOpen && 'ring-warning/40',
        isClosed && 'ring-hairline',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          Today's cashier shift · Counter {counterId}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      {isOpen && status.openShift ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-base font-semibold tabular-nums text-success">Open</span>
            <span className="text-xxs text-muted-foreground">
              since {new Date(status.openShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <span className="text-xxs text-muted-foreground">
            Opened by {status.openShift.openedByName} · Float {formatCurrency(status.openShift.openingFloat)}
          </span>
        </>
      ) : isClosed && status.closedShift ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-base font-semibold tabular-nums">Closed</span>
            <span className="text-xxs text-muted-foreground">
              at {new Date(status.closedShift.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <span className="text-xxs text-muted-foreground">
            By {status.closedShift.closedByName} · Variance {status.closedShift.variance === 0 ? '—' : `${status.closedShift.variance > 0 ? '+' : ''}${formatCurrency(status.closedShift.variance)}`}
          </span>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-base font-semibold tabular-nums text-warning">Not open</span>
          </div>
          <span className="text-xxs text-muted-foreground">
            Click to open the shift and unlock payments on this counter.
          </span>
        </>
      )}
    </Link>
  );
}

/* ─────────────── Category mix card ─────────────── */

interface CategoryMixCardProps {
  totals: Record<AnalyticsCategory, number>;
  max: number;
}

function CategoryMixCard({ totals, max }: CategoryMixCardProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-hairline shadow-card">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Receipt className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          Collections by category
        </span>
        <span className="text-xxs text-muted-foreground">Range total</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {ANALYTICS_CATEGORIES.map((c) => {
          const value = totals[c];
          const widthPct = Math.max(0, Math.min(100, (value / max) * 100));
          return (
            <div key={c} className="grid grid-cols-[7rem_minmax(0,1fr)_5.5rem] items-center gap-2 text-xs">
              <span className="text-muted-foreground">{ANALYTICS_CATEGORY_LABEL[c]}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-right font-mono tabular-nums">{formatCurrency(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
