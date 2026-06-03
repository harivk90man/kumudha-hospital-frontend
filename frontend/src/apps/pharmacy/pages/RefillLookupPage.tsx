import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, Search } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { searchPatientsByMobile, type PatientSummary } from '@/features/patient';
import { fetchPatientPrescriptionHistory, type RxQueueEntry } from '@/features/pharmacy';
import { PharmacyQueueTabs } from '../components/PharmacyQueueTabs';

/**
 * Refill lookup — a patient walks in with a phone number / UHID asking
 * for a re-fill of a prior prescription. Pharmacist finds them, opens
 * the most recent Rx, re-dispenses without involving the doctor.
 *
 * Lives under the PRESCRIPTION group in the sidebar (it’s a Rx flow,
 * not an OTC counter sale). Counter sale is its own page now —
 * isolating the two prevents the cart-vs-prescription mix-up that
 * happens when both modes share a screen.
 */
export function RefillLookupPage(): JSX.Element {
  const [lookup, setLookup] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [touched, setTouched] = useState<boolean>(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);

  const onLookup = async (raw: string): Promise<void> => {
    const value = raw.trim();
    setTouched(true);
    if (!value) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchPatientsByMobile(value));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Refill' }]}
        homeTo="/pharmacy/queue"
        homeLabel="Pharmacy"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Landing/home page — no back-link, so the slot carries a
              LiveIndicator band to keep the title + CTA row at the same
              y as every other page in the app. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live counter
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Refill (no doctor visit)
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Look up a patient by mobile or UHID and re-dispense from their
            most recent prescription — for repeat orders that don't need a
            fresh consultation.
          </p>
        </div>
      </header>

      {/* Unified filter row across the three pharmacist surfaces —
          label on the left; lookup form + PharmacyQueueTabs dropdown
          right-aligned together. Mirrors the doctor / nurse queue
          pattern. */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground">
          Lookup patient
        </span>
        <div className="flex flex-wrap items-end gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onLookup(lookup);
            }}
            className="flex items-end gap-2"
          >
            <label className="relative flex items-end">
              <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                placeholder="UHID (KH-…) or mobile (last 6 digits)"
                className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
              />
            </label>
            <Button type="submit" size="sm" disabled={searching || !lookup.trim()}>
              {searching ? <Spinner size="sm" /> : <Search />}
              Search
            </Button>
          </form>
          <PharmacyQueueTabs />
        </div>
      </div>

      {touched && !searching && results.length === 0 && lookup.trim() && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No patient matches <span className="font-mono">{lookup.trim()}</span>.
            For an unregistered customer, use the{' '}
            <span className="font-medium text-foreground">OTC counter sale</span> screen
            instead.
          </p>
        </Card>
      )}

      {!selectedPatient && results.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {results.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{p.fullName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{p.uhid}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.gender.toUpperCase()} · {p.ageYears}y · {p.mobile}
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => setSelectedPatient(p)}>
                <Pill /> Show prescription history
              </Button>
            </li>
          ))}
        </ul>
      )}

      {selectedPatient && (
        <PatientPrescriptionHistory
          patient={selectedPatient}
          onBack={() => setSelectedPatient(null)}
        />
      )}
    </div>
  );
}

interface PatientPrescriptionHistoryProps {
  patient: PatientSummary;
  onBack: () => void;
}

function PatientPrescriptionHistory({
  patient,
  onBack,
}: PatientPrescriptionHistoryProps): JSX.Element {
  const navigate = useNavigate();
  const [history, setHistory] = useState<RxQueueEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPatientPrescriptionHistory(patient.uhid, 10)
      .then((rows) => {
        if (alive) setHistory(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [patient.uhid]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{patient.fullName}</h3>
          <p className="text-xs text-muted-foreground">
            {patient.uhid} · {patient.gender.toUpperCase()} · {patient.ageYears}y · {patient.mobile}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back to search
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading prescription history...
        </div>
      ) : history.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No prescription history for this patient.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {history.map((rx) => (
            <li key={rx.id}>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>{rx.prescriptionNumber}</CardTitle>
                    <CardLabel>
                      {rx.doctorName} · {new Date(rx.prescribedAt).toLocaleString()}
                    </CardLabel>
                  </div>
                  <StatusPill
                    tone={
                      rx.status === 'rx_dispensed'
                        ? 'success'
                        : rx.status === 'rx_cancelled'
                          ? 'neutral'
                          : 'warning'
                    }
                    size="sm"
                  >
                    {rx.status.replace(/^rx_/, '').replace(/_/g, ' ')}
                  </StatusPill>
                </CardHeader>

                <ul className="flex flex-col gap-1 text-xs">
                  {rx.items.map((it) => (
                    <li key={it.id} className="flex items-baseline justify-between gap-2">
                      <span>
                        {it.medicineName} {it.strength}
                        <span className="text-muted-foreground">
                          {' '}
                          × {it.quantityPrescribed}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        stock {it.availableQty}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => navigate(`/pharmacy/queue/${rx.id}/dispense`)}
                  >
                    <Pill /> Dispense again
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
