import { resolveLineDiscount } from '../billingApi';
import type { Invoice, InvoiceLine, LineDiscount } from '../billingTypes';
import { formatCurrency } from '@/utils/formatCurrency';

/**
 * Print-only invoice layout. Hidden on screen (`hidden print:block`),
 * visible only when the browser is printing — paired with the global
 * print rules in `globals.css` that mask everything else so the sheet
 * coming out of the printer is just the invoice, not the editable
 * table + payment panel + sidebar.
 *
 * Picks up live edits from the parent's `rows` state when supplied, so
 * the cashier sees on paper exactly what they're about to charge — not
 * the unsaved-on-server snapshot.
 */
export interface PrintableInvoiceRow {
  id: string;
  source: InvoiceLine;
  quantity: number;
  discountKind: 'pct' | 'amt';
  discountValue: number;
  notes: string;
}

interface PrintableInvoiceProps {
  invoice: Invoice;
  /** Optional live-edit rows; falls back to `invoice.lines`. */
  rows?: PrintableInvoiceRow[];
}

const ROW_DISCOUNT = (r: PrintableInvoiceRow): LineDiscount | undefined =>
  r.discountValue > 0 ? { kind: r.discountKind, value: r.discountValue } : undefined;

interface DerivedLine {
  serviceName: string;
  serviceCode: string;
  unitPrice: number;
  quantity: number;
  gstPct: number;
  notes?: string;
  gross: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
}

const deriveFromRow = (r: PrintableInvoiceRow): DerivedLine => {
  const gross = r.source.unitPrice * r.quantity;
  const discount = resolveLineDiscount(ROW_DISCOUNT(r), gross);
  const net = gross - discount;
  const tax = (net * r.source.gstPct) / 100;
  return {
    serviceName: r.source.serviceName,
    serviceCode: r.source.serviceCode,
    unitPrice: r.source.unitPrice,
    quantity: r.quantity,
    gstPct: r.source.gstPct,
    notes: r.notes || undefined,
    gross,
    discount,
    net,
    tax,
    total: net + tax,
  };
};

const deriveFromLine = (l: InvoiceLine): DerivedLine => {
  const gross = l.unitPrice * l.quantity;
  const discount = resolveLineDiscount(l.lineDiscount, gross);
  const net = gross - discount;
  const tax = (net * l.gstPct) / 100;
  return {
    serviceName: l.serviceName,
    serviceCode: l.serviceCode,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
    gstPct: l.gstPct,
    notes: l.notes,
    gross,
    discount,
    net,
    tax,
    total: net + tax,
  };
};

export function PrintableInvoice({
  invoice,
  rows,
}: PrintableInvoiceProps): JSX.Element {
  const derived: DerivedLine[] = rows
    ? rows.map(deriveFromRow)
    : invoice.lines.map(deriveFromLine);

  const subtotal = derived.reduce((s, l) => s + l.net, 0);
  const discountTotal = derived.reduce((s, l) => s + l.discount, 0);
  const taxTotal = derived.reduce((s, l) => s + l.tax, 0);
  const grandTotal = subtotal + taxTotal;
  const created = new Date(invoice.createdAt);
  const address = invoice.patient.address
    ? [
        invoice.patient.address.line1,
        invoice.patient.address.line2,
        invoice.patient.address.city,
        invoice.patient.address.state,
        invoice.patient.address.pincode,
      ]
        .filter((s): s is string => Boolean(s && s.trim()))
        .join(', ')
    : '';

  return (
    <div className="printable-invoice hidden print:block" style={{ fontFamily: 'system-ui, sans-serif', color: '#000' }}>
      {/* ---- Letterhead ---- */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '8mm', marginBottom: '6mm' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20pt', fontWeight: 700, letterSpacing: '-0.01em' }}>
            Kumudha Hospital
          </h1>
          <div style={{ fontSize: '9pt', marginTop: '1mm', color: '#444' }}>
            Chennai · Tamil Nadu
          </div>
          <div style={{ fontSize: '9pt', color: '#444' }}>
            GSTIN 33AAACK1234B1ZX · +91 44 4123 0000
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11pt', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Tax Invoice
          </div>
          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10pt', marginTop: '2mm' }}>
            {invoice.invoiceNumber}
          </div>
          <div style={{ fontSize: '9pt', color: '#444', marginTop: '1mm' }}>
            {created.toLocaleString()}
          </div>
        </div>
      </header>

      {/* ---- Patient block ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6mm', marginBottom: '6mm', fontSize: '10pt' }}>
        <div>
          <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666' }}>
            Billed to
          </div>
          <div style={{ fontWeight: 600, fontSize: '11pt', marginTop: '1.5mm' }}>
            {invoice.patient.fullName}
          </div>
          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '9pt', color: '#444' }}>
            UHID {invoice.patient.uhid}
          </div>
          {invoice.patient.mobile && (
            <div style={{ fontSize: '9pt', color: '#444' }}>{invoice.patient.mobile}</div>
          )}
          {address && (
            <div style={{ fontSize: '9pt', color: '#444', marginTop: '1mm' }}>{address}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666' }}>
            Visit
          </div>
          {invoice.opNumber && (
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10pt', marginTop: '1.5mm' }}>
              OP {invoice.opNumber}
            </div>
          )}
          <div style={{ fontSize: '9pt', color: '#444', marginTop: '1mm' }}>
            Station: {invoice.station.replace(/_/g, ' ')}
          </div>
          <div style={{ fontSize: '9pt', color: '#444' }}>
            Patient: {invoice.patient.gender.toUpperCase()} · {invoice.patient.ageYears}y
            {invoice.patient.bloodGroup ? ` · ${invoice.patient.bloodGroup}` : ''}
          </div>
        </div>
      </section>

      {/* ---- Line items ---- */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
        <thead>
          <tr style={{ borderBottom: '1.5px solid #000', textAlign: 'left' }}>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Service</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Qty</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Rate</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Discount</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Taxable</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>GST</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {derived.map((l, i) => (
            <tr key={`${l.serviceCode}-${i}`} style={{ borderBottom: '0.5px solid #ccc', verticalAlign: 'top' }}>
              <td style={{ padding: '2mm 1mm', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '9pt', color: '#666' }}>
                {i + 1}
              </td>
              <td style={{ padding: '2mm 1mm' }}>
                <div style={{ fontWeight: 500 }}>{l.serviceName}</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '8pt', color: '#666' }}>
                  {l.serviceCode}
                </div>
                {l.notes && (
                  <div style={{ fontSize: '8pt', color: '#666', fontStyle: 'italic', marginTop: '0.5mm' }}>
                    {l.notes}
                  </div>
                )}
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.quantity}</td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(l.unitPrice)}
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {l.discount > 0 ? `− ${formatCurrency(l.discount)}` : '—'}
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(l.net)}
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(l.tax)}
                <div style={{ fontSize: '7pt', color: '#666' }}>{l.gstPct}%</div>
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {formatCurrency(l.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---- Totals ---- */}
      <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6mm' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '10pt', minWidth: '70mm' }}>
          <tbody>
            <tr>
              <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', color: '#444' }}>Subtotal</td>
              <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: '30mm' }}>
                {formatCurrency(subtotal + discountTotal)}
              </td>
            </tr>
            {discountTotal > 0 && (
              <tr>
                <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', color: '#444' }}>Discount</td>
                <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  − {formatCurrency(discountTotal)}
                </td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', color: '#444' }}>Taxable</td>
              <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(subtotal)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', color: '#444' }}>GST</td>
              <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(taxTotal)}
              </td>
            </tr>
            <tr style={{ borderTop: '1.5px solid #000' }}>
              <td style={{ padding: '2mm 4mm 1mm 0', textAlign: 'right', fontWeight: 700, fontSize: '11pt' }}>
                Total
              </td>
              <td style={{ padding: '2mm 0 1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '11pt' }}>
                {formatCurrency(grandTotal)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', color: '#444' }}>Paid</td>
              <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(invoice.total - invoice.balance)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', fontWeight: 600 }}>Balance due</td>
              <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {formatCurrency(invoice.balance)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---- Footer ---- */}
      <footer style={{ marginTop: '14mm', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10mm', fontSize: '9pt', color: '#444' }}>
        <div>
          <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666' }}>
            Terms
          </div>
          <ul style={{ paddingLeft: '4mm', marginTop: '2mm', lineHeight: 1.5 }}>
            <li>This is a computer-generated invoice.</li>
            <li>GST is charged on the post-discount taxable amount.</li>
            <li>Refunds processed only against the original payment instrument.</li>
          </ul>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ borderTop: '0.5px solid #000', paddingTop: '2mm', display: 'inline-block', minWidth: '60mm', marginLeft: 'auto' }}>
            Authorised signatory
          </div>
        </div>
      </footer>
    </div>
  );
}
