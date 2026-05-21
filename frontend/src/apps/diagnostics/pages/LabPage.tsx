import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Beaker,
  CheckCircle2,
  Eye,
  PlayCircle,
  Search,
  ShieldAlert,
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
import { EmptyState } from '@/components/feedback/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import {
  fetchLabOrderQueuePaged,
  releaseLabOrder,
  transitionLabOrder,
  type LabOrderQueueEntry,
  type OrderStatus,
} from '@/features/lab';
import { DEFAULT_LIMIT } from '@/utils/listQuery';

/**
 * Lab worklist — high-throughput tech workstation.
 *
 * Workflow simplification (vs the previous 4-button pipeline):
 *   `paid`               → "Open"      auto-runs sample_collection →
 *                                       sample_collected → in_progress
 *                                       silently, then expands the row
 *                                       inline with the result-entry
 *                                       panel.
 *   `sample_collection`/
 *   `sample_collected`   → "Open"      catches up missed transitions
 *                                       (kiosk reload, multi-tab) and
 *                                       lands on result entry.
 *   `in_progress`        → "Continue"  expands the result-entry panel.
 *   `reported`           → "Release"   one-click release; "View" expands
 *                                       the read-only result.
 *   `released`           → "View"      inline read-only result.
 *
 * Status field names (paid / sample_collection / sample_collected /
 * in_progress / reported / released) are PRESERVED on the wire for
 * audit trail — only the UI surface area collapses.
 */
const statusTone: Record<OrderStatus, StatusPillProps['tone']> = {
  ordered:             'neutral',
  awaiting_payment:    'warning',
  paid:                'info',
  sample_collection:   'info',
  sample_collected:    'info',
  in_progress:         'warning',
  partially_reported:  'warning',
  reported:            'success',
  released:            'success',
  cancelled:           'neutral',
};

const statusLabel: Record<OrderStatus, string> = {
  ordered:             'Ordered',
  awaiting_payment:    'Awaiting payment',
  paid:                'Ready',
  sample_collection:   'Collecting',
  sample_collected:    'Collected',
  in_progress:         'Processing',
  partially_reported:  'Partial',
  reported:            'Reported',
  released:            'Released',
  cancelled:           'Cancelled',
};

const flagTone: Record<NonNullable<LabOrderQueueEntry['flag']>, StatusPillProps['tone']> = {
  normal: 'success',
  low: 'warning',
  high: 'warning',
  critical_low: 'danger',
  critical_high: 'danger',
};

const POLL_INTERVAL_MS = 5_000;

export function LabPage(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT);
  const sort = params.get('sort') || '-orderedAt';

  const [items, setItems] = useState<LabOrderQueueEntry[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setParam = (key: string, value: string | null): void => {
    const np = new URLSearchParams(params);
    if (!value) np.delete(key);
    else np.set(key, value);
    setParams(np, { replace: true });
  };

  const load = async (silent: boolean): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const paged = await fetchLabOrderQueuePaged({
        q,
        page,
        limit,
        sort,
      });
      setItems(paged.rows);
      setTotal(paged.total);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, limit, sort]);

  // Silent 5s poll — keeps the worklist fresh during shift handover
  // without redrawing on every tick.
  useEffect(() => {
    const id = window.setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, limit, sort]);

  /**
   * Fast-forward an order to `in_progress` so the tech can start
   * entering values immediately. Each step is logged on the wire so
   * the audit trail stays intact (paid → sample_collection →
   * sample_collected → in_progress).
   */
  const fastForwardToProcessing = async (o: LabOrderQueueEntry): Promise<void> => {
    if (o.status === 'paid') {
      await transitionLabOrder(o.id, 'sample_collection');
      await transitionLabOrder(o.id, 'sample_collected');
      await transitionLabOrder(o.id, 'in_progress');
    } else if (o.status === 'sample_collection') {
      await transitionLabOrder(o.id, 'sample_collected');
      await transitionLabOrder(o.id, 'in_progress');
    } else if (o.status === 'sample_collected') {
      await transitionLabOrder(o.id, 'in_progress');
    }
  };

  /**
   * Primary row action — advances the wire status to `in_progress` when
   * the order isn't there yet, then navigates to the dedicated
   * result-entry page. Inline expansion was removed: one click takes
   * the tech from Ready straight into the focused entry surface.
   */
  const onOpenForEntry = async (o: LabOrderQueueEntry): Promise<void> => {
    setBusyId(o.id);
    try {
      if (
        o.status === 'paid' ||
        o.status === 'sample_collection' ||
        o.status === 'sample_collected'
      ) {
        await fastForwardToProcessing(o);
      }
      navigate(`/diagnostics/lab/${o.id}/result`);
    } finally {
      setBusyId(null);
    }
  };

  const onRelease = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      await releaseLabOrder(id);
      await load(true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Lab' }]}
        homeTo="/diagnostics/lab"
        homeLabel="Diagnostics"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live worklist
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Lab worklist
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Click <span className="font-medium text-foreground">Open</span> to
            start entering results — sample collection + processing are tracked
            for audit but no longer require explicit clicks.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {total} {total === 1 ? 'order' : 'orders'}
        </span>
        <div className="relative flex items-end">
          <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
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
            placeholder="Patient, UHID, OP, test…"
            className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading worklist...
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Beaker}
          title={q ? 'No lab orders match the current search.' : 'No active lab orders.'}
          description={
            q
              ? 'Clear the search to widen the view.'
              : 'New lab orders from the doctor or front desk will appear here.'
          }
        />
      ) : (
        <div className="overflow-hidden border-b border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <SortableTH field="patient.fullName" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                    Patient
                  </SortableTH>
                  <th className="px-3 py-2 font-medium">UHID · OP</th>
                  <SortableTH field="testName" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                    Test
                  </SortableTH>
                  <th className="px-3 py-2 font-medium">Sample</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <SortableTH field="status" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                    Status
                  </SortableTH>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o, idx) => (
                  <tr
                    key={o.id}
                    className={cn(
                      'border-b align-middle transition-colors hover:bg-primary/[0.05]',
                      idx % 2 === 1 && 'bg-muted/20',
                    )}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{o.patient.fullName}</div>
                      <div className="text-xxs text-muted-foreground">
                        {o.patient.gender.toUpperCase()} · {o.patient.ageYears}y
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                      <div>{o.patient.uhid}</div>
                      <div>{o.opNumber}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{o.testName}</div>
                      <div className="text-xxs text-muted-foreground">{o.testCode}</div>
                      {o.requiresFasting && (
                        <div className="mt-0.5 inline-flex items-center gap-0.5 text-xxs font-medium text-warning">
                          <ShieldAlert className="h-3 w-3" /> Fasting
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground capitalize">
                      {o.specimen}
                      {o.sampleVolumeMl ? (
                        <div className="font-mono tabular-nums">
                          {o.sampleVolumeMl} ml
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {o.resultSummary ? (
                        <>
                          <div className="line-clamp-1 max-w-[16rem] font-medium">
                            {o.resultSummary}
                          </div>
                          {o.flag && (
                            <StatusPill
                              tone={flagTone[o.flag]}
                              size="sm"
                              className="mt-0.5"
                              pulse={o.flag.startsWith('critical') ? 'ripple' : 'none'}
                            >
                              {o.flag.replace(/_/g, ' ')}
                            </StatusPill>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill
                        tone={statusTone[o.status]}
                        size="sm"
                        pulse={
                          o.status === 'in_progress' || o.status === 'sample_collection'
                            ? 'breathe'
                            : 'none'
                        }
                      >
                        {statusLabel[o.status]}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RowAction
                        order={o}
                        busy={busyId === o.id}
                        onOpen={() => void onOpenForEntry(o)}
                        onRelease={() => void onRelease(o.id)}
                      />
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}

interface RowActionProps {
  order: LabOrderQueueEntry;
  busy: boolean;
  onOpen: () => void;
  onRelease: () => void;
}

/**
 * One primary action per row. `paid` / `sample_*` / `in_progress` →
 * single "Open" button that fast-forwards the wire status and
 * navigates to the dedicated result-entry page. `reported` adds a
 * one-click "Release" alongside the View. `released` is view-only.
 */
function RowAction({
  order,
  busy,
  onOpen,
  onRelease,
}: RowActionProps): JSX.Element {
  const cls = 'min-w-[6.5rem]';
  const fullPageHref = `/diagnostics/lab/${order.id}/result`;

  if (
    order.status === 'paid' ||
    order.status === 'sample_collection' ||
    order.status === 'sample_collected'
  ) {
    return (
      <Button
        type="button"
        size="sm"
        className={cls}
        onClick={onOpen}
        disabled={busy}
      >
        {busy ? <Spinner size="sm" /> : <PlayCircle />} Open
      </Button>
    );
  }

  if (order.status === 'in_progress') {
    return (
      <Button asChild type="button" size="sm" className={cls}>
        <Link to={fullPageHref}>
          <PlayCircle /> Continue
        </Link>
      </Button>
    );
  }

  if (order.status === 'reported') {
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button asChild type="button" size="sm" variant="outline" className={cls}>
          <Link to={fullPageHref}>
            <Eye /> View
          </Link>
        </Button>
        <Button
          type="button"
          size="sm"
          className={cls}
          onClick={onRelease}
          disabled={busy}
        >
          <CheckCircle2 /> Release
        </Button>
      </div>
    );
  }

  if (order.status === 'released') {
    return (
      <Button asChild type="button" size="sm" variant="outline" className={cls}>
        <Link to={fullPageHref}>
          <Eye /> View
        </Link>
      </Button>
    );
  }

  if (order.status === 'awaiting_payment') {
    return <span className="text-xs text-warning">Awaiting payment</span>;
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}
