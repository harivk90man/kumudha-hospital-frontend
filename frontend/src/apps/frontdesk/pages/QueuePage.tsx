import { useCallback, useEffect, useState } from 'react';
import { Stethoscope, Users } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { FormErrorContainer } from '@/components/form';
import { Spinner } from '@/components/feedback/Spinner';
import { fetchQueueByDoctor, type DoctorQueueGroup } from '@/features/encounter';

const POLL_INTERVAL_MS = 5_000;

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const minutesAgo = (iso: string): number =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/**
 * Live per-doctor queue board for the front-desk nurse. Polls
 * `fetchQueueByDoctor` every 5 s so a walk-up patient can be told
 * exactly how many are ahead of them for any doctor.
 *
 * The doctor's own active patient (`in_consultation`) is pinned at the
 * top of the column; `awaiting_doctor` rows follow in FIFO order
 * (server-sorted by `appointmentTime`).
 */
export function QueuePage(): JSX.Element {
  const [groups, setGroups] = useState<DoctorQueueGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // Lifted out of useEffect so the FormErrorContainer's Retry can call
  // it directly. `silent` skips the loading flicker on the polling path.
  const load = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const next = await fetchQueueByDoctor();
      setGroups(next);
      setRefreshedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn\'t reach the queue.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Live queue' }]}
        homeTo="/frontdesk/station"
        homeLabel="OP coordination"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Landing-page band — same height as the ghost back-link on
              sub-pages so the title anchor stays consistent across
              every front-desk surface. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live queue
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Live queue
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Real-time per-doctor view — answer "how many ahead of me" for any walk-up
            patient.{' '}
            {refreshedAt && (
              <span className="text-[11px]">Last refresh {formatTime(refreshedAt.toISOString())}.</span>
            )}
          </p>
        </div>
      </header>

      {error && (
        <FormErrorContainer
          title="Couldn't reach the queue."
          description={error}
          onRetry={() => void load()}
        />
      )}

      {loading && groups.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading queue...
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No doctors configured.
          </p>
        </Card>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <DoctorQueueCard key={g.doctorId} group={g} />
          ))}
        </section>
      )}
    </div>
  );
}

interface DoctorQueueCardProps {
  group: DoctorQueueGroup;
}

function DoctorQueueCard({ group }: DoctorQueueCardProps): JSX.Element {
  const inConsult = group.entries.find((e) => e.status.name === 'in_consultation') ?? null;
  const waiting = group.entries.filter((e) => e.status.name === 'awaiting_doctor');

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" />
            {group.doctorName}
          </span>
        </CardTitle>
        <CardLabel>
          {waiting.length} ahead · {group.department}
        </CardLabel>
      </CardHeader>

      {/* Currently with the doctor */}
      {inConsult && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">
              {inConsult.patient.fullName}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {inConsult.tokenNumber}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{inConsult.patient.uhid}</span>
            <StatusPill tone="info" size="sm">
              In consultation
            </StatusPill>
          </div>
        </div>
      )}

      {/* Awaiting list */}
      {waiting.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          No one waiting.
        </p>
      ) : (
        <ol className="flex flex-col divide-y">
          {waiting.map((q, idx) => (
            <li
              key={q.opNumber}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{q.patient.fullName}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {q.tokenNumber}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {q.patient.uhid} · since {formatTime(q.appointmentTime)} (
                  {minutesAgo(q.appointmentTime)}m)
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
