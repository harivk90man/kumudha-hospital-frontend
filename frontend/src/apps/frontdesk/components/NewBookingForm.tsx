import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { StatusPill } from '@/components/data-display';
import { DatePicker, FormErrorContainer, FormSelect, FormTextarea } from '@/components/form';
import { cn } from '@/utils/cn';
import { isoDate } from '@/utils/dateRange';
import {
  fetchPatient,
  searchPatientsByMobile,
  type PatientSummary,
} from '@/features/patient';
import {
  bookAppointment,
  fetchBookableDoctors,
  fetchSlots,
  type Appointment,
  type AppointmentSlot,
  type VisitType,
} from '@/features/appointments';

export interface NewBookingFormHandle {
  triggerBooking: () => void;
}

interface NewBookingFormProps {
  /** ISO yyyy-mm-dd to start the slot grid on. Defaults to today. */
  initialDate?: string;
  /**
   * Pre-selected patient. When set, the patient picker is bypassed —
   * the form opens with this patient locked in and "Change" is hidden.
   * Used by BookAppointmentPage when the nurse has already searched.
   */
  initialPatient?: PatientSummary;
  /** Called after a successful booking. */
  onBooked: (appointment: Appointment) => void;
  /** Called when the user clicks "Close" — collapses the form on the parent. */
  onClose: () => void;
  /** Fires whenever the selected slot changes — lets a parent toolbar enable its book button. */
  onSlotChange?: (slot: AppointmentSlot | null) => void;
  /** Suppress the inline "Book appointment" button when the parent renders it in its toolbar. */
  hideBookButton?: boolean;
  /** Called when a booking attempt fails — lets the parent reset its own loading state. */
  onBookingError?: () => void;
}

interface DoctorOption {
  id: string;
  name: string;
  department: string;
}

/**
 * TSD-05 §4.1 says slots are generated "for the next N days" but doesn't
 * pin N. UI cap at 14 days; backend will enforce the same.
 */
const BOOKING_HORIZON_DAYS = 14;

const today = (): string => isoDate(new Date());

const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};

const formatDateLabel = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
};

/**
 * Inline new-booking form. Lives on the AppointmentsPage (and any other
 * surface that wants booking inline). Designed to replace the modal
 * drawer the front-desk used previously — the form unfolds in place,
 * the appointment list shifts below it.
 *
 * Gating order is:
 *   1. Patient + Doctor + Date → slot grid renders for that doctor+date.
 *   2. Slot tile click commits the booking (one-click; visit type
 *      defaults to `new`).
 *
 * Importantly, the slot grid renders as soon as the **doctor + date**
 * are chosen — the patient gate is checked on slot click, not as a
 * visibility filter. This was the bug in the previous drawer: picking
 * a date with no patient yet looked like the slots had vanished.
 */
export const NewBookingForm = forwardRef<NewBookingFormHandle, NewBookingFormProps>(
  function NewBookingForm({
    initialDate,
    initialPatient,
    onBooked,
    onClose: _onClose,
    onSlotChange,
    hideBookButton = false,
    onBookingError,
  }, ref) {
    /* ---------- Patient picker ---------- */
    const [patientSearch, setPatientSearch] = useState<string>('');
    const [searching, setSearching] = useState<boolean>(false);
    const [patientResults, setPatientResults] = useState<PatientSummary[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(
      initialPatient ?? null,
    );
    const [searchError, setSearchError] = useState<string | null>(null);
    // When the form is opened with a pre-selected patient, the "Change"
    // button is hidden (the caller owns the patient choice — typically a
    // standalone BookAppointmentPage opened from a search result).
    const patientLocked = Boolean(initialPatient);

    /* ---------- Doctor + visit type + date + slot ---------- */
    const [doctors, setDoctors] = useState<DoctorOption[]>([]);
    const [doctorId, setDoctorId] = useState<string>('');
    const [visitType, setVisitType] = useState<VisitType>('new');
    const [slotDate, setSlotDate] = useState<string>(initialDate ?? today());
    const [slots, setSlots] = useState<AppointmentSlot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState<boolean>(false);

    /* ---------- Chief complaint ---------- */
    const [chiefComplaint, setChiefComplaint] = useState<string>('');

    /* ---------- Slot selection + submit ---------- */
    const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
    const [booking, setBooking] = useState<boolean>(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    /* Stable ref so effects that notify the parent don't need onSlotChange in their dep arrays. */
    const onSlotChangeRef = useRef(onSlotChange);
    useEffect(() => { onSlotChangeRef.current = onSlotChange; });

    /* Version counter guards against races when the user spams doctor/date changes. */
    const fetchVersionRef = useRef<number>(0);

    const onSearch = async (raw: string): Promise<void> => {
      const value = raw.trim();
      setSearchError(null);
      if (!value) {
        setPatientResults([]);
        return;
      }
      setSearching(true);
      try {
        if (value.toUpperCase().startsWith('KH-')) {
          const found = await fetchPatient(value.toUpperCase());
          setPatientResults(found ? [found] : []);
        } else {
          const results = await searchPatientsByMobile(value);
          setPatientResults(results);
        }
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : 'Lookup failed');
      } finally {
        setSearching(false);
      }
    };

    const onSlotSelect = (slot: AppointmentSlot): void => {
      if (slot.status !== 'available' || booking) return;
      setSelectedSlot((prev) => {
        const next = prev?.id === slot.id ? null : slot;
        onSlotChangeRef.current?.(next);
        return next;
      });
      setSubmitError(null);
    };

    const onConfirmBooking = async (): Promise<void> => {
      if (!selectedSlot || !selectedPatient) return;
      setBooking(true);
      setSubmitError(null);
      try {
        const scheduledAt = new Date(`${selectedSlot.slotDate}T${selectedSlot.slotTime}:00`).toISOString();
        const created = await bookAppointment({
          patientId: selectedPatient.id,
          doctorId:  selectedSlot.doctorId,
          source:    'walk_in',
          visitType,
          chiefComplaint: chiefComplaint.trim() || undefined,
          scheduledAt,
        });
        onBooked(created);
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : 'Booking failed');
        setBooking(false);
        onBookingError?.();
      }
    };

    /* Expose triggerBooking so a parent toolbar button can fire the booking action. */
    useImperativeHandle(ref, () => ({
      triggerBooking: () => void onConfirmBooking(),
    }));

    /* Load doctors once on mount. */
    useEffect(() => {
      void fetchBookableDoctors().then(setDoctors);
    }, []);

    useEffect(() => {
      setSelectedSlot(null);
      onSlotChangeRef.current?.(null);
      if (!doctorId) {
        setSlots([]);
        return;
      }
      const ticket = ++fetchVersionRef.current;
      setLoadingSlots(true);
      fetchSlots({ doctorId, slotDate })
        .then((next) => {
          if (ticket === fetchVersionRef.current) setSlots(next);
        })
        .finally(() => {
          if (ticket === fetchVersionRef.current) setLoadingSlots(false);
        });
    }, [doctorId, slotDate]);

    const slotsByPeriod = useMemo(() => {
      const morning: AppointmentSlot[] = [];
      const afternoon: AppointmentSlot[] = [];
      for (const s of slots) {
        const hour = Number(s.slotTime.slice(0, 2));
        if (hour < 12) morning.push(s);
        else afternoon.push(s);
      }
      return { morning, afternoon };
    }, [slots]);

    const minDate = today();
    const maxDate = addDaysIso(minDate, BOOKING_HORIZON_DAYS);

    return (
      <div className="flex flex-col gap-5">
        {/* Patient search — only shown when patient is not pre-locked */}
        {!patientLocked && (
          <section className="flex flex-col gap-2">
            {selectedPatient ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-primary/5 p-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">
                      {selectedPatient.fullName}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {selectedPatient.uhid}
                    </span>
                    {(selectedPatient.allergies?.length ?? 0) > 0 && (
                      <StatusPill tone="danger" size="sm">
                        <ShieldAlert className="h-3 w-3" />
                        Allergy
                      </StatusPill>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedPatient.gender.toUpperCase()} · {selectedPatient.ageYears}y
                    · {selectedPatient.mobile}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedPatient(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onSearch(patientSearch);
                  }}
                  className="flex gap-2"
                >
                  <label className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="UHID or mobile"
                      className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <Button type="submit" disabled={searching || !patientSearch.trim()}>
                    {searching ? <Spinner size="sm" /> : <Search />}
                  </Button>
                </form>
                {searchError && (
                  <FormErrorContainer
                    title="Couldn't search patients."
                    description={searchError}
                    onRetry={() => void onSearch(patientSearch)}
                  />
                )}
                {patientResults.length === 0 && patientSearch && !searching ? (
                  <p className="text-xs text-muted-foreground">
                    No matches.{' '}
                    <Link
                      to="/frontdesk/register?for=appointment"
                      className="font-medium text-primary hover:underline"
                    >
                      Register this patient
                    </Link>{' '}
                    first.
                  </p>
                ) : (
                  patientResults.length > 0 && (
                    <ul className="flex flex-col divide-y rounded-lg border">
                      {patientResults.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-3 p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="truncate text-sm font-medium">{p.fullName}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {p.uhid}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.gender.toUpperCase()} · {p.ageYears}y · {p.mobile}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setSelectedPatient(p)}
                          >
                            Use
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </>
            )}
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* ---- Left: Doctor + Date + Visit type + Reason ---- */}
          <div className="flex flex-col gap-4">
            {/* Doctor */}
            <section className="flex flex-col gap-2">
              <FormSelect
                variant="flat"
                label="Doctor"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                <option value="" disabled>
                  Pick a doctor
                </option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.department}
                  </option>
                ))}
              </FormSelect>
            </section>

            {/* Chief complaint */}
            <section className="flex flex-col gap-2">
              <FormTextarea
                variant="flat"
                label="Reason for visit"
                rows={1}
                placeholder="Reason for visit (optional)"
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
              />
            </section>

            {/* Date + Visit type */}
            <section className="flex flex-col gap-2">
              <DatePicker
                label="Appointment date"
                hideLabel
                flat
                value={slotDate}
                min={minDate}
                max={maxDate}
                minYear={new Date().getFullYear()}
                maxYear={new Date().getFullYear() + 1}
                onChange={(next) => setSlotDate(next || minDate)}
              />
              <span className="text-xs text-muted-foreground">
                {formatDateLabel(slotDate)} · up to {BOOKING_HORIZON_DAYS} days ahead
              </span>
              <div className="inline-flex w-full rounded-lg bg-muted p-1">
                {(['new', 'follow_up'] as VisitType[]).map((v) => {
                  const active = visitType === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisitType(v)}
                      className={cn(
                        'flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition',
                        active
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      aria-pressed={active}
                    >
                      {v === 'new' ? 'New visit' : 'Follow-up'}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ---- Right: Slot grid (gated by doctor only) ---- */}
          <div className="flex flex-col gap-2">
            {!doctorId ? (
              <p className="text-sm text-muted-foreground">
                Pick a doctor to see open slots for {formatDateLabel(slotDate)}.
              </p>
            ) : loadingSlots ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" /> Loading slots…
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No slots configured for this doctor on {formatDateLabel(slotDate)}.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {(['morning', 'afternoon'] as const).map((period) => {
                  const list = slotsByPeriod[period];
                  if (list.length === 0) return null;
                  return (
                    <div key={period}>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {period === 'morning' ? 'Morning' : 'Afternoon / Evening'}
                      </p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {list.map((s) => {
                          const taken = s.status !== 'available';
                          const isSelected = selectedSlot?.id === s.id;
                          const disabled = taken || booking;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => onSlotSelect(s)}
                              className={cn(
                                'rounded-md border px-2 py-1.5 text-sm font-medium tabular-nums transition',
                                taken && 'cursor-not-allowed bg-muted text-muted-foreground line-through opacity-70',
                                !taken && !isSelected && 'hover:border-primary/40 hover:bg-primary/5',
                                isSelected && 'border-primary bg-primary text-primary-foreground',
                              )}
                              title={taken ? 'Booked' : isSelected ? 'Selected' : 'Click to select'}
                            >
                              {s.slotTime}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedSlot && !hideBookButton && (
              <div className="mt-3 flex items-center gap-3">
                <Button
                  type="button"
                  className="w-44 justify-center"
                  onClick={() => void onConfirmBooking()}
                  disabled={booking}
                >
                  {booking ? <Spinner size="sm" /> : null}
                  {booking ? 'Booking...' : 'Book appointment'}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedSlot.slotTime} selected
                </span>
              </div>
            )}

            {submitError && (
              <div className="mt-2">
                <FormErrorContainer
                  title="Couldn't book the slot."
                  description={submitError}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
