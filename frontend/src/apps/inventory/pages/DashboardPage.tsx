import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarX,
  PackagePlus,
  Truck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { useAuth } from '@/features/auth';
import {
  fetchGrns,
  fetchMedicineBatches,
  fetchMedicines,
  fetchPharmacyAlerts,
  fetchSuppliers,
  type Grn,
  type Medicine,
  type MedicineBatch,
  type PharmacyAlert,
  type StockSeverity,
  type Supplier,
} from '@/features/inventory';
import {
  AreaChart,
  Donut,
  Sparkline,
  type DonutSlice,
} from '@/components/charts';
import { NotificationBell, type NotificationItem } from '@/components/overlay';
import { formatCurrency } from '@/utils/formatCurrency';
import { isoDate } from '@/utils/dateRange';
import { cn } from '@/utils/cn';

interface DashboardData {
  meds: Medicine[];
  batches: MedicineBatch[];
  suppliers: Supplier[];
  grns: Grn[];
  alerts: PharmacyAlert[];
}

const today = (): string => isoDate(new Date());
const plusDays = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

const CLASS_PALETTE = [
  { stroke: 'stroke-primary text-primary',         dot: 'bg-primary' },
  { stroke: 'stroke-info text-info',               dot: 'bg-info' },
  { stroke: 'stroke-success text-success',         dot: 'bg-success' },
  { stroke: 'stroke-warning text-warning',         dot: 'bg-warning' },
  { stroke: 'stroke-brandAccent text-brandAccent', dot: 'bg-brandAccent' },
] as const;

/**
 * Inventory home — at-a-glance "what's in stock, what's expiring,
 * what came in lately, who do we owe most". Composed from shared
 * chart primitives so the visual language matches the owner /
 * cashier dashboards exactly.
 */
export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchMedicines(),
      fetchMedicineBatches(),
      fetchSuppliers(),
      fetchGrns(),
      fetchPharmacyAlerts(),
    ])
      .then(([meds, batches, suppliers, grns, alerts]) => {
        if (alive) setData({ meds, batches, suppliers, grns, alerts });
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
    const lowOrOOS = data.meds.filter(
      (m) => m.severity === 'low' || m.severity === 'out_of_stock' || m.severity === 'expired',
    );
    const expiringSoon = data.batches.filter(
      (b) => b.expiryDate <= plusDays(30) && b.expiryDate >= today(),
    );
    const expiringNext60 = data.batches.filter(
      (b) => b.expiryDate <= plusDays(60) && b.expiryDate >= today(),
    );
    const expired = data.batches.filter((b) => b.expiryDate < today());
    const monthStart = today().slice(0, 7);
    const grnsThisMonth = data.grns.filter((g) => g.receivedAt.startsWith(monthStart));
    return {
      lowOrOOS,
      expiringSoon,
      expiringNext60,
      expired,
      grnsThisMonth,
    };
  }, [data]);

  /** Last-30-days GRN value as area chart. */
  const grnSeries = useMemo<{ xLabels: string[]; values: number[] } | null>(() => {
    if (!data) return null;
    const days = 30;
    const buckets = Array(days).fill(0);
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    for (const g of data.grns) {
      const t = new Date(g.receivedAt).getTime();
      const idx = Math.floor((t - cutoff.getTime()) / (24 * 60 * 60 * 1000));
      if (idx >= 0 && idx < days) buckets[idx] += g.totalCost;
    }
    const xLabels = Array.from({ length: days }, (_, i) => {
      const d = new Date(cutoff.getTime() + i * 24 * 60 * 60 * 1000);
      return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    });
    return { xLabels, values: buckets };
  }, [data]);

  /** Donut: catalog by drug class (top 5 + Other). */
  const byDrugClassDonut = useMemo<DonutSlice[]>(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const m of data.meds) {
      const key = m.drugClass ?? 'unclassified';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const otherCount = sorted.slice(5).reduce((s, [, c]) => s + c, 0);
    const slices: DonutSlice[] = top.map(([cls, c], i) => {
      const palette = CLASS_PALETTE[i % CLASS_PALETTE.length];
      return {
        key: cls,
        label: cls,
        value: c,
        stroke: palette.stroke,
        dot: palette.dot,
      };
    });
    if (otherCount > 0) {
      slices.push({
        key: 'other',
        label: 'Other',
        value: otherCount,
        stroke: 'stroke-muted-foreground text-muted-foreground',
        dot: 'bg-muted-foreground',
      });
    }
    return slices;
  }, [data]);

  /** Stock severity breakdown across the WHOLE catalog. */
  const stockBreakdown = useMemo(() => {
    if (!data) return null;
    const acc: Record<StockSeverity, number> = {
      ok: 0,
      low: 0,
      out_of_stock: 0,
      near_expiry: 0,
      expired: 0,
    };
    for (const m of data.meds) acc[m.severity] += 1;
    return acc;
  }, [data]);

  /** Top 5 suppliers by outstanding balance. */
  const topSuppliers = useMemo<Supplier[]>(() => {
    if (!data) return [];
    return [...data.suppliers]
      .filter((s) => (s.outstandingBalance ?? 0) > 0)
      .sort((a, b) => (b.outstandingBalance ?? 0) - (a.outstandingBalance ?? 0))
      .slice(0, 5);
  }, [data]);

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!counters) return [];
    const list: NotificationItem[] = [];
    const blocking = counters.lowOrOOS.filter(
      (m) => m.severity === 'out_of_stock' || m.severity === 'expired',
    );
    if (blocking.length > 0) {
      list.push({
        severity: 'critical',
        Icon: AlertTriangle,
        message: `${blocking.length} medicine${blocking.length === 1 ? '' : 's'} blocking dispense`,
        href: '/inventory/medicines?severity=out_of_stock',
      });
    }
    if (counters.expired.length > 0) {
      list.push({
        severity: 'critical',
        Icon: CalendarX,
        message: `${counters.expired.length} expired batch${counters.expired.length === 1 ? '' : 'es'} need sequestering`,
        href: '/inventory/batches?expiring=0',
      });
    }
    if (counters.expiringSoon.length > 0) {
      list.push({
        severity: 'warning',
        Icon: CalendarX,
        message: `${counters.expiringSoon.length} batch${counters.expiringSoon.length === 1 ? '' : 'es'} expiring in ≤ 30 days`,
        href: '/inventory/batches?expiring=30',
      });
    }
    return list;
  }, [counters]);

  if (loading || !data || !counters || !stockBreakdown) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Spinner size="sm" className="mr-2" /> Loading dashboard...
      </div>
    );
  }

  const drugClassDonutTotal = byDrugClassDonut.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Dashboard' }]}
        homeTo="/inventory/medicines"
        homeLabel="Inventory"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live inventory
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
            · Stock-room
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationBell items={notifications} />
          <Button asChild>
            <Link to="/inventory/grn">
              <PackagePlus /> Receive goods
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/inventory/batches?expiring=60">
              <CalendarX /> Expiring soon
            </Link>
          </Button>
        </div>
      </header>

      {/* ───────── Hero KPI band ───────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Total SKUs"
          value={String(data.meds.length)}
          icon={Boxes}
        />
        <KpiTile
          label="Low / out-of-stock"
          value={String(counters.lowOrOOS.length)}
          icon={AlertTriangle}
          tone={counters.lowOrOOS.length > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Expiring ≤ 30d"
          value={String(counters.expiringSoon.length)}
          icon={CalendarX}
          tone={counters.expiringSoon.length > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="GRNs this month"
          value={String(counters.grnsThisMonth.length)}
          icon={PackagePlus}
          spark={grnSeries?.values}
        />
      </section>

      {/* ───────── Big GRN value chart ───────── */}
      <Card padding="md">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              GRN value received
            </h3>
            <p className="text-xxs text-muted-foreground">
              Daily inbound · last 30 days
            </p>
          </div>
        </div>
        {grnSeries && grnSeries.values.some((v) => v > 0) ? (
          <AreaChart
            xLabels={grnSeries.xLabels}
            series={[
              {
                key: 'grn',
                label: 'GRN value',
                values: grnSeries.values,
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
            No GRNs in the last 30 days.
          </p>
        )}
      </Card>

      {/* ───────── Drug-class donut + Stock breakdown + Top suppliers ───────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">By drug class</h3>
            <p className="text-xxs text-muted-foreground">
              Catalog mix · top 5 + other
            </p>
          </div>
          {byDrugClassDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              Catalog empty.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut
                slices={byDrugClassDonut}
                size={170}
                centreLabel={String(drugClassDonutTotal)}
                centreSub="SKUs"
              />
              <ul className="w-full space-y-1 text-xxs">
                {byDrugClassDonut.map((s) => {
                  const pct = drugClassDonutTotal > 0 ? (s.value / drugClassDonutTotal) * 100 : 0;
                  return (
                    <li key={s.key} className="flex items-center gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
                      <span className="flex-1 truncate capitalize text-muted-foreground">
                        {s.label}
                      </span>
                      <span className="font-mono tabular-nums text-foreground">{s.value}</span>
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
          <StockBreakdownChart counts={stockBreakdown} total={data.meds.length} />
        </Card>

        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <Truck className="h-4 w-4 text-muted-foreground" /> Top suppliers
            </h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              By outstanding
            </span>
          </div>
          {topSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding payables.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {topSuppliers.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.gstin ?? 'No GSTIN'}
                      {!s.isActive && ' · inactive'}
                    </div>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium">
                    {formatCurrency(s.outstandingBalance ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ───────── Recent GRNs + Top expiring batches ───────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Recent goods received</h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {counters.grnsThisMonth.length} this month
            </span>
          </div>
          {data.grns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No GRNs recorded.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.grns.slice(0, 5).map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs text-foreground">{g.grnNumber}</span>
                      <span className="truncate text-sm">{g.supplierName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Sup inv {g.supplierInvoiceNo} · {g.lineCount} lines · {g.totalQuantity} units
                    </span>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {formatCurrency(g.totalCost)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Top expiring batches</h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {counters.expiringNext60.length}
            </span>
          </div>
          {counters.expiringNext60.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing expiring in the next 60 days.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {counters.expiringNext60.slice(0, 5).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {b.medicineName} {b.strength}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Batch {b.batchNumber} · {b.quantityOnHand} units
                    </span>
                  </div>
                  <StatusPill tone="warning" size="sm" pulse="breathe">
                    {new Date(b.expiryDate).toLocaleDateString()}
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
        <h3 className="text-sm font-semibold tracking-tight">Catalog at a glance</h3>
        <p className="text-xxs text-muted-foreground">
          Stock severity breakdown · {total} SKU{total === 1 ? '' : 's'}
        </p>
      </div>
      {total === 0 ? (
        <p className="py-6 text-center text-xxs text-muted-foreground">
          Catalog empty.
        </p>
      ) : (
        <>
          <div
            role="img"
            aria-label="Catalog stock severity breakdown"
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
