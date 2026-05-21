import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  SortableTH,
  StatusPill,
  type StatusPillProps,
  TablePagination,
} from '@/components/data-display';
import { Button } from '@/components/ui/button';
import { CloseButton } from '@/components/ui/close-button';
import { FormErrorContainer } from '@/components/form';
import { Spinner } from '@/components/feedback/Spinner';
import {
  RichSelect,
  RowActionsMenu,
  RowActionsItem,
  type RichSelectOption,
} from '@/components/overlay';
import {
  cancelAppointment,
  checkInAppointment,
  fetchAppointmentsPaged,
  fetchBookableDoctors,
  markNoShow,
  type Appointment,
  type AppointmentStatus,
} from '@/features/appointments';
import {
  fetchPatient,
  searchPatientsByMobile,
  type PatientSummary,
} from '@/features/patient';
import { NewBookingForm } from '../components/NewBookingForm';
import { isoDate } from '@/utils/dateRange';
import { DEFAULT_LIMIT } from '@/utils/listQuery';

const STATUS_TONE: Record<AppointmentStatus, StatusPillProps['tone']> = {
  booked:          'info',
  confirmed:       'info',
  arrived:         'success',
  in_consultation: 'success',
  completed:       'neutral',
  no_show:         'danger',
  cancelled:       'neutral',
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked:          'Booked',
  confirmed:       'Confirmed',
  arrived:         'Arrived',
  in_consultation: 'In consult',
  completed:       'Completed',
  no_show:         'No-show',
  cancelled:       'Cancelled',
};

const today = (): string => isoDate(new Date());

const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};

const formatDateHeading = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  const t = today();
  if (iso === t) return 'Today';
  if (iso === addDaysIso(t, 1)) return 'Tomorrow';
  if (iso === addDaysIso(t, -1)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
};

const formatBookedRel = (iso: string): string => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const slotIsPast = (slotDate: string, slotTime: string): boolean =>
  new Date(`${slotDate}T${slotTime}:00`).getTime() < Date.now();

interface DoctorOption { id: string; name: string; department: string; }

export function AppointmentsPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT);
  const sort = params.get('sort') || 'slotTime';
  const slotDate = params.get('date') || today();
  const doctorFilter = params.get('doctor') || 'all';

  /* ---------- Appointments list ---------- */
  const [items, setItems] = useState<Appointment[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  /* ---------- Booking form ---------- */
  const [bookingOpen, setBookingOpen] = useState<boolean>(false);
  const [bookingPatient, setBookingPatient] = useState<PatientSummary | null>(null);

  /* ---------- UHID search (header) ---------- */
  const [uhidRaw, setUhidRaw] = useState<string>('');
  const [uhidSearching, setUhidSearching] = useState<boolean>(false);
  const [uhidResults, setUhidResults] = useState<PatientSummary[]>([]);
  const [uhidError, setUhidError] = useState<string | null>(null);
  const uhidRef = useRef<HTMLInputElement>(null);

  /* ---------- Doctors ---------- */
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  useEffect(() => { void fetchBookableDoctors().then(setDoctors); }, []);

  const setParam = (key: string, value: string | null): void => {
    const np = new URLSearchParams(params);
    if (!value) np.delete(key);
    else np.set(key, value);
    setParams(np, { replace: true });
  };

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const paged = await fetchAppointmentsPaged({
        slotDate,
        doctorId: doctorFilter === 'all' ? undefined : doctorFilter,
        q,
        page,
        limit,
        sort,
      });
      setItems(paged.rows);
      setTotal(paged.total);
      setRefreshedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [doctorFilter, q, page, limit, sort, slotDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAction = async (id: string, fn: (id: string) => Promise<Appointment>): Promise<void> => {
    setBusyId(id);
    try { await fn(id); await load(); } finally { setBusyId(null); }
  };

  const onUhidLookup = async (): Promise<void> => {
    const value = uhidRaw.trim();
    if (!value) return;
    setUhidSearching(true);
    setUhidError(null);
    try {
      if (value.toUpperCase().startsWith('KH-')) {
        const found = await fetchPatient(value.toUpperCase());
        setUhidResults(found ? [found] : []);
        if (!found) setUhidError(`No patient found for ${value}`);
      } else {
        const results = await searchPatientsByMobile(value);
        setUhidResults(results);
        if (results.length === 0) setUhidError(`No patient found for ${value}`);
      }
    } catch (e) {
      setUhidError(e instanceof Error ? e.message : 'Lookup failed');
      setUhidResults([]);
    } finally {
      setUhidSearching(false);
    }
  };

  const clearUhid = (): void => {
    setUhidRaw('');
    setUhidResults([]);
    setUhidError(null);
  };

  const doctorFilterOptions = useMemo<RichSelectOption[]>(() => [
    { value: 'all', name: 'All doctors' },
    ...doctors.map((d) => ({ value: d.id, name: d.name, sublabel: d.department })),
  ], [doctors]);

  const setSlotDate = (next: string): void => {
    const np = new URLSearchParams(params);
    if (next === today()) np.delete('date');
    else np.set('date', next);
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  const setDoctor = (next: string): void => {
    const np = new URLSearchParams(params);
    if (next === 'all') np.delete('doctor');
    else np.set('doctor', next);
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  const showUhidCard = uhidResults.length > 0 || uhidError !== null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 overflow-hidden p-4 md:h-screen md:gap-5 md:p-6">
      <Breadcrumb
        items={[{ label: 'Appointments' }]}
        homeTo="/frontdesk/station"
        homeLabel="OP coordination"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-0 mb-1 flex items-center gap-2">
            <LiveIndicator />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Appointments
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {formatDateHeading(slotDate)} — check in arrivals, manage bookings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* UHID search — w-52, underline, blur-to-search */}
          <div className="flex w-52 items-center gap-1.5 border-b border-hairline focus-within:border-primary">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <input
              ref={uhidRef}
              type="text"
              value={uhidRaw}
              onChange={(e) => setUhidRaw(e.target.value)}
              onBlur={() => void onUhidLookup()}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void onUhidLookup(); } }}
              placeholder="UHID or phone no"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {uhidSearching && <Spinner size="sm" />}
          </div>

          <Button
            type="button"
            className="w-44 justify-center"
            onClick={() => { setBookingPatient(null); setBookingOpen(true); }}
          >
            <CalendarClock /> New booking
          </Button>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col gap-3">

          {/* UHID lookup results */}
          {showUhidCard && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {uhidError ? (
                    <span className="flex items-center gap-2">
                      {uhidError}
                      <Link
                        to={`/frontdesk/register?returnTo=/frontdesk/appointments`}
                        className="font-medium text-primary hover:underline"
                      >
                        Register new patient
                      </Link>
                    </span>
                  ) : (
                    `${uhidResults.length} ${uhidResults.length === 1 ? 'result' : 'results'}`
                  )}
                </span>
                <CloseButton onClick={clearUhid} />
              </div>
              {uhidResults.length > 0 && (
                <ul className="divide-y">
                  {uhidResults.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{p.fullName}</span>
                          <span className="font-mono text-xs text-muted-foreground">{p.uhid}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.gender.toUpperCase()} · {p.ageYears}y · {p.mobile}
                        </div>
                        {(p.allergies?.length ?? 0) > 0 && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-danger">
                            <ShieldAlert className="h-3 w-3" />
                            {p.allergies?.map((a) => a.allergen).join(', ')}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          setBookingPatient(p);
                          setBookingOpen(true);
                          clearUhid();
                        }}
                      >
                        Book
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Inline booking form */}
          {bookingOpen && (
            <NewBookingForm
              initialPatient={bookingPatient ?? undefined}
              initialDate={slotDate}
              onBooked={() => { setBookingOpen(false); setBookingPatient(null); void load(); }}
              onClose={() => { setBookingOpen(false); setBookingPatient(null); }}
            />
          )}

          {/* Filter row */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">
                Appointments for {formatDateHeading(slotDate)}
              </span>
              {refreshedAt && (
                <span className="text-xs text-muted-foreground">
                  Refreshed {refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {/* Date stepper */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSlotDate(addDaysIso(slotDate, -1))}
                  aria-label="Previous day"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value || today())}
                  className="border-b border-hairline bg-transparent px-1 py-1 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setSlotDate(addDaysIso(slotDate, 1))}
                  aria-label="Next day"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                {slotDate !== today() && (
                  <button
                    type="button"
                    onClick={() => setSlotDate(today())}
                    className="ml-1 text-xs text-primary hover:underline"
                  >
                    Today
                  </button>
                )}
              </div>

              {/* Doctor filter */}
              <RichSelect
                value={doctorFilter}
                onChange={setDoctor}
                menuLabel="Filter by doctor"
                options={doctorFilterOptions}
                triggerClassName="border-0 border-b border-hairline rounded-none bg-transparent shadow-none"
              />

              {/* Search */}
              <div className="flex w-44 items-center gap-1.5 border-b border-hairline focus-within:border-primary">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => {
                    const np = new URLSearchParams(params);
                    if (e.target.value) np.set('q', e.target.value);
                    else np.delete('q');
                    np.set('page', '1');
                    setParams(np, { replace: true });
                  }}
                  placeholder="Search queue"
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            </div>
          </div>

          {error && (
            <FormErrorContainer
              title="Couldn't load appointments."
              description={error}
              onRetry={() => void load()}
            />
          )}

          {/* Table */}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" /> Loading appointments...
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {doctorFilter !== 'all' || q
                ? 'No appointments match the current filters.'
                : `No bookings for ${formatDateHeading(slotDate)}.`}
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-gray-100 bg-white shadow-sm">
              <div className="min-h-0 flex-1 overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <SortableTH field="slotTime" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                        Slot
                      </SortableTH>
                      <SortableTH field="patient.fullName" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                        Patient
                      </SortableTH>
                      <SortableTH field="doctorName" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                        Doctor
                      </SortableTH>
                      <SortableTH field="bookedAt" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                        Booking
                      </SortableTH>
                      <SortableTH field="status" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                        Status
                      </SortableTH>
                      <th className="px-3 py-2.5 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a) => {
                      const isPast = slotIsPast(a.slotDate, a.slotTime);
                      const isBooked = a.status === 'booked';
                      const inFlight = busyId === a.id;
                      return (
                        <tr
                          key={a.id}
                          className="border-b align-middle last:border-b-0 transition-colors hover:bg-primary/[0.04]"
                        >
                          <td className="px-3 py-3">
                            <div className="inline-flex items-center gap-1 font-mono text-sm font-semibold">
                              <Clock className="h-3.5 w-3.5" /> {a.slotTime}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              Token {a.tokenNumber}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="text-[13px] leading-tight text-foreground">
                              {a.patient.fullName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {a.patient.uhid} · {a.patient.gender.toUpperCase()} · {a.patient.ageYears}y
                            </div>
                            {(a.patient.allergies?.length ?? 0) > 0 && (
                              <div className="inline-flex items-center gap-1 text-xxs font-medium text-danger">
                                <ShieldAlert className="h-3 w-3" />
                                Allergy: {a.patient.allergies?.map((al) => al.allergen).join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm">
                            <div>{a.doctorName}</div>
                            <div className="text-xs text-muted-foreground">{a.department}</div>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            <div className="capitalize">{a.source.replace(/_/g, ' ')}</div>
                            <div>{formatBookedRel(a.bookedAt)}</div>
                            {a.visitType === 'follow_up' && (
                              <div className="font-medium text-foreground">Follow-up</div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <StatusPill
                              tone={STATUS_TONE[a.status]}
                              size="sm"
                            >
                              {STATUS_LABEL[a.status]}
                            </StatusPill>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isBooked && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-20 justify-center"
                                  onClick={() => void runAction(a.id, checkInAppointment)}
                                  disabled={inFlight}
                                >
                                  {inFlight ? <Spinner size="sm" /> : 'Check in'}
                                </Button>
                              )}
                              <RowActionsMenu label={`More actions for ${a.patient.fullName}`}>
                                <RowActionsItem asChild>
                                  <Link to={`/patient/${a.patient.uhid}`}>
                                    <Eye /> View / edit patient
                                  </Link>
                                </RowActionsItem>
                                {isBooked && isPast && (
                                  <RowActionsItem destructive onClick={() => void runAction(a.id, markNoShow)}>
                                    <XCircle /> Mark no-show
                                  </RowActionsItem>
                                )}
                                {isBooked && (
                                  <RowActionsItem
                                    destructive
                                    onClick={() => void runAction(a.id, (id) => cancelAppointment(id))}
                                  >
                                    <XCircle /> Cancel booking
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
