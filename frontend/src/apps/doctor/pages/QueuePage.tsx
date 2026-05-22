import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCheck,
  ClipboardCheck,
  FileSearch,
  FlaskConical,
  Pill,
  Play,
  Scan,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { PatientHoverPreview } from '@/components/overlay';
import { cn } from '@/utils/cn';
import {
  fetchQueuePaged,
  fetchReportPendingQueue,
  startConsultation,
  QueueStatusBadge,
  type EncounterStatusName,
  type QueueEntry,
  type ReportPendingEntry,
} from '@/features/encounter';
import { useAuth } from '@/features/auth';
import {
  Breadcrumb,
  LiveIndicator,
  SortableTH,
  TablePagination,
} from '@/components/data-display';

/** Silent poll cadence — matches OP coordination so wait/status deltas
 *  never lag more than ~5s. */
const POLL_INTERVAL_MS = 5_000;
/** Window during which a status-changed row keeps the flash highlight. */
const FLASH_DURATION_MS = 1_500;
/** Patients ≥ this age get a small `65+` indicator inline with demographics —
 *  a calm clinical-context nudge, not an alarm. */
const ELDERLY_AGE = 65;
/** Default rows-per-page for the doctor queue tables. Smaller than the
 *  global DEFAULT_LIMIT (25) because the doctor scans the queue
 *  glance-by-glance and rarely needs more than ~10 at once. */
const DEFAULT_PAGE_SIZE = 10;

/**
 * Compact icon cluster summarising whether an encounter has a
 * prescription, lab order, or radiology order attached. Renders an
 * em-dash when none apply so the column stays a stable width.
 */
function EncounterItemsCell({
  hasPrescription,
  hasLab,
  hasRadiology,
}: {
  hasPrescription: boolean;
  hasLab: boolean;
  hasRadiology: boolean;
}): JSX.Element {
  const items: { Icon: LucideIcon; label: string }[] = [];
  if (hasPrescription) items.push({ Icon: Pill, label: 'Prescription' });
  if (hasLab) items.push({ Icon: FlaskConical, label: 'Lab report' });
  if (hasRadiology) items.push({ Icon: Scan, label: 'Radiology report' });
  if (items.length === 0) {
    return <span className="text-xxs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-1">
      {items.map(({ Icon, label }) => (
        <span
          key={label}
          title={label}
          aria-label={label}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-hairline bg-muted/40 text-foreground"
        >
          <Icon className="h-3 w-3" />
        </span>
      ))}
    </div>
  );
}

type View = 'consultation' | 'reports' | 'done';
type StatusFilter = 'all' | EncounterStatusName;

/**
 * Statuses that belong in the active consultation queue.
 * `consultation_done` and everything downstream live in their own tabs.
 * Passed as `statuses` (set filter) so the server never returns done rows
 * when the user picks "All" — avoids client-side filtering (CLAUDE.md §3.4).
 */
const CONSULTATION_ACTIVE_STATUSES: EncounterStatusName[] = [
  'walk_in_arrived',
  'registered',
  'awaiting_vitals',
  'vitals_done',
  'awaiting_doctor',
  'in_consultation',
];

const formatRelative = (iso: string): string => {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
};

export function QueuePage(): JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Doctor / chief_doctor see only their own patients. Other super-roles
  // (owner peeking in) get the unfiltered view so they can audit any
  // doctor's queue. Backend will eventually own this scoping via the
  // session — until then we pass `doctorId` explicitly.
  const scopedDoctorId =
    user && (user.role === 'doctor' || user.role === 'chief_doctor')
      ? user.id
      : undefined;
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'reports'
    ? 'reports'
    : params.get('view') === 'done'
      ? 'done'
      : 'consultation';

  // Filter + paging state lives in URL — round-trips to the server (CLAUDE.md §3.4).
  const status: StatusFilter = (params.get('status') as StatusFilter) || 'all';
  const query: string = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_PAGE_SIZE);
  const sort = params.get('sort') || 'appointmentTime';

  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [queueTotal, setQueueTotal] = useState<number>(0);
  const [reports, setReports] = useState<ReportPendingEntry[]>([]);
  const [loadingQueue, setLoadingQueue] = useState<boolean>(true);
  const [loadingReports, setLoadingReports] = useState<boolean>(true);

  // Consultation-done tab data
  const [doneCases, setDoneCases] = useState<QueueEntry[]>([]);
  const [doneTotal, setDoneTotal] = useState<number>(0);
  const [loadingDone, setLoadingDone] = useState<boolean>(true);

  // `recentlyChanged` flashes rows whose status moved during the last
  // poll so the eye catches deltas without an alarm.
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(() => new Set());
  const prevStatusByOpRef = useRef<Record<string, EncounterStatusName>>({});

  /**
   * Reload the queue from the server. `silent` skips the loading skeleton
   * (used by the 5s poll so the table doesn't flicker every tick) and only
   * surfaces deltas via the flash-once highlight + tab counter update.
   */
  const reloadQueue = useCallback(
    async (silent: boolean): Promise<void> => {
      if (!silent) setLoadingQueue(true);
      const r = await fetchQueuePaged({
        // When no specific status is selected, pass the active-statuses
        // allowlist so the server never returns consultation_done (or any
        // post-consultation state) in the consultation queue.
        ...(status === 'all'
          ? { statuses: CONSULTATION_ACTIVE_STATUSES }
          : { status }),
        doctorId: scopedDoctorId,
        q: query || undefined,
        page,
        limit,
        sort,
      });

      // Diff against last snapshot to detect status moves; first load
      // (empty prev map) is silent — flash only on subsequent transitions.
      const nextSnapshot: Record<string, EncounterStatusName> = {};
      const changed: string[] = [];
      const hadPrev = Object.keys(prevStatusByOpRef.current).length > 0;
      for (const row of r.rows) {
        nextSnapshot[row.opNumber] = row.status.name;
        const prev = prevStatusByOpRef.current[row.opNumber];
        if (hadPrev && prev !== undefined && prev !== row.status.name) {
          changed.push(row.opNumber);
        }
      }
      prevStatusByOpRef.current = nextSnapshot;

      setQueue(r.rows);
      setQueueTotal(r.total);
      if (!silent) setLoadingQueue(false);

      if (changed.length > 0) {
        setRecentlyChanged((s) => {
          const next = new Set(s);
          changed.forEach((op) => next.add(op));
          return next;
        });
        window.setTimeout(() => {
          setRecentlyChanged((s) => {
            const next = new Set(s);
            changed.forEach((op) => next.delete(op));
            return next;
          });
        }, FLASH_DURATION_MS);
      }
    },
    [status, query, page, limit, sort, scopedDoctorId],
  );

  // Filter/paging-driven fetch — shows the loading skeleton.
  useEffect(() => {
    void reloadQueue(false);
  }, [reloadQueue]);

  // Silent 5s poll — keeps wait minutes and statuses fresh.
  useEffect(() => {
    const id = window.setInterval(() => void reloadQueue(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reloadQueue]);

  // `/` keyboard shortcut focuses the queue search input — common
  // operational habit borrowed from GitHub / GitLab. Skipped when the
  // user is already typing somewhere (input/textarea/contenteditable)
  // so it never hijacks a literal slash inside another field.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reload reports queue when its query param changes.
  useEffect(() => {
    let alive = true;
    setLoadingReports(true);
    void fetchReportPendingQueue({ q: query || undefined, doctorId: scopedDoctorId }).then((r) => {
      if (alive) {
        setReports(r);
        setLoadingReports(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [query, scopedDoctorId]);

  // Reload consultation-done cases whenever filters or pagination change.
  useEffect(() => {
    let alive = true;
    setLoadingDone(true);
    void fetchQueuePaged({
      status: 'consultation_done',
      doctorId: scopedDoctorId,
      q: query || undefined,
      page,
      limit,
      sort,
    }).then((r) => {
      if (alive) {
        setDoneCases(r.rows);
        setDoneTotal(r.total);
        setLoadingDone(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [query, page, limit, sort, scopedDoctorId]);

  const setView = (next: View): void => {
    const np = new URLSearchParams(params);
    if (next === 'consultation') np.delete('view');
    else np.set('view', next);
    setParams(np, { replace: true });
  };

  const setParam = (key: string, value: string | null): void => {
    const np = new URLSearchParams(params);
    if (!value) np.delete(key);
    else np.set(key, value);
    setParams(np, { replace: true });
  };

  const startAndOpen = async (opNumber: string): Promise<void> => {
    await startConsultation(opNumber);
    navigate(`/doctor/consultation/${opNumber}`);
  };

  const inConsultation = useMemo(
    () => queue.find((q) => q.status.name === 'in_consultation'),
    [queue],
  );

  const tabs: { value: View; label: string; count: number; loading: boolean; Icon: typeof Users }[] = [
    {
      value: 'consultation',
      label: 'Consultation queue',
      count: queueTotal,
      loading: loadingQueue,
      Icon: Users,
    },
    {
      value: 'reports',
      label: 'Reports to check',
      count: reports.length,
      loading: loadingReports,
      Icon: FileSearch,
    },
    {
      value: 'done',
      label: 'Consultation done',
      count: doneTotal,
      loading: loadingDone,
      Icon: CheckCheck,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 md:p-6">
      <Breadcrumb items={[{ label: 'Queue' }]} homeTo="/doctor/dashboard" homeLabel="Doctor home" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Landing-page band — same height (h-8) as the ghost
              back-link used on sub-pages so the title and any
              right-side CTAs anchor at the same y as elsewhere. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live queue
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Doctor queue
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {view === 'consultation'
              ? loadingQueue
                ? 'Loading...'
                : `${queueTotal} appointments shown`
              : view === 'done'
                ? loadingDone
                  ? 'Loading...'
                  : `${doneTotal} consultations completed today`
                : loadingReports
                  ? 'Loading...'
                  : `${reports.length} encounters with reports ready`}
          </p>
        </div>
      </header>

      {/* Hairline separator below the page title */}
      <div className="border-b border-hairline -mt-2" />

      <div role="tablist" aria-label="Queue views" className="inline-flex rounded-lg bg-muted p-1">
        {tabs.map(({ value, label, count, loading, Icon }) => {
          const active = view === value;
          return (
            <button
              key={value}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setView(value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span
                className={cn(
                  'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs',
                  active ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground',
                )}
              >
                {loading ? '...' : count}
              </span>
            </button>
          );
        })}
      </div>

      {view === 'consultation' && inConsultation && (
        <section
          aria-label="Current consultation"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Stethoscope className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-xxs font-medium text-primary">
                Currently in consultation
              </span>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-base font-semibold tracking-tight">
                  {inConsultation.patient.fullName}
                </span>
                <span className="font-mono text-xs font-medium tabular-nums text-primary">
                  {inConsultation.tokenNumber}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{inConsultation.opNumber}</span>
                {' · '}
                {inConsultation.chiefComplaint}
              </span>
            </div>
          </div>
          <Button asChild className="min-w-[10rem]">
            <Link to={`/doctor/consultation/${inConsultation.opNumber}`}>
              Resume consultation
            </Link>
          </Button>
        </section>
      )}

      {/* Search filter — sits directly above the table so it reads as a
          table-level control. Applies across all tabs (q is shared in
          the URL) so the placeholder copy switches per active view. */}
      <div className="flex flex-wrap items-end justify-end gap-4">
        <div className="relative flex items-end">
          <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder={
              view === 'consultation'
                ? 'Search by patient, mobile, UHID, OP number, token, complaint...'
                : view === 'done'
                  ? 'Search by patient, mobile, UHID, OP number...'
                  : 'Search by patient, mobile, UHID, OP number, diagnosis...'
            }
            className="w-72 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-8 text-sm shadow-none focus:outline-none focus:border-primary"
          />
          {/* `/` keyboard hint */}
          <kbd className="pointer-events-none absolute right-0 bottom-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            /
          </kbd>
        </div>
      </div>

      {/* ── Consultation queue tab ─────────────────────────────────────────────── */}
      {view === 'consultation' ? (
        loadingQueue ? (
          <div className="flex items-center justify-center rounded-xl border bg-card p-10 text-sm text-muted-foreground">
            <Spinner size="sm" className="mr-2" label="Loading queue" /> Loading queue...
          </div>
        ) : queue.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No patients waiting for you right now."
            description="New arrivals from the front desk will appear here automatically."
          />
        ) : (
          <div className="overflow-hidden border-b border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                    <SortableTH field="tokenNumber" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                      Token
                    </SortableTH>
                    <SortableTH field="patient.fullName" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                      Patient
                    </SortableTH>
                    <th className="px-3 py-2 font-medium">Chief complaint</th>
                    <SortableTH field="status.name" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                      Status
                    </SortableTH>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((e, idx) => {
                    const canStart =
                      e.status.name === 'awaiting_doctor' ||
                      e.status.name === 'walk_in_arrived' ||
                      e.status.name === 'awaiting_vitals' ||
                      e.status.name === 'registered';
                    const isLive = e.status.name === 'in_consultation';
                    const isElderly = e.patient.ageYears >= ELDERLY_AGE;
                    const flashing = recentlyChanged.has(e.opNumber);
                    return (
                      <tr
                        key={e.opNumber}
                        className={cn(
                          'border-b align-middle last:border-b-0 transition-colors hover:bg-primary/[0.05]',
                          !isLive && idx % 2 === 1 && 'bg-muted/20',
                          isLive && 'bg-primary/[0.08] shadow-[inset_3px_0_0] shadow-primary',
                          flashing && 'animate-flash-once',
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-base font-bold tracking-tight tabular-nums">
                            {e.tokenNumber}
                          </div>
                          <div className="font-mono text-xxs text-muted-foreground tabular-nums">
                            {e.opNumber}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <PatientHoverPreview
                              patient={e.patient}
                              navigateTo={`/patient/${e.patient.uhid}?op=${encodeURIComponent(e.opNumber)}`}
                            >
                              <span className="font-medium">{e.patient.fullName}</span>
                            </PatientHoverPreview>
                            {isElderly && (
                              <span
                                className="inline-flex items-center rounded-full bg-warning/12 px-1.5 py-px text-xxs font-medium text-warning"
                                title="Patient is 65 or older — consider geriatric dosing and fall risk"
                              >
                                65+
                              </span>
                            )}
                          </div>
                          <div className="text-xxs text-muted-foreground">
                            {e.patient.gender.toUpperCase()} · {e.patient.ageYears}y ·{' '}
                            <span className="font-mono tabular-nums">{e.patient.uhid}</span>
                          </div>
                          {(e.patient.allergies?.length ?? 0) > 0 && (
                            <div className="mt-0.5 text-xxs font-medium text-danger">
                              Allergy: {e.patient.allergies?.map((a) => a.allergen).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm">
                          <p className="line-clamp-2 max-w-md leading-snug">{e.chiefComplaint}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <QueueStatusBadge status={e.status} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isLive ? (
                            <Button asChild size="sm" className="min-w-[5.5rem]">
                              <Link to={`/doctor/consultation/${e.opNumber}`}>Resume</Link>
                            </Button>
                          ) : canStart ? (
                            <Button
                              size="sm"
                              className="min-w-[5.5rem]"
                              onClick={() => void startAndOpen(e.opNumber)}
                            >
                              <Play /> Start
                            </Button>
                          ) : (
                            <Button asChild size="sm" variant="outline" className="min-w-[5.5rem]">
                              <Link to={`/doctor/consultation/${e.opNumber}`}>Open</Link>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              total={queueTotal}
              page={page}
              limit={limit}
              onPageChange={(p) => setParam('page', String(p))}
              onLimitChange={(l) => {
                const np = new URLSearchParams(params);
                np.set('limit', String(l));
                np.set('page', '1');
                setParams(np, { replace: true });
              }}
            />
          </div>
        )

      /* ── Reports to check tab ─────────────────────────────────────────────── */
      ) : view === 'reports' ? (
        loadingReports ? (
          <div className="flex items-center justify-center rounded-xl border bg-card p-10 text-sm text-muted-foreground">
            <Spinner size="sm" className="mr-2" label="Loading report queue" /> Loading report queue...
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No reports waiting for review."
            description="Encounters whose lab/imaging reports are ready will appear here."
          />
        ) : (
          <div className="overflow-hidden border-b border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Patient</th>
                    <th className="px-3 py-2 font-medium">Diagnosis</th>
                    <th className="px-3 py-2 font-medium">Reports</th>
                    <th className="px-3 py-2 font-medium">Consulted</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, idx) => (
                    <tr
                      key={r.opNumber}
                      className={cn(
                        'border-b align-top last:border-b-0 transition-colors hover:bg-primary/[0.05]',
                        idx % 2 === 1 && 'bg-muted/20',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.patient.fullName}</div>
                        <div className="text-xxs text-muted-foreground">
                          {r.patient.gender.toUpperCase()} · {r.patient.ageYears}y
                        </div>
                        <div className="font-mono text-xxs text-muted-foreground tabular-nums">
                          {r.patient.uhid} · {r.opNumber}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.primaryDiagnosis ? (
                          <span className="line-clamp-2 leading-snug">{r.primaryDiagnosis}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xxs font-medium text-success">
                            <ClipboardCheck className="h-3 w-3" />
                            {r.readyCount} ready
                          </span>
                          {r.pendingCount > 0 && (
                            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xxs font-medium text-warning">
                              {r.pendingCount} pending
                            </span>
                          )}
                        </div>
                        <ul className="mt-1.5 flex flex-wrap gap-1">
                          {r.reports.map((rep) => {
                            const Icon = rep.kind === 'lab' ? FlaskConical : Scan;
                            const isReady = rep.status === 'reported';
                            return (
                              <li
                                key={`${r.opNumber}-${rep.testCode}`}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-xxs',
                                  isReady ? 'text-foreground' : 'text-muted-foreground',
                                )}
                                title={
                                  isReady && rep.reportedAt
                                    ? `${rep.testName} · reported ${formatRelative(rep.reportedAt)}`
                                    : `${rep.testName} · ${rep.status.replace('_', ' ')}`
                                }
                              >
                                <Icon className="h-3 w-3" />
                                {rep.testName}
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                      <td className="px-3 py-2.5 text-xxs text-muted-foreground tabular-nums">
                        {formatRelative(r.consultedAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button asChild size="sm" className="min-w-[8rem]">
                          <Link to={`/doctor/consultation/${r.opNumber}?tab=reports`}>
                            Review reports
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )

      /* ── Consultation done tab ─────────────────────────────────────────────── */
      ) : loadingDone ? (
        <div className="flex items-center justify-center rounded-xl border bg-card p-10 text-sm text-muted-foreground">
          <Spinner size="sm" className="mr-2" label="Loading completed consultations" /> Loading...
        </div>
      ) : doneCases.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="No completed consultations yet."
          description="Encounters marked consultation done will appear here."
        />
      ) : (
        <div className="overflow-hidden border-b border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <SortableTH field="tokenNumber" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                    Token
                  </SortableTH>
                  <SortableTH field="patient.fullName" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                    Patient
                  </SortableTH>
                  <th className="px-3 py-2 font-medium">Chief complaint</th>
                  <th className="px-3 py-2 font-medium">Items</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {doneCases.map((e, idx) => {
                  const isElderly = e.patient.ageYears >= ELDERLY_AGE;
                  return (
                    <tr
                      key={e.opNumber}
                      className={cn(
                        'border-b align-middle last:border-b-0 transition-colors hover:bg-primary/[0.05]',
                        idx % 2 === 1 && 'bg-muted/20',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-base font-bold tracking-tight tabular-nums">
                          {e.tokenNumber}
                        </div>
                        <div className="font-mono text-xxs text-muted-foreground tabular-nums">
                          {e.opNumber}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <PatientHoverPreview
                            patient={e.patient}
                            navigateTo={`/patient/${e.patient.uhid}?op=${encodeURIComponent(e.opNumber)}`}
                          >
                            <span className="font-medium">{e.patient.fullName}</span>
                          </PatientHoverPreview>
                          {isElderly && (
                            <span
                              className="inline-flex items-center rounded-full bg-warning/12 px-1.5 py-px text-xxs font-medium text-warning"
                              title="Patient is 65 or older"
                            >
                              65+
                            </span>
                          )}
                        </div>
                        <div className="text-xxs text-muted-foreground">
                          {e.patient.gender.toUpperCase()} · {e.patient.ageYears}y ·{' '}
                          <span className="font-mono tabular-nums">{e.patient.uhid}</span>
                        </div>
                        {(e.patient.allergies?.length ?? 0) > 0 && (
                          <div className="mt-0.5 text-xxs font-medium text-danger">
                            Allergy: {e.patient.allergies?.map((a) => a.allergen).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm">
                        <p className="line-clamp-2 max-w-md leading-snug">{e.chiefComplaint}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <EncounterItemsCell
                          hasPrescription={e.hasPrescription}
                          hasLab={e.hasLabOrders}
                          hasRadiology={e.hasRadiologyOrders}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button asChild size="sm" variant="outline" className="min-w-[5.5rem]">
                          <Link to={`/doctor/consultation/${e.opNumber}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            total={doneTotal}
            page={page}
            limit={limit}
            onPageChange={(p) => setParam('page', String(p))}
            onLimitChange={(l) => {
              const np = new URLSearchParams(params);
              np.set('limit', String(l));
              np.set('page', '1');
              setParams(np, { replace: true });
            }}
          />
        </div>
      )}
    </div>
  );
}
