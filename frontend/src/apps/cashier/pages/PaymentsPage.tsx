import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Receipt, Search } from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  SortableTH,
  StatusPill,
  TablePagination,
} from '@/components/data-display';
import { Card, CardLabel } from '@/components/layout';
import { Spinner } from '@/components/feedback/Spinner';
import {
  fetchPayments,
  fetchPaymentsPaged,
  type Payment,
  type PaymentMethod,
} from '@/features/billing';
import { formatCurrency } from '@/utils/formatCurrency';
import { isoDate } from '@/utils/dateRange';
import { cn } from '@/utils/cn';
import { DEFAULT_LIMIT } from '@/utils/listQuery';

type MethodFilter = 'all' | PaymentMethod;

const methodOptions: { value: MethodFilter; label: string }[] = [
  { value: 'all',        label: 'All' },
  { value: 'cash',       label: 'Cash' },
  { value: 'upi',        label: 'UPI' },
  { value: 'card',       label: 'Card' },
  { value: 'netbanking', label: 'Net banking' },
  { value: 'insurance',  label: 'Insurance' },
];

// Local calendar date so "today" matches the user’s perception.
const today = (): string => isoDate(new Date());

export function PaymentsPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const method = (params.get('method') as MethodFilter) || 'all';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT);
  const sort = params.get('sort') || '-receivedAt';

  const [items, setItems] = useState<Payment[]>([]);
  const [total, setTotal] = useState<number>(0);
  // Totals strip needs the FULL filtered set (across all pages) — separate
  // unpaged fetch so gross / refunds / net stay correct as pages change.
  const [allFiltered, setAllFiltered] = useState<Payment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchPaymentsPaged({ method, q, date: today(), page, limit, sort }),
      fetchPayments({ method, q, date: today() }),
    ])
      .then(([paged, all]) => {
        if (alive) {
          setItems(paged.rows);
          setTotal(paged.total);
          setAllFiltered(all);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [method, q, page, limit, sort]);

  const setParam = (key: string, value: string): void => {
    const np = new URLSearchParams(params);
    if (value) np.set(key, value);
    else np.delete(key);
    setParams(np, { replace: true });
  };

  const totals = allFiltered.reduce(
    (acc, p) => {
      if (p.status !== 'succeeded') return acc;
      acc.gross += Math.max(p.amount, 0);
      acc.refunds += Math.min(p.amount, 0);
      acc.net += p.amount;
      return acc;
    },
    { gross: 0, refunds: 0, net: 0 },
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Payments' }]}
        homeTo="/cashier/invoices"
        homeLabel="Cashier home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Home/landing page — no "back" link. Substitute the equivalent
              h-8 band carrying the live-counter indicator so title +
              right-side CTAs anchor at the same y as on every sub-page. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live counter
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Today's payments
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Daily collection ledger across every counter. Refunds appear as
            negative-amount rows.
          </p>
        </div>
      </header>

      {/* Daily totals strip */}
      <section className="grid gap-3 md:grid-cols-3">
        <Card padding="sm">
          <CardLabel>Gross collection</CardLabel>
          <span className="font-mono text-2xl tabular-nums font-semibold text-success">
            {formatCurrency(totals.gross)}
          </span>
        </Card>
        <Card padding="sm">
          <CardLabel>Refunds</CardLabel>
          <span className="font-mono text-2xl tabular-nums font-semibold text-danger">
            {formatCurrency(totals.refunds)}
          </span>
        </Card>
        <Card padding="sm">
          <CardLabel>Net</CardLabel>
          <span className="font-mono text-2xl tabular-nums font-semibold">
            {formatCurrency(totals.net)}
          </span>
        </Card>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {total} {total === 1 ? 'payment' : 'payments'}
        </span>
        <div className="flex items-end gap-4">
          <select
            value={method}
            onChange={(e) => setParam('method', e.target.value)}
            className="rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-0 pr-6 text-sm font-medium text-foreground focus:outline-none focus:border-primary"
          >
            {methodOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="relative flex items-end">
            <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Invoice, UHID, name, ref…"
              className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading payments...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No payments match these filters.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden border-b border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <SortableTH field="receivedAt" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                  Time
                </SortableTH>
                <SortableTH field="patient.fullName" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                  Patient
                </SortableTH>
                <SortableTH field="invoiceNumber" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                  Invoice
                </SortableTH>
                <SortableTH field="method" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                  Method
                </SortableTH>
                <SortableTH field="amount" sort={sort} onSort={(s) => setParam('sort', s ?? '')} align="right">
                  Amount
                </SortableTH>
                <th className="px-3 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="border-b align-top last:border-b-0 transition-colors hover:bg-muted/30"
                >
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {new Date(p.receivedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{p.patient.fullName}</div>
                    {(p.referenceNo || p.notes) && (
                      <div className="text-xs text-muted-foreground">
                        {p.referenceNo}
                        {p.referenceNo && p.notes ? ' · ' : ''}
                        {p.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      to={`/cashier/invoices/${p.invoiceId}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {p.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill
                      tone={p.status === 'refunded' ? 'neutral' : p.amount < 0 ? 'danger' : 'success'}
                      size="sm"
                    >
                      {p.status === 'refunded' ? 'Refunded' : p.amount < 0 ? 'Refund' : p.method}
                    </StatusPill>
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3 text-right font-mono text-sm tabular-nums font-semibold',
                      p.amount < 0 && 'text-danger',
                    )}
                  >
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      to={`/cashier/invoices/${p.invoiceId}`}
                      aria-label="Open invoice"
                      className="inline-flex text-muted-foreground hover:text-foreground"
                    >
                      <Receipt className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        </div>
      )}
    </div>
  );
}
