import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  Eye,
  PlayCircle,
  Search,
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
  fetchRadiologyOrderQueuePaged,
  releaseRadiologyOrder,
  transitionRadiologyOrder,
  type RadiologyOrderQueueEntry,
} from '@/features/radiology';
import type { OrderStatus } from '@/features/lab';
import { DEFAULT_LIMIT } from '@/utils/listQuery';

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

const statusLabel: Partial<Record<OrderStatus, string>> = {
  paid: 'Paid · ready to capture',
  in_progress: 'Capturing',
  reported: 'Reported',
  released: 'Released',
  awaiting_payment: 'Awaiting payment',
};

export function RadiologyPage(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT);
  const sort = params.get('sort') || '-orderedAt';

  const [items, setItems] = useState<RadiologyOrderQueueEntry[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setParam = (key: string, value: string | null): void => {
    const np = new URLSearchParams(params);
    if (!value) np.delete(key);
    else np.set(key, value);
    setParams(np, { replace: true });
  };

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const paged = await fetchRadiologyOrderQueuePaged({
        q,
        page,
        limit,
        sort,
      });
      setItems(paged.rows);
      setTotal(paged.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, limit, sort]);

  /**
   * Single primary action across statuses:
   *   paid          → auto-run transition to in_progress, expand form
   *   in_progress   → just expand the impression form
   *   reported      → handled separately (Release + View)
   *   released      → handled separately (View)
   *
   * Mirrors the LabPage simplification: technicians don't click
   * "Start capture" + "Enter impression" — one click takes them from
   * Ready straight into the impression form.
   */
  const onOpenForReport = async (o: RadiologyOrderQueueEntry): Promise<void> => {
    setBusyId(o.id);
    try {
      if (o.status === 'paid') {
        await transitionRadiologyOrder(o.id, 'in_progress');
      }
      navigate(`/diagnostics/radiology/${o.id}/report`);
    } finally {
      setBusyId(null);
    }
  };

  const onRelease = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      await releaseRadiologyOrder(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Radiology' }]}
        homeTo="/diagnostics/radiology"
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
            Radiology worklist
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Capture imaging → enter impression inline → release. The doctor's
            report-pending queue picks it up automatically.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {total} {total === 1 ? 'study' : 'studies'}
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
            placeholder="Patient, UHID, OP, study…"
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
          icon={Camera}
          title={
            q
              ? 'No imaging studies match the current search.'
              : 'No active imaging studies.'
          }
          description={
            q
              ? 'Clear the search to widen the view.'
              : 'New imaging orders will appear here as the day moves.'
          }
        />
      ) : (
        <div className="overflow-hidden border-b border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <SortableTH field="patient.fullName" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                  Patient
                </SortableTH>
                <SortableTH field="testName" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                  Study
                </SortableTH>
                <th className="px-3 py-2.5 font-medium">Impression</th>
                <SortableTH field="status" sort={sort} onSort={(s) => setParam('sort', s ?? null)}>
                  Status
                </SortableTH>
                <th className="px-3 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o, idx) => {
                const fullPageHref = `/diagnostics/radiology/${o.id}/report`;
                return (
                  <tr
                    key={o.id}
                    className={cn(
                      'border-b align-top transition-colors hover:bg-muted/30',
                      idx % 2 === 1 && 'bg-muted/20',
                    )}
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium">{o.patient.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.patient.uhid} · OP {o.opNumber}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{o.testName}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {o.testCode} · {o.modality} · {o.bodyPart}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {o.resultSummary ? (
                        <p className="line-clamp-2 max-w-md leading-snug">{o.resultSummary}</p>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        tone={statusTone[o.status]}
                        size="sm"
                        pulse={o.status === 'in_progress' ? 'breathe' : 'none'}
                      >
                        {statusLabel[o.status] ?? o.status.replace(/_/g, ' ')}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {o.status === 'paid' && (
                          <Button
                            type="button"
                            size="sm"
                            className="min-w-[6.5rem]"
                            onClick={() => void onOpenForReport(o)}
                            disabled={busyId === o.id}
                          >
                            {busyId === o.id ? <Spinner size="sm" /> : <PlayCircle />}
                            Open
                          </Button>
                        )}
                        {o.status === 'in_progress' && (
                          <Button asChild type="button" size="sm" className="min-w-[6.5rem]">
                            <Link to={fullPageHref}>
                              <PlayCircle /> Continue
                            </Link>
                          </Button>
                        )}
                        {o.status === 'reported' && (
                          <>
                            <Button asChild type="button" size="sm" variant="outline" className="min-w-[6.5rem]">
                              <Link to={fullPageHref}>
                                <Eye /> View
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="min-w-[6.5rem]"
                              onClick={() => void onRelease(o.id)}
                              disabled={busyId === o.id}
                            >
                              <CheckCircle2 /> Release
                            </Button>
                          </>
                        )}
                        {o.status === 'released' && (
                          <Button asChild type="button" size="sm" variant="outline" className="min-w-[6.5rem]">
                            <Link to={fullPageHref}>
                              <Eye /> View
                            </Link>
                          </Button>
                        )}
                        {o.status === 'awaiting_payment' && (
                          <span className="text-xs text-warning">Awaiting payment</span>
                        )}
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
    </div>
  );
}
