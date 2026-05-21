import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, User } from 'lucide-react';
import { cn } from '@/utils/cn';
import { searchPatientsByMobile, type PatientSummary } from '@/features/patient';
import {
  fetchQueuePaged,
  searchCasesByDiagnosis,
  type CaseSummary,
  type EncounterStatusName,
} from '@/features/encounter';

type Mode = 'patient' | 'cases';

/** Encounter statuses considered "live" for the patient-mode jump-to-consultation
 *  shortcut. Matches the doctor queue tab's active-statuses allowlist. */
const ACTIVE_ENCOUNTER_STATUSES: EncounterStatusName[] = [
  'walk_in_arrived',
  'registered',
  'awaiting_vitals',
  'vitals_done',
  'awaiting_doctor',
  'in_consultation',
];

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 8;

const formatConsultedRelative = (iso: string): string => {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
};

/**
 * Doctor-app global search. Mounted in DoctorLayout above the page outlet
 * so it stays visible across dashboard, queue, AND the consultation page.
 *
 * Two modes:
 *  - **Patient** — UHID or mobile substring → single patient pick. On select,
 *    jumps to the patient's active encounter if one exists today, else
 *    falls back to the patient profile.
 *  - **Cases**   — diagnosis substring → list of completed encounters. On
 *    select, opens the consultation page for that opNumber.
 *
 * Keyboard shortcuts (`/`, Ctrl+K) still open the global CommandPalette
 * mounted in AppSidebar — this visible bar is for discoverability + the
 * Cases mode the palette doesn't support.
 */
export function DoctorTopSearch(): JSX.Element {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>('patient');
  const [query, setQuery] = useState<string>('');
  const [patientResults, setPatientResults] = useState<PatientSummary[]>([]);
  const [caseResults, setCaseResults] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);

  // Debounced fetch tied to (mode, query).
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setPatientResults([]);
      setCaseResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        if (mode === 'patient') {
          const rows = await searchPatientsByMobile(trimmed);
          setPatientResults(rows.slice(0, MAX_RESULTS));
        } else {
          const rows = await searchCasesByDiagnosis(trimmed, MAX_RESULTS);
          setCaseResults(rows);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [mode, query]);

  // Close dropdown when clicking outside.
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const closeAndReset = (): void => {
    setOpen(false);
    setQuery('');
    setPatientResults([]);
    setCaseResults([]);
  };

  /** Patient-mode select: route to active encounter today if any, else profile. */
  const onSelectPatient = async (p: PatientSummary): Promise<void> => {
    closeAndReset();
    const r = await fetchQueuePaged({
      q: p.uhid,
      statuses: ACTIVE_ENCOUNTER_STATUSES,
      page: 1,
      limit: 5,
    });
    const active = r.rows.find((row) => row.patient.uhid === p.uhid);
    if (active) {
      navigate(`/doctor/consultation/${active.opNumber}`);
    } else {
      navigate(`/patient/${p.uhid}`);
    }
  };

  const onSelectCase = (c: CaseSummary): void => {
    closeAndReset();
    navigate(`/doctor/consultation/${c.opNumber}`);
  };

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length > 0;
  const showEmpty =
    showDropdown &&
    !loading &&
    (mode === 'patient' ? patientResults.length === 0 : caseResults.length === 0);

  return (
    <div
      ref={containerRef}
      className="flex h-12 flex-shrink-0 items-end justify-end gap-3 border-b border-hairline bg-card px-4 pb-1 md:px-6"
    >
      {/* Mode toggle */}
      <div role="tablist" aria-label="Search mode" className="inline-flex rounded-md bg-muted p-0.5">
        {(['patient', 'cases'] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium capitalize transition',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m}
            </button>
          );
        })}
      </div>

      {/* Search field — bottom-border-only to match the other search inputs */}
      <div className="relative w-72">
        <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            mode === 'patient'
              ? 'Search by UHID or mobile…'
              : 'Search cases by diagnosis…'
          }
          aria-label={mode === 'patient' ? 'Search patients' : 'Search cases'}
          className="w-full rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-8 text-sm shadow-none focus:border-primary focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-0 bottom-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          /
        </kbd>

        {showDropdown && (
          <div
            role="listbox"
            className="absolute right-0 top-full z-40 mt-1 max-h-80 w-[26rem] overflow-y-auto rounded-md border border-hairline bg-card shadow-lg"
          >
            {loading && (
              <div className="px-3 py-2 text-xxs text-muted-foreground">Searching…</div>
            )}
            {showEmpty && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                {mode === 'patient'
                  ? 'No patient matches that UHID or mobile.'
                  : 'No completed cases match that diagnosis.'}
              </div>
            )}
            {!loading && mode === 'patient' && patientResults.length > 0 && (
              <ul>
                {patientResults.map((p) => (
                  <li key={p.uhid}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => void onSelectPatient(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                    >
                      <User className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.fullName}</span>
                        <span className="block truncate text-xxs text-muted-foreground">
                          <span className="font-mono tabular-nums">{p.uhid}</span>
                          {' · '}
                          {p.gender.toUpperCase()} · {p.ageYears}y · {p.mobile}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!loading && mode === 'cases' && caseResults.length > 0 && (
              <ul>
                {caseResults.map((c) => (
                  <li key={c.opNumber}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => onSelectCase(c)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                    >
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          <span className="font-medium">{c.primaryDiagnosis}</span>
                        </span>
                        <span className="block truncate text-xxs text-muted-foreground">
                          {c.patient.fullName}
                          {' · '}
                          <span className="font-mono tabular-nums">{c.patient.uhid}</span>
                          {' · '}
                          <span className="font-mono tabular-nums">{c.opNumber}</span>
                          {' · '}
                          {formatConsultedRelative(c.consultedAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
