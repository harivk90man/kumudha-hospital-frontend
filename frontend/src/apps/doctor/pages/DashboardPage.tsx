import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileClock,
  ListOrdered,
  PackageX,
  Stethoscope,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { Card } from '@/components/layout';
import { Breadcrumb, LiveIndicator } from '@/components/data-display';
import { cn } from '@/utils/cn';
import { useAuth } from '@/features/auth';
import {
  AreaChart,
  Donut,
  Funnel,
  Sparkline,
  type DonutSlice,
} from '@/components/charts';
import {
  NotificationBell,
  type NotificationItem,
} from '@/components/overlay';
import { fetchQueue, type QueueEntry } from '@/features/encounter';
import { fetchDashboard, type DashboardPayload } from '../doctorApi';

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const formatRelative = (iso: string): string => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
};

interface DashboardData {
  payload: DashboardPayload;
  queue: QueueEntry[];
}

/**
 * Doctor home — a chart-rich at-a-glance view answering "what does the
 * day look like, where am I leaking patients, and what needs me right
 * now?". Composed from the shared chart primitives so the visual
 * language matches the owner / cashier / clinic dashboards exactly.
 */
export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const isDoctor = user?.role === 'doctor';
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Scope the dashboard's queue panel to the logged-in doctor so a
  // doctor doesn't see another doctor's patients on their landing page.
  // Owner / admin fall through unfiltered (overview).
  const scopedDoctorId =
    user && (user.role === 'doctor' || user.role === 'chief_doctor')
      ? user.id
      : undefined;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchDashboard(), fetchQueue({ doctorId: scopedDoctorId })])
      .then(([payload, queue]) => {
        if (alive) {
          setData({ payload, queue });
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedDoctorId]);

  /**
   * Patient-flow funnel for "the doctor's queue" — registered → vitals
   * done → awaiting doctor → in consultation → completed. Mirrors the
   * encounter status ladder (TSD-04 §4.1) so the drop-offs are real
   * stage transitions, not invented buckets.
   */
  const flow = useMemo(() => {
    if (!data) return null;
    const q = data.queue;
    const registered = q.filter((e) => e.status.name === 'registered').length;
    const awaitingVitals = q.filter((e) => e.status.name === 'awaiting_vitals').length;
    const vitalsDone = q.filter((e) => e.status.name === 'vitals_done').length;
    const awaitingDoctor = q.filter((e) => e.status.name === 'awaiting_doctor').length;
    const inConsultation = q.filter((e) => e.status.name === 'in_consultation').length;
    const consultationDone = q.filter((e) => e.status.name === 'consultation_done').length;
    return {
      booked: registered + awaitingVitals + vitalsDone + awaitingDoctor + inConsultation + consultationDone,
      arrived: awaitingVitals + vitalsDone + awaitingDoctor + inConsultation + consultationDone,
      vitalsDone: vitalsDone + awaitingDoctor + inConsultation + consultationDone,
      inConsult: inConsultation + consultationDone,
      completed: consultationDone,
    };
  }, [data]);

  /**
   * Visit-type donut — derived from the recent activity feed since the
   * dashboard payload doesn't carry a per-visit-type tally. We classify
   * "consultation_completed" + "prescription_issued" as new vs follow-up
   * heuristically by the message; failing that we fall back to the
   * counters' followUpsToday vs todayAppointments split which IS
   * authoritative.
   */
  const visitTypeDonut = useMemo<DonutSlice[]>(() => {
    if (!data) return [];
    const total = data.payload.counters.todayAppointments;
    const followUp = data.payload.counters.followUpsToday;
    const newVisit = Math.max(0, total - followUp);
    const slices: DonutSlice[] = [];
    if (newVisit > 0) {
      slices.push({
        key: 'new',
        label: 'New visits',
        value: newVisit,
        stroke: 'stroke-primary text-primary',
        dot: 'bg-primary',
      });
    }
    if (followUp > 0) {
      slices.push({
        key: 'followup',
        label: 'Follow-ups',
        value: followUp,
        stroke: 'stroke-info text-info',
        dot: 'bg-info',
      });
    }
    return slices;
  }, [data]);

  /**
   * Hourly arrival shape — `appointmentTime` from the queue rows. Gives
   * the doctor a sense of "when does the day actually peak". Single
   * series (volume), so the area chart is the right primitive.
   */
  const arrivalsByHour = useMemo<{
    xLabels: string[];
    values: number[];
  } | null>(() => {
    if (!data) return null;
    const buckets = Array(13).fill(0); // 8am-8pm
    for (const e of data.queue) {
      const h = new Date(e.appointmentTime).getHours();
      const idx = h - 8;
      if (idx >= 0 && idx < buckets.length) buckets[idx] += 1;
    }
    const xLabels = Array.from({ length: 13 }, (_, i) => {
      const h = i + 8;
      if (h === 12) return '12p';
      return h < 12 ? `${h}a` : `${h - 12}p`;
    });
    return { xLabels, values: buckets };
  }, [data]);

  /**
   * Bell payload: stock alerts (blocking + warning) + the doctor's own
   * pending-reports count if it's growing. Pure pointers — clicking
   * forwards to the operational page.
   */
  const notifications = useMemo<NotificationItem[]>(() => {
    if (!data) return [];
    const list: NotificationItem[] = [];
    const blocking = data.payload.pharmacyAlerts.filter(
      (a) => a.severity === 'out_of_stock' || a.severity === 'expired',
    );
    if (blocking.length > 0) {
      list.push({
        severity: 'critical',
        Icon: PackageX,
        message: `${blocking.length} medicine${blocking.length === 1 ? '' : 's'} blocking new prescriptions`,
        href: '/pharmacy/alerts',
      });
    }
    const lowStock = data.payload.pharmacyAlerts.filter((a) => a.severity === 'low');
    if (lowStock.length > 0) {
      list.push({
        severity: 'warning',
        Icon: AlertCircle,
        message: `${lowStock.length} medicine${lowStock.length === 1 ? '' : 's'} running low`,
        href: '/pharmacy/alerts',
      });
    }
    if (data.payload.counters.pendingReports > 3) {
      list.push({
        severity: 'warning',
        Icon: FileClock,
        message: `${data.payload.counters.pendingReports} reports waiting for your review`,
        href: '/doctor/queue?view=reports',
      });
    }
    if (data.payload.counters.admissionsAdvised > 0) {
      list.push({
        severity: 'info',
        Icon: BedDouble,
        message: `${data.payload.counters.admissionsAdvised} admission${data.payload.counters.admissionsAdvised === 1 ? '' : 's'} advised today`,
        href: '/doctor/dashboard',
      });
    }
    return list;
  }, [data]);

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-center rounded-xl border bg-card p-10 text-sm text-muted-foreground">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : (
            <>
              <Spinner size="sm" className="mr-2" label="Loading dashboard" /> Loading dashboard...
            </>
          )}
        </div>
      </div>
    );
  }

  const { payload } = data;
  const visitTotal = visitTypeDonut.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 md:p-6">
      <Breadcrumb items={[{ label: 'Dashboard' }]} homeTo="/doctor/dashboard" homeLabel="Doctor home" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live dashboard
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Good day, {user?.fullName ?? 'Doctor'}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {isDoctor ? user.specialization : '—'} ·{' '}
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationBell items={notifications} />
          {payload.activeOpNumber && (
            <Button asChild>
              <Link to={`/doctor/consultation/${payload.activeOpNumber}`}>
                <Stethoscope /> Resume current consultation
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/doctor/queue">
              <ListOrdered /> Open queue
            </Link>
          </Button>
        </div>
      </header>

      {/* ───────── Hero KPI band ───────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Today’s appointments"
          value={String(payload.counters.todayAppointments)}
          icon={CalendarClock}
          tone="default"
          spark={arrivalsByHour?.values}
        />
        <KpiTile
          label="Waiting"
          value={String(payload.counters.waiting)}
          icon={ListOrdered}
          tone={payload.counters.waiting > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Completed today"
          value={String(payload.counters.completedToday)}
          icon={CheckCircle2}
          tone={payload.counters.completedToday > 0 ? 'success' : 'default'}
        />
        <KpiTile
          label="Pending reports"
          value={String(payload.counters.pendingReports)}
          icon={FileClock}
          tone={payload.counters.pendingReports > 0 ? 'warning' : 'default'}
        />
      </section>

      {/* ───────── Patient flow funnel + Visit-type donut + Arrivals area ───────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Today’s patient flow</h3>
            <p className="text-xxs text-muted-foreground">
              Where in the journey is each patient
            </p>
          </div>
          <Funnel
            stages={[
              { key: 'booked',     label: 'Booked',          value: flow?.booked ?? 0,     fill: 'bg-primary/80' },
              { key: 'arrived',    label: 'Arrived',         value: flow?.arrived ?? 0,    fill: 'bg-info/70' },
              { key: 'vitals',     label: 'Vitals taken',    value: flow?.vitalsDone ?? 0, fill: 'bg-warning/70' },
              { key: 'inconsult',  label: 'In consult',      value: flow?.inConsult ?? 0,  fill: 'bg-success/70' },
              { key: 'completed',  label: 'Completed',       value: flow?.completed ?? 0,  fill: 'bg-success' },
            ]}
          />
        </Card>

        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Visit type</h3>
            <p className="text-xxs text-muted-foreground">
              New patients vs follow-ups · today
            </p>
          </div>
          {visitTypeDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              No appointments today.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut
                slices={visitTypeDonut}
                size={170}
                centreLabel={String(visitTotal)}
                centreSub="Today"
              />
              <ul className="w-full space-y-1 text-xxs">
                {visitTypeDonut.map((s) => {
                  const pct = visitTotal > 0 ? (s.value / visitTotal) * 100 : 0;
                  return (
                    <li key={s.key} className="flex items-center gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
                      <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
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
              <h3 className="text-sm font-semibold tracking-tight">Arrival shape</h3>
              <p className="text-xxs text-muted-foreground">
                Patients due in across the working day
              </p>
            </div>
          </div>
          {arrivalsByHour && arrivalsByHour.values.some((v) => v > 0) ? (
            <AreaChart
              xLabels={arrivalsByHour.xLabels}
              series={[
                {
                  key: 'arrivals',
                  label: 'Patients',
                  values: arrivalsByHour.values,
                  stroke: 'stroke-primary text-primary',
                  fill: 'fill-primary text-primary',
                  dot: 'bg-primary',
                },
              ]}
              format={(v) => String(Math.round(v))}
              height={180}
            />
          ) : (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              Nothing scheduled yet today.
            </p>
          )}
        </Card>
      </section>

      {/* ───────── Follow-ups + Admissions advised + Recent activity ───────── */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <UserCheck className="h-4 w-4 text-muted-foreground" /> Today’s follow-ups
            </h3>
            <span className="text-xxs text-muted-foreground">
              {payload.followUps.length}
            </span>
          </div>
          {payload.followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No follow-ups expected today.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {payload.followUps.map((f) => (
                <li
                  key={f.uhid}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{f.patientName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {f.uhid} · {f.reason}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(f.dueOn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <BedDouble className="h-4 w-4 text-muted-foreground" /> Admissions advised
            </h3>
            <span className="text-xxs text-muted-foreground">
              {payload.admissionsAdvised.length}
            </span>
          </div>
          {payload.admissionsAdvised.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admissions advised today.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {payload.admissionsAdvised.map((a) => (
                <li
                  key={a.uhid}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{a.patientName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {a.uhid} · {a.wardType.replace('_', ' ')} · {a.reason}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(a.advisedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Activity className="h-4 w-4 text-muted-foreground" /> Recent activity
            </h3>
          </div>
          <ol className="space-y-2">
            {payload.recentActivity.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-2.5 text-sm"
              >
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span>{e.message}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(e.at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* ───────── Quick actions footer ───────── */}
      <section>
        <h3 className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
          <ClipboardList className="h-4 w-4 text-muted-foreground" /> Quick actions
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/doctor/queue">
              <ListOrdered /> Open today’s queue
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/doctor/queue?view=reports">
              <FileClock /> View pending reports
            </Link>
          </Button>
          {payload.activeOpNumber && (
            <Button asChild variant="outline">
              <Link to={`/doctor/consultation/${payload.activeOpNumber}`}>
                <Stethoscope /> Continue consultation
              </Link>
            </Button>
          )}
        </div>
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
