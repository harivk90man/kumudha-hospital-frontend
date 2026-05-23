import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Coins, Pill, SlidersHorizontal, Search } from 'lucide-react';
import { Breadcrumb } from '@/components/data-display';
import { Card, CardHeader, CardTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { formatCurrency } from '@/utils/formatCurrency';
import { cn } from '@/utils/cn';
import {
  fetchAllServices,
  fetchAllDrugs,
  updateServicePricing,
  updateDrugThresholds,
  type ServicePricingRow,
  type DrugThresholdRow,
} from '../pricingApi';

type Tab = 'services' | 'drugs';

/**
 * Owner-only catalog tuning.
 *
 * Two tabs:
 *   - **Services** — edit `services.default_price` + `default_gst_pct`.
 *     Drives consultation fees + lab + radiology line pricing across
 *     billing.
 *   - **Drugs** — edit `drug_catalogue.low_stock_threshold` (drives the
 *     pharmacy-alerts notification on the doctor / owner dashboards)
 *     + `max_stock_threshold` + `gst_pct`.
 *
 * Edits are inline per row with a Save button per row — no global Save,
 * so a half-typed value in one row doesn't lock the others. A row goes
 * back to "saved" once the round-trip lands.
 */
export function PricingPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('services');

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb items={[{ label: 'Pricing & thresholds' }]} homeTo="/owner/dashboard" homeLabel="Owner" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Pricing &amp; thresholds
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Edit service rates, GST, and stock thresholds. Changes
            apply to every downstream invoice + alert immediately.
          </p>
        </div>
      </header>

      <div className="inline-flex items-center gap-1 self-start rounded-md border border-hairline bg-card p-1">
        <TabButton
          active={tab === 'services'}
          onClick={() => setTab('services')}
          Icon={Coins}
          label="Services"
        />
        <TabButton
          active={tab === 'drugs'}
          onClick={() => setTab('drugs')}
          Icon={Pill}
          label="Drug thresholds"
        />
      </div>

      {tab === 'services' ? <ServicesSection /> : <DrugsSection />}
    </div>
  );
}

function TabButton({
  active, onClick, Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Coins;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted/60',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*                            SERVICES                              */
/* ─────────────────────────────────────────────────────────────── */

function ServicesSection(): JSX.Element {
  const [rows, setRows] = useState<ServicePricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAllServices());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      r.serviceCode.toLowerCase().includes(term)
      || r.serviceName.toLowerCase().includes(term)
      || r.serviceType.toLowerCase().includes(term),
    );
  }, [rows, q]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Service prices &amp; GST
          </span>
        </CardTitle>
        <SearchBox value={q} onChange={setQ} placeholder="Code, name, type…" />
      </CardHeader>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading services…
        </div>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {q ? 'No services match the search.' : 'No services configured.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 text-right font-medium">Price (₹)</th>
                <th className="py-2 pr-3 text-right font-medium">GST %</th>
                <th className="py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <ServiceRow
                  key={row.id}
                  initial={row}
                  onSaved={(saved) =>
                    setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ServiceRow({
  initial, onSaved,
}: {
  initial: ServicePricingRow;
  onSaved: (next: ServicePricingRow) => void;
}): JSX.Element {
  const [price, setPrice] = useState<string>(String(initial.defaultPrice));
  const [gst, setGst] = useState<string>(String(initial.defaultGstPct));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty =
    Number(price) !== initial.defaultPrice
    || Number(gst) !== initial.defaultGstPct;

  const save = async (): Promise<void> => {
    setSaving(true);
    setErr(null);
    try {
      const nextPrice = Number(price);
      const nextGst = Number(gst);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) throw new Error('Price must be 0 or more');
      if (!Number.isFinite(nextGst) || nextGst < 0 || nextGst > 28) throw new Error('GST must be 0–28');
      await updateServicePricing(initial.id, {
        defaultPrice: nextPrice,
        defaultGstPct: nextGst,
      });
      onSaved({ ...initial, defaultPrice: nextPrice, defaultGstPct: nextGst });
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 pr-3 font-mono text-xs tabular-nums">{initial.serviceCode}</td>
      <td className="py-2 pr-3">{initial.serviceName}</td>
      <td className="py-2 pr-3 text-xs capitalize text-muted-foreground">
        {initial.serviceType.replace(/_/g, ' ')}
      </td>
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          step="1"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded-md border border-hairline bg-transparent px-2 py-1 text-right text-sm tabular-nums focus:border-primary focus:outline-none"
        />
      </td>
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          step="0.5"
          min="0"
          max="28"
          value={gst}
          onChange={(e) => setGst(e.target.value)}
          className="w-16 rounded-md border border-hairline bg-transparent px-2 py-1 text-right text-sm tabular-nums focus:border-primary focus:outline-none"
        />
      </td>
      <td className="py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {err && <span className="text-xs text-danger">{err}</span>}
          {justSaved && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant={dirty ? 'default' : 'outline'}
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? <Spinner size="sm" /> : 'Save'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*                              DRUGS                               */
/* ─────────────────────────────────────────────────────────────── */

function DrugsSection(): JSX.Element {
  const [rows, setRows] = useState<DrugThresholdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAllDrugs());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load drugs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      r.drugCode.toLowerCase().includes(term)
      || r.genericName.toLowerCase().includes(term)
      || (r.brandName ?? '').toLowerCase().includes(term),
    );
  }, [rows, q]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Pill className="h-4 w-4 text-muted-foreground" />
            Low-stock thresholds &amp; drug GST
          </span>
        </CardTitle>
        <SearchBox value={q} onChange={setQ} placeholder="Drug code, generic, brand…" />
      </CardHeader>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading drug catalogue…
        </div>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {q ? 'No drugs match the search.' : 'No drugs in catalogue.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="py-2 pr-3 font-medium">Drug</th>
                <th className="py-2 pr-3 font-medium">Form / Strength</th>
                <th className="py-2 pr-3 text-right font-medium">Low @</th>
                <th className="py-2 pr-3 text-right font-medium">Max @</th>
                <th className="py-2 pr-3 text-right font-medium">GST %</th>
                <th className="py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <DrugRow
                  key={row.id}
                  initial={row}
                  onSaved={(saved) =>
                    setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DrugRow({
  initial, onSaved,
}: {
  initial: DrugThresholdRow;
  onSaved: (next: DrugThresholdRow) => void;
}): JSX.Element {
  const [low, setLow] = useState<string>(String(initial.lowStockThreshold));
  const [max, setMax] = useState<string>(String(initial.maxStockThreshold));
  const [gst, setGst] = useState<string>(String(initial.gstPct));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty =
    Number(low) !== initial.lowStockThreshold
    || Number(max) !== initial.maxStockThreshold
    || Number(gst) !== initial.gstPct;

  const save = async (): Promise<void> => {
    setSaving(true);
    setErr(null);
    try {
      const nextLow = Number(low);
      const nextMax = Number(max);
      const nextGst = Number(gst);
      if (!Number.isInteger(nextLow) || nextLow < 0) throw new Error('Low threshold must be 0+');
      if (!Number.isInteger(nextMax) || nextMax < 0) throw new Error('Max threshold must be 0+');
      if (nextMax > 0 && nextLow > nextMax) throw new Error('Low must be ≤ Max');
      const validGst = [0, 5, 12, 18, 28];
      if (!validGst.includes(nextGst)) throw new Error('GST must be one of 0/5/12/18/28');
      await updateDrugThresholds(initial.id, {
        lowStockThreshold: nextLow,
        maxStockThreshold: nextMax,
        gstPct: nextGst,
      });
      onSaved({
        ...initial,
        lowStockThreshold: nextLow,
        maxStockThreshold: nextMax,
        gstPct: nextGst,
      });
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 pr-3 font-mono text-xs tabular-nums">{initial.drugCode}</td>
      <td className="py-2 pr-3">
        <div className="font-medium">{initial.genericName}</div>
        {initial.brandName && (
          <div className="text-xs text-muted-foreground">{initial.brandName}</div>
        )}
      </td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {initial.form}{initial.strength ? ` · ${initial.strength}` : ''}
      </td>
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          step="1"
          min="0"
          value={low}
          onChange={(e) => setLow(e.target.value)}
          className="w-16 rounded-md border border-hairline bg-transparent px-2 py-1 text-right text-sm tabular-nums focus:border-primary focus:outline-none"
        />
      </td>
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          step="1"
          min="0"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="w-20 rounded-md border border-hairline bg-transparent px-2 py-1 text-right text-sm tabular-nums focus:border-primary focus:outline-none"
        />
      </td>
      <td className="py-2 pr-3 text-right">
        <input
          type="number"
          step="1"
          min="0"
          max="28"
          value={gst}
          onChange={(e) => setGst(e.target.value)}
          className="w-16 rounded-md border border-hairline bg-transparent px-2 py-1 text-right text-sm tabular-nums focus:border-primary focus:outline-none"
        />
      </td>
      <td className="py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {err && <span className="text-xs text-danger">{err}</span>}
          {justSaved && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant={dirty ? 'default' : 'outline'}
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? <Spinner size="sm" /> : 'Save'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*                            SHARED                                */
/* ─────────────────────────────────────────────────────────────── */

function SearchBox({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}): JSX.Element {
  return (
    <label className="relative inline-flex items-end">
      <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
      />
    </label>
  );
}

// `formatCurrency` is imported for the "₹{price}" hint potential; the
// rows render raw numbers in inputs. Keep the import so dropping it
// into a column later (e.g. "current price preview") is a one-liner.
void formatCurrency;
