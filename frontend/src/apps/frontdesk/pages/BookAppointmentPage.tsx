import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, WorkspacePageLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { CloseButton } from '@/components/ui/close-button';
import { Spinner } from '@/components/feedback/Spinner';
import { FormErrorContainer } from '@/components/form';
import {
  fetchPatient,
  searchPatientsByMobile,
  type PatientSummary,
} from '@/features/patient';
import { NewBookingForm, type NewBookingFormHandle } from '../components/NewBookingForm';

export function BookAppointmentPage(): JSX.Element {
  const { uhid = '' } = useParams<{ uhid: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/frontdesk/station';

  /* ---------- Patient loaded from URL ---------- */
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /* ---------- UHID lookup (change patient) ---------- */
  const [lookupValue, setLookupValue] = useState<string>('');
  const [lookupSearching, setLookupSearching] = useState<boolean>(false);
  const [lookupResults, setLookupResults] = useState<PatientSummary[]>([]);
  const [lookupTouched, setLookupTouched] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  /* ---------- Toolbar booking state ---------- */
  const [hasSlot, setHasSlot] = useState<boolean>(false);
  const [isBooking, setIsBooking] = useState<boolean>(false);
  const formRef = useRef<NewBookingFormHandle>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPatient(uhid)
      .then((p) => {
        if (!alive) return;
        setPatient(p);
        setError(p ? null : 'Patient not found.');
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Lookup failed');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [uhid]);

  const onLookup = async (raw: string): Promise<void> => {
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
  };

  const back = (): void => navigate(returnTo);

  const handleBook = (): void => {
    setIsBooking(true);
    formRef.current?.triggerBooking();
  };

  const subtitle = patient
    ? `${patient.fullName} · ${patient.uhid} · ${patient.gender.toUpperCase()} · ${patient.ageYears}y · ${patient.mobile}`
    : undefined;

  const breadcrumbItems = [
    { label: 'OP coordination', to: '/frontdesk/station' },
    { label: patient ? `Book for ${patient.fullName}` : 'Book appointment' },
  ];

  return (
    <WorkspacePageLayout
      breadcrumbItems={breadcrumbItems}
      homeTo="/frontdesk/station"
      homeLabel="OP coordination"
      backTo={returnTo}
      title="Book appointment"
      subtitle={subtitle}
      uhidSearch={{
        value: lookupValue,
        onChange: setLookupValue,
        onSubmit: () => void onLookup(lookupValue),
      }}
      primaryAction={{
        label: 'Book appointment',
        loadingLabel: 'Booking...',
        loading: isBooking,
        disabled: !hasSlot || isBooking,
        onClick: handleBook,
      }}
      secondaryAction={{
        label: 'Cancel',
        disabled: isBooking,
        onClick: back,
      }}
    >
      {/* UHID lookup results */}
      {lookupTouched && !lookupSearching && (
        <>
          {lookupError && (
            <FormErrorContainer
              title="Lookup failed."
              description={lookupError}
              onRetry={() => void onLookup(lookupValue)}
            />
          )}
          {!lookupError && lookupResults.length === 0 && lookupValue.trim() && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                No patient matches <span className="font-mono">{lookupValue.trim()}</span>.
              </p>
            </div>
          )}
          {lookupResults.length > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between rounded-t-lg border-b border-hairline bg-muted/50 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {lookupResults.length} {lookupResults.length === 1 ? 'result' : 'results'}
                </span>
                <CloseButton
                  onClick={() => { setLookupResults([]); setLookupTouched(false); setLookupValue(''); }}
                  aria-label="Close results"
                />
              </div>
              <ul className="flex flex-col divide-y">
                {lookupResults.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{p.fullName}</span>
                        <span className="font-mono text-xs text-muted-foreground">{p.uhid}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.gender.toUpperCase()} · {p.ageYears}y · {p.mobile}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setPatient(p);
                        setHasSlot(false);
                        setIsBooking(false);
                        setLookupResults([]);
                        setLookupTouched(false);
                        setLookupValue('');
                      }}
                    >
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading patient...
        </div>
      ) : error || !patient ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {error ?? 'Patient not found.'}
          </p>
          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={back}>
              Back to station
            </Button>
          </div>
        </Card>
      ) : (
        <NewBookingForm
          ref={formRef}
          initialPatient={patient}
          onBooked={back}
          onClose={back}
          onSlotChange={(slot) => {
            setHasSlot(Boolean(slot));
            if (!slot) setIsBooking(false);
          }}
          hideBookButton
          onBookingError={() => setIsBooking(false)}
        />
      )}
    </WorkspacePageLayout>
  );
}
