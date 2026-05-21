import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FlaskConical,
  Scan,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Funnel } from '@/components/charts';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import {
  fetchQueue,
  fetchQueueByDoctor,
  type DoctorQueueGroup,
  type QueueEntry,
} from '@/features/encounter';
import { fetchAppointmentsPaged, type Appointment } from '@/features/appointments';
import {
  fetchLabOrderQueue,
  type LabOrderQueueEntry,
} from '@/features/lab';
import {
  fetchRadiologyOrderQueue,
  type RadiologyOrderQueueEntry,
} from '@/features/radiology';
import { isoDate } from '@/utils/dateRange';

const today = (): string => isoDate(new Date());

interface OperationsData {
  queue: QueueEntry[];
  appointments: Appointment[];
  labQueue: LabOrderQueueEntry[];
  radQueue: RadiologyOrderQueueEntry[];
  doctorGroups: DoctorQueueGroup[];
}

const minutesAgo = (iso: string): number => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
};

/**
 * Owner operations — live patient-flow + diagnostics + per-doctor load.
 * Pulls cross-feature data so the owner sees stage-level pile-ups
 * without flipping between role apps.
 */
export function OperationsPage(): JSX.Element {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchQueue(),
      fetchAppointmentsPaged({ slotDate: today() }).then((r) => r.rows),
      fetchLabOrderQueue(),
      fetchRadiologyOrderQueue(),
      fetchQueueByDoctor(),
    ])
      .then(([queue, appointments, labQueue, radQueue, doctorGroups]) => {
        if (!alive) return;
        setData({ queue, appointments, labQueue, radQueue, doctorGroups });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const flow = useMemo(() => {
    if (!data) return null;
    const total = data.queue.length;
    const awaitingVitals = data.queue.filter((q) => q.status.name === 'awaiting_vitals').length;
    const awaitingDoctor = data.queue.filter((q) => q.status.name === 'awaiting_doctor').length;
    const inConsultation = data.queue.filter((q) => q.status.name === 'in_consultation').length;
    const consultationDone = data.queue.filter(
      (q) => q.status.name === 'consultation_done',
    ).length;
    const labPending = data.queue.filter((q) => q.status.name === 'lab_pending').length;
    const imagingPending = data.queue.filter((q) => q.status.name === 'imaging_pending').length;
    return {
      total,
      awaitingVitals,
      awaitingDoctor,
      inConsultation,
      consultationDone,
      labPending,
      imagingPending,
    };
  }, [data]);

  const labStuck = useMemo(() => {
    if (!data) return 0;
    return data.labQueue.filter((o) => {
      if (
        o.status !== 'paid' &&
        o.status !== 'sample_collection' &&
        o.status !== 'sample_collected' &&
        o.status !== 'in_progress'
      )
        return false;
      return minutesAgo(o.orderedAt) > 120;
    }).length;
  }, [data]);

  if (loading || !data || !flow) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Spinner size="sm" className="mr-2" /> Loading operations...
      </div>
    );
  }

  const appointmentsByStatus = data.appointments.reduce<Record<string, number>>(
    (acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Operations' }]}
        homeTo="/owner/dashboard"
        homeLabel="Owner home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Home/landing page: LiveIndicator band substitutes for the
              ghost back link so the title baseline matches every other
              page header. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live operations
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Operations
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Where every patient is right now, where the diagnostic worklists
            stand, and how today's appointment book is shaping up.
          </p>
        </div>
      </header>

      {/* Patient flow funnel — same shared primitive used on the
          owner dashboard so the owner reads the stage counts (and
          their drop-offs) the same way on both screens. */}
      <Card>
        <CardHeader>
          <CardTitle>Patient flow</CardTitle>
          <CardLabel>{flow.total} active</CardLabel>
        </CardHeader>
        <Funnel
          stages={[
            { key: 'vitals',  label: 'Awaiting vitals',     value: flow.awaitingVitals + flow.awaitingDoctor + flow.inConsultation + flow.consultationDone, fill: 'bg-info/70' },
            { key: 'doctor',  label: 'Awaiting doctor',     value: flow.awaitingDoctor + flow.inConsultation + flow.consultationDone, fill: 'bg-warning/70' },
            { key: 'consult', label: 'In consultation',     value: flow.inConsultation + flow.consultationDone, fill: 'bg-success/70' },
            { key: 'done',    label: 'Consultation done',   value: flow.consultationDone, fill: 'bg-success' },
            { key: 'lab',     label: 'Lab pending',         value: flow.labPending, fill: 'bg-primary/60' },
            { key: 'imaging', label: 'Imaging pending',     value: flow.imagingPending, fill: 'bg-brandAccent/60' },
          ]}
        />
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Doctor load — uses fetchQueueByDoctor (real per-doctor join)
            so the owner sees who's overloaded, who's idle. */}
        <Card>
          <CardHeader>
            <CardTitle>Doctor load</CardTitle>
            <CardLabel>{data.doctorGroups.length} doctors</CardLabel>
          </CardHeader>
          {data.doctorGroups.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title="No doctors configured."
              surface="inline"
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {data.doctorGroups
                .map((g) => {
                  const inConsult = g.entries.filter(
                    (e) => e.status.name === 'in_consultation',
                  ).length;
                  const waiting = g.entries.filter(
                    (e) => e.status.name === 'awaiting_doctor',
                  ).length;
                  const totalLoad = inConsult + waiting;
                  const longestWaitMins = g.entries
                    .filter((e) => e.status.name === 'awaiting_doctor')
                    .reduce(
                      (max, e) => Math.max(max, minutesAgo(e.appointmentTime)),
                      0,
                    );
                  return { g, inConsult, waiting, totalLoad, longestWaitMins };
                })
                .sort((a, b) => b.totalLoad - a.totalLoad)
                .map(({ g, inConsult, waiting, totalLoad, longestWaitMins }) => {
                  const overloaded = waiting > 10 || longestWaitMins > 60;
                  const idle = totalLoad === 0;
                  return (
                    <li
                      key={g.doctorId}
                      className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {g.doctorName}
                          </span>
                          {overloaded && (
                            <StatusPill tone="warning" size="sm">
                              Overloaded
                            </StatusPill>
                          )}
                          {idle && (
                            <StatusPill tone="neutral" size="sm">
                              Idle
                            </StatusPill>
                          )}
                        </div>
                        <div className="text-xxs text-muted-foreground">
                          {g.department}
                          {g.avgConsultMinutes > 0 && (
                            <>
                              {' · '}avg {g.avgConsultMinutes}m / consult
                            </>
                          )}
                          {longestWaitMins > 0 && (
                            <>
                              {' · '}longest wait {longestWaitMins}m
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono tabular-nums',
                            inConsult > 0 && 'text-primary',
                          )}
                          title="In consultation"
                        >
                          <Stethoscope className="h-3 w-3" /> {inConsult}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono tabular-nums',
                            overloaded && 'bg-warning/15 text-warning',
                          )}
                          title="Awaiting doctor"
                        >
                          <Users className="h-3 w-3" /> {waiting}
                        </span>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today’s appointments</CardTitle>
            <CardLabel>{data.appointments.length}</CardLabel>
          </CardHeader>
          {data.appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments today.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {Object.entries(appointmentsByStatus).map(([state, count]) => (
                <li
                  key={state}
                  className="flex items-baseline justify-between py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-sm capitalize">{state.replace(/_/g, ' ')}</span>
                  <StatusPill
                    tone={
                      state === 'no_show'
                        ? 'danger'
                        : state === 'arrived'
                          ? 'success'
                          : state === 'late_arrival'
                            ? 'warning'
                            : 'neutral'
                    }
                    size="sm"
                  >
                    {count}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lab worklist</CardTitle>
            <CardLabel>
              {data.labQueue.length} active
              {labStuck > 0 && ` · ${labStuck} stuck`}
            </CardLabel>
          </CardHeader>
          <DiagnosticsBucket
            Icon={FlaskConical}
            buckets={[
              { label: 'Ready to collect', count: data.labQueue.filter((o) => o.status === 'paid').length },
              { label: 'Collecting', count: data.labQueue.filter((o) => o.status === 'sample_collection').length },
              { label: 'Processing', count: data.labQueue.filter((o) => o.status === 'in_progress').length },
              {
                label: 'Reported (pending release)',
                count: data.labQueue.filter((o) => o.status === 'reported').length,
              },
            ]}
          />
          {labStuck > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {labStuck} {labStuck === 1 ? 'order' : 'orders'} stuck &gt; 2hrs in collection /
                processing.
              </span>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Radiology worklist</CardTitle>
            <CardLabel>{data.radQueue.length} active</CardLabel>
          </CardHeader>
          <DiagnosticsBucket
            Icon={Scan}
            buckets={[
              { label: 'Ready', count: data.radQueue.filter((o) => o.status === 'paid').length },
              { label: 'Processing', count: data.radQueue.filter((o) => o.status === 'in_progress').length },
              {
                label: 'Reported (pending release)',
                count: data.radQueue.filter((o) => o.status === 'reported').length,
              },
            ]}
          />
        </Card>
      </section>
    </div>
  );
}

interface DiagnosticsBucketProps {
  Icon: typeof FlaskConical;
  buckets: { label: string; count: number }[];
}

function DiagnosticsBucket({ Icon, buckets }: DiagnosticsBucketProps): JSX.Element {
  return (
    <ul className="flex flex-col gap-1.5">
      {buckets.map((b) => (
        <li
          key={b.label}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {b.label}
          </span>
          <span
            className={cn(
              'font-mono tabular-nums',
              b.count > 0 ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {b.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

