import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Droplet,
  FlaskConical,
  HeartPulse,
  Home,
  Pencil,
  Phone,
  Pill,
  Scan,
  ShieldAlert,
  User,
  User2,
  Users,
} from 'lucide-react';
import { Breadcrumb, StatusPill } from '@/components/data-display';
import { CardLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { homeForRole, useAuth } from '@/features/auth';
import { fetchVisitHistory, type VisitHistoryItem } from '@/features/consultation';
import { ReportViewerDialog, type ReportViewerInput } from '@/features/consultation/components/ReportViewerDialog';
import { fetchPatient, findLinkedPatients } from './patientApi';
import { useRecentPatientsStore } from './recentsStore';
import type { LinkedPatient, PatientSummary } from './patientTypes';
import { cn } from '@/utils/cn';

export function PatientProfilePage(): JSX.Element {
  const { uhid = '' } = useParams<{ uhid: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const homePath = user ? homeForRole(user.role) : '/';
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [visits, setVisits] = useState<VisitHistoryItem[]>([]);
  const [linked, setLinked] = useState<LinkedPatient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fromUhid = searchParams.get('from') ?? '';
  const [fromPatient, setFromPatient] = useState<PatientSummary | null>(null);

  const pushRecent = useRecentPatientsStore((s) => s.push);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPatient(uhid)
      .then(async (p) => {
        if (!alive) return;
        setPatient(p);
        setError(p ? null : 'Patient not found.');
        if (p) {
          pushRecent({ uhid: p.uhid, fullName: p.fullName });
          const [vs, lks] = await Promise.all([
            fetchVisitHistory(p.uhid).catch(() => []),
            findLinkedPatients(p.uhid).catch(() => []),
          ]);
          if (!alive) return;
          setVisits(vs);
          setLinked(lks);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Lookup failed');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uhid]);

  useEffect(() => {
    if (!fromUhid) { setFromPatient(null); return; }
    let alive = true;
    fetchPatient(fromUhid).then((p) => { if (alive) setFromPatient(p); });
    return () => { alive = false; };
  }, [fromUhid]);

  const breadcrumbItems = useMemo(() => {
    const items: { label: string; to?: string }[] = [];
    if (fromUhid) items.push({ label: fromPatient?.fullName ?? fromUhid, to: `/patient/${fromUhid}` });
    items.push({ label: patient?.fullName ?? uhid });
    return items;
  }, [fromUhid, fromPatient, patient, uhid]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="px-4 pt-5 md:px-6 md:pt-6">
        <Breadcrumb items={breadcrumbItems} homeTo={homePath} homeLabel="Home" />
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-5 pt-4 md:px-6">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(homePath)}
            className="-ml-2 mb-1 h-7 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {patient?.fullName ?? 'Patient'}
          </h1>
          <p className="font-mono text-xxs text-muted-foreground tabular-nums">
            {uhid}
            {patient && (
              <span className="ml-1.5 font-sans tracking-normal">
                · {patient.gender.toUpperCase()} · {patient.ageYears}y · {patient.mobile}
              </span>
            )}
          </p>
        </div>
        {patient && (
          <Button asChild className="w-44 justify-center">
            <Link to={`/patient/${patient.uhid}/edit`}>
              <Pencil /> Edit patient
            </Link>
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto border-t border-hairline">
        <div className="px-4 py-5 md:px-6">
          {loading ? null : error || !patient ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {error ?? 'Patient not found.'}
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              {/* Left column */}
              <div className="flex flex-col gap-6">
                <IdentitySection patient={patient} />
                <VisitHistorySection visits={visits} patient={patient} />
              </div>

              {/* Right column — left-accent sections, flush with Identity heading */}
              <div className="flex flex-col gap-5 self-start">
                <SidebarCard
                  icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
                  title="Allergies"
                  count={(patient.allergies?.length ?? 0)}
                  accentClass="border-l-red-300"
                >
                  {(patient.allergies?.length ?? 0) > 0 ? (
                    <AllergyPills items={patient.allergies?.map((a) => a.allergen) ?? []} />
                  ) : (
                    <p className="text-xs text-muted-foreground">No known allergies.</p>
                  )}
                </SidebarCard>

                <SidebarCard
                  icon={<HeartPulse className="h-4 w-4 text-amber-500" />}
                  title="Chronic conditions"
                  count={(patient.chronicConditions?.length ?? 0)}
                  accentClass="border-l-amber-300"
                >
                  {(patient.chronicConditions?.length ?? 0) > 0 ? (
                    <ChronicPills items={patient.chronicConditions ?? []} />
                  ) : (
                    <p className="text-xs text-muted-foreground">None recorded.</p>
                  )}
                </SidebarCard>

                <SidebarCard
                  icon={<Users className="h-4 w-4 text-muted-foreground" />}
                  title="Linked family"
                  count={linked.length}
                  accentClass="border-l-gray-300"
                >
                  {linked.length > 0 ? (
                    <FamilyList linked={linked} fromUhid={patient.uhid} />
                  ) : (
                    <p className="text-xs text-muted-foreground">No linked family.</p>
                  )}
                </SidebarCard>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Identity ---------- */

function IdentitySection({ patient }: { patient: PatientSummary }): JSX.Element {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 border-b border-hairline pb-2">
        <User2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-foreground">Identity</span>
      </div>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-xxs uppercase tracking-wider text-muted-foreground">Mobile</dt>
        <dd className="inline-flex items-center gap-1.5 text-foreground tabular-nums">
          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
          {patient.mobile}
        </dd>

        {patient.dateOfBirth && (
          <>
            <dt className="text-xxs uppercase tracking-wider text-muted-foreground">Date of birth</dt>
            <dd className="text-foreground tabular-nums">
              {new Date(patient.dateOfBirth).toLocaleDateString()}
            </dd>
          </>
        )}

        {patient.bloodGroup && (
          <>
            <dt className="text-xxs uppercase tracking-wider text-muted-foreground">Blood group</dt>
            <dd className="inline-flex items-center gap-1.5 font-mono text-foreground">
              <Droplet className="h-3.5 w-3.5 text-muted-foreground" />
              {patient.bloodGroup}
            </dd>
          </>
        )}

        <dt className="text-xxs uppercase tracking-wider text-muted-foreground">Address</dt>
        <dd className="text-foreground">
          {(() => {
            const a = patient.address;
            if (!a) return <span className="text-muted-foreground">—</span>;
            const parts = [a.line1, a.line2, a.city, a.state, a.pincode].filter(
              (s): s is string => Boolean(s && s.trim()),
            );
            return parts.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="inline-flex items-start gap-1.5">
                <Home className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>{parts.join(', ')}</span>
              </span>
            );
          })()}
        </dd>
      </dl>
    </div>
  );
}

/* ---------- Visit history ---------- */

const VISIT_PAGE_SIZE = 5;

function VisitHistorySection({
  visits,
  patient,
}: {
  visits: VisitHistoryItem[];
  patient: PatientSummary;
}): JSX.Element {
  const [page, setPage] = useState<number>(1);
  const [viewingReport, setViewingReport] = useState<ReportViewerInput>(null);
  const lastPage = Math.max(1, Math.ceil(visits.length / VISIT_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * VISIT_PAGE_SIZE;
  const visible = visits.slice(start, start + VISIT_PAGE_SIZE);
  const hasVisits = visits.length > 0;

  return (
    <div>
      <div className="mb-0 flex items-center justify-between gap-2 border-b border-hairline pb-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Visit history
        </span>
        {hasVisits ? (
          <CardLabel>{visits.length}</CardLabel>
        ) : (
          <span className="text-xxs text-muted-foreground">No previous OP visits.</span>
        )}
      </div>
      {hasVisits && (
        <ul className="flex flex-col divide-y divide-hairline">
          {visible.map((v) => (
            <VisitRow
              key={v.opNumber}
              visit={v}
              patient={patient}
              onOpenReport={setViewingReport}
            />
          ))}
        </ul>
      )}
      <ReportViewerDialog value={viewingReport} onClose={() => setViewingReport(null)} />
      {hasVisits && (
        <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2 text-xxs text-muted-foreground">
          <span className="tabular-nums">
            {start + 1}–{Math.min(start + visible.length, visits.length)} of {visits.length}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className={cn('rounded p-1 transition', safePage <= 1 ? 'cursor-not-allowed opacity-40' : 'hover:bg-muted hover:text-foreground')}
              aria-label="Previous page"
            >
              <ChevronRight className="h-3.5 w-3.5 -rotate-180" />
            </button>
            <span className="px-1 tabular-nums text-foreground">{safePage} / {lastPage}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={safePage >= lastPage}
              className={cn('rounded p-1 transition', safePage >= lastPage ? 'cursor-not-allowed opacity-40' : 'hover:bg-muted hover:text-foreground')}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VisitRow({
  visit: v,
  patient,
  onOpenReport,
}: {
  visit: VisitHistoryItem;
  patient: PatientSummary;
  onOpenReport: (input: ReportViewerInput) => void;
}): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const dateLabel = new Date(v.visitDate).toLocaleDateString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const hasReports = (v.labOrders?.length ?? 0) + (v.radiologyOrders?.length ?? 0) > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className={cn(
          'flex w-full flex-wrap items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/30',
          open && 'bg-muted/20',
        )}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <span className="w-[6.5rem] text-[13px] font-medium tabular-nums text-foreground">{dateLabel}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{v.chiefComplaint}</span>
        <span className="hidden text-xxs text-muted-foreground sm:inline">{v.doctorName}</span>
        <span className="hidden font-mono text-xxs text-muted-foreground tabular-nums lg:inline">{v.opNumber}</span>
        <span className="inline-flex items-center gap-1.5 text-xxs text-muted-foreground">
          {v.prescriptionCount > 0 && <span title={`${v.prescriptionCount} Rx`}><Pill className="h-3.5 w-3.5" /></span>}
          {v.hasLabReports && <span title="Lab reports"><FlaskConical className="h-3.5 w-3.5" /></span>}
          {v.hasRadiologyReports && <span title="Imaging"><Scan className="h-3.5 w-3.5" /></span>}
        </span>
      </button>
      {open && (
        <div className="grid gap-1 border-t border-hairline bg-muted/10 py-2.5 text-[13px]">
          <div className="grid grid-cols-[7rem_1fr] gap-x-3">
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">Doctor</span>
            <span className="text-foreground">
              {v.doctorName}
              <span className="ml-1.5 text-xxs text-muted-foreground">· {v.department}</span>
            </span>
          </div>
          {v.primaryDiagnosis && (
            <div className="grid grid-cols-[7rem_1fr] gap-x-3">
              <span className="text-xxs uppercase tracking-wider text-muted-foreground">Diagnosis</span>
              <span className="text-foreground">{v.primaryDiagnosis}</span>
            </div>
          )}
          <div className="grid grid-cols-[7rem_1fr] gap-x-3">
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">OP number</span>
            <span className="font-mono text-foreground tabular-nums">{v.opNumber}</span>
          </div>

          {hasReports && (
            <div className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3">
              <span className="text-xxs uppercase tracking-wider text-muted-foreground">Reports</span>
              <ul className="flex flex-col gap-1">
                {v.labOrders?.map((o) => (
                  <li key={`lab-${o.id}`} className="flex items-center gap-2">
                    <FlaskConical className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{o.testName}</span>
                    <button
                      type="button"
                      onClick={() => onOpenReport({ kind: 'lab', order: o, patient })}
                      className="text-xxs font-medium text-primary hover:underline"
                    >
                      View
                    </button>
                  </li>
                ))}
                {v.radiologyOrders?.map((o) => (
                  <li key={`rad-${o.id}`} className="flex items-center gap-2">
                    <Scan className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{o.testName}</span>
                    <button
                      type="button"
                      onClick={() => onOpenReport({ kind: 'radiology', order: o, patient })}
                      className="text-xxs font-medium text-primary hover:underline"
                    >
                      View
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ---------- Clinical sidebar cards ---------- */

function SidebarCard({
  icon, title, count, children, accentClass = 'border-l-gray-200',
}: {
  icon: JSX.Element;
  title: string;
  count: number;
  children: React.ReactNode;
  accentClass?: string;
}): JSX.Element {
  return (
    <section className={cn('border-l-2 pl-3', accentClass)}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {title}
          {count > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">({count})</span>
          )}
        </span>
      </div>
      {children}
    </section>
  );
}

function AllergyPills({ items }: { items: string[] }): JSX.Element {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item}>
          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ChronicPills({ items }: { items: string[] }): JSX.Element {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item}>
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FamilyList({ linked, fromUhid }: { linked: LinkedPatient[]; fromUhid: string }): JSX.Element {
  return (
    <ul className="-mx-1 flex flex-col gap-0.5">
      {linked.map((l) => (
        <li key={l.patient.uhid}>
          <Link
            to={`/patient/${l.patient.uhid}?from=${fromUhid}`}
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-foreground">
                {l.patient.fullName}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {l.patient.uhid}
              </div>
            </div>
            <StatusPill tone="neutral" size="sm">
              {l.relationshipSpecific ?? l.relationship}
            </StatusPill>
          </Link>
        </li>
      ))}
    </ul>
  );
}
