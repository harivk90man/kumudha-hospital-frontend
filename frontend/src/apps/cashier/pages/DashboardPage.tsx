import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  ClockAlert,
  Download,
  IndianRupee,
  Receipt,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Spinner } from '@/components/feedback/Spinner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth';
import {
  fetchInvoices,
  fetchPayments,
  type Invoice,
  type Payment,
  type PaymentMethod,
} from '@/features/billing';
import {
  AreaChart,
  Donut,
  HourHeatmap,
  Sparkline,
  type DonutSlice,
} from '@/components/charts';
import { downloadCsv, type CsvRow } from '@/components/charts/exportCsv';
import { NotificationBell, type NotificationItem } from '@/components/overlay';
import { formatCurrency } from '@/utils/formatCurrency';
import { isoDate } from '@/utils/dateRange';
import { cn } from '@/utils/cn';

const today = (): string => isoDate(new Date());
const yesterday = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
};

interface DashboardData {
  todayInvoices: Invoice[];
  todayPayments: Payment[];
  yesterdayPayments: Payment[];
}

const STATION_PALETTE: Record<
  Invoice['station'],
  { stroke: string; dot: string; label: string }
> = {
  front_desk: { stroke: 'stroke-primary text-primary',         dot: 'bg-primary',     label: 'Front desk' },
  lab:        { stroke: 'stroke-warning text-warning',         dot: 'bg-warning',     label: 'Lab' },
  radiology:  { stroke: 'stroke-info text-info',               dot: 'bg-info',        label: 'Radiology' },
  pharmacy:   { stroke: 'stroke-success text-success',         dot: 'bg-success',     label: 'Pharmacy' },
  billing:    { stroke: 'stroke-brandAccent text-brandAccent', dot: 'bg-brandAccent', label: 'Billing' },
};

const METHOD_PALETTE: Record<PaymentMethod, { stroke: string; dot: string; label: string }> = {
  cash:       { stroke: 'stroke-success text-success',         dot: 'bg-success',     label: 'Cash' },
  upi:        { stroke: 'stroke-info text-info',               dot: 'bg-info',        label: 'UPI' },
  card:       { stroke: 'stroke-primary text-primary',         dot: 'bg-primary',     label: 'Card' },
  netbanking: { stroke: 'stroke-warning text-warning',         dot: 'bg-warning',     label: 'Net banking' },
  insurance:  { stroke: 'stroke-brandAccent text-brandAccent', dot: 'bg-brandAccent', label: 'Insurance' },
};

/**
 * Cashier home — at-a-glance "what did the counter do today, where is
 * the money coming from, what's still owed". Mirrors the visual
 * language of the owner dashboard with chart-led KPI tiles, a
 * collection-by-hour area chart, donut splits by method + counter,
 * and an hour-of-day heatmap for shift planning.
 */
export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchInvoices({ date: today() }),
      fetchPayments({ date: today() }),
      fetchPayments({ date: yesterday() }),
    ])
      .then(([todayInvoices, todayPayments, yesterdayPayments]) => {
        if (alive) {
          setData({ todayInvoices, todayPayments, yesterdayPayments });
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const metrics = useMemo(() => {
    if (!data) return null;
    const succ = data.todayPayments.filter((p) => p.status === 'succeeded');
    const succPrior = data.yesterdayPayments.filter((p) => p.status === 'succeeded');
    const collection = succ.reduce((s, p) => s + Math.max(p.amount, 0), 0);
    const collectionPrior = succPrior.reduce((s, p) => s + Math.max(p.amount, 0), 0);
    const refunds = succ.filter((p) => p.amount < 0).length;
    const refundsPrior = succPrior.filter((p) => p.amount < 0).length;
    const open = data.todayInvoices.filter(
      (i) => i.status === 'billed' || i.status === 'partially_paid',
    );
    const openBalance = open.reduce((s, i) => s + i.balance, 0);
    return {
      collection,
      collectionPrior,
      refunds,
      refundsPrior,
      openCount: open.length,
      openBalance,
    };
  }, [data]);

  /** Per-hour collection today — single-series area chart. */
  const collectionByHour = useMemo<{ xLabels: string[]; values: number[] } | null>(() => {
    if (!data) return null;
    const buckets = Array(24).fill(0);
    for (const p of data.todayPayments) {
      if (p.status !== 'succeeded' || p.amount <= 0) continue;
      const h = new Date(p.receivedAt).getHours();
      buckets[h] += p.amount;
    }
    const xLabels = Array.from({ length: 24 }, (_, i) =>
      i === 0 ? '12a' : i === 12 ? '12p' : i < 12 ? `${i}a` : `${i - 12}p`,
    );
    return { xLabels, values: buckets };
  }, [data]);

  const sparkValues = collectionByHour?.values ?? [];

  /** Donut: collection by payment method (today). */
  const byMethodDonut = useMemo<DonutSlice[]>(() => {
    if (!data) return [];
    const acc = {} as Record<PaymentMethod, number>;
    for (const p of data.todayPayments) {
      if (p.status !== 'succeeded' || p.amount <= 0) continue;
      acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    }
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .map(([method, value]) => ({
        key: method,
        label: METHOD_PALETTE[method as PaymentMethod].label,
        value,
        stroke: METHOD_PALETTE[method as PaymentMethod].stroke,
        dot: METHOD_PALETTE[method as PaymentMethod].dot,
      }));
  }, [data]);

  /** Donut: collection by counter / station. */
  const byStationDonut = useMemo<DonutSlice[]>(() => {
    if (!data) return [];
    const acc: Record<Invoice['station'], number> = {
      front_desk: 0,
      lab: 0,
      radiology: 0,
      pharmacy: 0,
      billing: 0,
    };
    for (const p of data.todayPayments) {
      if (p.status !== 'succeeded' || p.amount <= 0) continue;
      const inv = data.todayInvoices.find((i) => i.id === p.invoiceId);
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
  }, [data]);

  /** Top 5 overdue invoices by balance. */
  const topOpen = useMemo<Invoice[]>(() => {
    if (!data) return [];
    return data.todayInvoices
      .filter((i) => i.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
  }, [data]);

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!data || !metrics) return [];
    const list: NotificationItem[] = [];
    if (metrics.openBalance > 0) {
      list.push({
        severity: 'warning',
        Icon: Wallet,
        message: `${formatCurrency(metrics.openBalance)} pending across ${metrics.openCount} invoice${metrics.openCount === 1 ? '' : 's'}`,
        href: '/cashier/invoices?status=billed',
      });
    }
    if (metrics.refunds > 0) {
      list.push({
        severity: 'info',
        Icon: RotateCcw,
        message: `${metrics.refunds} refund${metrics.refunds === 1 ? '' : 's'} processed today`,
        href: '/cashier/invoices',
      });
    }
    return list;
  }, [data, metrics]);

  const exportPayments = (): void => {
    if (!data) return;
    const rows: CsvRow[] = data.todayPayments
      .filter((p) => p.status === 'succeeded')
      .map((p) => {
        const inv = data.todayInvoices.find((i) => i.id === p.invoiceId);
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
    downloadCsv(`cashier-payments-${today()}.csv`, rows);
  };

  if (loading || !data || !metrics) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Spinner size="sm" className="mr-2" /> Loading dashboard...
      </div>
    );
  }

  const stationDonutTotal = byStationDonut.reduce((s, x) => s + x.value, 0);
  const methodDonutTotal = byMethodDonut.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Dashboard' }]}
        homeTo="/cashier/invoices"
        homeLabel="Cashier home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live counter
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Good day, {user?.fullName ?? 'Cashier'}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}{' '}
            — Billing counter
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationBell items={notifications} />
          <Button type="button" variant="outline" onClick={exportPayments}>
            <Download /> Export today’s CSV
          </Button>
          <Button asChild>
            <Link to="/cashier/invoices?status=billed">
              <Receipt /> Open invoices
            </Link>
          </Button>
        </div>
      </header>

      {/* ───────── Hero KPI band ───────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Today’s collection"
          value={formatCurrency(metrics.collection)}
          icon={IndianRupee}
          delta={metrics.collection - metrics.collectionPrior}
          deltaLabel="vs yesterday"
          tone="success"
          spark={sparkValues}
          formatDelta={formatCurrency}
        />
        <KpiTile
          label="Outstanding"
          value={formatCurrency(metrics.openBalance)}
          icon={Wallet}
          tone={metrics.openBalance > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Open invoices"
          value={String(metrics.openCount)}
          icon={ClockAlert}
          tone={metrics.openCount > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Refunds today"
          value={String(metrics.refunds)}
          icon={RotateCcw}
          delta={metrics.refunds - metrics.refundsPrior}
          deltaLabel="vs yesterday"
          deltaInverted
          tone={metrics.refunds > 0 ? 'danger' : 'default'}
        />
      </section>

      {/* ───────── Big collection chart ───────── */}
      <Card padding="md">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Collection by hour
            </h3>
            <p className="text-xxs text-muted-foreground">
              Where the money landed across today
            </p>
          </div>
        </div>
        {collectionByHour && collectionByHour.values.some((v) => v > 0) ? (
          <AreaChart
            xLabels={collectionByHour.xLabels}
            series={[
              {
                key: 'collection',
                label: 'Collection',
                values: collectionByHour.values,
                stroke: 'stroke-primary text-primary',
                fill: 'fill-primary text-primary',
                dot: 'bg-primary',
              },
            ]}
            format={(v) => formatCurrency(v)}
            height={200}
          />
        ) : (
          <p className="py-6 text-center text-xxs text-muted-foreground">
            No payments recorded today yet.
          </p>
        )}
      </Card>

      {/* ───────── Method donut + Counter donut + Top open ───────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Payment methods</h3>
            <p className="text-xxs text-muted-foreground">
              Cash vs digital mix · today
            </p>
          </div>
          {byMethodDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              No payments yet.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut
                slices={byMethodDonut}
                size={170}
                centreLabel={formatCurrency(methodDonutTotal)}
                centreSub="Today"
              />
              <ul className="w-full space-y-1 text-xxs">
                {byMethodDonut
                  .sort((a, b) => b.value - a.value)
                  .map((s) => {
                    const pct = methodDonutTotal > 0 ? (s.value / methodDonutTotal) * 100 : 0;
                    return (
                      <li key={s.key} className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
                        <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
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
            <h3 className="text-sm font-semibold tracking-tight">Collection by counter</h3>
            <p className="text-xxs text-muted-foreground">
              Which station drove the day · today
            </p>
          </div>
          {byStationDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              No collection yet.
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
                        <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
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
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Top open invoices</h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {metrics.openCount}
            </span>
          </div>
          {topOpen.length === 0 ? (
            <p className="text-sm text-muted-foreground">All clear — nothing outstanding.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {topOpen.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{i.patient.fullName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {i.invoiceNumber}
                      </span>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">
                      {i.station.replace(/_/g, ' ')}
                      {i.status === 'partially_paid' && ' · partly paid'}
                    </span>
                  </div>
                  <Link
                    to={`/cashier/invoices/${i.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {formatCurrency(i.balance)} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ───────── Hour-of-day heatmap ───────── */}
      <Card padding="md">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Collection by hour</h3>
            <p className="text-xxs text-muted-foreground">
              Where today’s money landed across the working day
            </p>
          </div>
          <span className="text-xxs text-muted-foreground tabular-nums">
            Peak{' '}
            {(() => {
              const buckets = collectionByHour?.values ?? [];
              if (buckets.length === 0) return '—';
              const peak = buckets.indexOf(Math.max(...buckets));
              if (buckets[peak] === 0) return '—';
              return peak === 0 ? '12a' : peak === 12 ? '12p' : peak < 12 ? `${peak}a` : `${peak - 12}p`;
            })()}
          </span>
        </div>
        <HourHeatmap
          values={collectionByHour?.values ?? []}
          toneClass="bg-primary"
          format={(v) => formatCurrency(v)}
        />
      </Card>

      {/* ───────── Recent payments list ───────── */}
      <Card padding="md">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Recent payments</h3>
          <span className="text-xxs text-muted-foreground tabular-nums">
            {data.todayPayments.length}
          </span>
        </div>
        {data.todayPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments today yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.todayPayments.slice(0, 8).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{p.patient.fullName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.invoiceNumber}
                    </span>
                    <StatusPill tone={p.amount < 0 ? 'danger' : 'success'} size="sm">
                      {p.amount < 0 ? 'Refund' : p.method}
                    </StatusPill>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.receivedAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {p.referenceNo ? ` · ${p.referenceNo}` : ''}
                  </span>
                </div>
                <span
                  className={cn(
                    'font-mono text-sm tabular-nums font-medium',
                    p.amount < 0 && 'text-danger',
                  )}
                >
                  {formatCurrency(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ─────────────────── KPI hero tile (local) ─────────────────── */

interface KpiTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: number;
  deltaLabel?: string;
  deltaInverted?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  spark?: number[];
  formatDelta?: (v: number) => string;
}

function KpiTile({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  deltaInverted = false,
  tone = 'default',
  spark,
  formatDelta = (v) => String(v),
}: KpiTileProps): JSX.Element {
  const hasDelta = delta !== undefined;
  const positive = (delta ?? 0) >= 0;
  const goodMove = deltaInverted ? !positive : positive;
  const deltaText = (() => {
    if (delta === undefined) return '';
    const sign = delta >= 0 ? '+' : '−';
    return `${sign}${formatDelta(Math.abs(delta))}`;
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
          {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
        </div>
      )}
      {spark && spark.length > 0 && (
        <div
          className={cn(
            tone === 'success'
              ? 'text-success'
              : tone === 'warning'
                ? 'text-warning'
                : tone === 'danger'
                  ? 'text-danger'
                  : 'text-primary',
          )}
        >
          <Sparkline values={spark} height={28} />
        </div>
      )}
    </div>
  );
}
