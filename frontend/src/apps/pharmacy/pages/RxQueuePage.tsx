import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Pill,
  Search,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  StatusPill,
  TablePagination,
  type StatusPillProps,
} from '@/components/data-display';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import {
  fetchRxQueue,
  pickupRx,
  type RxItem,
  type RxQueueEntry,
  type RxQueueStatus,
} from '@/features/pharmacy';
import { PharmacyQueueTabs } from '../components/PharmacyQueueTabs';
import { useFitRowsToHeight } from '@/hooks/useFitRowsToHeight';

const STATUS_LABEL: Record<RxQueueStatus, string> = {
  rx_pending:             'Pending',
  rx_in_progress:         'In progress',
  rx_dispensed:           'Dispensed',
  rx_partially_dispensed: 'Partial',
  rx_cancelled:           'Cancelled',
};

/**
 * Status order — drives the wait-vs-status sort and the empty-state
 * hint copy. The pharmacist sees Pending first (action needed),
 * Cancelled last.
 */
const STATUS_ORDER: RxQueueStatus[] = [
  'rx_pending',
  'rx_in_progress',
  'rx_partially_dispensed',
  'rx_dispensed',
  'rx_cancelled',
];

const STATUS_PILL_TONE: Record<RxQueueStatus, StatusPillProps['tone']> = {
  rx_pending:              'warning',
  rx_in_progress:          'info',
  rx_dispensed:            'success',
  rx_partially_dispensed:  'warning',
  rx_cancelled:            'neutral',
};

const POLL_INTERVAL_MS = 5_000;

type SortField = 'wait' | 'status' | 'patient';
type SortDir = 'asc' | 'desc';

const sortRows = (rows: RxQueueEntry[], field: SortField, dir: SortDir): RxQueueEntry[] => {
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (field === 'wait') {
      cmp = new Date(a.prescribedAt).getTime() - new Date(b.prescribedAt).getTime();
    } else if (field === 'status') {
      cmp = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    } else {
      cmp = a.patient.fullName.localeCompare(b.patient.fullName);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
};

/**
 * Pharmacist Rx queue — dense operational table with sticky header,
 * expandable rows for per-Rx item detail, inline allergy + low-stock
 * indicators, and compact/comfortable density toggle. Supersedes the
 * card-grid layout that wasted vertical space during high-volume
 * dispensing shifts.
 */
export function RxQueuePage(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sortField = (params.get('sort') as SortField) ?? 'wait';
  const sortDir = (params.get('dir') as SortDir) ?? 'asc';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const tableRef = useRef<HTMLDivElement>(null);
  // Rx rows have 2 text lines + py-2.5 padding ≈ 56px each.
  const autoLimit = useFitRowsToHeight(tableRef, { rowHeight: 56, theadHeight: 33, footerHeight: 44 });
  // Honour an explicit ?limit= URL param (user manually overrode via dropdown); fall back to auto.
  const limit = params.has('limit') ? Math.max(1, Number(params.get('limit'))) : autoLimit;

  const [items, setItems] = useState<RxQueueEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const setParam = (key: string, value: string | null): void => {
    const np = new URLSearchParams(params);
    if (!value) np.delete(key);
    else np.set(key, value);
    setParams(np, { replace: true });
  };

  const toggleExpand = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const flipSort = (field: SortField): void => {
    if (sortField === field) {
      setParam('dir', sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      const np = new URLSearchParams(params);
      np.set('sort', field);
      np.set('dir', 'asc');
      setParams(np, { replace: true });
    }
  };

  const load = async (silent: boolean): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const rows = await fetchRxQueue({ q: q || undefined });
      setItems(rows);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent 5s poll keeps wait minutes + statuses fresh without flicker.
  useEffect(() => {
    const id = window.setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(
    () => sortRows(items, sortField, sortDir),
    [items, sortField, sortDir],
  );

  const goToDispense = (rx: RxQueueEntry): void => {
    navigate(`/pharmacy/queue/${rx.id}/dispense`);
  };

  const onPickup = async (rx: RxQueueEntry): Promise<void> => {
    setBusyId(rx.id);
    try {
      await pickupRx(rx.id);
      goToDispense(rx);
    } finally {
      setBusyId(null);
    }
  };

  /** Row padding constants. The previous compact / comfortable density
   *  toggle was dropped per design call — single, balanced row height. */
  const rowPad = 'py-2.5';
  const expandedRowPad = 'py-3';

  /** Client-side pagination — the worklist is small enough that the
   *  server returns the full set in one shot. Slicing keeps the visible
   *  table at a consistent height regardless of queue depth. */
  const totalRows = sorted.length;
  const lastPage = Math.max(1, Math.ceil(totalRows / limit));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * limit;
  const visibleRows = sorted.slice(start, start + limit);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Rx queue' }]}
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
            Rx queue
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Pick up the patient's Rx, decide per item (dispense / decline /
            out of stock), collect counter payment, hand medicines over.
          </p>
        </div>
      </header>

      {/* Unified filter row across the three pharmacist surfaces —
          count on the left; search + PharmacyQueueTabs dropdown
          right-aligned together. Mirrors the doctor / nurse queue
          pages so the eye doesn't have to retrain between
          operational screens. */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {totalRows} {totalRows === 1 ? 'prescription' : 'prescriptions'}
        </span>
        <div className="flex flex-wrap items-end gap-4">
          <div className="relative flex items-end">
            <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setParam('q', e.target.value || null)}
              placeholder="Patient, UHID, OP, Rx…"
              className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
            />
          </div>
          <PharmacyQueueTabs />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading queue...
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={q ? 'No prescriptions match the current search.' : 'No prescriptions waiting to dispense.'}
          description={
            q
              ? 'Clear the search to widen the view.'
              : 'New prescriptions from the doctor land here automatically.'
          }
        />
      ) : (
        <div ref={tableRef} className="overflow-hidden border-b border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-3 py-2 font-medium">Rx #</th>
                  <SortableHeader
                    field="patient"
                    label="Patient"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={flipSort}
                  />
                  <th className="px-3 py-2 font-medium">UHID · OP</th>
                  <th className="px-3 py-2 text-right font-medium">Items</th>
                  <th className="px-3 py-2 font-medium">Stock / allergy</th>
                  <SortableHeader
                    field="status"
                    label="Status"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={flipSort}
                  />
                  <th className="px-3 py-2 font-medium">Doctor</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((rx, idx) => {
                  const isExpanded = expanded.has(rx.id);
                  const allergyCount = (rx.patient.allergies?.length ?? 0);
                  const lowStockCount = rx.items.filter(
                    (i) => i.stockSeverity === 'low' || i.stockSeverity === 'out_of_stock',
                  ).length;
                  return (
                    <>
                      <tr
                        key={rx.id}
                        className={cn(
                          'border-b align-middle transition-colors hover:bg-primary/[0.05]',
                          !isExpanded && idx % 2 === 1 && 'bg-muted/20',
                          rx.status === 'rx_in_progress' &&
                            'bg-primary/[0.06] shadow-[inset_3px_0_0] shadow-primary',
                        )}
                      >
                        <td className={cn('px-2 text-center', rowPad)}>
                          <button
                            type="button"
                            onClick={() => toggleExpand(rx.id)}
                            aria-label={isExpanded ? 'Collapse Rx' : 'Expand Rx'}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className={cn('px-3', rowPad)}>
                          <div className="font-mono text-sm font-semibold tabular-nums">
                            {rx.prescriptionNumber}
                          </div>
                        </td>
                        <td className={cn('px-3', rowPad)}>
                          <div className="font-medium">{rx.patient.fullName}</div>
                          <div className="text-xxs text-muted-foreground">
                            {rx.patient.gender.toUpperCase()} · {rx.patient.ageYears}y
                          </div>
                        </td>
                        <td className={cn('px-3 font-mono text-xs tabular-nums text-muted-foreground', rowPad)}>
                          <div>{rx.patient.uhid}</div>
                          <div>{rx.opNumber}</div>
                        </td>
                        <td className={cn('px-3 text-right font-mono text-sm tabular-nums', rowPad)}>
                          {rx.items.length}
                        </td>
                        <td className={cn('px-3', rowPad)}>
                          <div className="flex flex-wrap items-center gap-1">
                            {allergyCount > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 rounded-full bg-danger/12 px-1.5 py-px text-xxs font-medium text-danger"
                                title={rx.patient.allergies?.map((a) => a.allergen).join(', ')}
                              >
                                <ShieldAlert className="h-3 w-3" /> {allergyCount} allergy
                              </span>
                            )}
                            {lowStockCount > 0 && (
                              <span
                                className="inline-flex items-center rounded-full bg-warning/12 px-1.5 py-px text-xxs font-medium text-warning"
                                title="Some items are low or out of stock"
                              >
                                {lowStockCount} stock
                              </span>
                            )}
                            {allergyCount === 0 && lowStockCount === 0 && (
                              <span className="text-xxs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className={cn('px-3', rowPad)}>
                          <StatusPill
                            tone={STATUS_PILL_TONE[rx.status]}
                            size="sm"
                            pulse={
                              rx.status === 'rx_in_progress' || rx.status === 'rx_pending'
                                ? 'breathe'
                                : 'none'
                            }
                          >
                            {STATUS_LABEL[rx.status]}
                          </StatusPill>
                        </td>
                        <td className={cn('px-3 text-xs text-muted-foreground', rowPad)}>
                          {rx.doctorName}
                        </td>
                        <td className={cn('px-3 text-right', rowPad)}>
                          <RxRowAction
                            rx={rx}
                            busy={busyId === rx.id}
                            onPickup={() => void onPickup(rx)}
                            onOpen={() => goToDispense(rx)}
                          />
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b bg-muted/10">
                          <td colSpan={9} className={cn('px-4', expandedRowPad)}>
                            <RxItemsDetail items={rx.items} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            total={totalRows}
            page={safePage}
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

interface SortableHeaderProps {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

function SortableHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: SortableHeaderProps): JSX.Element {
  const active = sortField === field;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 transition',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
        {active && <span className="text-xxs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

interface RxRowActionProps {
  rx: RxQueueEntry;
  busy: boolean;
  onPickup: () => void;
  onOpen: () => void;
}

function RxRowAction({ rx, busy, onPickup, onOpen }: RxRowActionProps): JSX.Element {
  // Action CTAs share min-w so the column doesn’t shift between rows.
  const cls = 'min-w-[6rem]';
  if (rx.status === 'rx_pending') {
    return (
      <Button type="button" size="sm" className={cls} onClick={onPickup} disabled={busy}>
        {busy ? <Spinner size="sm" /> : <Pill />} Pick up
      </Button>
    );
  }
  if (rx.status === 'rx_in_progress') {
    return (
      <Button type="button" size="sm" className={cls} onClick={onOpen}>
        <Wallet /> Continue
      </Button>
    );
  }
  return (
    <Button type="button" size="sm" variant="outline" className={cls} onClick={onOpen}>
      <Pill /> View
    </Button>
  );
}

interface RxItemsDetailProps {
  items: RxItem[];
}

function RxItemsDetail({ items }: RxItemsDetailProps): JSX.Element {
  return (
    <div>
      <div className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
        Items
      </div>
      <ul className="mt-1 grid gap-x-4 gap-y-1 md:grid-cols-2">
        {items.map((it) => {
          const tone =
            it.stockSeverity === 'out_of_stock'
              ? 'text-danger'
              : it.stockSeverity === 'low'
                ? 'text-warning'
                : 'text-muted-foreground';
          return (
            <li
              key={it.id}
              className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/50 py-1 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{it.medicineName}</span>{' '}
                <span className="text-xs text-muted-foreground">{it.strength}</span>
                <span className="text-xs text-muted-foreground">
                  {' '}× {it.quantityPrescribed}
                </span>
              </span>
              <span className={cn('font-mono text-xs tabular-nums', tone)}>
                stock {it.availableQty}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
