import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  Gauge,
  Heart,
  History,
  Lock,
  MessageSquare,
  Pencil,
  Phone,
  Pill,
  Scale,
  ShieldAlert,
  Stethoscope,
  Thermometer,
  User2,
  Wind,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormErrorContainer } from '@/components/form';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import { completeConsultation } from '@/features/encounter';
import { useAuth } from '@/features/auth';
import { needsAck } from '@/features/lab';
import { LinkedPatientsButton } from '@/features/patient';
import {
  AmendWithReasonSheet,
  ConsultationActions,
  ConsultationNotesForm,
  CriticalResultBanner,
  DiagnosisForm,
  FollowUpAdvicePanel,
  OrdersPanel,
  PrescriptionBuilder,
  VisitHistoryPanel,
  VitalsEditSheet,
  fetchVisitHistory,
  useConsultationContext,
  type Diagnosis,
  type NextAction,
  type PrescriptionItem,
  type VisitHistoryItem,
  type Vitals,
} from '@/features/consultation';
import { Breadcrumb, type BreadcrumbItem } from '@/components/data-display';

// ── Section registry ───────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'sec-notes',        label: 'Notes',                   icon: ClipboardList },
  { id: 'sec-diagnosis',    label: 'Diagnosis / Impression',  icon: Stethoscope   },
  { id: 'sec-orders',       label: 'Labs & Tests', icon: FlaskConical  },
  { id: 'sec-prescription', label: 'Prescription',            icon: Pill          },
  { id: 'sec-advice',       label: 'Advice Given',            icon: MessageSquare },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatLockedAt = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const formatSavedAt = (iso: string): string => {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 5)  return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.round(diffMin / 60)}h ago`;
};

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// ── VitalChip ──────────────────────────────────────────────────────────────────

type AlertLevel = 'warning' | 'danger';

interface VitalChipProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  alert?: AlertLevel;
}

function VitalChip({ icon, label, value, unit, alert }: VitalChipProps): JSX.Element {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg border px-3 py-1.5',
      alert === 'danger'  ? 'border-danger/30  bg-danger/5'  :
      alert === 'warning' ? 'border-warning/30 bg-warning/5' :
      'border-hairline bg-muted/40',
    )}>
      <span className={cn(
        'flex-shrink-0',
        alert === 'danger'  ? 'text-danger'  :
        alert === 'warning' ? 'text-warning' :
        'text-muted-foreground',
      )}>
        {icon}
      </span>
      <div>
        <div className="text-[10px] leading-none text-muted-foreground/70 mb-0.5">{label}</div>
        <div className="flex items-baseline gap-0.5">
          <span className={cn(
            'text-sm font-bold leading-none tabular-nums',
            alert === 'danger'  ? 'text-danger'  :
            alert === 'warning' ? 'text-warning' :
            'text-foreground',
          )}>
            {value}
          </span>
          <span className={cn(
            'text-[10px] leading-none',
            alert === 'danger'  ? 'text-danger/70'  :
            alert === 'warning' ? 'text-warning/70' :
            'text-muted-foreground',
          )}>
            {unit}
          </span>
          {alert && (
            <AlertTriangle className={cn(
              'ml-0.5 h-3 w-3',
              alert === 'danger' ? 'text-danger' : 'text-warning',
            )} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── VitalsRow ──────────────────────────────────────────────────────────────────

function VitalsRow({ vitals, onEdit }: { vitals: Vitals; onEdit?: () => void }): JSX.Element {
  const tempAlert: AlertLevel | undefined =
    vitals.temperatureF == null ? undefined :
    vitals.temperatureF > 103   ? 'danger'  :
    vitals.temperatureF > 99.5  ? 'warning' :
    vitals.temperatureF < 96    ? 'danger'  :
    vitals.temperatureF < 97.5  ? 'warning' : undefined;

  // High: hypertension stage 2+; Low: hypotension
  const bpAlert: AlertLevel | undefined =
    vitals.bpSystolic != null && vitals.bpSystolic > 160 ? 'danger'  :
    vitals.bpSystolic != null && vitals.bpSystolic > 140 ? 'warning' :
    vitals.bpSystolic != null && vitals.bpSystolic < 90  ? 'danger'  :
    vitals.bpSystolic != null && vitals.bpSystolic < 100 ? 'warning' : undefined;

  // High: tachycardia; Low: bradycardia
  const pulseAlert: AlertLevel | undefined =
    vitals.pulseRate != null && vitals.pulseRate > 120 ? 'danger'  :
    vitals.pulseRate != null && vitals.pulseRate > 100 ? 'warning' :
    vitals.pulseRate != null && vitals.pulseRate < 50  ? 'danger'  :
    vitals.pulseRate != null && vitals.pulseRate < 60  ? 'warning' : undefined;

  const spo2Alert: AlertLevel | undefined =
    vitals.spo2 != null && vitals.spo2 < 90 ? 'danger'  :
    vitals.spo2 != null && vitals.spo2 < 94 ? 'warning' : undefined;

  // Normal RR: 12–20/min; bradypnea or tachypnea
  const rrAlert: AlertLevel | undefined =
    vitals.respiratoryRate != null && (vitals.respiratoryRate < 8  || vitals.respiratoryRate > 30) ? 'danger'  :
    vitals.respiratoryRate != null && (vitals.respiratoryRate < 12 || vitals.respiratoryRate > 20) ? 'warning' : undefined;

  // Pain: 0–3 mild, 4–6 moderate, 7–10 severe
  const painAlert: AlertLevel | undefined =
    vitals.painScore != null && vitals.painScore >= 7 ? 'danger'  :
    vitals.painScore != null && vitals.painScore >= 4 ? 'warning' : undefined;

  // BMI: <18.5 underweight, <16 severely; >30 obese, >40 severe
  const bmiAlert: AlertLevel | undefined =
    vitals.bmi != null && (vitals.bmi < 16   || vitals.bmi > 40) ? 'danger'  :
    vitals.bmi != null && (vitals.bmi < 18.5 || vitals.bmi > 30) ? 'warning' : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {vitals.bpSystolic != null && (
        <VitalChip icon={<Activity className="h-3.5 w-3.5" />}    label="Blood Pressure" value={`${vitals.bpSystolic}/${vitals.bpDiastolic ?? '–'}`} unit="mmHg" alert={bpAlert} />
      )}
      {vitals.pulseRate != null && (
        <VitalChip icon={<Heart className="h-3.5 w-3.5" />}       label="Pulse"          value={String(vitals.pulseRate)}              unit="bpm"  alert={pulseAlert} />
      )}
      {vitals.temperatureF != null && (
        <VitalChip icon={<Thermometer className="h-3.5 w-3.5" />} label="Temperature"    value={vitals.temperatureF.toFixed(1)}        unit="°F"   alert={tempAlert} />
      )}
      {vitals.spo2 != null && (
        <VitalChip icon={<Wind className="h-3.5 w-3.5" />}        label="SpO₂"           value={String(vitals.spo2)}                   unit="%"    alert={spo2Alert} />
      )}
      {vitals.respiratoryRate != null && (
        <VitalChip icon={<Activity className="h-3.5 w-3.5" />}    label="Resp. Rate"     value={String(vitals.respiratoryRate)}        unit="/min" alert={rrAlert} />
      )}
      {vitals.bmi != null && (
        <VitalChip icon={<Scale className="h-3.5 w-3.5" />}       label="BMI"            value={vitals.bmi.toFixed(1)}                 unit="kg/m²" alert={bmiAlert} />
      )}
      {vitals.painScore != null && (
        <VitalChip icon={<Gauge className="h-3.5 w-3.5" />}       label="Pain"           value={`${vitals.painScore}/10`}             unit=""     alert={painAlert} />
      )}
      <div className="ml-auto flex items-center gap-2">
        {vitals.recordedAt && (
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            Vitals taken: {formatTime(vitals.recordedAt)}
          </span>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title="Edit vitals"
            aria-label="Edit vitals"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── SectionCard ────────────────────────────────────────────────────────────────

interface SectionCardProps {
  id: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

function SectionCard({ id, icon: Icon, title, children, isOpen, onToggle, className }: SectionCardProps): JSX.Element {
  return (
    <section id={id} className={className}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 px-8 py-5 text-left transition-colors',
          isOpen ? 'bg-card hover:bg-muted/40' : 'bg-muted/50 hover:bg-muted/70',
        )}
      >
        <div className={cn(
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors duration-200',
          isOpen ? 'bg-primary/10' : 'bg-muted',
        )}>
          <Icon className={cn('h-[17px] w-[17px] transition-colors duration-200', isOpen ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <h3 className={cn(
          'flex-1 text-[13px] tracking-tight transition-colors duration-200',
          isOpen ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
        )}>
          {title}
        </h3>
        <ChevronDown className={cn(
          'h-4 w-4 transition-transform duration-200',
          isOpen ? 'rotate-180 text-primary' : 'text-muted-foreground',
        )} />
      </button>

      {isOpen && (
        <div className="px-8 pb-7 pt-1">
          {children}
        </div>
      )}
    </section>
  );
}

// ── ConsultationSidebar ────────────────────────────────────────────────────────

interface SidebarProps {
  activeSection: SectionId;
  onNavigate: (id: SectionId) => void;
  onHistory: () => void;
  showingHistory: boolean;
  showHistoryButton: boolean;
}

function ConsultationSidebar({
  activeSection, onNavigate, onHistory, showingHistory, showHistoryButton,
}: SidebarProps): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-card">
      {/* Brand accent strip */}
      <div className="h-0.5 bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />

      <nav className="p-2">
        <ul className="flex flex-col gap-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = !showingHistory && activeSection === id;
            return (
              <li key={id} className={active ? 'mx-2' : ''}>
                <button
                  type="button"
                  onClick={() => onNavigate(id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-150',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="leading-snug">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {showHistoryButton && (
          <>
            <div className="my-2 border-t border-hairline" />
            <button
              type="button"
              onClick={onHistory}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                showingHistory
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <History className="h-4 w-4 flex-shrink-0" />
              Patient History
            </button>
          </>
        )}
      </nav>
    </div>
  );
}

// ── ConsultationPage ───────────────────────────────────────────────────────────

export function ConsultationPage(): JSX.Element {
  const { opNumber = '' } = useParams<{ opNumber: string }>();
  const navigate = useNavigate();
  const searchParams = useSearchParams()[0];
  const fromOp     = searchParams.get('from');
  const sectionParam = searchParams.get('section') as SectionId | null;

  const { user } = useAuth();
  const doctor = user?.role === 'doctor' ? user : null;

  const {
    data, loading, error, isLocked,
    patch, updateVitals, lock, amend, pendingDraft, draftSavedAt, restoreDraft, dismissDraft,
  } = useConsultationContext(opNumber);

  const [amendOpen,       setAmendOpen]       = useState(false);
  const [vitalsEditOpen,  setVitalsEditOpen]  = useState(false);
  const [visits,        setVisits]        = useState<VisitHistoryItem[]>([]);
  const [busy,          setBusy]          = useState(false);
  const [criticalOpen,  setCriticalOpen]  = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('sec-notes');
  const [openSections,  setOpenSections]  = useState<Set<SectionId>>(new Set(['sec-notes' as SectionId]));


  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const viewOnly = isLocked;
  const pastVisitDate = data?.lockedAt ?? null;
  const isLatestOp = visits.length === 0 || visits[0].opNumber === opNumber;

  useEffect(() => {
    if (data) void fetchVisitHistory(data.patient.uhid).then(setVisits);
  }, [data]);

  // Reset view state when navigating between consultations (same component instance).
  const didInitialScroll = useRef(false);
  const autoOpenedRef = useRef<Set<SectionId>>(new Set());
  useEffect(() => {
    setShowHistory(false);
    setOpenSections(new Set(['sec-notes' as SectionId]));
    didInitialScroll.current = false;
    autoOpenedRef.current = new Set();
  }, [opNumber]);
  useEffect(() => {
    if (!data || !sectionParam || didInitialScroll.current) return;
    if (!SECTIONS.some((s) => s.id === sectionParam)) return;
    didInitialScroll.current = true;
    // 400 ms: sections open animation (200 ms) + layout settle
    setTimeout(() => scrollToSection(sectionParam), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Auto-open sections that already have content (progressive fill).
  // `autoOpenedRef` ensures each section is auto-opened at most once — so a
  // user collapse sticks across subsequent autosaves / data updates.
  useEffect(() => {
    if (!data) return;
    const tryAutoOpen = (id: SectionId, condition: boolean): void => {
      if (!condition || autoOpenedRef.current.has(id)) return;
      autoOpenedRef.current.add(id);
      setOpenSections((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
    };
    tryAutoOpen('sec-diagnosis',    data.diagnoses.length > 0);
    tryAutoOpen('sec-orders',       data.labOrders.length > 0 || data.radiologyOrders.length > 0);
    tryAutoOpen('sec-prescription', data.prescriptionItems.length > 0);
    tryAutoOpen('sec-advice',       !!data.followUp || (data.recommendationsNotes ?? '').trim().length > 0);
    // Past encounters: open everything so the doctor can read the full record.
    if (isLocked) SECTIONS.forEach((s) => tryAutoOpen(s.id, true));
  }, [data, isLocked]);

  // Track showHistory in a ref so the scroll callback doesn't go stale.
  const showHistoryRef = useRef(showHistory);
  useEffect(() => { showHistoryRef.current = showHistory; }, [showHistory]);

  const toggleSection = useCallback((id: SectionId): void => {
    setActiveSection(id);
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const scrollToSection = useCallback((id: SectionId) => {
    setShowHistory(false);
    setActiveSection(id);
    setOpenSections((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
    const delay = showHistoryRef.current ? 120 : 0;
    setTimeout(() => {
      // Double rAF: first frame lets React flush the DOM update,
      // second frame ensures the browser has fully reflowed the layout
      // before smooth scroll starts — avoids sticky breaking mid-animation.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(id);
          if (!el) return;
          (el as HTMLElement).style.scrollMarginTop = '12px';
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }, delay);
  }, []);

  // ── Breadcrumb ───────────────────────────────────────────────────────────────

  const breadcrumb = useMemo<BreadcrumbItem[]>(() => {
    const base = { label: 'Consultation', to: '/doctor/queue' };
    if (fromOp) {
      // Navigated via Patient History panel — show date as last crumb
      const dateLabel = pastVisitDate
        ? new Date(pastVisitDate).toLocaleDateString(undefined, {
            day: '2-digit', month: 'short', year: 'numeric',
          })
        : opNumber;
      return [base, { label: 'Patient History', to: `/doctor/consultation/${fromOp}` }, { label: dateLabel, to: '' }];
    }
    if (!isLatestOp) {
      // Done tab — this OP is not the latest; show OP number as last crumb
      return [base, { label: 'Patient History', to: `/doctor/consultation/${visits[0].opNumber}` }, { label: opNumber, to: '' }];
    }
    if (showHistory) {
      return [base, { label: 'Patient History', to: '' }];
    }
    return [base, { label: opNumber, to: '' }];
  }, [opNumber, fromOp, pastVisitDate, isLatestOp, visits, showHistory]);

  // ── Loading / error ──────────────────────────────────────────────────────────

  if (loading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        {error ? (
          <FormErrorContainer
            title="Couldn't load the consultation."
            description={error}
            onRetry={() => window.location.reload()}
            className="max-w-md"
          />
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" label="Loading consultation" /> Loading consultation…
          </span>
        )}
      </div>
    );
  }

  const unackCriticalCount = data.criticalNotifications.filter(needsAck).length;
  if (criticalOpen && unackCriticalCount === 0) setCriticalOpen(false);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const addDiagnosis = async (v: {
    icd10?: string; description: string; type: Diagnosis['type'];
  }): Promise<void> => {
    const next: Diagnosis = {
      id: `dx-${Date.now()}`, icd10: v.icd10 || undefined,
      description: v.description, type: v.type,
    };
    const diagnoses = v.type === 'primary'
      ? [...data.diagnoses.map((d) => d.type === 'primary' ? { ...d, type: 'secondary' as const } : d), next]
      : [...data.diagnoses, next];
    await patch({ diagnoses });
  };

  const updateDiagnosis         = async (updated: Diagnosis): Promise<void> =>
    patch({ diagnoses: data.diagnoses.map((d) => d.id === updated.id ? updated : d) });
  const removeDiagnosis        = async (id: string): Promise<void> =>
    patch({ diagnoses: data.diagnoses.filter((d) => d.id !== id) });
  const handlePrescriptionChange = (items: PrescriptionItem[]): void => {
    void patch({ prescriptionItems: items });
  };

  const onComplete = async (): Promise<void> => {
    setBusy(true);
    try { await completeConsultation(opNumber); await lock(); navigate('/doctor/queue'); }
    finally { setBusy(false); }
  };

  const onCompleteWithDisposition = async (disposition: NextAction): Promise<void> => {
    setBusy(true);
    try {
      await patch({ nextAction: disposition });
      await completeConsultation(opNumber);
      await lock();
      navigate('/doctor/queue');
    } finally { setBusy(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* ── Sticky patient header ─────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-hairline bg-card/95 backdrop-blur">

        {/* Past visit banner */}
        {pastVisitDate && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 md:px-6">
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <History className="h-4 w-4" />
              Past visit · {new Date(pastVisitDate).toLocaleDateString(undefined, {
                weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
              })}
            </span>
            {fromOp ? (
              <Button size="sm" variant="outline"
                className="border-amber-500/40 text-amber-900 hover:bg-amber-500/10 dark:text-amber-200"
                onClick={() => navigate(`/doctor/consultation/${fromOp}`)}>
                <ArrowLeft className="h-3.5 w-3.5" /> Return to current visit
              </Button>
            ) : !isLatestOp ? (
              <Button size="sm" variant="outline"
                className="border-amber-500/40 text-amber-900 hover:bg-amber-500/10 dark:text-amber-200"
                onClick={() => navigate(`/doctor/consultation/${visits[0].opNumber}`)}>
                <ArrowLeft className="h-3.5 w-3.5" /> Return to latest OP
              </Button>
            ) : null}
          </div>
        )}

        {/* Patient identity row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold leading-tight text-foreground">
                  {data.patient.fullName}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {data.patient.gender.toUpperCase()} · {data.patient.ageYears}y
                </span>
                {data.patient.bloodGroup && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                    {data.patient.bloodGroup}
                  </span>
                )}
                {(data.patient.allergies?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger">
                    <ShieldAlert className="h-3 w-3" /> Allergies
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0 text-xs text-muted-foreground">
                <span className="font-mono">{data.patient.uhid}</span>
                <span>·</span>
                <span>OP {opNumber}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {data.patient.mobile}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            {draftSavedAt && !viewOnly && (
              <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-success">
                <Check className="h-3 w-3" /> Saved {formatSavedAt(draftSavedAt)}
              </span>
            )}

            <LinkedPatientsButton
              uhid={data.patient.uhid}
              onSelect={(lp) => navigate(`/patient/${lp.patient.uhid}`)}
            />

            {!viewOnly && unackCriticalCount > 0 && (
              <button
                type="button"
                onClick={() => setCriticalOpen((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  criticalOpen
                    ? 'border-danger bg-danger text-white'
                    : 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {unackCriticalCount} critical
              </button>
            )}

            {!viewOnly ? (
              <ConsultationActions
                status={data.status}
                onComplete={onComplete}
                onCompleteWithDisposition={onCompleteWithDisposition}
                busy={busy}
                lockedAt={data.lockedAt ?? null}
                amendUnlocked={Boolean(data.lockedAt) && !isLocked}
                onAmend={() => setAmendOpen(true)}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  {data.lockedAt ? formatLockedAt(data.lockedAt) : 'Read-only'}
                </span>
                <Button size="sm" variant="outline" onClick={() => setAmendOpen(true)}>
                  <ShieldAlert className="h-3.5 w-3.5" /> Amend
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Vitals chips */}
        {data.latestVitals && (
          <div className="border-t border-hairline bg-primary/[0.03] px-4 py-2 md:px-6">
            <VitalsRow
              vitals={data.latestVitals}
              onEdit={viewOnly ? undefined : () => setVitalsEditOpen(true)}
            />
          </div>
        )}

        {/* Critical result expansion */}
        {criticalOpen && !viewOnly && doctor && (
          <div className="border-t border-hairline px-4 py-3 md:px-6">
            <CriticalResultBanner
              notifications={data.criticalNotifications}
              doctorId={doctor.id}
              initialExpanded
              onAcknowledged={(notificationId, ackedAt, ackedBy) =>
                void patch({
                  criticalNotifications: data.criticalNotifications.map((n) =>
                    n.id === notificationId ? { ...n, ackedAt, ackedBy } : n,
                  ),
                })
              }
            />
          </div>
        )}
      </header>

      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2.5 md:px-6">
        <Breadcrumb items={breadcrumb} homeTo="/doctor/dashboard" homeLabel="Doctor home" />
      </div>

      {/* ── Draft restore banner ──────────────────────────────────────────── */}
      {!viewOnly && pendingDraft && (
        <div className="flex-shrink-0 mx-4 mb-3 md:mx-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/40 bg-info/5 px-4 py-2.5 text-sm text-info">
            <span>
              Unsaved draft from{' '}
              <strong>
                {new Date(pendingDraft.lastSavedAt).toLocaleString(undefined, {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </strong>
              {' '}· {pendingDraft.autosaveCount} autosave(s)
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void dismissDraft()}>Discard</Button>
              <Button size="sm" onClick={() => void restoreDraft()}>Restore</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main workspace ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 pb-4 md:px-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">

          {/* Section navigator — sticky within grid area */}
          <aside
            className="hidden lg:block"
            style={{ position: 'sticky', top: 8 }}
          >
            <ConsultationSidebar
              activeSection={activeSection}
              onNavigate={scrollToSection}
              onHistory={() => setShowHistory((v) => !v)}
              showingHistory={showHistory}
              showHistoryButton={!showHistory}
            />
          </aside>

          {/* Consultation document */}
          <div className="min-w-0">

            {showHistory ? (
              <div className="rounded-xl border border-hairline bg-card p-6">
                <VisitHistoryPanel
                  visits={visits}
                  onSelect={(op) => {
                    const carryFrom = fromOp ?? opNumber;
                    const params = new URLSearchParams();
                    if (carryFrom) params.set('from', carryFrom);
                    params.set('section', 'sec-notes');
                    // Close the history panel so the new visit's
                    // consultation content actually renders. Without
                    // this the URL changes but the user keeps seeing
                    // the same history list, making it feel like the
                    // page reopened the latest visit.
                    setShowHistory(false);
                    navigate(`/doctor/consultation/${op}?${params.toString()}`);
                  }}
                  selectedOpNumber={null}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-hairline bg-card shadow-sm overflow-hidden">
                <fieldset
                  disabled={viewOnly}
                  className={cn(
                    'border-0 p-0 transition-opacity',
                    viewOnly && 'pointer-events-none opacity-60',
                  )}
                >
                  <SectionCard id="sec-notes" icon={ClipboardList} title="Notes"
                    isOpen={openSections.has('sec-notes')} onToggle={() => toggleSection('sec-notes')}>
                    <ConsultationNotesForm
                      initial={data.notes}
                      onSubmit={async (notes) => { await patch({ notes }); }}
                    />
                  </SectionCard>

                  <div className="border-t border-hairline" />
                  <SectionCard id="sec-diagnosis" icon={Stethoscope} title="Diagnosis / Impression"
                    isOpen={openSections.has('sec-diagnosis')} onToggle={() => toggleSection('sec-diagnosis')}>
                    <DiagnosisForm
                      diagnoses={data.diagnoses}
                      onAdd={addDiagnosis}
                      onUpdate={updateDiagnosis}
                      onRemove={removeDiagnosis}
                    />
                  </SectionCard>

                  <div className="border-t border-hairline" />
                  <SectionCard id="sec-orders" icon={FlaskConical} title="Labs & Tests"
                    isOpen={openSections.has('sec-orders')} onToggle={() => toggleSection('sec-orders')}>
                    <OrdersPanel
                      opNumber={opNumber}
                      patient={data.patient}
                      labOrders={data.labOrders}
                      radiologyOrders={data.radiologyOrders}
                      onPlacedLab={(orders) => void patch({ labOrders: [...data.labOrders, ...orders] })}
                      onPlacedRadiology={(orders) => void patch({ radiologyOrders: [...data.radiologyOrders, ...orders] })}
                      onUpdateLab={(o) => void patch({ labOrders: data.labOrders.map((x) => x.id === o.id ? o : x) })}
                      onUpdateRadiology={(o) => void patch({ radiologyOrders: data.radiologyOrders.map((x) => x.id === o.id ? o : x) })}
                      onRemoveLab={(id) => void patch({ labOrders: data.labOrders.filter((x) => x.id !== id) })}
                      onRemoveRadiology={(id) => void patch({ radiologyOrders: data.radiologyOrders.filter((x) => x.id !== id) })}
                    />
                  </SectionCard>

                  <div className="border-t border-hairline" />
                  <SectionCard id="sec-prescription" icon={Pill} title="Prescription"
                    isOpen={openSections.has('sec-prescription')} onToggle={() => toggleSection('sec-prescription')}>
                    <PrescriptionBuilder
                      initialItems={data.prescriptionItems}
                      allergies={data.patient.allergies ?? []}
                      onPrescriptionChange={handlePrescriptionChange}
                    />
                  </SectionCard>

                  <div className="border-t border-hairline" />
                  <SectionCard id="sec-advice" icon={MessageSquare} title="Advice Given"
                    isOpen={openSections.has('sec-advice')} onToggle={() => toggleSection('sec-advice')}>
                    <div className="flex flex-col gap-10">
                      <div>
                        <div className="mb-4 flex items-center gap-2.5">
                          <div className="h-3.5 w-0.5 rounded-full bg-primary/50" />
                          <h4 className="text-xs font-semibold text-foreground">Follow-up</h4>
                        </div>
                        <FollowUpAdvicePanel
                          initial={data.followUp}
                          onSubmit={async (followUp) => { await patch({ followUp }); }}
                        />
                      </div>
                      <div>
                        <div className="mb-4 flex items-center gap-2.5">
                          <div className="h-3.5 w-0.5 rounded-full bg-primary/50" />
                          <h4 className="text-xs font-semibold text-foreground">Referrals & Recommendations</h4>
                        </div>
                        <textarea
                          key={`rec-notes-${opNumber}`}
                          defaultValue={data.recommendationsNotes ?? ''}
                          onBlur={(e) => { void patch({ recommendationsNotes: e.target.value }); }}
                          placeholder="Specialist referrals, physio, surgery follow-ups, lifestyle advice…"
                          disabled={viewOnly}
                          rows={3}
                          className="w-full resize-none overflow-hidden border-0 border-b border-hairline bg-transparent pt-1.5 pb-0.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors [field-sizing:content] disabled:cursor-not-allowed disabled:text-muted-foreground"
                        />
                      </div>
                    </div>
                  </SectionCard>
                </fieldset>
              </div>
            )}
          </div>
        </div>
      </main>

      <AmendWithReasonSheet
        open={amendOpen}
        onClose={() => setAmendOpen(false)}
        onSubmit={(reason) => amend(reason)}
        history={(data.amendments ?? []).map((a) => ({
          id: a.id, reason: a.reason, amendedAt: a.amendedAt,
        }))}
      />

      <VitalsEditSheet
        open={vitalsEditOpen}
        onClose={() => setVitalsEditOpen(false)}
        initial={data.latestVitals}
        onSubmit={(patch) => updateVitals(patch)}
      />
    </div>
  );
}
