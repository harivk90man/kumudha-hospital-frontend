import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pill, Search, ShieldAlert } from 'lucide-react';
import {
  Breadcrumb,
  LiveIndicator,
  SortableTH,
  StatusPill,
  TablePagination,
} from '@/components/data-display';
import { Card } from '@/components/layout';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import { sortRows } from '@/utils/listQuery';
import {
  fetchMedicines,
  severityLabel,
  severityPulse,
  severityTone,
  type Medicine,
  type StockSeverity,
} from '@/features/inventory';

const MEDICINE_SORT_FIELDS = [
  'name',
  'severity',
  'availableQty',
  'thresholdQty',
  'earliestExpiry',
] as const;

/**
 * Catalog landing — read-only view of every medicine the hospital
 * carries. Filter row above the table (severity dropdown + labelled
 * search + narcotics-only toggle) replaces the legacy `MetricStrip`
 * chip-row, which doubled as KPI + multi-select filter and was being
 * phased out across the app. Status pills on each row carry the
 * severity signal now; pagination keeps a 500-row catalog usable on
 * a 13" laptop.
 */
const DEFAULT_PAGE_SIZE = 25;

const SEVERITY_OPTIONS: { value: 'all' | StockSeverity; label: string }[] = [
  { value: 'all',          label: 'All severities' },
  { value: 'ok',           label: severityLabel.ok },
  { value: 'low',          label: severityLabel.low },
  { value: 'out_of_stock', label: severityLabel.out_of_stock },
  { value: 'near_expiry',  label: severityLabel.near_expiry },
  { value: 'expired',      label: severityLabel.expired },
];

export function MedicinesPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  // Narcotic-only quick filter — narrows the table to controlled
  // substances for register checks. Client-side because the mock
  // backend doesn't expose a wire param yet; flip when the real
  // endpoint accepts `?narcotic=1`.
  const narcoticOnly = params.get('narcotic') === '1';
  const severity = (params.get('severity') as StockSeverity | 'all') || 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.max(1, Number(params.get('limit')) || DEFAULT_PAGE_SIZE);
  const sort = params.get('sort') ?? '';

  const [items, setItems] = useState<Medicine[]>([]);
  /**
   * Unfiltered-by-severity twin of `items` — feeds the catalog
   * breakdown chart so the bar reflects the WHOLE catalog (or the
   * current search), not just whichever severity bucket the table is
   * currently filtered to. Otherwise selecting "Out of stock" would
   * collapse the chart to a single segment, defeating the at-a-glance
   * purpose.
   */
  const [allMedicines, setAllMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchMedicines({
        severity: severity === 'all' ? undefined : severity,
        q: q || undefined,
      }),
      fetchMedicines({ q: q || undefined }),
    ])
      .then(([rows, all]) => {
        if (!alive) return;
        setItems(rows);
        setAllMedicines(all);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [severity, q]);

  const filtered = useMemo(
    () => (narcoticOnly ? items.filter((m) => m.isNarcotic) : items),
    [items, narcoticOnly],
  );

  const sorted = useMemo(
    () => sortRows(filtered, sort, MEDICINE_SORT_FIELDS),
    [filtered, sort],
  );
  const total = sorted.length;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), lastPage);
  const start = (safePage - 1) * limit;
  const visible = useMemo(
    () => sorted.slice(start, start + limit),
    [sorted, start, limit],
  );

  /**
   * Severity counts for the catalog breakdown chart. Derived from
   * `allMedicines` (the unfiltered-by-severity twin) so the chart
   * stays a true at-a-glance picture even when the table is narrowed
   * to one bucket. Narrows to narcotics-only when that toggle is on
   * so the chart doesn't lie about the visible set.
   */
  const chartSource = useMemo(
    () => (narcoticOnly ? allMedicines.filter((m) => m.isNarcotic) : allMedicines),
    [allMedicines, narcoticOnly],
  );
  const severityCounts = useMemo(() => {
    const acc: Record<StockSeverity, number> = {
      ok: 0,
      low: 0,
      out_of_stock: 0,
      near_expiry: 0,
      expired: 0,
    };
    for (const m of chartSource) acc[m.severity] += 1;
    return acc;
  }, [chartSource]);

  const setParam = (key: string, value: string): void => {
    const np = new URLSearchParams(params);
    if (value && value !== 'all') np.set(key, value);
    else np.delete(key);
    // Any filter change resets back to page 1 — otherwise the user
    // ends up looking at "page 5 of 1".
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  const onSortChange = (next: string | undefined): void => {
    const np = new URLSearchParams(params);
    if (!next) np.delete('sort');
    else np.set('sort', next);
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  const onPageChange = (next: number): void => {
    const np = new URLSearchParams(params);
    np.set('page', String(next));
    setParams(np, { replace: true });
  };
  const onLimitChange = (next: number): void => {
    const np = new URLSearchParams(params);
    np.set('limit', String(next));
    np.set('page', '1');
    setParams(np, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Medicines' }]}
        homeTo="/inventory/medicines"
        homeLabel="Inventory"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Home/landing — LiveIndicator band substitutes the back-link
              slot, keeping titles + CTAs aligned across the app. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live catalog
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Medicine catalog
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Read-only catalog. Editing the catalog (add/discontinue medicines)
            is a Platform-admin function.
          </p>
        </div>
      </header>

      <CatalogBreakdownChart
        counts={severityCounts}
        total={chartSource.length}
        active={severity}
        onFilter={(next) => setParam('severity', next)}
      />

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {total} {total === 1 ? 'medicine' : 'medicines'}
        </span>
        <div className="flex items-end gap-4">
          <select
            value={severity}
            onChange={(e) => setParam('severity', e.target.value)}
            className="rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-0 pr-6 text-sm font-medium text-foreground focus:outline-none focus:border-primary"
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setParam('narcotic', narcoticOnly ? '' : '1')}
            aria-pressed={narcoticOnly}
            className={cn(
              'inline-flex items-center gap-1 rounded-none border-b py-2 text-sm font-medium transition',
              narcoticOnly
                ? 'border-danger text-danger'
                : 'border-hairline text-muted-foreground hover:text-foreground',
            )}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Narcotics
          </button>
          <div className="relative flex items-end">
            <Search className="pointer-events-none absolute left-0 bottom-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Brand, generic, drug class…"
              className="w-64 rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-6 pr-3 text-sm shadow-none focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading...
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={Pill}
          title={
            severity !== 'all' || q || narcoticOnly
              ? 'No medicines match the current filters.'
              : 'Catalog is empty.'
          }
          description={
            severity !== 'all' || q || narcoticOnly
              ? 'Clear severity / search / narcotic filters to widen the view.'
              : 'Ask Platform admin to seed the medicine catalog.'
          }
        />
      ) : (
        <div className="overflow-hidden border-b border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-left text-xxs uppercase tracking-wide text-muted-foreground">
                  <SortableTH field="name" sort={sort} onSort={onSortChange}>
                    Medicine
                  </SortableTH>
                  <th className="px-3 py-2 font-medium">Generic</th>
                  <th className="px-3 py-2 font-medium">Form</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <SortableTH
                    field="availableQty"
                    sort={sort}
                    onSort={onSortChange}
                    align="right"
                  >
                    Available
                  </SortableTH>
                  <SortableTH
                    field="thresholdQty"
                    sort={sort}
                    onSort={onSortChange}
                    align="right"
                  >
                    Threshold
                  </SortableTH>
                  <SortableTH
                    field="earliestExpiry"
                    sort={sort}
                    onSort={onSortChange}
                  >
                    Earliest expiry
                  </SortableTH>
                  <SortableTH field="severity" sort={sort} onSort={onSortChange}>
                    Severity
                  </SortableTH>
                </tr>
              </thead>
              <tbody>
                {visible.map((m, idx) => (
                  <tr
                    key={m.id}
                    className={cn(
                      'border-b align-middle last:border-b-0 transition-colors hover:bg-primary/[0.04]',
                      idx % 2 === 1 && 'bg-muted/15',
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium">{m.name}</span>{' '}
                      <span className="text-xs text-muted-foreground">{m.strength}</span>
                      {m.isNarcotic && (
                        <StatusPill tone="danger" size="sm" className="ml-2">
                          Narcotic
                        </StatusPill>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {m.genericName}
                    </td>
                    <td className="px-3 py-2 text-xs capitalize text-muted-foreground">
                      {m.form}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {m.drugClass ?? '—'}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-mono text-sm tabular-nums',
                        m.severity === 'low' && 'text-warning',
                        m.severity === 'out_of_stock' && 'text-danger',
                      )}
                    >
                      {m.availableQty}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {m.thresholdQty}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {m.earliestExpiry
                        ? new Date(m.earliestExpiry).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill
                        tone={severityTone[m.severity]}
                        size="sm"
                        pulse={severityPulse[m.severity]}
                      >
                        {severityLabel[m.severity]}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
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
      )}
    </div>
  );
}

/* ───────────── Catalog breakdown chart ───────────── */

interface CatalogBreakdownChartProps {
  counts: Record<StockSeverity, number>;
  total: number;
  active: 'all' | StockSeverity;
  onFilter: (next: 'all' | StockSeverity) => void;
}

interface ChartSegment {
  severity: StockSeverity;
  bar: string;
  dot: string;
  label: string;
}

/**
 * Severities ordered urgent → calm so the chart's left edge always
 * carries the action-required buckets (the eye lands there first).
 */
const CHART_SEGMENTS: ChartSegment[] = [
  { severity: 'expired',      bar: 'bg-danger',     dot: 'bg-danger',     label: 'Expired' },
  { severity: 'out_of_stock', bar: 'bg-danger/70',  dot: 'bg-danger/70',  label: 'Out of stock' },
  { severity: 'low',          bar: 'bg-warning',    dot: 'bg-warning',    label: 'Low' },
  { severity: 'near_expiry',  bar: 'bg-warning/55', dot: 'bg-warning/55', label: 'Near expiry' },
  { severity: 'ok',           bar: 'bg-success',    dot: 'bg-success',    label: 'In stock' },
];

/**
 * Catalog breakdown — a single horizontal stacked bar with a clickable
 * legend below. Each segment width is proportional to that severity's
 * share of the (search-narrowed but severity-unfiltered) catalog.
 * Clicking a segment or legend chip toggles the table's severity
 * filter, so the chart doubles as a one-click slicer.
 */
function CatalogBreakdownChart({
  counts,
  total,
  active,
  onFilter,
}: CatalogBreakdownChartProps): JSX.Element | null {
  if (total === 0) return null;
  return (
    <Card padding="md">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Catalog at a glance</h3>
        <span className="text-xxs text-muted-foreground tabular-nums">
          {total.toLocaleString()} medicines
        </span>
      </div>
      <div
        role="img"
        aria-label="Catalog severity breakdown"
        className="flex h-3 overflow-hidden rounded-full bg-muted/40"
      >
        {CHART_SEGMENTS.map((s) => {
          const c = counts[s.severity] ?? 0;
          if (c === 0) return null;
          const pct = (c / total) * 100;
          const isActive = active === s.severity;
          const isOtherActive = active !== 'all' && !isActive;
          return (
            <button
              key={s.severity}
              type="button"
              onClick={() => onFilter(isActive ? 'all' : s.severity)}
              className={cn(
                s.bar,
                'transition-opacity duration-150 hover:opacity-90',
                isOtherActive && 'opacity-30',
              )}
              style={{ width: `${pct}%` }}
              aria-label={`${s.label}: ${c}`}
              title={`${s.label} — ${c} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xxs">
        {CHART_SEGMENTS.map((s) => {
          const c = counts[s.severity] ?? 0;
          const isActive = active === s.severity;
          return (
            <button
              key={s.severity}
              type="button"
              onClick={() => onFilter(isActive ? 'all' : s.severity)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors',
                isActive
                  ? 'bg-muted/40 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/20 hover:text-foreground',
              )}
              aria-pressed={isActive}
            >
              <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
              <span className="font-medium">{s.label}</span>
              <span className="font-mono tabular-nums">{c}</span>
            </button>
          );
        })}
        {active !== 'all' && (
          <button
            type="button"
            onClick={() => onFilter('all')}
            className="ml-auto text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </Card>
  );
}
