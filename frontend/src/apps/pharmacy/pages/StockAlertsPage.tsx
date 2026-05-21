import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Search } from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  StatusPill,
  TablePagination,
  type StatusPillProps,
} from '@/components/data-display';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import {
  fetchMedicines,
  type Medicine,
  type StockSeverity,
} from '@/features/inventory';

/**
 * Read-only stock view for the pharmacist's counter. The previous
 * "Stock alerts" page only surfaced critical buckets — pharmacists
 * still want to see "do we have <X> at all, and how much" without
 * leaving the counter. This page shows every medicine in the catalog
 * with the same severity signalling, plus search / severity filter
 * and pagination so a 500-row catalog stays usable on a 13" laptop.
 *
 * Full receive / batch / expiry management still lives in the
 * back-office Inventory app — this is a counter-side lookup table.
 */
const DEFAULT_PAGE_SIZE = 20;

const SEVERITY_TONE: Record<StockSeverity, StatusPillProps['tone']> = {
  ok:           'success',
  low:          'warning',
  out_of_stock: 'danger',
  near_expiry:  'warning',
  expired:      'danger',
};

const SEVERITY_LABEL: Record<StockSeverity, string> = {
  ok:           'In stock',
  low:          'Low',
  out_of_stock: 'Out of stock',
  near_expiry:  'Near expiry',
  expired:      'Expired',
};

const FORM_LABEL: Record<Medicine['form'], string> = {
  tab:    'Tablet',
  cap:    'Capsule',
  syrup:  'Syrup',
  inj:    'Injection',
  oint:   'Ointment',
  drops:  'Drops',
};

const formatExpiry = (iso?: string): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export function StockAlertsPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const severity = (params.get('severity') as StockSeverity | 'all') || 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_PAGE_SIZE);

  const [rows, setRows] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchMedicines({
      q: q || undefined,
      severity: severity === 'all' ? undefined : severity,
    })
      .then((r) => {
        if (alive) setRows(r);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [q, severity]);

  const total = rows.length;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * limit;
  const visible = useMemo(
    () => rows.slice(start, start + limit),
    [rows, start, limit],
  );

  const setParam = (key: string, value: string | null): void => {
    const np = new URLSearchParams(params);
    if (!value) np.delete(key);
    else np.set(key, value);
    setParams(np, { replace: true });
  };

  const onPageChange = (next: number): void => {
    setParam('page', String(next));
  };
  const onLimitChange = (next: number): void => {
    const np = new URLSearchParams(params);
    np.set('limit', String(next));
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Stock' }]}
        homeTo="/pharmacy/queue"
        homeLabel="Pharmacy"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live stock
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Stock
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Read-only view of every medicine the pharmacy carries. Full
            receive / batch / expiry management lives in the back-office
            Inventory app.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {total} {total === 1 ? 'medicine' : 'medicines'}
        </span>
        <div className="flex items-end gap-4">
          <select
            value={severity}
            onChange={(e) => {
              const v = e.target.value;
              const np = new URLSearchParams(params);
              if (v === 'all') np.delete('severity');
              else np.set('severity', v);
              np.set('page', '1');
              setParams(np, { replace: true });
            }}
            className="rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-0 pr-6 text-sm font-medium text-foreground focus:outline-none focus:border-primary"
          >
            <option value="all">All severities</option>
            <option value="ok">In stock</option>
            <option value="low">Low</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="near_expiry">Near expiry</option>
            <option value="expired">Expired</option>
          </select>
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
            placeholder="Name, generic, drug class…"
            className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
          />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading stock…
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={Boxes}
          title={
            q || severity !== 'all'
              ? 'No medicines match the current filters.'
              : 'No medicines in the catalog.'
          }
          description={
            q || severity !== 'all'
              ? 'Clear search / severity to widen the view.'
              : 'Add medicines from the back-office Inventory app to populate this list.'
          }
        />
      ) : (
        <div className="overflow-hidden border-b border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Medicine</th>
                  <th className="px-3 py-2 font-medium">Form</th>
                  <th className="px-3 py-2 font-medium">Drug class</th>
                  <th className="px-3 py-2 text-right font-medium">Stock</th>
                  <th className="px-3 py-2 text-right font-medium">Threshold</th>
                  <th className="px-3 py-2 font-medium">Earliest expiry</th>
                  <th className="px-3 py-2 font-medium">Severity</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m, idx) => (
                  <tr
                    key={m.id}
                    className={cn(
                      'border-b align-middle last:border-b-0 transition-colors hover:bg-primary/[0.04]',
                      idx % 2 === 1 && 'bg-muted/15',
                    )}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {m.name}{' '}
                        <span className="text-xs text-muted-foreground">{m.strength}</span>
                      </div>
                      <div className="text-xxs text-muted-foreground">{m.genericName}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {FORM_LABEL[m.form]}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {m.drugClass ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                      {m.availableQty}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xxs tabular-nums text-muted-foreground">
                      {m.thresholdQty}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatExpiry(m.earliestExpiry)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={SEVERITY_TONE[m.severity]} size="sm">
                        {SEVERITY_LABEL[m.severity]}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            total={total}
            page={safePage}
            limit={limit}
            onPageChange={onPageChange}
            onLimitChange={onLimitChange}
          />
        </div>
      )}
    </div>
  );
}
