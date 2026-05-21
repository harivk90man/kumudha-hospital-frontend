import type { RxQueueEntry } from '@/features/pharmacy';
import { formatCurrency } from '@/utils/formatCurrency';

/**
 * Print-only Rx dispensing receipt. Hidden on screen
 * (`hidden print:block`); the global print rules in `globals.css`
 * mask everything else when `window.print()` fires.
 *
 * Used on the RxDispensePage's read-only summary so the pharmacist
 * can hand the patient a paper receipt after Charge + dispense.
 */
export function PrintableRxReceipt({ rx }: { rx: RxQueueEntry }): JSX.Element {
  const subtotal = rx.items.reduce(
    (s, l) => s + l.unitPrice * l.quantityPrescribed,
    0,
  );
  const gst = rx.items.reduce(
    (s, l) =>
      s + (l.unitPrice * l.quantityPrescribed * l.gstPct) / 100,
    0,
  );
  const total = subtotal + gst;
  const dispensed = rx.dispensedAt ? new Date(rx.dispensedAt) : new Date();

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
            Pharmacy counter · Prescription dispense
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
            {rx.prescriptionNumber}
          </div>
          <div style={{ fontSize: '9pt', color: '#444', marginTop: '1mm' }}>
            {dispensed.toLocaleString()}
          </div>
        </div>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6mm',
          marginBottom: '6mm',
          fontSize: '10pt',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '8pt',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#666',
            }}
          >
            Patient
          </div>
          <div style={{ fontWeight: 600, fontSize: '11pt', marginTop: '1.5mm' }}>
            {rx.patient.fullName}
          </div>
          <div
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '9pt',
              color: '#444',
            }}
          >
            UHID {rx.patient.uhid}
          </div>
          {rx.patient.mobile && (
            <div style={{ fontSize: '9pt', color: '#444' }}>{rx.patient.mobile}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '8pt',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#666',
            }}
          >
            Visit
          </div>
          <div
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '10pt',
              marginTop: '1.5mm',
            }}
          >
            OP {rx.opNumber}
          </div>
          <div style={{ fontSize: '9pt', color: '#444', marginTop: '1mm' }}>
            Doctor: {rx.doctorName}
          </div>
        </div>
      </section>

      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}
      >
        <thead>
          <tr style={{ borderBottom: '1.5px solid #000', textAlign: 'left' }}>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Medicine</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dosing</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Qty</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Unit</th>
            <th style={{ padding: '2mm 1mm', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rx.items.map((it, i) => (
            <tr
              key={it.id}
              style={{ borderBottom: '0.5px solid #ccc', verticalAlign: 'top' }}
            >
              <td style={{ padding: '2mm 1mm', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '9pt', color: '#666' }}>
                {i + 1}
              </td>
              <td style={{ padding: '2mm 1mm' }}>
                <div style={{ fontWeight: 500 }}>
                  {it.medicineName} <span style={{ color: '#666' }}>{it.strength}</span>
                </div>
                {it.genericName && (
                  <div style={{ fontSize: '8pt', color: '#666', fontStyle: 'italic' }}>
                    gen: {it.genericName}
                  </div>
                )}
              </td>
              <td style={{ padding: '2mm 1mm', fontSize: '9pt', color: '#444' }}>
                {it.dosage} · {it.frequency} · {it.route} · {it.durationDays}d
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {it.quantityPrescribed}
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(it.unitPrice)}
              </td>
              <td style={{ padding: '2mm 1mm', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {formatCurrency(it.unitPrice * it.quantityPrescribed)}
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
                {formatCurrency(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer
        style={{
          marginTop: '14mm',
          fontSize: '9pt',
          color: '#444',
          textAlign: 'center',
        }}
      >
        Thank you. Computer-generated receipt — keep this slip for any return.
      </footer>
    </div>
  );
}
