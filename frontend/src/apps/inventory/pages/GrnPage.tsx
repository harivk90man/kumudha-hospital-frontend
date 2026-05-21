import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  IndianRupee,
  PackageOpen,
  PackagePlus,
  Pencil,
  Receipt,
  Search,
  Truck,
} from 'lucide-react';
import {
  Breadcrumb,
  DashboardStatCard,
  LiveIndicator,
  SortableTH,
  TablePagination,
} from '@/components/data-display';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { EmptyState } from '@/components/feedback/EmptyState';
import { RowActionsItem, RowActionsMenu } from '@/components/overlay';
import { fetchGrns, type Grn } from '@/features/inventory';
import { formatCurrency } from '@/utils/formatCurrency';
import { sortRows } from '@/utils/listQuery';
import { cn } from '@/utils/cn';

const DEFAULT_PAGE_SIZE = 25;

const GRN_SORT_FIELDS = [
  'grnNumber',
  'supplierName',
  'receivedAt',
  'totalQuantity',
  'totalCost',
] as const;

/**
 * GRN list — every Goods-Receive-Note recorded against a supplier
 * invoice. The "Receive goods" CTA in the header navigates to the
 * dedicated `/inventory/grn/new` creation page (replaced the legacy
 * side-sheet so the spreadsheet-style line editor has a full canvas).
 */
export function GrnPage(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_PAGE_SIZE);
  const sort = params.get('sort') ?? '';

  const [items, setItems] = useState<Grn[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchGrns()
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter(
      (g) =>
        g.grnNumber.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        g.supplierInvoiceNo.toLowerCase().includes(q),
    );
  }, [items, q]);

  const kpis = useMemo(() => {
    const supplierSet = new Set<string>();
    let totalUnits = 0;
    let totalCost = 0;
    for (const g of filtered) {
      supplierSet.add(g.supplierId);
      totalUnits += g.totalQuantity;
      totalCost += g.totalCost;
    }
    return {
      totalGrns: filtered.length,
      supplierCount: supplierSet.size,
      totalUnits,
      totalCost,
    };
  }, [filtered]);

  const sorted = useMemo(
    () => sortRows(filtered, sort, GRN_SORT_FIELDS),
    [filtered, sort],
  );
  const total = sorted.length;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * limit;
  const visible = useMemo(
    () => sorted.slice(start, start + limit),
    [sorted, start, limit],
  );

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

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Goods receive' }]}
        homeTo="/inventory/medicines"
        homeLabel="Inventory"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Home/landing — LiveIndicator band substitutes the back-link
              slot so the title + primary CTA anchor at the same y as on
              every other page. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live GRNs
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Goods receive notes
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Record inbound stock against a supplier invoice. Each line creates
            a batch row in `medicine_batches`.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => navigate('/inventory/grn/new')}>
            <PackagePlus /> Receive goods
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard
          label="GRNs in view"
          value={kpis.totalGrns.toLocaleString()}
          icon={Receipt}
        />
        <DashboardStatCard
          label="Suppliers"
          value={kpis.supplierCount.toLocaleString()}
          icon={Truck}
        />
        <DashboardStatCard
          label="Units received"
          value={kpis.totalUnits.toLocaleString()}
          icon={PackageOpen}
        />
        <DashboardStatCard
          label="Total cost"
          value={formatCurrency(kpis.totalCost)}
          icon={IndianRupee}
        />
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {total} {total === 1 ? 'GRN' : 'GRNs'}
        </span>
        <div className="relative flex items-end">
          <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={params.get('q') ?? ''}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="GRN number, supplier, invoice…"
            className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading GRNs...
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            q
              ? 'No GRNs match the current search.'
              : 'No GRNs yet.'
          }
          description={
            q
              ? 'Clear the search to widen the view.'
              : 'Receive your first batch using the “Receive goods” button above.'
          }
        />
      ) : (
        <div className="overflow-hidden border-b border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <SortableTH field="grnNumber" sort={sort} onSort={onSortChange}>
                    GRN no.
                  </SortableTH>
                  <SortableTH field="supplierName" sort={sort} onSort={onSortChange}>
                    Supplier
                  </SortableTH>
                  <th className="px-3 py-2 font-medium">Sup invoice</th>
                  <SortableTH field="receivedAt" sort={sort} onSort={onSortChange}>
                    Received
                  </SortableTH>
                  <th className="px-3 py-2 text-right font-medium">Lines</th>
                  <SortableTH
                    field="totalQuantity"
                    sort={sort}
                    onSort={onSortChange}
                    align="right"
                  >
                    Units
                  </SortableTH>
                  <SortableTH
                    field="totalCost"
                    sort={sort}
                    onSort={onSortChange}
                    align="right"
                  >
                    Cost
                  </SortableTH>
                  <th className="w-10 px-2 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((g, idx) => (
                  <tr
                    key={g.id}
                    className={cn(
                      'border-b align-middle last:border-b-0 transition-colors hover:bg-primary/[0.04]',
                      idx % 2 === 1 && 'bg-muted/15',
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{g.grnNumber}</td>
                    <td className="px-3 py-2">{g.supplierName}</td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                      {g.supplierInvoiceNo}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(g.receivedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                      {g.lineCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                      {g.totalQuantity.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                      {formatCurrency(g.totalCost)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <RowActionsMenu label={`More actions for ${g.grnNumber}`}>
                        <RowActionsItem
                          onClick={() =>
                            navigate(`/inventory/grn/${g.id}/edit`)
                          }
                        >
                          <Pencil /> Edit GRN
                        </RowActionsItem>
                      </RowActionsMenu>
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
