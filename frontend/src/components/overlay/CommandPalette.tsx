import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  HeartPulse,
  IndianRupee,
  Search,
  ShieldAlert,
  Stethoscope,
  User,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useAuth, type UserRole } from '@/features/auth';
import {
  searchPatientsByMobile,
  useRecentPatientsStore,
  type PatientSummary,
} from '@/features/patient';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';

/**
 * Global command palette — opens with `/` (anywhere outside an input)
 * or `⌘K` / `Ctrl+K`. Single keyboard-first surface for finding any
 * patient, jumping to any major page, or kicking off any frequent
 * action.
 *
 * Sections (v1):
 *   - Patients (debounced search, hits the same APIs as the top-bar)
 *   - Actions (role-aware navigation shortcuts + register-new + walk-in)
 *   - Recents (when search is empty)
 *
 * Future sections — doctors, tokens, services — slot in as additional
 * data sources without changing the layout. Keep the section model
 * open for that.
 *
 * Keyboard:
 *   - `↑` / `↓` move highlight
 *   - `Enter` activates the highlighted item
 *   - `Esc` closes
 *   - typing focuses the input automatically
 */

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  /** Right-aligned subtle text (e.g. "Patient", "Doctor", a UHID). */
  rightLabel?: string;
  onSelect: () => void;
}

interface PaletteSection {
  title: string;
  items: PaletteItem[];
}

export function CommandPalette({ open, onClose }: CommandPaletteProps): JSX.Element | null {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState<string>('');
  const [patientResults, setPatientResults] = useState<PatientSummary[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [highlight, setHighlight] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const recent = useRecentPatientsStore((s) => s.recent);

  // Reset internal state every time the palette opens so a stale
  // query / highlight doesn’t surface.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPatientResults([]);
    setHighlight(0);
    // Defer the focus until after render so the input is mounted.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Patient search — debounce ~200ms.
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setPatientResults([]);
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const v = query.trim();
        const matches = await searchPatientsByMobile(v);
        if (alive) setPatientResults(matches);
      } finally {
        if (alive) setSearching(false);
      }
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query, open]);

  /* ---------- Sections ---------- */

  const goAndClose = useCallback(
    (to: string): (() => void) =>
      () => {
        navigate(to);
        onClose();
      },
    [navigate, onClose],
  );

  const sections = useMemo<PaletteSection[]>(() => {
    const result: PaletteSection[] = [];
    const hasQuery = query.trim().length > 0;

    // Patients — only when there’s a query OR there are recents to show.
    if (hasQuery) {
      result.push({
        title: 'Patients',
        items: patientResults.map((p) => ({
          id: `patient-${p.uhid}`,
          label: p.fullName,
          hint: `${p.gender.toUpperCase()} · ${p.ageYears}y · ${p.mobile}`,
          icon: (p.allergies?.length ?? 0) > 0 ? ShieldAlert : User,
          rightLabel: p.uhid,
          onSelect: goAndClose(`/patient/${p.uhid}`),
        })),
      });
    } else if (recent.length > 0) {
      result.push({
        title: 'Recent patients',
        items: recent.slice(0, 5).map((r) => ({
          id: `recent-${r.uhid}`,
          label: r.fullName,
          icon: User,
          rightLabel: r.uhid,
          onSelect: goAndClose(`/patient/${r.uhid}`),
        })),
      });
    }

    // Actions — role-aware navigation shortcuts. Filtered by the
    // signed-in user’s role so a doctor doesn’t see "Register patient",
    // a cashier doesn’t see "Take vitals", etc.
    result.push({
      title: 'Actions',
      items: actionsForRole(user?.role, goAndClose, hasQuery, query),
    });

    return result.filter((s) => s.items.length > 0);
  }, [query, patientResults, recent, user?.role, goAndClose]);

  // Flatten for keyboard navigation across sections.
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Keep highlight inside the bounds when results shrink.
  useEffect(() => {
    if (highlight >= flat.length) setHighlight(Math.max(0, flat.length - 1));
  }, [flat.length, highlight]);

  // Scroll the highlighted row into view if the list overflows.
  useEffect(() => {
    if (!listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${highlight}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(flat.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flat[highlight]?.onSelect();
    }
    // Esc handled at the document level via the open-state owner.
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 px-4 pt-[12vh] backdrop-blur-sm print:hidden"
      onMouseDown={(e) => {
        // Click on the backdrop closes — but only when the click started
        // outside the dialog body (don’t close on drag-from-input).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-hairline bg-card shadow-elevated"
        onKeyDown={onKeyDown}
      >
        <div className="relative border-b border-hairline">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            placeholder="Search patients, jump to a page, run an action…"
            className="h-12 w-full bg-transparent pl-11 pr-4 text-sm focus:outline-none"
            aria-label="Command palette search"
          />
          {searching && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2">
              <Spinner size="sm" />
            </span>
          )}
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {sections.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </div>
          ) : (
            sections.map((section) => (
              <PaletteSectionView
                key={section.title}
                section={section}
                highlight={highlight}
                flatStartIndex={flat.indexOf(section.items[0]!)}
                onHover={setHighlight}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-hairline bg-muted/30 px-4 py-1.5 text-xxs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>navigate</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Kbd>↵</Kbd>
            <span>open</span>
            <span className="px-1">·</span>
            <Kbd>esc</Kbd>
            <span>close</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Section + row + kbd helpers ---------- */

interface PaletteSectionViewProps {
  section: PaletteSection;
  highlight: number;
  flatStartIndex: number;
  onHover: (idx: number) => void;
}

function PaletteSectionView({
  section,
  highlight,
  flatStartIndex,
  onHover,
}: PaletteSectionViewProps): JSX.Element {
  return (
    <div className="py-1">
      <div className="px-4 pb-1 pt-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground/70">
        {section.title}
      </div>
      {section.items.map((item, i) => {
        const idx = flatStartIndex + i;
        const active = idx === highlight;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            data-palette-index={idx}
            onMouseEnter={() => onHover(idx)}
            onClick={item.onSelect}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
              active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/40',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 flex-shrink-0',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{item.label}</div>
              {item.hint && (
                <div className="truncate text-xxs text-muted-foreground">
                  {item.hint}
                </div>
              )}
            </div>
            {item.rightLabel && (
              <span className="font-mono text-xxs text-muted-foreground tabular-nums">
                {item.rightLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-hairline bg-card px-1 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  );
}

/* ---------- Role-aware action set ---------- */

function actionsForRole(
  role: UserRole | undefined,
  goAndClose: (to: string) => () => void,
  hasQuery: boolean,
  query: string,
): PaletteItem[] {
  const items: PaletteItem[] = [];

  // Always-on across roles
  if (role === 'frontdesk') {
    items.push({
      id: 'go-op-coordination',
      label: 'OP coordination',
      hint: 'Live queue + lookup',
      icon: HeartPulse,
      onSelect: goAndClose('/frontdesk/station'),
    });
    items.push({
      id: 'go-appointments',
      label: 'Appointments',
      hint: "Today’s bookings + check-in",
      icon: CalendarClock,
      onSelect: goAndClose('/frontdesk/appointments'),
    });
    items.push({
      id: 'go-walkin',
      label: 'Walk-in service',
      hint: 'Direct lab / radiology order',
      icon: HeartPulse,
      onSelect: goAndClose('/frontdesk/walkin'),
    });
    items.push({
      id: 'register-new',
      label:
        hasQuery
          ? `Register new patient — ${query.trim()}`
          : 'Register new patient',
      icon: UserPlus,
      onSelect: goAndClose(
        hasQuery
          ? `/frontdesk/register?prefill=${encodeURIComponent(query.trim())}`
          : '/frontdesk/register',
      ),
    });
  }

  if (role === 'doctor' || role === 'chief_doctor') {
    items.push({
      id: 'go-doctor-queue',
      label: 'My queue',
      icon: Stethoscope,
      onSelect: goAndClose('/doctor/queue'),
    });
  }

  if (role === 'frontdesk') {
    items.push({
      id: 'go-cashier-invoices',
      label: 'Invoices',
      hint: 'Take payment',
      icon: IndianRupee,
      onSelect: goAndClose('/cashier/invoices'),
    });
  }

  if (role === 'lab_radio') {
    items.push({
      id: 'go-lab',
      label: 'Lab worklist',
      icon: HeartPulse,
      onSelect: goAndClose('/diagnostics/lab'),
    });
    items.push({
      id: 'go-radiology',
      label: 'Radiology worklist',
      icon: HeartPulse,
      onSelect: goAndClose('/diagnostics/radiology'),
    });
  }

  if (role === 'pharma') {
    items.push({
      id: 'go-rx-queue',
      label: 'Rx queue',
      icon: HeartPulse,
      onSelect: goAndClose('/pharmacy/queue'),
    });
    items.push({
      id: 'go-pharmacy-refill',
      label: 'Pharmacy refill',
      hint: 'Look up a patient + re-dispense their last Rx',
      icon: HeartPulse,
      onSelect: goAndClose('/pharmacy/refill'),
    });
    items.push({
      id: 'go-pharmacy-counter',
      label: 'OTC counter sale',
      hint: 'Anonymous over-the-counter sale',
      icon: HeartPulse,
      onSelect: goAndClose('/pharmacy/counter'),
    });
    items.push({
      id: 'go-pharmacy-otc-invoices',
      label: 'OTC invoices',
      hint: 'Past counter-sale receipts',
      icon: HeartPulse,
      onSelect: goAndClose('/pharmacy/otc/invoices'),
    });
  }

  return items;
}
