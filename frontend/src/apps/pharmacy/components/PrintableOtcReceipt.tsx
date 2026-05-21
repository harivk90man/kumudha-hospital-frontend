import type { OtcSaleRecord } from '@/features/pharmacy';
import { formatCurrency } from '@/utils/formatCurrency';

/**
 * Print-only OTC counter-sale receipt. Hidden on screen
 * (`hidden print:block`); the global print rules in `globals.css`
 * mask everything else when `window.print()` fires so the printer
 * receives a clean receipt — not a screenshot of the OTC invoices
 * table + page chrome.
 *
 * Layout mirrors the PrintableInvoice in billing — letterhead, ref
 * number, lines, totals, signature — sized for a standard 80mm
 * thermal roll or A4 (the print stylesheet uses 12mm @page margins so
 * either output is legible).
 */
export function PrintableOtcReceipt({
  sale,
}: {
  sale: OtcSaleRecord;
}): JSX.Element {
  const created = new Date(sale.soldAt);
  const subtotal = sale.lines.reduce((s, l) => s + l.lineTotal, 0);
  const gst = sale.invoiceTotal - subtotal;
  return (
    <div
      className="printable hidden print:block"
      style={{ fontFamily: 'system-ui, sans-serif', color: '#000' }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '2px solid #000',
          paddingBottom: '8mm',
          marginBottom: '6mm',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '20pt',
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}
          >
            Kumudha Hospital
          </h1>
          <div style={{ fontSize: '9pt', marginTop: '1mm', color: '#444' }}>
            Pharmacy counter · OTC sale
          </div>
          <div style={{ fontSize: '9pt', color: '#444' }}>
            GSTIN 33AAACK1234B1ZX · +91 44 4123 0000
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '11pt',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Receipt
          </div>
          <div
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '10pt',
              marginTop: '2mm',
            }}
          >
            {sale.saleNumber}
          </div>
          <div style={{ fontSize: '9pt', color: '#444', marginTop: '1mm' }}>
            {created.toLocaleString()}
          </div>
        </div>
      </header>

      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}
      >
        <thead>
          <tr style={{ borderBottom: '1.5px solid #000', textAlign: 'left' }}>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Medicine</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Qty</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Unit</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>GST</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((l, i) => (
            <tr
              key={`${l.medicineId}-${i}`}
              style={{ borderBottom: '0.5px solid #ccc', verticalAlign: 'top' }}
            >
              <td style={{ padding: '2mm 1mm', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '9pt', color: '#666' }}>
                {i + 1}
              </td>
              <td style={{ padding: '2mm 1mm' }}>
                <div style={{ fontWeight: 500 }}>
                  {l.medicineName} <span style={{ color: '#666' }}>{l.strength}</span>
                </div>
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {l.quantity}
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(l.unitPrice)}
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {l.gstPct}%
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {formatCurrency(l.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6mm' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '10pt', minWidth: '70mm' }}>
          <tbody>
            <tr>
              <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', color: '#444' }}>Subtotal</td>
              <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: '30mm' }}>
                {formatCurrency(subtotal)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', color: '#444' }}>GST</td>
              <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(gst)}
              </td>
            </tr>
            <tr style={{ borderTop: '1.5px solid #000' }}>
              <td style={{ padding: '2mm 4mm 1mm 0', textAlign: 'right', fontWeight: 700, fontSize: '11pt' }}>
                Total
              </td>
              <td style={{ padding: '2mm 0 1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '11pt' }}>
                {formatCurrency(sale.invoiceTotal)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '1mm 4mm 1mm 0', textAlign: 'right', color: '#444' }}>Paid</td>
              <td style={{ padding: '1mm 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(sale.invoiceTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {sale.shortfalls && sale.shortfalls.length > 0 && (
        <section
          style={{
            marginTop: '6mm',
            paddingTop: '3mm',
            borderTop: '0.5px solid #999',
            fontSize: '9pt',
            color: '#666',
          }}
        >
          <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Short-stocked lines
          </div>
          <ul style={{ paddingLeft: '4mm', marginTop: '1mm' }}>
            {sale.shortfalls.map((s) => (
              <li key={s.medicineId}>
                {s.medicineName} — fulfilled {s.fulfilled} of {s.requested}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer
        style={{
          marginTop: '14mm',
          fontSize: '9pt',
          color: '#444',
          textAlign: 'center',
        }}
      >
        Thank you for your purchase. Computer-generated receipt.
      </footer>
    </div>
  );
}
