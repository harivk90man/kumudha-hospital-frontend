import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Eye,
  FlaskConical,
  HeartPulse,
  Pin,
  Search,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  SortableTH,
  StatusPill,
  TablePagination,
  type StatusPillProps,
} from '@/components/data-display';
import { Button } from '@/components/ui/button';
import { DatePicker, FormErrorContainer } from '@/components/form';
import { Spinner } from '@/components/feedback/Spinner';
import { TableSkeleton } from '@/components/feedback/TableSkeleton';
import {
  PatientHoverPreview,
  RichSelect,
  RowActionsMenu,
  RowActionsItem,
  type RichSelectOption,
} from '@/components/overlay';
import { CloseButton } from '@/components/ui/close-button';
import {
  fetchPatient,
  searchPatientsByMobile,
  type PatientSummary,
} from '@/features/patient';
import {
  cancelAppointment,
  checkInAppointment,
  fetchBookableDoctors,
  markNoShow,
} from '@/features/appointments';
import {
  fetchLiveQueue,
  LIVE_QUEUE_SORT_WHITELIST,
  type LiveQueueEntry,
  type LiveQueueStatus,
} from '@/features/encounter';
import { sortRows } from '@/utils/listQuery';
import { useNotificationsStore } from '@/store/notificationsStore';
import { ShiftLockedBanner, useShiftLock } from '@/features/billing';
import { cn } from '@/utils/cn';

const POLL_INTERVAL_MS = 5_000;
const todayIso = (): string => new Date().toISOString().slice(0, 10);
const formatSlot = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const STATUS_LABEL: Record<LiveQueueStatus, string> = {
  booked:          'Booked',
  pending_payment: 'Awaiting payment',
  awaiting_vitals: 'Awaiting vitals',
  awaiting_doctor: 'Awaiting doctor',
};

const STATUS_TONE: Record<LiveQueueStatus, StatusPillProps['tone']> = {
  booked:          'neutral',
  pending_payment: 'danger',
  awaiting_vitals: 'warning',
  awaiting_doctor: 'info',
};

const STATUS_BREATHE: ReadonlySet<LiveQueueStatus> = new Set<LiveQueueStatus>([
  'pending_payment',
]);

interface DoctorOption { id: string; name: string; department: string; }

export function NurseStationPage(): JSX.Element {
  const navigate = useNavigate();
  const shiftLock = useShiftLock();

  /* ---------- URL-driven state ---------- */
  const [params, setParams] = useSearchParams();
  const page        = Math.max(1, Number(params.get('page'))  || 1);
  const limit       = Math.max(1, Number(params.get('limit')) || 8);
  const sort        = params.get('sort') || 'queuePos';
  const doctorFilter = params.get('doctor') || 'all';
  const queueQ      = params.get('queueQ') ?? '';

  const setParam = (key: string, value: string | null): void => {
    const np = new URLSearchParams(params);
    if (!value) np.delete(key); else np.set(key, value);
    setParams(np, { replace: true });
  };

  const setDoctor = (doctorId: string): void => {
    const np = new URLSearchParams(params);
    if (doctorId === 'all') np.delete('doctor'); else np.set('doctor', doctorId);
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  /* ---------- Date selection ---------- */
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const isToday = selectedDate === todayIso();

  /* ---------- Focus-on-return (after a successful payment) ----------
   * PaymentPage redirects back with ?focus=<opNumber>. State + ref are
   * declared here; the effect that depends on `rows` lives further down
   * after the queue fetch state.
   */
  const [focusedOp, setFocusedOp] = useState<string | null>(params.get('focus'));
  const scrolledOpRef = useRef<string | null>(null);

  /* ---------- Doctor list ---------- */
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  useEffect(() => { void fetchBookableDoctors().then(setDoctors); }, []);

  /* ---------- Queue fetch + polling ---------- */
  const [rows, setRows]             = useState<LiveQueueEntry[]>([]);
  const [total, setTotal]           = useState<number>(0);
  const [loading, setLoading]       = useState<boolean>(true);
  const [error, setError]           = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const firstLoadRef = useRef<boolean>(true);

  const prevStatusByKey = useRef<Map<string, string>>(new Map());
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set());

  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const togglePin = useCallback((key: string): void => {
    setPinnedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const reload = async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const result = await fetchLiveQueue({
        date:       selectedDate !== todayIso() ? selectedDate : undefined,
        doctorId:   doctorFilter !== 'all' ? doctorFilter : undefined,
        q:          queueQ || undefined,
        page,
        limit,
        pinnedKeys: pinnedKeys.size > 0 ? [...pinnedKeys] : undefined,
      });

      // Flash rows whose queueStatus changed since last poll
      const prev = prevStatusByKey.current;
      const changedNow: string[] = [];
      for (const r of result.rows) {
        const key = r.opNumber ?? r.appointmentId ?? '';
        const last = prev.get(key);
        if (last !== undefined && last !== r.queueStatus) changedNow.push(key);
      }
      const next = new Map<string, string>();
      for (const r of result.rows) {
        const key = r.opNumber ?? r.appointmentId ?? '';
        next.set(key, r.queueStatus);
      }
      prevStatusByKey.current = next;
      if (changedNow.length > 0) {
        setRecentlyChanged((s) => { const n = new Set(s); for (const k of changedNow) n.add(k); return n; });
        window.setTimeout(() => {
          setRecentlyChanged((s) => { const n = new Set(s); for (const k of changedNow) n.delete(k); return n; });
        }, 1_400);
      }

      setRows(result.rows);
      setTotal(result.total);
      setRefreshedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
    } finally {
      if (!silent) setLoading(false);
      firstLoadRef.current = false;
    }
  };

  useEffect(() => { void reload(); }, [selectedDate, doctorFilter, queueQ, page, limit, pinnedKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isToday) return;
    const id = window.setInterval(() => void reload(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isToday, doctorFilter, queueQ, page, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus-on-return scroll: when `rows` updates after the queue load,
  // find the row whose data-op matches `focusedOp` and centre it.
  // Only fires once per focus value — a poll-driven re-render won't
  // yank the page away from what the cashier is reading.
  useEffect(() => {
    if (!focusedOp) return;
    if (scrolledOpRef.current === focusedOp) return;
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`tr[data-op="${focusedOp}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        scrolledOpRef.current = focusedOp;
        // Strip ?focus= so refreshing the URL doesn't re-trigger.
        const np = new URLSearchParams(params);
        np.delete('focus');
        setParams(np, { replace: true });
      }
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedOp, rows]);

  // Drop the flash after 6s so the page returns to its normal look.
  useEffect(() => {
    if (!focusedOp) return;
    const t = window.setTimeout(() => setFocusedOp(null), 6_000);
    return () => window.clearTimeout(t);
  }, [focusedOp]);

  const rowKey = (r: LiveQueueEntry): string => r.opNumber ?? r.appointmentId ?? '';

  const STATUS_PRIORITY: Record<LiveQueueStatus, number> = {
    awaiting_doctor: 1,
    awaiting_vitals: 2,
    pending_payment: 3,
    booked:          4,
  };

  /* ---------- Appointment-row actions (Check-in / Cancel / No-show) ---------- */
  const pushNotification = useNotificationsStore((s) => s.push);
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set());
  const setBusy = (id: string, busy: boolean): void =>
    setRowBusy((s) => {
      const next = new Set(s);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const onCheckIn = async (apptId: string): Promise<void> => {
    setBusy(apptId, true);
    try {
      await checkInAppointment(apptId);
      pushNotification({ type: 'success', title: 'Checked in', message: 'Patient marked as arrived.' });
      await reload(true);
    } catch (e) {
      pushNotification({
        type: 'error', title: 'Check-in failed',
        message: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(apptId, false);
    }
  };

  const onCancelAppt = async (apptId: string): Promise<void> => {
    if (!window.confirm('Cancel this appointment?')) return;
    setBusy(apptId, true);
    try {
      await cancelAppointment(apptId, 'Cancelled at front desk');
      pushNotification({ type: 'success', title: 'Cancelled', message: 'Appointment cancelled.' });
      await reload(true);
    } catch (e) {
      pushNotification({
        type: 'error', title: 'Cancel failed',
        message: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(apptId, false);
    }
  };

  const onMarkNoShow = async (apptId: string): Promise<void> => {
    setBusy(apptId, true);
    try {
      await markNoShow(apptId);
      pushNotification({ type: 'success', title: 'No-show', message: 'Appointment marked as no-show.' });
      await reload(true);
    } catch (e) {
      pushNotification({
        type: 'error', title: 'Mark no-show failed',
        message: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusy(apptId, false);
    }
  };

  /* ---------- Patient lookup ---------- */
  const [lookupValue, setLookupValue]   = useState<string>('');
  const [lookupSearching, setLookupSearching] = useState<boolean>(false);
  const [lookupResults, setLookupResults]     = useState<PatientSummary[]>([]);
  const [lookupError, setLookupError]         = useState<string | null>(null);
  const [lookupTouched, setLookupTouched]     = useState<boolean>(false);

  const onLookup = useCallback(async (raw: string): Promise<void> => {
    const value = raw.trim();
    setLookupError(null);
    setLookupTouched(true);
    if (!value) { setLookupResults([]); return; }
    setLookupSearching(true);
    try {
      if (value.toUpperCase().startsWith('KH-')) {
        const found = await fetchPatient(value.toUpperCase());
        setLookupResults(found ? [found] : []);
      } else {
        setLookupResults(await searchPatientsByMobile(value));
      }
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookupSearching(false);
    }
  }, []);

  // Debounced live search — fires 300 ms after the user stops typing, ≥ 4 chars.
  useEffect(() => {
    const trimmed = lookupValue.trim();
    if (trimmed.length < 4) {
      setLookupResults([]);
      setLookupTouched(false);
      setLookupError(null);
      return;
    }
    const timer = window.setTimeout(() => void onLookup(lookupValue), 300);
    return () => window.clearTimeout(timer);
  }, [lookupValue, onLookup]);

  const doctorFilterOptions = useMemo<RichSelectOption[]>(() => [
    { value: 'all', name: 'All doctors' },
    ...doctors.map((d) => ({ value: d.id, name: d.name, sublabel: d.department })),
  ], [doctors]);

  // Per-doctor queue positions + ETA for awaiting_doctor rows.
  // Sorted by waitingSince ASC within each doctor — Q1 = next up.
  // ETA = Q# × avgConsultMinutes (default 10 min; swap in real per-doctor avg
  // once the backend exposes it via GET /api/doctors/avg-consult-times).
  const AVG_CONSULT_MINUTES = 10;
  const queueMeta = useMemo(() => {
    const meta = new Map<string, { qPos: number; etaMinutes: number }>();
    const byDoctor = new Map<string, LiveQueueEntry[]>();
    for (const row of rows) {
      if (row.queueStatus !== 'awaiting_doctor') continue;
      const g = byDoctor.get(row.doctorId) ?? [];
      g.push(row);
      byDoctor.set(row.doctorId, g);
    }
    for (const group of byDoctor.values()) {
      group
        .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime())
        .forEach((r, i) => {
          const qPos = i + 1;
          meta.set(rowKey(r), { qPos, etaMinutes: qPos * AVG_CONSULT_MINUTES });
        });
    }
    return meta;
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedRows = useMemo(() => {
    const pinned   = rows.filter((r) => pinnedKeys.has(rowKey(r)));
    const unpinned = rows.filter((r) => !pinnedKeys.has(rowKey(r)));

    const desc  = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    let sortedUnpinned: LiveQueueEntry[];
    if (field === 'queuePos') {
      sortedUnpinned = [...unpinned].sort((a, b) => {
        const pa = STATUS_PRIORITY[a.queueStatus];
        const pb = STATUS_PRIORITY[b.queueStatus];
        if (pa !== pb) return pa - pb;
        if (a.queueStatus === 'awaiting_doctor') {
          const qa = queueMeta.get(rowKey(a))?.qPos ?? Infinity;
          const qb = queueMeta.get(rowKey(b))?.qPos ?? Infinity;
          return desc ? qb - qa : qa - qb;
        }
        return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
      });
    } else {
      sortedUnpinned = sortRows(unpinned, sort, LIVE_QUEUE_SORT_WHITELIST);
    }
    return [...pinned, ...sortedUnpinned];
  }, [rows, sort, queueMeta, pinnedKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 overflow-hidden md:h-screen md:gap-5">
      <div className="px-4 pt-5 md:px-6 md:pt-6">
        <Breadcrumb items={[{ label: 'OP Management' }]} homeTo="/frontdesk/station" homeLabel="OP Management" />
      </div>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 md:px-6">
        <div>
          <LiveIndicator className="mb-1" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">OP Management</h1>
          <p className="text-[13px] text-muted-foreground">
            Live queue — payment pending, vitals routing, awaiting doctor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); void onLookup(lookupValue); }} className="flex gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={lookupValue}
                onChange={(e) => setLookupValue(e.target.value)}
                placeholder="UHID or phone number"
                className="w-52 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-9 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
              />
              {lookupSearching && <Spinner size="sm" className="absolute right-2 top-1/2 -translate-y-1/2" />}
            </label>
          </form>
          <Button asChild className="w-44 justify-center">
            <Link to="/frontdesk/register?returnTo=/frontdesk/station">
              <UserPlus /> Register new patient
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/frontdesk/walkin"><FlaskConical /> Walk-in service</Link>
          </Button>
        </div>
      </header>

      {/* Lookup results */}
      {(lookupError || (lookupTouched && !lookupSearching)) && (
        <section className="flex flex-col gap-2 px-4 md:px-6">
          {lookupError && (
            <FormErrorContainer title="Couldn't look up patient." description={lookupError} onRetry={() => void onLookup(lookupValue)} />
          )}
          {!lookupError && lookupResults.length === 0 && lookupValue.trim() && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                No patient matches <span className="font-mono">{lookupValue.trim()}</span>.
              </p>
              <Button asChild size="sm">
                <Link to={`/frontdesk/register?for=appointment&prefill=${encodeURIComponent(lookupValue.trim())}`}>
                  <UserPlus /> Register new patient
                </Link>
              </Button>
            </div>
          )}
          {lookupResults.length > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between rounded-t-lg border-b border-hairline bg-muted/50 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {lookupResults.length} {lookupResults.length === 1 ? 'result' : 'results'}
                </span>
                <CloseButton onClick={() => { setLookupResults([]); setLookupTouched(false); setLookupValue(''); }} />
              </div>
              <ul className="flex flex-col divide-y">
                {lookupResults.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{p.fullName}</span>
                          <span className="font-mono text-xs text-muted-foreground">{p.uhid}</span>
                          {(p.allergies?.length ?? 0) > 0 && (
                            <StatusPill tone="danger" size="sm"><ShieldAlert className="h-3 w-3" /> Allergy</StatusPill>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.gender.toUpperCase()} · {p.ageYears}y · {p.mobile}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/patient/${p.uhid}`}><Eye /> View</Link>
                        </Button>
                        <Button asChild size="sm">
                          <Link to={`/frontdesk/station/book/${p.uhid}`}><CalendarClock /> Book appointment</Link>
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="px-4 md:px-6">
        <ShiftLockedBanner lock={shiftLock} />
      </div>

      {/* Live queue */}
      <section className="flex min-h-0 flex-1 flex-col gap-3 px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">
              {isToday ? 'Live queue' : 'Appointments'}
            </span>
            <span className="text-xxs text-muted-foreground tabular-nums">
              {isToday
                ? (refreshedAt ? `Refreshed ${refreshedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ' ')
                : 'Scheduled appointments for the selected date'}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <DatePicker
              label="Date"
              hideLabel
              flat
              value={selectedDate}
              onChange={(d) => {
                setSelectedDate(d || todayIso());
                setParam('page', '1');
              }}
              min={todayIso()}
              minYear={new Date().getFullYear()}
              maxYear={new Date().getFullYear() + 1}
            />
            <RichSelect
              value={doctorFilter}
              onChange={setDoctor}
              menuLabel="Filter queue by doctor"
              className="w-48"
              options={doctorFilterOptions}
              triggerClassName="rounded-none border-x-0 border-t-0 border-b border-hairline shadow-none bg-transparent px-0 focus:ring-0 focus:border-primary"
            />
            <div className="relative flex items-end">
              <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={queueQ}
                onChange={(e) => {
                  const np = new URLSearchParams(params);
                  if (e.target.value) np.set('queueQ', e.target.value); else np.delete('queueQ');
                  np.set('page', '1');
                  setParams(np, { replace: true });
                }}
                placeholder="Search"
                className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {error && (
          <FormErrorContainer title="Couldn't reach the queue." description={error} onRetry={() => void reload()} />
        )}

        {loading && firstLoadRef.current ? (
          <TableSkeleton rows={5} cols={7} />
        ) : rows.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border-b border-border">
            <div className="flex max-w-sm flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium text-foreground">
                {queueQ
                  ? 'No rows match the search.'
                  : isToday
                    ? 'Queue is clear — nobody is waiting.'
                    : 'No appointments scheduled for this date.'}
              </p>
              <p className="text-xxs text-muted-foreground">
                {queueQ
                  ? 'Try a different name or UHID.'
                  : isToday
                    ? 'New arrivals will appear automatically every 5 seconds.'
                    : 'Appointments booked for this date will appear here.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border bg-card shadow-sm">
            <div className="min-h-0 flex-1 overflow-hidden">
              <table className="min-w-full table-fixed text-sm">
                <colgroup>
                  {isToday && <col className="w-12" />}
                  <col className="w-24" />
                  <col className="w-[26%]" />
                  <col className="w-[18%]" />
                  {isToday && <col className="w-16" />}
                  <col className="w-32" />
                  {isToday && <col className="w-24" />}
                  <col className="w-44" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {isToday && (
                      <SortableTH field="queuePos" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                        Q#
                      </SortableTH>
                    )}
                    <SortableTH field="tokenNumber" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                      {isToday ? 'Token' : 'Slot'}
                    </SortableTH>
                    <SortableTH field="patient.fullName" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>Patient</SortableTH>
                    <th className="px-3 py-2.5">Doctor</th>
                    {isToday && <th className="px-3 py-2.5">Vitals</th>}
                    <SortableTH field="queueStatus" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>Status</SortableTH>
                    {isToday && <th className="px-3 py-2.5">ETA</th>}
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row: LiveQueueEntry) => {
                    const isBooked  = row.queueStatus === 'booked';
                    const isPending = row.queueStatus === 'pending_payment';
                    const isVitals  = row.queueStatus === 'awaiting_vitals';
                    const apptId    = row.appointmentId;
                    const busy      = apptId ? rowBusy.has(apptId) : false;
                    const qMeta     = queueMeta.get(rowKey(row));
                    return (
                      <tr
                        key={rowKey(row)}
                        data-op={row.opNumber ?? ''}
                        className={cn(
                          'border-b align-middle last:border-b-0 transition-colors',
                          isPending ? 'bg-warning/5 hover:bg-warning/10' : 'hover:bg-muted/30',
                          pinnedKeys.has(rowKey(row)) && 'bg-primary/5',
                          recentlyChanged.has(rowKey(row)) && 'animate-flash-once',
                          focusedOp && row.opNumber === focusedOp && 'animate-flash-once bg-success/10 ring-2 ring-success/40',
                        )}
                      >
                        {/* Q# + pin toggle */}
                        {isToday && (
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); togglePin(rowKey(row)); }}
                                title={pinnedKeys.has(rowKey(row)) ? 'Unpin row' : 'Pin to top'}
                                className="flex-shrink-0 rounded p-0.5 transition-colors hover:bg-muted/60 focus:outline-none"
                              >
                                <Pin className={cn(
                                  'h-3 w-3',
                                  pinnedKeys.has(rowKey(row))
                                    ? 'fill-primary text-primary'
                                    : 'text-muted-foreground/40',
                                )} />
                              </button>
                              {qMeta
                                ? <span className="font-mono text-xs font-semibold tabular-nums text-primary">{qMeta.qPos}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </div>
                          </td>
                        )}

                        {/* Token / Slot */}
                        <td className="px-3 py-2.5">
                          {isToday ? (
                            row.tokenNumber ? (
                              <>
                                <div className="font-mono text-[13px] tabular-nums">{row.tokenNumber}</div>
                                <div className="font-mono text-xxs text-muted-foreground tabular-nums">{row.opNumber}</div>
                              </>
                            ) : (
                              <>
                                <div className={cn('font-mono text-[13px] tabular-nums', isBooked && 'font-medium')}>
                                  {isBooked
                                    ? formatSlot(row.scheduledAt)
                                    : <span className="text-xxs text-muted-foreground">No token yet</span>}
                                </div>
                                {row.appointmentNo && (
                                  <div className="font-mono text-xxs text-muted-foreground tabular-nums">{row.appointmentNo}</div>
                                )}
                              </>
                            )
                          ) : (
                            <>
                              <span className="font-mono text-[13px] tabular-nums font-medium">
                                {formatSlot(row.scheduledAt)}
                              </span>
                              {row.appointmentNo && (
                                <div className="font-mono text-xxs text-muted-foreground tabular-nums">{row.appointmentNo}</div>
                              )}
                            </>
                          )}
                        </td>

                        {/* Patient */}
                        <td className="px-3 py-2.5">
                          <div className="space-y-0.5">
                            {row.opNumber ? (
                              <PatientHoverPreview
                                patient={row.patient as PatientSummary}
                                navigateTo={`/patient/${row.patient.uhid}?op=${encodeURIComponent(row.opNumber)}`}
                              >
                                <span className="text-[13px] leading-tight text-foreground">{row.patient.fullName}</span>
                              </PatientHoverPreview>
                            ) : (
                              <div className="text-[13px] leading-tight text-foreground">{row.patient.fullName}</div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              {row.patient.uhid} · {row.patient.gender.toUpperCase()} · {row.patient.ageYears}y
                            </div>
                            {row.patient.allergies.length > 0 && (
                              <div className="inline-flex items-center gap-1 text-xxs font-medium text-danger">
                                <ShieldAlert className="h-3 w-3" />
                                Allergy: {row.patient.allergies.map((a) => a.allergen).join(', ')}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Doctor */}
                        <td className="px-3 py-2.5">
                          <div className="text-[12px] leading-tight">{row.doctorName}</div>
                          {row.department && <div className="text-xxs text-muted-foreground">{row.department}</div>}
                        </td>

                        {/* Vitals (today only) */}
                        {isToday && (
                          <td className="px-3 py-2.5">
                            {isVitals ? (
                              <span className="inline-flex items-center gap-1.5 text-warning">
                                <HeartPulse className="h-3.5 w-3.5 animate-breathe" />
                                <span className="text-xxs">Pending</span>
                              </span>
                            ) : row.queueStatus === 'awaiting_doctor' ? (
                              <span className="inline-flex items-center gap-1.5 text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span className="text-xxs">Done</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}

                        {/* Status */}
                        <td className="px-3 py-2.5">
                          {isToday ? (
                            <StatusPill
                              tone={STATUS_TONE[row.queueStatus]}
                              size="sm"
                              pulse={STATUS_BREATHE.has(row.queueStatus) ? 'breathe' : 'none'}
                            >
                              {STATUS_LABEL[row.queueStatus]}
                            </StatusPill>
                          ) : (
                            <StatusPill tone="neutral" size="sm">Booked</StatusPill>
                          )}
                        </td>

                        {/* ETA (today only) */}
                        {isToday && (
                          <td className="px-3 py-2.5">
                            {qMeta
                              ? <span className="font-mono text-xs tabular-nums text-muted-foreground">~{qMeta.etaMinutes}m</span>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                        )}

                        {/* Actions */}
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isToday && isBooked && (
                              <Button
                                type="button"
                                size="sm"
                                className="w-20 justify-center"
                                onClick={() => apptId && void onCheckIn(apptId)}
                                disabled={!apptId || busy}
                              >
                                {busy ? <Spinner size="sm" /> : 'Check in'}
                              </Button>
                            )}
                            {isToday && isPending && (
                              <Button
                                type="button"
                                size="sm"
                                className="w-20 justify-center"
                                onClick={() => {
                                  if (shiftLock.locked) return;
                                  if (row.appointmentId) {
                                    navigate(`/payment/appointment/${row.appointmentId}`);
                                  } else if (row.opNumber) {
                                    navigate(`/payment/${encodeURIComponent(row.opNumber)}`);
                                  }
                                }}
                                disabled={shiftLock.locked || (!row.appointmentId && !row.opNumber)}
                                title={
                                  shiftLock.locked
                                    ? shiftLock.reason === 'no_open'
                                      ? 'Shift not opened on this counter yet'
                                      : 'Shift on this counter is closed'
                                    : undefined
                                }
                              >
                                Payment
                              </Button>
                            )}
                            {isToday && isVitals && row.opNumber && (
                              <Button asChild size="sm" className="w-20 justify-center">
                                <Link to={`/frontdesk/vitals?op=${encodeURIComponent(row.opNumber)}`}>
                                  Vitals
                                </Link>
                              </Button>
                            )}
                            <RowActionsMenu label={`More actions for ${row.patient.fullName}`}>
                              <RowActionsItem asChild>
                                <Link to={`/patient/${row.patient.uhid}`}><Eye /> View / edit patient</Link>
                              </RowActionsItem>
                              {isToday && isBooked && (
                                <RowActionsItem onClick={() => { if (apptId) void onMarkNoShow(apptId); }}>
                                  Mark no-show
                                </RowActionsItem>
                              )}
                              {isToday && isBooked && (
                                <RowActionsItem
                                  destructive
                                  onClick={() => { if (apptId) void onCancelAppt(apptId); }}
                                >
                                  Cancel appointment
                                </RowActionsItem>
                              )}
                            </RowActionsMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              total={total}
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
      </section>
    </div>
  );
}
