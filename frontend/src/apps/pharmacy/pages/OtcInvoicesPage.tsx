import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, Receipt, Search } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill, TablePagination } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn } from '@/utils/cn';
import { useOtcSalesStore, type OtcSaleRecord } from '@/features/pharmacy';
import { formatCurrency } from '@/utils/formatCurrency';
import { PharmacyQueueTabs } from '../components/PharmacyQueueTabs';
import { PrintableOtcReceipt } from '../components/PrintableOtcReceipt';

/**
 * History of completed OTC counter sales — pharmacist’s "what did I
 * sell this shift" surface. OTC sales never flow into the cashier’s
 * prescription-tied invoice list (no patient record, no op visit), so
 * pharmacy owns its own list view here.
 *
 * `?sale=<saleNumber>` query param auto-expands a specific row — used
 * by the post-sale "Open OTC invoices" CTA on the counter screen.
 */
const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function OtcInvoicesPage(): JSX.Element {
  const sales = useOtcSalesStore((s) => s.sales);
  const listSales = useOtcSalesStore((s) => s.listSales);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const focusedSale = params.get('sale') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || 20);

  // Auto-expand the row matching the `?sale=` query (post-sale handoff
  // from the counter screen). Pharmacist can collapse / expand others
  // from there.
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    focusedSale ? new Set([focusedSale]) : new Set(),
  );

  const toggle = (saleNumber: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(saleNumber)) next.delete(saleNumber);
      else next.add(saleNumber);
      return next;
    });
  };

  const filtered = useMemo<OtcSaleRecord[]>(() => listSales(q), [listSales, q, sales]);

  /** Client-side pagination — OTC sales are stored locally and are
   *  unlikely to exceed a few hundred per terminal, so slicing client-
   *  side is fine. */
  const totalSales = filtered.length;
  const lastPage = Math.max(1, Math.ceil(totalSales / limit));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * limit;
  const visibleSales = filtered.slice(start, start + limit);

  const setSearch = (value: string): void => {
    const np = new URLSearchParams(params);
    if (value) np.set('q', value);
    else np.delete('q');
    // Clear the `?sale=` focus marker when the user starts searching —
    // a fresh search shouldn’t keep an unrelated row expanded.
    np.delete('sale');
    setParams(np, { replace: true });
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'OTC invoices' }]}
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
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <Receipt className="h-4 w-4 text-primary" />
            OTC sale
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Counter-sale receipts kept locally on this terminal. Click{' '}
            <span className="font-medium text-foreground">New OTC sale</span> to
            ring up a fresh transaction.
          </p>
        </div>
        <Button asChild>
          <Link to="/pharmacy/counter">
            <Plus /> New OTC sale
          </Link>
        </Button>
      </header>

      {/* Shared tab strip across the three pharmacist surfaces — Rx
          queue / OTC invoices (this page) / Refill — so they read as
          one tabbed counter. */}
      <PharmacyQueueTabs />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by OTC number, customer name, phone, or medicine..."
          className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {sales.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No OTC sales yet."
          description="Counter-sale receipts will appear here as soon as a sale is recorded."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No OTC sales match the current search."
          description="Clear the search to widen the view."
        />
      ) : (
        <Card padding="none" elevation="elevated" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-3 py-2 font-medium">OTC #</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Items</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleSales.map((sale, idx) => {
                  const isExpanded = expanded.has(sale.saleNumber);
                  const hasShortfall = (sale.shortfalls?.length ?? 0) > 0;
                  return (
                    <>
                      <tr
                        key={sale.saleNumber}
                        className={cn(
                          'border-b align-middle transition-colors hover:bg-primary/[0.05]',
                          idx % 2 === 1 && !isExpanded && 'bg-muted/20',
                        )}
                      >
                        <td className="px-2 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggle(sale.saleNumber)}
                            aria-label={
                              isExpanded ? 'Collapse details' : 'Expand details'
                            }
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-sm font-semibold tabular-nums">
                            {sale.saleNumber}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {formatDateTime(sale.soldAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          {sale.customerName ? (
                            <div className="flex flex-col leading-tight">
                              <span className="text-sm">{sale.customerName}</span>
                              {sale.customerPhone && (
                                <span className="font-mono text-xxs text-muted-foreground tabular-nums">
                                  {sale.customerPhone}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">
                              Anonymous
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums">
                          {sale.lines.length}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold tabular-nums">
                          {formatCurrency(sale.invoiceTotal)}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={hasShortfall ? 'warning' : 'success'} size="sm">
                            {hasShortfall ? 'Partial' : 'Complete'}
                          </StatusPill>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b bg-muted/10">
                          <td colSpan={7} className="px-4 py-3">
                            <OtcSaleDetail sale={sale} />
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
            total={totalSales}
            page={safePage}
            limit={limit}
            onPageChange={(p) => {
              const np = new URLSearchParams(params);
              np.set('page', String(p));
              setParams(np, { replace: true });
            }}
            onLimitChange={(l) => {
              const np = new URLSearchParams(params);
              np.set('limit', String(l));
              np.set('page', '1');
              setParams(np, { replace: true });
            }}
          />
        </Card>
      )}
    </div>
  );
}

interface OtcSaleDetailProps {
  sale: OtcSaleRecord;
}

function OtcSaleDetail({ sale }: OtcSaleDetailProps): JSX.Element {
  const subtotal = sale.lines.reduce((s, l) => s + l.lineTotal, 0);
  // Mock backend already returns the post-GST total — recompute the
  // GST line for the receipt breakdown.
  const gst = sale.invoiceTotal - subtotal;
  return (
    <>
      {/* Print-only receipt — hidden on screen, masked-in by the
          global print CSS in globals.css when window.print() fires.
          The printable is rendered inside the expanded row so the
          per-sale "Print receipt" button below prints THIS receipt,
          not a screenshot of the table chrome. */}
      <PrintableOtcReceipt sale={sale} />
      <SaleDetailBody sale={sale} subtotal={subtotal} gst={gst} />
    </>
  );
}

function SaleDetailBody({
  sale,
  subtotal,
  gst,
}: {
  sale: OtcSaleRecord;
  subtotal: number;
  gst: number;
}): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <div className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
          Lines
        </div>
        <ul className="mt-1 flex flex-col divide-y rounded-md border bg-card">
          {sale.lines.map((l) => (
            <li
              key={l.medicineId}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {l.medicineName}{' '}
                  <span className="text-xs text-muted-foreground">{l.strength}</span>
                </div>
                <div className="text-xxs text-muted-foreground">
                  {formatCurrency(l.unitPrice)}/unit · GST {l.gstPct}%
                </div>
              </div>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                × {l.quantity}
              </span>
              <span className="w-24 text-right font-mono text-sm tabular-nums">
                {formatCurrency(l.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        {sale.shortfalls && sale.shortfalls.length > 0 && (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            <p className="mb-1 font-semibold text-warning">Short-stocked lines:</p>
            <ul className="list-disc pl-4">
              {sale.shortfalls.map((s) => (
                <li key={s.medicineId}>
                  {s.medicineName} — fulfilled {s.fulfilled} of {s.requested}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card p-3 text-sm">
        <div className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
          Totals
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>GST</span>
            <span className="font-mono tabular-nums">{formatCurrency(gst)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(sale.invoiceTotal)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.print()}
          >
            Print receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
