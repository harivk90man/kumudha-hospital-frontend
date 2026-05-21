import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Clock,
  HeartPulse,
  Stethoscope,
  Timer,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Spinner } from '@/components/feedback/Spinner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth';
import { fetchQueue, type QueueEntry } from '@/features/encounter';
import { fetchAppointmentsPaged, type Appointment } from '@/features/appointments';
import {
  Donut,
  Funnel,
  HourHeatmap,
  Sparkline,
  type DonutSlice,
} from '@/components/charts';
import { NotificationBell, type NotificationItem } from '@/components/overlay';
import { isoDate } from '@/utils/dateRange';
import { cn } from '@/utils/cn';

const today = (): string => isoDate(new Date());

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const minutesAgo = (iso: string): number =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

interface DashboardData {
  fullQueue: QueueEntry[];
  todayAppointments: Appointment[];
}

const DOCTOR_PALETTE = [
  { stroke: 'stroke-primary text-primary',         dot: 'bg-primary' },
  { stroke: 'stroke-info text-info',               dot: 'bg-info' },
  { stroke: 'stroke-success text-success',         dot: 'bg-success' },
  { stroke: 'stroke-warning text-warning',         dot: 'bg-warning' },
  { stroke: 'stroke-brandAccent text-brandAccent', dot: 'bg-brandAccent' },
] as const;

/**
 * Front-desk home — coordination at a glance: where are the patients
 * stuck, who's running late, where is the day overloaded. Composed
 * from the shared chart primitives so the visual language matches
 * the owner / cashier dashboards exactly.
 */
export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchQueue(), fetchAppointmentsPaged({ slotDate: today() }).then((r) => r.rows)])
      .then(([fullQueue, todayAppointments]) => {
        if (!alive) return;
        setData({ fullQueue, todayAppointments });
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load');
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
    const vitalsQueue = data.fullQueue.filter((q) => q.status.name === 'awaiting_vitals');
    const doctorQueue = data.fullQueue.filter((q) => q.status.name === 'awaiting_doctor');
    const inConsult = data.fullQueue.filter((q) => q.status.name === 'in_consultation');
    const waiting = vitalsQueue.length + doctorQueue.length;
    const avgWait = waiting > 0
      ? Math.round(
          [...vitalsQueue, ...doctorQueue].reduce((s, q) => s + q.waitingForMinutes, 0) /
            waiting,
        )
      : 0;
    const arrived = data.todayAppointments.filter((a) => a.status === 'arrived').length;
    const booked = data.todayAppointments.filter((a) => a.status === 'booked').length;
    const noShows = data.todayAppointments.filter((a) => a.status === 'no_show').length;
    const walkIns = data.todayAppointments.filter(
      (a) => a.source === 'walk_in',
    ).length;
    return {
      vitalsQueue,
      doctorQueue,
      inConsult,
      waiting,
      avgWait,
      arrived,
      booked,
      noShows,
      walkIns,
    };
  }, [data]);

  /**
   * Funnel: Booked → Arrived → Registered → Vitals → Doctor.
   * Booked totals span ALL today appointments; subsequent stages walk
   * the encounter ladder so the funnel reads as real drop-off.
   */
  const funnelStages = useMemo(() => {
    if (!data || !counters) return null;
    const totalToday = data.todayAppointments.length;
    const arrivedAll = data.todayAppointments.filter(
      (a) => a.status === 'arrived',
    ).length;
    const registered = data.fullQueue.filter(
      (q) =>
        q.status.name === 'registered' ||
        q.status.name === 'awaiting_vitals' ||
        q.status.name === 'vitals_done' ||
        q.status.name === 'awaiting_doctor' ||
        q.status.name === 'in_consultation' ||
        q.status.name === 'consultation_done',
    ).length;
    const vitalsDone = data.fullQueue.filter(
      (q) =>
        q.status.name === 'vitals_done' ||
        q.status.name === 'awaiting_doctor' ||
        q.status.name === 'in_consultation' ||
        q.status.name === 'consultation_done',
    ).length;
    const seenDoctor = data.fullQueue.filter(
      (q) =>
        q.status.name === 'in_consultation' ||
        q.status.name === 'consultation_done',
    ).length;
    return [
      { key: 'booked',     label: 'Booked',     value: totalToday, fill: 'bg-primary/80' },
      { key: 'arrived',    label: 'Arrived',    value: arrivedAll, fill: 'bg-info/70' },
      { key: 'registered', label: 'Registered', value: registered, fill: 'bg-warning/70' },
      { key: 'vitals',     label: 'Vitals',     value: vitalsDone, fill: 'bg-success/70' },
      { key: 'doctor',     label: 'With doctor', value: seenDoctor, fill: 'bg-success' },
    ];
  }, [data, counters]);

  /** Donut: today's appointments by doctor (top 5). */
  const byDoctorDonut = useMemo<DonutSlice[]>(() => {
    if (!data) return [];
    const counts = new Map<string, { name: string; count: number }>();
    for (const a of data.todayAppointments) {
      const prev = counts.get(a.doctorId);
      if (prev) prev.count += 1;
      else counts.set(a.doctorId, { name: a.doctorName, count: 1 });
    }
    const sorted = Array.from(counts.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return sorted.map((d, i) => {
      const palette = DOCTOR_PALETTE[i % DOCTOR_PALETTE.length];
      return {
        key: d.id,
        label: d.name,
        value: d.count,
        stroke: palette.stroke,
        dot: palette.dot,
      };
    });
  }, [data]);

  /** Hour-of-day arrival shape — uses appointment slotTime. */
  const arrivalsByHour = useMemo<number[]>(() => {
    const buckets = Array(24).fill(0);
    if (!data) return buckets;
    for (const a of data.todayAppointments) {
      const [h] = a.slotTime.split(':');
      const hour = Number.parseInt(h, 10);
      if (!Number.isNaN(hour)) buckets[hour] += 1;
    }
    return buckets;
  }, [data]);

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!counters) return [];
    const list: NotificationItem[] = [];
    const longWait = counters.vitalsQueue.filter((q) => q.waitingForMinutes > 30);
    if (longWait.length > 0) {
      list.push({
        severity: 'critical',
        Icon: Timer,
        message: `${longWait.length} patient${longWait.length === 1 ? '' : 's'} waiting > 30 min for vitals`,
        href: '/frontdesk/vitals',
      });
    }
    const doctorWait = counters.doctorQueue.filter((q) => q.waitingForMinutes > 45);
    if (doctorWait.length > 0) {
      list.push({
        severity: 'warning',
        Icon: Clock,
        message: `${doctorWait.length} patient${doctorWait.length === 1 ? '' : 's'} waiting > 45 min for a doctor`,
        href: '/frontdesk/station',
      });
    }
    if (counters.vitalsQueue.length > 5) {
      list.push({
        severity: 'warning',
        Icon: HeartPulse,
        message: `Vitals queue building up — ${counters.vitalsQueue.length} waiting`,
        href: '/frontdesk/vitals',
      });
    }
    if (counters.noShows > 0) {
      list.push({
        severity: 'info',
        Icon: XCircle,
        message: `${counters.noShows} no-show${counters.noShows === 1 ? '' : 's'} today`,
        href: '/frontdesk/appointments',
      });
    }
    return list;
  }, [counters]);

  if (loading || !data || !counters) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : (
          <>
            <Spinner size="sm" className="mr-2" label="Loading dashboard" /> Loading dashboard...
          </>
        )}
      </div>
    );
  }

  const upcoming = data.todayAppointments
    .filter((a) => a.status === 'booked' || a.status === 'arrived')
    .sort((a, b) => a.slotTime.localeCompare(b.slotTime))
    .slice(0, 5);
  const doctorDonutTotal = byDoctorDonut.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Dashboard' }]}
        homeTo="/frontdesk/station"
        homeLabel="OP coordination"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live dashboard
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
            · Front desk
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationBell items={notifications} />
          <Button asChild>
            <Link to="/frontdesk/register">
              <UserPlus /> Register patient
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/frontdesk/appointments">
              <CalendarClock /> Appointments
            </Link>
          </Button>
        </div>
      </header>

      {/* ───────── Hero KPI band ───────── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="In queue now"
          value={String(counters.waiting)}
          icon={Users}
          tone={counters.waiting > 0 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Booked today"
          value={String(counters.booked + counters.arrived)}
          icon={CalendarClock}
          spark={arrivalsByHour}
        />
        <KpiTile
          label="Walk-ins today"
          value={String(counters.walkIns)}
          icon={UserPlus}
          tone={counters.walkIns > 0 ? 'primary' : 'default'}
        />
        <KpiTile
          label="Avg wait"
          value={`${counters.avgWait}m`}
          icon={Timer}
          tone={
            counters.avgWait > 30
              ? 'danger'
              : counters.avgWait > 15
                ? 'warning'
                : 'default'
          }
        />
      </section>

      {/* ───────── Funnel + Doctor donut + Upcoming ───────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Today’s patient flow</h3>
            <p className="text-xxs text-muted-foreground">
              Where the day is leaking
            </p>
          </div>
          {funnelStages && <Funnel stages={funnelStages} />}
        </Card>

        <Card padding="md">
          <div className="mb-3">
            <h3 className="text-sm font-semibold tracking-tight">By doctor</h3>
            <p className="text-xxs text-muted-foreground">
              Top 5 doctors · today’s appointments
            </p>
          </div>
          {byDoctorDonut.length === 0 ? (
            <p className="py-6 text-center text-xxs text-muted-foreground">
              No appointments yet.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut
                slices={byDoctorDonut}
                size={170}
                centreLabel={String(doctorDonutTotal)}
                centreSub="Bookings"
              />
              <ul className="w-full space-y-1 text-xxs">
                {byDoctorDonut.map((s) => {
                  const pct = doctorDonutTotal > 0 ? (s.value / doctorDonutTotal) * 100 : 0;
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
            <h3 className="text-sm font-semibold tracking-tight">Next up</h3>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {upcoming.length}
            </span>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing more scheduled today.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {upcoming.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        {a.slotTime}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {a.patient.fullName}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.doctorName} · {a.department}
                    </div>
                  </div>
                  <StatusPill
                    tone={
                      a.status === 'arrived'
                        ? 'success'
                        : a.status === 'booked'
                          ? 'info'
                          : 'neutral'
                    }
                    size="sm"
                  >
                    {a.status === 'arrived' ? 'Arrived' : 'Booked'}
                  </StatusPill>
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
            <h3 className="text-sm font-semibold tracking-tight">Arrivals by hour</h3>
            <p className="text-xxs text-muted-foreground">
              Where the day spikes — plan staffing accordingly
            </p>
          </div>
          <span className="text-xxs text-muted-foreground tabular-nums">
            Peak{' '}
            {(() => {
              const peak = arrivalsByHour.indexOf(Math.max(...arrivalsByHour));
              if (arrivalsByHour[peak] === 0) return '—';
              return peak === 0 ? '12a' : peak === 12 ? '12p' : peak < 12 ? `${peak}a` : `${peak - 12}p`;
            })()}
          </span>
        </div>
        <HourHeatmap
          values={arrivalsByHour}
          toneClass="bg-primary"
          format={(v) => `${v} patient${v === 1 ? '' : 's'}`}
        />
      </Card>

      {/* ───────── Awaiting doctor mini-grid ───────── */}
      <Card padding="md">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight">
            <Stethoscope className="h-4 w-4 text-muted-foreground" /> Awaiting doctor
          </h3>
          <span className="text-xxs text-muted-foreground tabular-nums">
            {counters.doctorQueue.length}
          </span>
        </div>
        {counters.doctorQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground">Doctors are caught up.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {counters.doctorQueue.slice(0, 6).map((q) => (
              <li key={q.opNumber} className="rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{q.patient.fullName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{q.tokenNumber}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {q.patient.uhid} · since {formatTime(q.appointmentTime)} ({minutesAgo(q.appointmentTime)}m)
                </div>
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
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
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
              tone === 'primary' && 'text-primary',
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
