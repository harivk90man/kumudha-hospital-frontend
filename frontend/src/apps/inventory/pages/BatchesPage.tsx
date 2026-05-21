import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarOff,
  Layers,
  PackageX,
  Search,
  ShieldCheck,
  TimerReset,
} from 'lucide-react';
import {
  Breadcrumb,
  DashboardStatCard,
  LiveIndicator,
  SortableTH,
  StatusPill,
  TablePagination,
  type StatusPillProps,
} from '@/components/data-display';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { fetchMedicineBatches, type MedicineBatch } from '@/features/inventory';
import { formatCurrency } from '@/utils/formatCurrency';
import { isoDate } from '@/utils/dateRange';
import { sortRows } from '@/utils/listQuery';
import { cn } from '@/utils/cn';

const BATCH_SORT_FIELDS = [
  'medicineName',
  'batchNumber',
  'expiryDate',
  'quantityOnHand',
  'supplierName',
  'receivedAt',
] as const;

const today = (): string => isoDate(new Date());
const plusDays = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

const DEFAULT_PAGE_SIZE = 25;

type BatchStatus = 'expired' | 'near_expiry' | 'short' | 'healthy';

const STATUS_TONE: Record<BatchStatus, StatusPillProps['tone']> = {
  expired:     'danger',
  near_expiry: 'warning',
  short:       'warning',
  healthy:     'success',
};

const STATUS_LABEL: Record<BatchStatus, string> = {
  expired:     'Expired',
  near_expiry: 'Near expiry',
  short:       'Short window',
  healthy:     'Healthy',
};

const daysToExpiry = (iso: string): number => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.round((t - Date.now()) / (24 * 60 * 60 * 1000));
};

const classifyBatch = (b: MedicineBatch): BatchStatus => {
  const d = daysToExpiry(b.expiryDate);
  if (d < 0) return 'expired';
  if (d <= 60) return 'near_expiry';
  if (d <= 180) return 'short';
  return 'healthy';
};

const expiryCountdown = (iso: string): { label: string; tone: string } => {
  const d = daysToExpiry(iso);
  if (d < 0) return { label: `expired ${Math.abs(d)}d ago`, tone: 'text-danger' };
  if (d === 0) return { label: 'expires today', tone: 'text-danger' };
  if (d <= 30) return { label: `${d}d left`, tone: 'text-danger' };
  if (d <= 90) return { label: `${d}d left`, tone: 'text-warning' };
  if (d <= 180) return { label: `${d}d left`, tone: 'text-foreground' };
  return { label: `${d}d left`, tone: 'text-muted-foreground' };
};

const expiryWindowOptions: { value: string; label: string }[] = [
  { value: '',     label: 'All' },
  { value: '30',   label: '≤ 30 days' },
  { value: '60',   label: '≤ 60 days' },
  { value: '90',   label: '≤ 90 days' },
  { value: 'past', label: 'Already expired' },
];

const formatDate = (iso?: string): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export function BatchesPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const expiring = params.get('expiring') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_PAGE_SIZE);
  const sort = params.get('sort') ?? '';

  const [items, setItems] = useState<MedicineBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const before =
      expiring === 'past'
        ? today()
        : expiring
          ? plusDays(Number(expiring))
          : undefined;
    fetchMedicineBatches({ q, expiringBefore: before })
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [expiring, q]);

  const setParam = (key: string, value: string): void => {
    const np = new URLSearchParams(params);
    if (value) np.set(key, value);
    else np.delete(key);
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  const onSortChange = (next: string | undefined): void => {
    const np = new URLSearchParams(params);
    if (!next) np.delete('sort');
    else np.set('sort', next);
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  const onPageChange = (next: number): void => {
    const np = new URLSearchParams(params);
    np.set('page', String(next));
    setParams(np, { replace: true });
  };
  const onLimitChange = (next: number): void => {
    const np = new URLSearchParams(params);
    np.set('limit', String(next));
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  /**
   * FEFO marker — for each medicine, the row with the earliest non-expired
   * expiry is the "next to dispense". Highlighting it lets the inventory
   * clerk verify the FEFO consumer is hitting the right batch.
   */
  const fefoIds = useMemo(() => {
    const earliest = new Map<string, MedicineBatch>();
    for (const b of items) {
      if (daysToExpiry(b.expiryDate) < 0) continue;
      const cur = earliest.get(b.medicineId);
      if (!cur || new Date(b.expiryDate) < new Date(cur.expiryDate)) {
        earliest.set(b.medicineId, b);
      }
    }
    return new Set(Array.from(earliest.values()).map((b) => b.id));
  }, [items]);

  const kpis = useMemo(() => {
    let totalUnits = 0;
    let totalValue = 0;
    let expiringValue = 0;
    let deadStockValue = 0;
    let expiring30Count = 0;
    let expiredCount = 0;
    for (const b of items) {
      const lineCost = b.quantityOnHand * b.unitCost;
      totalUnits += b.quantityOnHand;
      totalValue += lineCost;
      const d = daysToExpiry(b.expiryDate);
      if (d < 0) {
        expiredCount += 1;
        deadStockValue += lineCost;
      } else if (d <= 30) {
        expiring30Count += 1;
        expiringValue += lineCost;
      } else if (d <= 60) {
        expiringValue += lineCost;
      }
    }
    return {
      totalBatches: items.length,
      totalUnits,
      totalValue,
      expiringValue,
      deadStockValue,
      expiring30Count,
      expiredCount,
    };
  }, [items]);

  const sorted = useMemo(
    () => sortRows(items, sort, BATCH_SORT_FIELDS),
    [items, sort],
  );
  const total = sorted.length;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * limit;
  const visible = useMemo(
    () => sorted.slice(start, start + limit),
    [sorted, start, limit],
  );

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Batches' }]}
        homeTo="/inventory/medicines"
        homeLabel="Inventory"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Home/landing — LiveIndicator band substitutes the back-link
              slot so the title anchors at the same y as on every other
              page across the app. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live stock
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Batches + expiry
          </h1>
          <p className="text-[13px] text-muted-foreground">
            FEFO is enforced server-side at dispense. Use the expiry filter to
            surface batches that need to move soon; the FEFO row of each
            medicine is highlighted with a left rule.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard
          label="Batches in view"
          value={kpis.totalBatches.toLocaleString()}
          icon={Layers}
          trailing={
            <span className="text-xxs text-muted-foreground">
              {formatCurrency(kpis.totalValue)} at cost
            </span>
          }
        />
        <DashboardStatCard
          label="Expiring ≤ 30d"
          value={kpis.expiring30Count.toLocaleString()}
          icon={TimerReset}
          tone={kpis.expiring30Count > 0 ? 'warning' : 'default'}
          trailing={
            <span className="text-xxs text-muted-foreground">
              {formatCurrency(kpis.expiringValue)} exposure
            </span>
          }
        />
        <DashboardStatCard
          label="Expired"
          value={kpis.expiredCount.toLocaleString()}
          icon={CalendarOff}
          tone={kpis.expiredCount > 0 ? 'danger' : 'default'}
          trailing={
            <span className="text-xxs text-muted-foreground">
              {formatCurrency(kpis.deadStockValue)} dead stock
            </span>
          }
        />
        <DashboardStatCard
          label="Units on hand"
          value={kpis.totalUnits.toLocaleString()}
          icon={ShieldCheck}
        />
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {total} {total === 1 ? 'batch' : 'batches'}
        </span>
        <div className="flex items-end gap-4">
          <select
            value={expiring}
            onChange={(e) => setParam('expiring', e.target.value)}
            className="rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-0 pr-6 text-sm font-medium text-foreground focus:outline-none focus:border-primary"
          >
            {expiryWindowOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="relative flex items-end">
            <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Medicine, batch, supplier…"
              className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading batches...
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={PackageX}
          title="No batches match these filters."
          description="Clear the search or expiry filter to widen the view."
        />
      ) : (
        <div className="overflow-hidden border-b border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <SortableTH field="medicineName" sort={sort} onSort={onSortChange}>
                    Medicine
                  </SortableTH>
                  <SortableTH field="batchNumber" sort={sort} onSort={onSortChange}>
                    Batch
                  </SortableTH>
                  <SortableTH field="supplierName" sort={sort} onSort={onSortChange}>
                    Supplier
                  </SortableTH>
                  <th className="px-3 py-2 font-medium">MFG</th>
                  <SortableTH field="expiryDate" sort={sort} onSort={onSortChange}>
                    EXP
                  </SortableTH>
                  <th className="px-3 py-2 font-medium">Countdown</th>
                  <SortableTH
                    field="quantityOnHand"
                    sort={sort}
                    onSort={onSortChange}
                    align="right"
                  >
                    Qty
                  </SortableTH>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Sell</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b, idx) => {
                  const status = classifyBatch(b);
                  const countdown = expiryCountdown(b.expiryDate);
                  const isFefo = fefoIds.has(b.id);
                  return (
                    <tr
                      key={b.id}
                      className={cn(
                        'border-b align-middle last:border-b-0 transition-colors hover:bg-primary/[0.04]',
                        idx % 2 === 1 && 'bg-muted/15',
                        isFefo && 'shadow-[inset_3px_0_0] shadow-primary',
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {b.medicineName}{' '}
                          <span className="text-xs text-muted-foreground">{b.strength}</span>
                        </div>
                        {isFefo && (
                          <div className="text-xxs font-medium text-primary">
                            FEFO · next to dispense
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">
                        {b.batchNumber}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {b.supplierName}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDate(b.mfgDate)}
                      </td>
                      <td className="px-3 py-2 text-xs">{formatDate(b.expiryDate)}</td>
                      <td className={cn('px-3 py-2 text-xs', countdown.tone)}>
                        {countdown.label}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                        {b.quantityOnHand}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(b.unitCost)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(b.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                        {formatCurrency(b.quantityOnHand * b.unitCost)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill
                          tone={STATUS_TONE[status]}
                          size="sm"
                          pulse={status === 'expired' ? 'breathe' : 'none'}
                        >
                          {STATUS_LABEL[status]}
                        </StatusPill>
                      </td>
                    </tr>
                  );
                })}
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
