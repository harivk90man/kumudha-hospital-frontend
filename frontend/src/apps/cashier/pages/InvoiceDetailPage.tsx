import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Breadcrumb, StatusPill, type StatusPillProps } from '@/components/data-display';
import { Card, CardHeader, CardTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { FormErrorContainer } from '@/components/form';
import { Spinner } from '@/components/feedback/Spinner';
import {
  fetchInvoice,
  type Invoice,
  type InvoiceStatus,
} from '@/features/billing';
import { formatCurrency } from '@/utils/formatCurrency';
import { cn } from '@/utils/cn';
import { InvoicePaymentPanel } from '@/features/billing';

const statusTone: Record<InvoiceStatus, StatusPillProps['tone']> = {
  draft:           'neutral',
  billed:          'info',
  partially_paid:  'warning',
  paid:            'success',
  cancelled:       'neutral',
};

const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'Draft', billed: 'Billed', partially_paid: 'Partial',
  paid: 'Paid', cancelled: 'Cancelled',
};

/**
 * Full-page invoice view. Still mounted at `/cashier/invoices/:id` for
 * deep-links and back-compat; the cashier's primary surface is now the
 * Invoices list with inline-expand payment (via `InvoicePaymentPanel`).
 */
export function InvoiceDetailPage(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async (): Promise<void> => {
    setLoading(true);
    try {
      const inv = await fetchInvoice(id);
      setInvoice(inv);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Spinner size="sm" className="mr-2" /> Loading invoice...
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-sm text-muted-foreground">
        <span>Invoice not found.</span>
        <Button asChild variant="outline">
          <Link to="/cashier/invoices">
            <ArrowLeft /> Back to invoices
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[
          { label: 'Invoices', to: '/cashier/invoices' },
          { label: invoice.invoiceNumber },
        ]}
        homeTo="/cashier/invoices"
        homeLabel="Cashier home"
      />

      {/* Sub-page header — ghost "Back to invoices" link in the back-link
          slot above the title, patient name as the title, mono metadata
          line for invoice context. Print is the only outward action so
          it sits alone on the right; the status pill rides next to the
          title because it's identity metadata, not an action. */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/cashier/invoices')}
            className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft /> Back to invoices
          </Button>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            {invoice.patient.fullName}
            <StatusPill tone={statusTone[invoice.status]} size="sm">
              {statusLabel[invoice.status]}
            </StatusPill>
          </h1>
          <p className="font-mono text-xxs text-muted-foreground tabular-nums">
            {invoice.invoiceNumber} · {invoice.patient.uhid}
            {invoice.opNumber ? ` · OP ${invoice.opNumber}` : ''}
            <span className="font-sans"> · </span>
            <span className="font-sans capitalize">
              {invoice.station.replace(/_/g, ' ')}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </header>

      {error && (
        <FormErrorContainer
          title="Couldn’t load invoice."
          description={error}
          onRetry={() => void reload()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invoice {invoice.invoiceNumber}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Created {new Date(invoice.createdAt).toLocaleString()}
              </p>
            </div>
          </CardHeader>

          <table className="w-full border-collapse text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="py-2">Service</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Price</th>
                <th className="py-2 text-right">GST</th>
                <th className="py-2 text-right">Line</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0">
                  <td className="py-2">
                    <div className="font-medium">{l.serviceName}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {l.serviceCode}
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCurrency(l.unitPrice)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{l.gstPct}%</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatCurrency(l.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr>
                <td colSpan={4} className="pt-3 text-right text-muted-foreground">
                  Subtotal
                </td>
                <td className="pt-3 text-right tabular-nums">
                  {formatCurrency(invoice.subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="text-right text-muted-foreground">
                  Tax
                </td>
                <td className="text-right tabular-nums">
                  {formatCurrency(invoice.tax)}
                </td>
              </tr>
              <tr className="border-t">
                <td colSpan={4} className="pt-2 text-right font-semibold">
                  Total
                </td>
                <td className="pt-2 text-right tabular-nums font-semibold">
                  {formatCurrency(invoice.total)}
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="text-right text-muted-foreground">
                  Balance
                </td>
                <td
                  className={cn(
                    'text-right tabular-nums font-medium',
                    invoice.balance > 0 ? 'text-warning' : 'text-success',
                  )}
                >
                  {formatCurrency(invoice.balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>

        <InvoicePaymentPanel invoice={invoice} onUpdated={reload} />
      </div>
    </div>
  );
}
