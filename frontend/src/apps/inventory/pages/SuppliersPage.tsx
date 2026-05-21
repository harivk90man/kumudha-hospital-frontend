import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Truck,
} from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  SortableTH,
  StatusPill,
  TablePagination,
} from '@/components/data-display';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { Button } from '@/components/ui/button';
import { RowActionsItem, RowActionsMenu } from '@/components/overlay';
import { fetchSuppliers, type Supplier } from '@/features/inventory';
import { formatCurrency } from '@/utils/formatCurrency';
import { sortRows } from '@/utils/listQuery';
import { cn } from '@/utils/cn';

const DEFAULT_PAGE_SIZE = 25;

const SUPPLIER_SORT_FIELDS = ['name', 'gstin', 'outstandingBalance'] as const;

/**
 * Supplier directory — dense enterprise table with row-level expand
 * for the long-form fields (address, notes). Pagination keeps the
 * directory usable as the supplier roster grows past a single page.
 */
export function SuppliersPage(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_PAGE_SIZE);
  const sort = params.get('sort') ?? '';

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchSuppliers()
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

  // Sort first, then slice. Client-side because the mock returns the
  // full set; the SortableTH wire format matches the planned backend
  // contract so this collapses to a `?sort=` round-trip later.
  const sorted = useMemo(
    () => sortRows(items, sort, SUPPLIER_SORT_FIELDS),
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

  const setParam = (key: string, value: string | null): void => {
    const np = new URLSearchParams(params);
    if (value === null || value === '') np.delete(key);
    else np.set(key, value);
    setParams(np, { replace: true });
  };

  const onSortChange = (next: string | undefined): void => {
    const np = new URLSearchParams(params);
    if (!next) np.delete('sort');
    else np.set('sort', next);
    // Sort change resets to page 1 — otherwise the user lands on
    // "page 5 of 1" after re-ordering a long list.
    np.set('page', '1');
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

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Suppliers' }]}
        homeTo="/inventory/medicines"
        homeLabel="Inventory"
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Home/landing — LiveIndicator band substitutes the back-link
              slot so the title anchors at the same y as on every other
              page. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live suppliers
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Suppliers
          </h1>
          <p className="text-[13px] text-muted-foreground">
            GST-registered vendors. Outstanding payable is what we owe each
            supplier; expand a row for full address and notes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button">
            <Link to="/inventory/suppliers/new">
              <Plus /> Add supplier
            </Link>
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading suppliers...
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={Truck}
          title="No suppliers yet."
          description="Add a supplier to start receiving goods against their invoices."
        />
      ) : (
        <>
          <div className="flex items-end border-t border-hairline pt-3">
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {total} {total === 1 ? 'supplier' : 'suppliers'}
            </span>
          </div>
          <div className="overflow-hidden border-b border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-2 py-2"></th>
                  <SortableTH field="name" sort={sort} onSort={onSortChange}>
                    Supplier
                  </SortableTH>
                  <SortableTH field="gstin" sort={sort} onSort={onSortChange}>
                    GSTIN
                  </SortableTH>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <SortableTH
                    field="outstandingBalance"
                    sort={sort}
                    onSort={onSortChange}
                    align="right"
                  >
                    Outstanding
                  </SortableTH>
                  <th className="w-10 px-2 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s, idx) => {
                  const isExpanded = expanded.has(s.id);
                  const hasExpandable = Boolean(s.address || s.email);
                  const owesMoney = (s.outstandingBalance ?? 0) > 0;
                  return (
                    <Fragment key={s.id}>
                      <tr
                        className={cn(
                          'border-b align-middle transition-colors hover:bg-primary/[0.04]',
                          !isExpanded && idx % 2 === 1 && 'bg-muted/15',
                          isExpanded && 'bg-muted/25',
                        )}
                      >
                        <td className="px-2 py-2 text-center">
                          {hasExpandable && (
                            <button
                              type="button"
                              onClick={() => toggle(s.id)}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                          {s.gstin ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {s.contactPerson ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                          {s.phone ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill tone={s.isActive ? 'success' : 'neutral'} size="sm">
                            {s.isActive ? 'Active' : 'Inactive'}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {typeof s.outstandingBalance === 'number' ? (
                            <span
                              className={cn(
                                'font-mono text-sm font-medium tabular-nums',
                                owesMoney && 'text-warning',
                                s.outstandingBalance < 0 && 'text-success',
                              )}
                            >
                              {formatCurrency(s.outstandingBalance)}
                            </span>
                          ) : (
                            <span className="text-xxs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <RowActionsMenu label={`More actions for ${s.name}`}>
                            <RowActionsItem
                              onClick={() =>
                                navigate(`/inventory/suppliers/${s.id}/edit`)
                              }
                            >
                              <Pencil /> Edit supplier
                            </RowActionsItem>
                          </RowActionsMenu>
                        </td>
                      </tr>
                      {isExpanded && hasExpandable && (
                        <tr className="border-b bg-muted/5">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="grid gap-3 text-xs md:grid-cols-2">
                              {s.address && (
                                <div>
                                  <div className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
                                    Address
                                  </div>
                                  <div className="mt-1 inline-flex items-start gap-1.5 text-foreground">
                                    <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                                    <span>{s.address}</span>
                                  </div>
                                </div>
                              )}
                              {s.email && (
                                <div>
                                  <div className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
                                    Email
                                  </div>
                                  <div className="mt-1 inline-flex items-center gap-1.5 text-foreground">
                                    <Mail className="h-3 w-3 text-muted-foreground" />
                                    <a
                                      href={`mailto:${s.email}`}
                                      className="font-mono hover:underline"
                                    >
                                      {s.email}
                                    </a>
                                  </div>
                                </div>
                              )}
                              {s.phone && (
                                <div>
                                  <div className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
                                    Phone
                                  </div>
                                  <div className="mt-1 inline-flex items-center gap-1.5 text-foreground">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    <a
                                      href={`tel:${s.phone}`}
                                      className="font-mono tabular-nums hover:underline"
                                    >
                                      {s.phone}
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
        </>
      )}
    </div>
  );
}
