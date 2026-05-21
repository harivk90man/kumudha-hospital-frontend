import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Beaker,
  CheckCircle2,
  ClockAlert,
  FlaskConical,
  Scan,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  StatusPill,
} from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { useAuth } from '@/features/auth';
import {
  fetchLabOrderQueue,
  type LabOrderQueueEntry,
} from '@/features/lab';
import {
  fetchRadiologyOrderQueue,
  type RadiologyOrderQueueEntry,
} from '@/features/radiology';
import {
  Donut,
  Funnel,
  HourHeatmap,
  Sparkline,
  type DonutSlice,
} from '@/components/charts';
import { NotificationBell, type NotificationItem } from '@/components/overlay';
import { cn } from '@/utils/cn';

interface DashboardData {
  labQueue: LabOrderQueueEntry[];
  radQueue: RadiologyOrderQueueEntry[];
}

const MODALITY_PALETTE = [
  { stroke: 'stroke-warning text-warning',         dot: 'bg-warning' },
  { stroke: 'stroke-info text-info',               dot: 'bg-info' },
  { stroke: 'stroke-primary text-primary',         dot: 'bg-primary' },
  { stroke: 'stroke-success text-success',         dot: 'bg-success' },
  { stroke: 'stroke-brandAccent text-brandAccent', dot: 'bg-brandAccent' },
] as const;

/**
 * Diagnostics home — at-a-glance "what is the lab+rad load right now,
 * where is the bottleneck, what critical results haven't been
 * released". Composed from shared chart primitives so the visual
 * language matches the owner / cashier dashboards exactly.
 */
export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchLabOrderQueue(), fetchRadiologyOrderQueue()])
      .then(([labQueue, radQueue]) => {
        if (alive) setData({ labQueue, radQueue });
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
    const labOrdersToday = data.labQueue.length;
    const radOrdersToday = data.radQueue.length;
    const labReadyToCollect = data.labQueue.filter(
      (o) => o.status === 'paid' || o.status === 'sample_collection',
    );
    const labProcessing = data.labQueue.filter(
      (o) => o.status === 'in_progress' || o.status === 'sample_collected',
    );
    const labReported = data.labQueue.filter((o) => o.status === 'reported');
    const radReady = data.radQueue.filter((o) => o.status === 'paid');
    const radCapturing = data.radQueue.filter((o) => o.status === 'in_progress');
    const radReported = data.radQueue.filter((o) => o.status === 'reported');
    const reportsPending = labReported.length + radReported.length;
    const criticalFlags = data.labQueue.filter(
      (o) =>
        (o.flag === 'critical_low' || o.flag === 'critical_high') &&
        o.status !== 'released',
    ).length;
    return {
      labOrdersToday,
      radOrdersToday,
      labReadyToCollect,
      labProcessing,
      labReported,
      radReady,
      radCapturing,
      radReported,
      reportsPending,
      criticalFlags,
    };
  }, [data]);

  /**
   * Funnel: Ordered → Sample collected → In progress → Reported → Released.
   * Walks the TSD-08 §4.6 ladder. Lab-led; radiology surfaces in the
   * companion modality donut.
   */
  const funnelStages = useMemo(() => {
    if (!data) return null;
    const all = [
      ...data.labQueue.map((o) => o.status),
      ...data.radQueue.map((o) => o.status),
    ];
    const ordered = all.filter(
      (s) =>
        s === 'ordered' ||
        s === 'awaiting_payment' ||
        s === 'paid' ||
        s === 'sample_collection' ||
        s === 'sample_collected' ||
        s === 'in_progress' ||
        s === 'partially_reported' ||
        s === 'reported' ||
        s === 'released',
    ).length;
    const sampleCollected = all.filter(
      (s) =>
        s === 'sample_collected' ||
        s === 'in_progress' ||
        s === 'partially_reported' ||
        s === 'reported' ||
        s === 'released',
    ).length;
    const inProgress = all.filter(
      (s) =>
        s === 'in_progress' ||
        s === 'partially_reported' ||
        s === 'reported' ||
        s === 'released',
    ).length;
    const reported = all.filter((s) => s === 'reported' || s === 'released').length;
    const released = all.filter((s) => s === 'released').length;
    return [
      { key: 'ordered',   label: 'Ordered',        value: ordered,         fill: 'bg-primary/80' },
      { key: 'collected', label: 'Sample / paid',  value: sampleCollected, fill: 'bg-info/70' },
      { key: 'progress',  label: 'In progress',    value: inProgress,      fill: 'bg-warning/70' },
      { key: 'reported',  label: 'Reported',       value: reported,        fill: 'bg-success/70' },
      { key: 'released',  label: 'Released',       value: released,        fill: 'bg-success' },
    ];
  }, [data]);

  /** Donut: orders by category — lab category + radiology modality. */
  const byCategoryDonut = useMemo<DonutSlice[]>(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const o of data.labQueue) {
      const key = `Lab · ${o.specimen}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const o of data.radQueue) {
      const key = `Rad · ${o.modality}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return sorted.map(([label, value], i) => {
      const palette = MODALITY_PALETTE[i % MODALITY_PALETTE.length];
      return {
        key: label,
        label,
        value,
        stroke: palette.stroke,
        dot: palette.dot,
      };
    });
  }, [data]);

  /** Hour-of-day heatmap — orders received by hour. */
  const ordersByHour = useMemo<number[]>(() => {
    const buckets = Array(24).fill(0);
    if (!data) return buckets;
    for (const o of data.labQueue) {
      const h = new Date(o.orderedAt).getHours();
      buckets[h] += 1;
    }
    for (const o of data.radQueue) {
      const h = new Date(o.orderedAt).getHours();
      buckets[h] += 1;
    }
    return buckets;
  }, [data]);

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!data || !counters) return [];
    const list: NotificationItem[] = [];
    if (counters.criticalFlags > 0) {
      list.push({
        severity: 'critical',
        Icon: AlertTriangle,
        message: `${counters.criticalFlags} critical lab result${counters.criticalFlags === 1 ? '' : 's'} not yet released`,
        href: '/diagnostics/lab?statuses=reported',
      });
    }
    const stuckLab = data.labQueue.filter((o) => {
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
        Icon: ClockAlert,
        message: `${stuckLab.length} lab order${stuckLab.length === 1 ? '' : 's'} pending > 2 hrs`,
        href: '/diagnostics/lab',
      });
    }
    if (counters.reportsPending > 0) {
      list.push({
        severity: 'info',
        Icon: CheckCircle2,
        message: `${counters.reportsPending} report${counters.reportsPending === 1 ? '' : 's'} ready to release`,
        href: '/diagnostics/lab?statuses=reported',
      });
    }
    return list;
  }, [data, counters]);

  if (loading || !data || !counters) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Spinner size="sm" className="mr-2" /> Loading dashboard...
      </div>
    );
  }

  const categoryDonutTotal = byCategoryDonut.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Dashboard' }]}
        homeTo="/diagnostics/lab"
        homeLabel="Diagnostics"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live diagnostics
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
            · Diagnostics
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationBell items={notifications} />
          <Button asChild>
            <Link to="/diagnostics/lab">
              <FlaskConical /> Lab worklist
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/diagnostics/radiology">
              <Scan /> Radiology worklist
            </Link>
          </Button>
        </div>
      </header>

      {/* ───────── Hero KPI band ───────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Lab orders today"
          value={String(counters.labOrdersToday)}
          icon={FlaskConical}
          spark={ordersByHour}
        />
        <KpiTile
          label="Radiology orders"
          value={String(counters.radOrdersToday)}
          icon={Scan}
        />
        <KpiTile
          label="Reports pending"
          value={String(counters.reportsPending)}
          icon={CheckCircle2}
          tone={counters.reportsPending > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Critical flags"
          value={String(counters.criticalFlags)}
          icon={AlertTriangle}
          tone={counters.criticalFlags > 0 ? 'danger' : 'default'}
        />
      </section>

      {/* ───────── Funnel + Category donut + Hour heatmap row ───────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Order pipeline</h3>
            <p className="text-xxs text-muted-foreground">
              Lab + radiology · combined ladder
            </p>
          </div>
          {funnelStages && <Funnel stages={funnelStages} />}
        </Card>

        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">By category</h3>
            <p className="text-xxs text-muted-foreground">
              Where the load lands · top 6
            </p>
          </div>
          {byCategoryDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              No orders yet.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut
                slices={byCategoryDonut}
                size={170}
                centreLabel={String(categoryDonutTotal)}
                centreSub="Orders"
              />
              <ul className="w-full space-y-1 text-xxs">
                {byCategoryDonut.map((s) => {
                  const pct = categoryDonutTotal > 0 ? (s.value / categoryDonutTotal) * 100 : 0;
                  return (
                    <li key={s.key} className="flex items-center gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
                      <span className="flex-1 truncate text-muted-foreground capitalize">
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
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Orders by hour</h3>
              <p className="text-xxs text-muted-foreground">
                When samples and orders land
              </p>
            </div>
            <span className="text-xxs text-muted-foreground tabular-nums">
              Peak{' '}
              {(() => {
                const peak = ordersByHour.indexOf(Math.max(...ordersByHour));
                if (ordersByHour[peak] === 0) return '—';
                return peak === 0 ? '12a' : peak === 12 ? '12p' : peak < 12 ? `${peak}a` : `${peak - 12}p`;
              })()}
            </span>
          </div>
          <HourHeatmap
            values={ordersByHour}
            toneClass="bg-primary"
            format={(v) => `${v} order${v === 1 ? '' : 's'}`}
          />
          <div className="mt-4 grid grid-cols-3 gap-2 text-xxs">
            <MiniStat
              icon={Beaker}
              label="Processing (lab)"
              value={counters.labProcessing.length}
            />
            <MiniStat
              icon={ClockAlert}
              label="To collect"
              value={counters.labReadyToCollect.length}
            />
            <MiniStat
              icon={Scan}
              label="Capturing (rad)"
              value={counters.radCapturing.length}
            />
          </div>
        </Card>
      </section>

      {/* ───────── Lab + Radiology next-action lists ───────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Lab — next 5 to act on</h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {data.labQueue.length}
            </span>
          </div>
          {data.labQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Lab worklist is clear.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.labQueue.slice(0, 5).map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{o.patient.fullName}</span>
                      <span className="text-xs text-muted-foreground">{o.testCode}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {o.testName} · {o.specimen}
                    </span>
                  </div>
                  <StatusPill tone="info" size="sm">
                    {o.status.replace(/_/g, ' ')}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold tracking-tight">
              Radiology — next 5 to act on
            </h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {data.radQueue.length}
            </span>
          </div>
          {data.radQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Radiology worklist is clear.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.radQueue.slice(0, 5).map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{o.patient.fullName}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {o.modality}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {o.testName} · {o.bodyPart}
                    </span>
                  </div>
                  <StatusPill tone="info" size="sm">
                    {o.status.replace(/_/g, ' ')}
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
  tone?: 'default' | 'success' | 'warning' | 'danger';
  spark?: number[];
}

function KpiTile({
  label,
  value,
  icon: Icon,
  tone = 'default',
  spark,
}: KpiTileProps): JSX.Element {
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

/* ─────────────────── Inline mini-stat ─────────────────── */

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/20 p-2">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
