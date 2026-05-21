import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { Breadcrumb, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import { FormSelect } from '@/components/form';
import {
  dispenseOtcSale,
  getOtcUnitPrice,
  useOtcSalesStore,
  type OtcPaymentMethod,
  type OtcSaleLineRecord,
} from '@/features/pharmacy';
import { searchMedicines, type Medicine } from '@/features/inventory';
import { formatCurrency } from '@/utils/formatCurrency';

/**
 * OTC counter sale — anonymous customer buys medicines without a
 * prescription. Optional name/phone capture for the receipt; no
 * patient record is created. Separated from `/pharmacy/refill`
 * (which IS a prescription flow) so a counter shift can stay in one
 * mental mode at a time.
 *
 * Completed sales are persisted in `useOtcSalesStore` and surfaced on
 * `/pharmacy/otc/invoices` — they intentionally don’t flow into the
 * cashier’s prescription-tied invoice list, which kept landing OTC
 * users on the wrong screen.
 */
interface OtcCartLine {
  medicine: Medicine;
  quantity: number;
  unitPrice: number;
}

const DEFAULT_OTC_GST_PCT = 12;

export function CounterSalePage(): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState<string>('');
  const [hits, setHits] = useState<Medicine[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [cart, setCart] = useState<OtcCartLine[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<OtcPaymentMethod>('cash');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<{
    saleNumber: string;
    invoiceTotal: number;
    shortfalls?: { medicineName: string; requested: number; fulfilled: number }[];
  } | null>(null);

  const recordSale = useOtcSalesStore((s) => s.recordSale);

  // Live medicine search — fires on every keystroke (debounce omitted
  // to keep the demo simple; production would debounce ~200ms).
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    let alive = true;
    setSearching(true);
    searchMedicines(query)
      .then((rows) => {
        if (alive) setHits(rows);
      })
      .finally(() => {
        if (alive) setSearching(false);
      });
    return () => {
      alive = false;
    };
  }, [query]);

  const addToCart = (m: Medicine): void => {
    setCart((prev) => {
      const existing = prev.find((l) => l.medicine.id === m.id);
      if (existing) {
        return prev.map((l) =>
          l.medicine.id === m.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      const unitPrice = getOtcUnitPrice(m.id);
      return [...prev, { medicine: m, quantity: 1, unitPrice }];
    });
    setQuery('');
    setHits([]);
  };

  const setLineQty = (medicineId: string, qty: number): void => {
    setCart((prev) =>
      prev.map((l) =>
        l.medicine.id === medicineId ? { ...l, quantity: Math.max(1, qty) } : l,
      ),
    );
  };

  const removeLine = (medicineId: string): void => {
    setCart((prev) => prev.filter((l) => l.medicine.id !== medicineId));
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const gst = subtotal * (DEFAULT_OTC_GST_PCT / 100);
    return { subtotal, gst, total: subtotal + gst };
  }, [cart]);

  const onRecordSale = async (): Promise<void> => {
    if (cart.length === 0) return;
    setBusy(true);
    try {
      const res = await dispenseOtcSale({
        lines: cart.map((l) => ({
          medicineId: l.medicine.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          gstPct: DEFAULT_OTC_GST_PCT,
        })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        paymentRef: paymentRef.trim() || undefined,
      });

      // Snapshot full cart + shortfalls into the OTC sales store so the
      // OTC invoices history page can re-render this receipt later.
      const lineRecords: OtcSaleLineRecord[] = cart.map((l) => ({
        medicineId: l.medicine.id,
        medicineName: l.medicine.name,
        strength: l.medicine.strength,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        gstPct: DEFAULT_OTC_GST_PCT,
        lineTotal: Number((l.unitPrice * l.quantity).toFixed(2)),
      }));
      const shortfallRecords = res.shortfalls?.map((s) => {
        const line = cart.find((l) => l.medicine.id === s.medicineId);
        return {
          medicineId: s.medicineId,
          medicineName: line
            ? `${line.medicine.name} ${line.medicine.strength}`
            : s.medicineId,
          requested: s.requested,
          fulfilled: s.fulfilled,
        };
      });
      recordSale({
        saleNumber: res.saleNumber,
        invoiceId: res.invoiceId,
        invoiceTotal: res.invoiceTotal,
        soldAt: new Date().toISOString(),
        lines: lineRecords,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        paymentRef: paymentRef.trim() || undefined,
        shortfalls: shortfallRecords,
      });

      setResult({
        saleNumber: res.saleNumber,
        invoiceTotal: res.invoiceTotal,
        shortfalls: shortfallRecords?.map((s) => ({
          medicineName: s.medicineName,
          requested: s.requested,
          fulfilled: s.fulfilled,
        })),
      });
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPaymentRef('');
      // Keep `paymentMethod` sticky — most counter shifts collect cash
      // back-to-back, so resetting between sales would slow them down.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Counter sale' }]}
        homeTo="/pharmacy/queue"
        homeLabel="Pharmacy"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/pharmacy/queue')}
            className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft /> Back to queue
          </Button>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <ShoppingBag className="h-4 w-4 text-primary" />
            OTC counter sale
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Anonymous over-the-counter sale — no prescription required. Capture
            customer name + phone for the receipt if the customer wants one.
          </p>
        </div>
        {!result && cart.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void onRecordSale()}
              disabled={busy}
            >
              {busy ? <Spinner size="sm" /> : <CheckCircle2 />}
              {busy
                ? 'Recording…'
                : `Record sale + collect ${formatCurrency(totals.total)}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/pharmacy/queue')}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        )}
        {/* Post-sale CTAs — once a sale lands, "New sale" and "Open
            OTC invoices" sit at the top-right where every other page
            puts its primary actions, instead of being buried at the
            bottom of the success card. */}
        {result && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => setResult(null)}>
              <Plus /> New sale
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to={`/pharmacy/otc/invoices?sale=${result.saleNumber}`}>
                Open OTC invoices
              </Link>
            </Button>
          </div>
        )}
      </header>

      {result ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sale recorded · payment collected</CardTitle>
              <CardLabel>{result.saleNumber}</CardLabel>
            </div>
            <StatusPill tone="success" size="sm">
              <CheckCircle2 className="h-3 w-3" /> Done
            </StatusPill>
          </CardHeader>
          <p className="text-sm">
            Collected{' '}
            <span className="font-semibold">{formatCurrency(result.invoiceTotal)}</span>{' '}
            via{' '}
            <span className="font-medium capitalize">{paymentMethod.replace('_', ' ')}</span>.
          </p>
          {result.shortfalls && result.shortfalls.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="mb-1 font-semibold text-warning">
                Some lines were short-stocked:
              </p>
              <ul className="list-disc pl-4">
                {result.shortfalls.map((s) => (
                  <li key={s.medicineName}>
                    {s.medicineName} — fulfilled {s.fulfilled} of {s.requested}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader>
              <CardTitle>Medicines</CardTitle>
              <CardLabel>{cart.length} in cart</CardLabel>
            </CardHeader>

            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search brand or generic name..."
                className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Spinner size="sm" />
                </span>
              )}
            </label>

            {hits.length > 0 && (
              <ul className="flex flex-col divide-y rounded-md border">
                {hits.map((m) => {
                  const inCart = cart.some((l) => l.medicine.id === m.id);
                  const price = getOtcUnitPrice(m.id);
                  return (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">
                          {m.name}{' '}
                          <span className="text-xs text-muted-foreground">
                            {m.strength}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.genericName} · stock {m.availableQty} ·{' '}
                          {formatCurrency(price)}/unit
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={inCart ? 'outline' : 'default'}
                        onClick={() => addToCart(m)}
                        disabled={m.availableQty === 0}
                      >
                        <Plus />
                        {inCart ? 'Add another' : 'Add'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Search and add medicines to the cart.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {cart.map((l) => (
                  <li key={l.medicine.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {l.medicine.name}{' '}
                        <span className="text-xs text-muted-foreground">
                          {l.medicine.strength}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(l.unitPrice)}/unit · stock{' '}
                        {l.medicine.availableQty}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={l.medicine.availableQty}
                      value={l.quantity}
                      onChange={(e) =>
                        setLineQty(l.medicine.id, Number(e.target.value) || 1)
                      }
                      className="w-16 rounded-md border bg-background px-2 py-1 text-right text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="w-20 text-right font-mono text-sm tabular-nums">
                      {formatCurrency(l.unitPrice * l.quantity)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(l.medicine.id)}
                      aria-label="Remove line"
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Payment summary — sticky on tall viewports so totals stay
              glanceable while the pharmacist edits the cart. */}
          <Card className={cn('lg:sticky lg:top-4 lg:self-start')}>
            <CardHeader>
              <CardTitle>Counter sale</CardTitle>
              <CardLabel>OTC</CardLabel>
            </CardHeader>

            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Customer name (optional)
                </span>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="For the receipt"
                  className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Customer phone (optional)
                </span>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="10-digit"
                  className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>

            {/* Payment is captured in-line with the sale — OTC is
                always paid at the counter, so "Record sale" and
                "Collect payment" are one action, not two. */}
            <div className="flex flex-col gap-2 border-t pt-3">
              <FormSelect
                label="Payment method"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as OtcPaymentMethod)
                }
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="netbanking">Net banking</option>
              </FormSelect>
              {paymentMethod !== 'cash' && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Reference no (optional)
                  </span>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="UPI txn id, RRN…"
                    className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              )}
            </div>

            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(totals.subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GST ({DEFAULT_OTC_GST_PCT}%)</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(totals.gst)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>Total</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
