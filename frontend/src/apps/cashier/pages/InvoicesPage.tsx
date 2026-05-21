import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, IndianRupee, Search, ShieldAlert } from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  SortableTH,
  StatusPill,
  type StatusPillProps,
  TablePagination,
} from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  RichSelect,
  RowActionsItem,
  RowActionsMenu,
  type RichSelectOption,
} from '@/components/overlay';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import {
  fetchInvoices,
  fetchInvoicesPaged,
  ShiftLockedBanner,
  useShiftLock,
  type Invoice,
  type InvoiceStatus,
} from '@/features/billing';
import { formatCurrency } from '@/utils/formatCurrency';
import { isoDate } from '@/utils/dateRange';
import { DEFAULT_LIMIT } from '@/utils/listQuery';

type StationFilter = 'all' | Invoice['station'];

const stationOptions: { value: StationFilter; label: string }[] = [
  { value: 'all',        label: 'All counters' },
  { value: 'front_desk', label: 'Front desk' },
  { value: 'billing',    label: 'Billing' },
  { value: 'lab',        label: 'Lab' },
  { value: 'radiology',  label: 'Radiology' },
  { value: 'pharmacy',   label: 'Pharmacy' },
];

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft:           'Draft',
  billed:          'Billed',
  partially_paid:  'Partial',
  paid:            'Paid',
  cancelled:       'Cancelled',
};

const STATUS_PILL_TONE: Record<InvoiceStatus, StatusPillProps['tone']> = {
  draft:           'neutral',
  billed:          'info',
  partially_paid:  'warning',
  paid:            'success',
  cancelled:       'neutral',
};

/** Statuses where money is owed and the cashier’s primary action is "Take payment". */
const PAYMENT_PENDING: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'billed',
  'partially_paid',
]);

const today = (): string => isoDate(new Date());

/**
 * Cashier's primary station — invoice list following the same unified
 * pattern as OP coordination's queue table:
 *
 *   - Card-wrapped table with soft elevation (Modern Clean spec).
 *   - Status-driven primary CTA per row: `[â‚¹ Take payment]` for invoices
 *     with a balance, navigating to /payment/{opNumber} (the same
 *     dedicated payment page nurses + receptionists use). For walk-in
 *     OTC invoices that have no `opNumber`, falls back to the cashier’s
 *     own InvoiceDetailPage (which carries the same payment panel).
 *   - Kebab for secondary actions (View invoice, View patient).
 *   - No more inline-expand chevron — the dedicated /payment/:opNumber
 *     page is the single take-payment surface across roles.
 */
export function InvoicesPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const station = (params.get('station') as StationFilter) || 'all';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT);
  const sort = params.get('sort') || '-createdAt';

  const [items, setItems] = useState<Invoice[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [allDay, setAllDay] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const shiftLock = useShiftLock();

  const reload = async (): Promise<void> => {
    setLoading(true);
    try {
      const [paged, dayAll] = await Promise.all([
        fetchInvoicesPaged({ station, q, date: today(), page, limit, sort }),
        fetchInvoices({ station, date: today() }),
      ]);
      setItems(paged.rows);
      setTotal(paged.total);
      setAllDay(dayAll);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, q, page, limit, sort]);

  const counterOptions = useMemo<RichSelectOption[]>(() => {
    const countByStation = new Map<string, number>();
    for (const i of allDay) {
      countByStation.set(i.station, (countByStation.get(i.station) ?? 0) + 1);
    }
    return stationOptions.map((o) => ({
      value: o.value,
      name: o.label,
      sublabel: o.value === 'all' ? 'Every counter today' : 'Counter',
      count: o.value === 'all' ? allDay.length : (countByStation.get(o.value) ?? 0),
    }));
  }, [allDay]);

  const setParam = (key: string, value: string): void => {
    const np = new URLSearchParams(params);
    if (value) np.set(key, value);
    else np.delete(key);
    setParams(np, { replace: true });
  };

  /**
   * Primary-CTA destination: opNumber-bound invoices use the cross-role
   * /payment/:opNumber surface so cashier + nurse + receptionist share
   * the same payment page. Walk-in OTC invoices (no opNumber) drop into
   * the cashier’s own InvoiceDetailPage which has the same panel inline.
   */
  const paymentLinkFor = (i: Invoice): string =>
    i.opNumber
      ? `/payment/${encodeURIComponent(i.opNumber)}`
      : `/cashier/invoices/${encodeURIComponent(i.id)}`;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Invoices' }]}
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
            Invoices
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Today's invoices across every counter. Take payment, view, or
            drill into the invoice detail.
          </p>
        </div>
      </header>

      <ShiftLockedBanner lock={shiftLock} />

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {total} {total === 1 ? 'invoice' : 'invoices'}
        </span>
        <div className="flex items-end gap-4">
          <RichSelect
            value={station}
            onChange={(v) => setParam('station', v === 'all' ? '' : v)}
            menuLabel="Filter invoices by counter"
            className="w-64"
            triggerClassName="rounded-none border-x-0 border-t-0 border-b border-hairline shadow-none bg-transparent px-0 focus:ring-0 focus:border-primary"
            options={counterOptions}
          />
          <div className="relative flex items-end">
            <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Invoice, UHID, name, OP…"
              className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading invoices...
        </div>
      ) : items.length === 0 ? (
        <Card elevation="elevated" className="text-center">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <IndianRupee className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium text-foreground">
              {station !== 'all' || q
                ? 'No invoices match the current filters.'
                : 'No invoices today yet.'}
            </p>
            <p className="text-xxs text-muted-foreground">
              {station !== 'all' || q
                ? 'Clear the counter / search filters to widen the view.'
                : 'New invoices will appear here as the day moves.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="overflow-hidden border-b border-hairline bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <SortableTH field="invoiceNumber" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                    Invoice
                  </SortableTH>
                  <SortableTH field="patient.fullName" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                    Patient
                  </SortableTH>
                  <SortableTH field="station" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                    Counter
                  </SortableTH>
                  <th className="px-3 py-2.5 font-medium">Items</th>
                  <SortableTH field="status" sort={sort} onSort={(s) => setParam('sort', s ?? '')}>
                    Status
                  </SortableTH>
                  <SortableTH field="total" sort={sort} onSort={(s) => setParam('sort', s ?? '')} align="right">
                    Amount
                  </SortableTH>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const firstLine = i.lines[0];
                  const extraCount = Math.max(0, i.lines.length - 1);
                  const owesMoney = PAYMENT_PENDING.has(i.status) && i.balance > 0;
                  return (
                    <tr
                      key={i.id}
                      className="border-b align-top transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-3">
                        <div className="font-mono text-sm font-semibold">{i.invoiceNumber}</div>
                        {i.opNumber && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            OP {i.opNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {/* Same typography hierarchy as OP coordination
                            for cross-role consistency: name semibold,
                            metadata muted. */}
                        <div className="space-y-0.5">
                          <div className="text-sm font-semibold leading-tight text-foreground">
                            {i.patient.fullName}
                          </div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {i.patient.uhid}
                          </div>
                          {(i.patient.allergies?.length ?? 0) > 0 && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-danger">
                              <ShieldAlert className="h-3 w-3" /> Allergy
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs capitalize text-muted-foreground">
                        {i.station.replace(/_/g, ' ')}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {firstLine && (
                          <div className="max-w-xs truncate">
                            {firstLine.serviceName}
                            {firstLine.quantity > 1 ? ` × ${firstLine.quantity}` : ''}
                          </div>
                        )}
                        {extraCount > 0 && (
                          <div className="text-muted-foreground">+{extraCount} more</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill
                          tone={STATUS_PILL_TONE[i.status]}
                          size="sm"
                          pulse={owesMoney ? 'breathe' : 'none'}
                        >
                          {STATUS_LABEL[i.status]}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {i.balance > 0 ? 'Balance' : 'Total'}
                        </div>
                        <div
                          className={cn(
                            'font-mono text-base tabular-nums font-semibold',
                            i.balance > 0 && 'text-warning',
                          )}
                        >
                          {formatCurrency(i.balance > 0 ? i.balance : i.total)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {/* Same primary-CTA-plus-kebab pattern as OP
                            coordination — owes-money rows show Take
                            payment; everyone gets the kebab for View
                            invoice / View patient. */}
                        <div className="flex items-center justify-end gap-1.5">
                          {owesMoney && (
                            shiftLock.locked ? (
                              <Button
                                size="sm"
                                disabled
                                title={
                                  shiftLock.reason === 'no_open'
                                    ? 'Shift not opened on this counter yet'
                                    : 'Shift on this counter is closed'
                                }
                              >
                                <IndianRupee /> Take payment
                              </Button>
                            ) : (
                              <Button asChild size="sm">
                                <Link to={paymentLinkFor(i)}>
                                  <IndianRupee /> Take payment
                                </Link>
                              </Button>
                            )
                          )}
                          <RowActionsMenu
                            label={`More actions for invoice ${i.invoiceNumber}`}
                          >
                            <RowActionsItem asChild>
                              <Link to={`/cashier/invoices/${encodeURIComponent(i.id)}`}>
                                <Eye /> View invoice
                              </Link>
                            </RowActionsItem>
                            <RowActionsItem asChild>
                              <Link to={`/patient/${i.patient.uhid}`}>
                                <Eye /> View / edit patient
                              </Link>
                            </RowActionsItem>
                          </RowActionsMenu>
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
