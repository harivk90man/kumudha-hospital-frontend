import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ClockAlert,
  Download,
  PackageX,
  Pill,
  ShoppingCart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { useAuth } from '@/features/auth';
import { fetchRxQueue, type RxQueueEntry, useOtcSalesStore } from '@/features/pharmacy';
import {
  fetchPharmacyAlerts,
  severityPulse,
  severityTone,
  type PharmacyAlert,
  type StockSeverity,
} from '@/features/inventory';
import {
  Donut,
  Funnel,
  Sparkline,
  type DonutSlice,
} from '@/components/charts';
import { downloadCsv, type CsvRow } from '@/components/charts/exportCsv';
import { NotificationBell, type NotificationItem } from '@/components/overlay';
import { formatCurrency } from '@/utils/formatCurrency';
import { isoDate } from '@/utils/dateRange';
import { cn } from '@/utils/cn';

interface DashboardData {
  rxQueue: RxQueueEntry[];
  alerts: PharmacyAlert[];
}

const today = (): string => isoDate(new Date());

/**
 * Pharmacy home — at-a-glance "what's queued, what was sold, what's
 * blocking dispense". Composed from shared chart primitives so the
 * visual language matches the owner / cashier dashboards exactly.
 */
export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const otcSales = useOtcSalesStore((s) => s.sales);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchRxQueue(), fetchPharmacyAlerts()])
      .then(([rxQueue, alerts]) => {
        if (alive) setData({ rxQueue, alerts });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const counters = useMemo(() => {
    if (!data) return null;
    const pending = data.rxQueue.filter((r) => r.status === 'rx_pending');
    const inProgress = data.rxQueue.filter((r) => r.status === 'rx_in_progress');
    const dispensedToday = data.rxQueue.filter(
      (r) =>
        (r.status === 'rx_dispensed' || r.status === 'rx_partially_dispensed') &&
        r.dispensedAt?.startsWith(today()),
    );
    const todayStr = today();
    const otcToday = otcSales.filter((s) => s.soldAt.startsWith(todayStr));
    const otcTotal = otcToday.reduce((s, x) => s + x.invoiceTotal, 0);
    /**
     * Rough Rx revenue estimate — sum of (quantityPrescribed × unitPrice)
     * across dispensed rows. Per-line `quantityDispensed` isn't on
     * RxQueueEntry, so the prescribed snapshot is the best public proxy.
     */
    const rxRevenueToday = dispensedToday.reduce(
      (s, r) =>
        s +
        r.items.reduce((ss, i) => ss + i.quantityPrescribed * i.unitPrice, 0),
      0,
    );
    const criticalStock = data.alerts.filter(
      (a) => a.severity === 'out_of_stock' || a.severity === 'expired',
    );
    return {
      pending,
      inProgress,
      dispensedToday,
      otcToday,
      otcTotal,
      rxRevenueToday,
      criticalStock,
    };
  }, [data, otcSales]);

  /** Funnel: Rx pending → in progress → dispensed. */
  const funnelStages = useMemo(() => {
    if (!counters) return null;
    const total =
      counters.pending.length +
      counters.inProgress.length +
      counters.dispensedToday.length;
    return [
      { key: 'pending',  label: 'Pending',     value: total,                                                            fill: 'bg-warning/70' },
      { key: 'progress', label: 'In progress', value: counters.inProgress.length + counters.dispensedToday.length,      fill: 'bg-info/70' },
      { key: 'done',     label: 'Dispensed',   value: counters.dispensedToday.length,                                   fill: 'bg-success' },
    ];
  }, [counters]);

  /** Donut: Rx revenue vs OTC revenue today. */
  const revenueDonut = useMemo<DonutSlice[]>(() => {
    if (!counters) return [];
    const slices: DonutSlice[] = [];
    if (counters.rxRevenueToday > 0) {
      slices.push({
        key: 'rx',
        label: 'Rx dispense',
        value: counters.rxRevenueToday,
        stroke: 'stroke-primary text-primary',
        dot: 'bg-primary',
      });
    }
    if (counters.otcTotal > 0) {
      slices.push({
        key: 'otc',
        label: 'OTC counter',
        value: counters.otcTotal,
        stroke: 'stroke-success text-success',
        dot: 'bg-success',
      });
    }
    return slices;
  }, [counters]);

  /** Stock breakdown (mirrors inventory MedicinesPage chart shape). */
  const stockBreakdown = useMemo(() => {
    if (!data) return null;
    const acc: Record<StockSeverity, number> = {
      ok: 0,
      low: 0,
      out_of_stock: 0,
      near_expiry: 0,
      expired: 0,
    };
    for (const a of data.alerts) acc[a.severity] += 1;
    return acc;
  }, [data]);

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!data || !counters) return [];
    const list: NotificationItem[] = [];
    if (counters.criticalStock.length > 0) {
      list.push({
        severity: 'critical',
        Icon: PackageX,
        message: `${counters.criticalStock.length} medicine${counters.criticalStock.length === 1 ? '' : 's'} blocking dispense`,
        href: '/pharmacy/alerts',
      });
    }
    const lowStock = data.alerts.filter((a) => a.severity === 'low');
    if (lowStock.length > 0) {
      list.push({
        severity: 'warning',
        Icon: AlertTriangle,
        message: `${lowStock.length} medicine${lowStock.length === 1 ? '' : 's'} running low`,
        href: '/pharmacy/alerts',
      });
    }
    if (counters.pending.length > 5) {
      list.push({
        severity: 'warning',
        Icon: ClockAlert,
        message: `Rx queue backing up — ${counters.pending.length} pending`,
        href: '/pharmacy/queue?status=rx_pending',
      });
    }
    return list;
  }, [data, counters]);

  const exportToday = (): void => {
    if (!data || !counters) return;
    const rows: CsvRow[] = [];
    counters.dispensedToday.forEach((rx) => {
      rx.items.forEach((it) => {
        rows.push({
          type: 'rx',
          dispensed_at: rx.dispensedAt ?? '',
          rx_no: rx.prescriptionNumber,
          patient: rx.patient.fullName,
          uhid: rx.patient.uhid,
          medicine: `${it.medicineName} ${it.strength}`,
          quantity: it.quantityPrescribed,
          unit_price: it.unitPrice,
          line_total: it.quantityPrescribed * it.unitPrice,
        });
      });
    });
    counters.otcToday.forEach((sale) => {
      sale.lines.forEach((l) => {
        rows.push({
          type: 'otc',
          sold_at: sale.soldAt,
          sale_no: sale.saleNumber,
          customer: sale.customerName ?? '',
          medicine: `${l.medicineName} ${l.strength}`,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          line_total: l.lineTotal,
        });
      });
    });
    downloadCsv(`pharmacy-${today()}.csv`, rows);
  };

  if (loading || !data || !counters || !stockBreakdown) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Spinner size="sm" className="mr-2" /> Loading dashboard...
      </div>
    );
  }

  const revenueDonutTotal = revenueDonut.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Dashboard' }]}
        homeTo="/pharmacy/queue"
        homeLabel="Pharmacy"
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
            Good day, {user?.fullName ?? 'there'}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}{' '}
            · Pharmacy counter
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationBell items={notifications} />
          <Button type="button" variant="outline" onClick={exportToday}>
            <Download /> Export today’s CSV
          </Button>
          <Button asChild>
            <Link to="/pharmacy/queue?status=rx_pending">
              <Pill /> Open Rx queue
            </Link>
          </Button>
        </div>
      </header>

      {/* ───────── Hero KPI band ───────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Rx pending"
          value={String(counters.pending.length)}
          icon={ClockAlert}
          tone={counters.pending.length > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Rx dispensed today"
          value={String(counters.dispensedToday.length)}
          icon={CheckCircle2}
          tone={counters.dispensedToday.length > 0 ? 'success' : 'default'}
        />
        <KpiTile
          label="OTC sales today"
          value={formatCurrency(counters.otcTotal)}
          icon={ShoppingCart}
          tone={counters.otcTotal > 0 ? 'success' : 'default'}
        />
        <KpiTile
          label="Stock alerts"
          value={String(data.alerts.length)}
          icon={AlertTriangle}
          tone={
            counters.criticalStock.length > 0
              ? 'danger'
              : data.alerts.length > 0
                ? 'warning'
                : 'default'
          }
        />
      </section>

      {/* ───────── Funnel + Revenue donut + Stock breakdown ───────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Rx flow</h3>
            <p className="text-xxs text-muted-foreground">
              Pending → in progress → dispensed
            </p>
          </div>
          {funnelStages && <Funnel stages={funnelStages} />}
        </Card>

        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Revenue mix</h3>
            <p className="text-xxs text-muted-foreground">
              Rx vs OTC · today
            </p>
          </div>
          {revenueDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              No revenue yet today.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut
                slices={revenueDonut}
                size={170}
                centreLabel={formatCurrency(revenueDonutTotal)}
                centreSub="Today"
              />
              <ul className="w-full space-y-1 text-xxs">
                {revenueDonut.map((s) => {
                  const pct = revenueDonutTotal > 0 ? (s.value / revenueDonutTotal) * 100 : 0;
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
          <StockBreakdownChart counts={stockBreakdown} total={data.alerts.length} />
        </Card>
      </section>

      {/* ───────── Pending Rx + Stock alerts ───────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Pending Rx</h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {counters.pending.length}
            </span>
          </div>
          {counters.pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue clear.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {counters.pending.slice(0, 5).map((rx) => (
                <li
                  key={rx.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{rx.patient.fullName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {rx.prescriptionNumber}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {rx.items.length} item{rx.items.length === 1 ? '' : 's'} · {rx.doctorName}
                    </span>
                  </div>
                  <Link
                    to="/pharmacy/queue?status=rx_pending"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Open →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Stock alerts</h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {data.alerts.length}
            </span>
          </div>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock alerts.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.alerts.slice(0, 5).map((a) => (
                <li
                  key={a.medicineId}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {a.medicineName} {a.strength}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      stock {a.availableQty} (threshold {a.thresholdQty})
                    </div>
                  </div>
                  <StatusPill
                    tone={severityTone[a.severity]}
                    size="sm"
                    pulse={severityPulse[a.severity]}
                  >
                    {a.severity.replace(/_/g, ' ')}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
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
}: KpiTileProps): JSX.Element {
  const hasDelta = delta !== undefined;
  const positive = (delta ?? 0) >= 0;
  const goodMove = deltaInverted ? !positive : positive;
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
            {Math.abs(delta ?? 0)}
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

/* ─────────────────── Stock breakdown chart ─────────────────── */

interface StockSegment {
  severity: StockSeverity;
  bar: string;
  dot: string;
  label: string;
}

const STOCK_SEGMENTS: StockSegment[] = [
  { severity: 'expired',      bar: 'bg-danger',     dot: 'bg-danger',     label: 'Expired' },
  { severity: 'out_of_stock', bar: 'bg-danger/70',  dot: 'bg-danger/70',  label: 'Out of stock' },
  { severity: 'low',          bar: 'bg-warning',    dot: 'bg-warning',    label: 'Low' },
  { severity: 'near_expiry',  bar: 'bg-warning/55', dot: 'bg-warning/55', label: 'Near expiry' },
  { severity: 'ok',           bar: 'bg-success',    dot: 'bg-success',    label: 'In stock' },
];

function StockBreakdownChart({
  counts,
  total,
}: {
  counts: Record<StockSeverity, number>;
  total: number;
}): JSX.Element {
  return (
    <>
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight">Stock alerts mix</h3>
        <p className="text-xxs text-muted-foreground">
          Severity breakdown · {total} alert{total === 1 ? '' : 's'}
        </p>
      </div>
      {total === 0 ? (
        <p className="py-6 text-center text-xxs text-muted-foreground">
          All stocked OK.
        </p>
      ) : (
        <>
          <div
            role="img"
            aria-label="Stock alert severity breakdown"
            className="flex h-3 overflow-hidden rounded-full bg-muted/40"
          >
            {STOCK_SEGMENTS.map((s) => {
              const c = counts[s.severity] ?? 0;
              if (c === 0) return null;
              const pct = (c / total) * 100;
              return (
                <div
                  key={s.severity}
                  className={cn(s.bar, 'transition-opacity duration-150')}
                  style={{ width: `${pct}%` }}
                  title={`${s.label} — ${c} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 text-xxs">
            {STOCK_SEGMENTS.map((s) => {
              const c = counts[s.severity] ?? 0;
              if (c === 0) return null;
              const pct = total > 0 ? (c / total) * 100 : 0;
              return (
                <li key={s.severity} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
                  <span className="flex-1 text-muted-foreground">{s.label}</span>
                  <span className="font-mono tabular-nums text-foreground">{c}</span>
                  <span className="w-10 text-right font-mono tabular-nums text-muted-foreground">
                    {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
