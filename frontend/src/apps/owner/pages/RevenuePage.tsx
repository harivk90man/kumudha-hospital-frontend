import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Coins,
  Download,
  Receipt,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Breadcrumb, DashboardStatCard, DateRangePicker, LiveIndicator } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  pctChange,
  resolveDateRange,
  type DateRange,
  type DateRangePreset,
} from '@/utils/dateRange';
import { downloadCsv, toCsv } from '@/utils/exportCsv';
import { Donut, type DonutSlice } from '@/components/charts';
import {
  fetchRevenueByCategory,
  fetchRevenueByDepartment,
  fetchRevenueByDoctor,
  fetchRevenueOverview,
  fetchTopServices,
  type CategoryBreakdown,
  type DepartmentBreakdown,
  type DoctorBreakdown,
  type RevenueOverview,
  type TopService,
} from '../ownerApi';

/** Rotating Tailwind tone palette so any number of departments /
 *  categories pick a distinct stroke + dot without us hard-coding
 *  per-name colours (which we don't know at build time). */
const SLICE_PALETTE = [
  { stroke: 'stroke-primary text-primary',          dot: 'bg-primary' },
  { stroke: 'stroke-success text-success',          dot: 'bg-success' },
  { stroke: 'stroke-info text-info',                dot: 'bg-info' },
  { stroke: 'stroke-warning text-warning',          dot: 'bg-warning' },
  { stroke: 'stroke-brandAccent text-brandAccent',  dot: 'bg-brandAccent' },
  { stroke: 'stroke-danger text-danger',            dot: 'bg-danger' },
] as const;

const sliceTone = (i: number): { stroke: string; dot: string } =>
  SLICE_PALETTE[i % SLICE_PALETTE.length];

interface DataBundle {
  current: RevenueOverview;
  previous: RevenueOverview;
  byCategory: CategoryBreakdown[];
  byDepartment: DepartmentBreakdown[];
  byDoctor: DoctorBreakdown[];
  topServices: TopService[];
}

const isPreset = (s: string | null): s is DateRangePreset =>
  s === 'today' ||
  s === 'yesterday' ||
  s === 'this_week' ||
  s === 'this_month' ||
  s === 'last_month' ||
  s === 'this_quarter' ||
  s === 'ytd' ||
  s === 'custom';

export function RevenuePage(): JSX.Element {
  /* ---------- URL-backed filter state (CLAUDE.md §3.4) ---------- */
  const [params, setParams] = useSearchParams();

  const presetParam = params.get('range');
  const preset: DateRangePreset = isPreset(presetParam) ? presetParam : 'this_month';
  const customFrom = params.get('from');
  const customTo = params.get('to');
  const custom: DateRange | undefined =
    preset === 'custom' && customFrom && customTo
      ? { from: customFrom, to: customTo }
      : undefined;

  const resolved = useMemo(() => resolveDateRange(preset, custom), [preset, custom]);

  /* ---------- Data ---------- */
  const [bundle, setBundle] = useState<DataBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const cur: DateRange = { from: resolved.from, to: resolved.to };
    const prev: DateRange = { from: resolved.previous.from, to: resolved.previous.to };
    Promise.all([
      fetchRevenueOverview(cur),
      fetchRevenueOverview(prev),
      fetchRevenueByCategory(cur),
      fetchRevenueByDepartment(cur),
      fetchRevenueByDoctor(cur),
      fetchTopServices(cur),
    ])
      .then(([current, previous, byCategory, byDepartment, byDoctor, topServices]) => {
        if (alive) {
          setBundle({ current, previous, byCategory, byDepartment, byDoctor, topServices });
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [resolved.from, resolved.to, resolved.previous.from, resolved.previous.to]);

  const onChangeRange = ({
    preset: nextPreset,
    custom: nextCustom,
  }: {
    preset: DateRangePreset;
    custom?: DateRange;
  }): void => {
    const next = new URLSearchParams(params);
    next.set('range', nextPreset);
    if (nextPreset === 'custom' && nextCustom) {
      next.set('from', nextCustom.from);
      next.set('to', nextCustom.to);
    } else {
      next.delete('from');
      next.delete('to');
    }
    setParams(next, { replace: true });
  };

  /* ---------- CSV exports ---------- */

  const exportFilenameSuffix = `${resolved.from}_${resolved.to}`;

  const exportByDoctor = (): void => {
    if (!bundle) return;
    const csv = toCsv(bundle.byDoctor, [
      { key: 'doctorName', header: 'Doctor' },
      { key: 'department', header: 'Department' },
      { key: 'amount', header: 'Revenue (INR)' },
      { key: 'invoiceCount', header: 'Invoices' },
      { key: 'patientCount', header: 'Patients' },
    ]);
    downloadCsv(`revenue_by_doctor_${exportFilenameSuffix}.csv`, csv);
  };

  const exportByDepartment = (): void => {
    if (!bundle) return;
    const csv = toCsv(bundle.byDepartment, [
      { key: 'department', header: 'Department' },
      { key: 'amount', header: 'Revenue (INR)' },
      { key: 'invoiceCount', header: 'Invoices' },
      { key: 'doctorCount', header: 'Doctors' },
    ]);
    downloadCsv(`revenue_by_department_${exportFilenameSuffix}.csv`, csv);
  };

  const exportTopServices = (): void => {
    if (!bundle) return;
    const csv = toCsv(bundle.topServices, [
      { key: 'serviceCode', header: 'Code' },
      { key: 'serviceName', header: 'Service' },
      { key: 'category', header: 'Category' },
      { key: 'quantity', header: 'Qty' },
      { key: 'amount', header: 'Revenue (INR)' },
    ]);
    downloadCsv(`top_services_${exportFilenameSuffix}.csv`, csv);
  };

  /* ---------- Render ---------- */

  if (loading || !bundle) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Breadcrumb items={[{ label: 'Revenue' }]} homeTo="/owner/dashboard" homeLabel="Owner home" />
        <DateRangePicker value={preset} custom={custom} onChange={onChangeRange} />
        <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
          <Spinner size="sm" className="mr-2" /> Loading revenue...
        </div>
      </div>
    );
  }

  const { current, previous, byCategory, byDepartment, byDoctor, topServices } = bundle;
  const billedDelta = pctChange(current.billed, previous.billed);
  const collectedDelta = pctChange(current.collected, previous.collected);
  const invoicesDelta = pctChange(current.invoiceCount, previous.invoiceCount);
  const patientsDelta = pctChange(current.patientCount, previous.patientCount);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Breadcrumb items={[{ label: 'Revenue' }]} homeTo="/owner/dashboard" homeLabel="Owner home" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Home/landing page: LiveIndicator band substitutes for the
              ghost back link so the title baseline matches every other
              page header. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live revenue
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Revenue
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Filter by period and compare against the matching prior window.
            Every section exports as CSV.
          </p>
          <p className="font-mono text-xxs tabular-nums text-muted-foreground">
            {resolved.from} → {resolved.to} · vs {resolved.previous.label}
          </p>
        </div>
      </header>

      <DateRangePicker value={preset} custom={custom} onChange={onChangeRange} />

      {/* ---------- KPI tiles with Δ-vs-prior ---------- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label="Billed"
          value={formatCurrency(current.billed)}
          icon={Receipt}
          trailing={<DeltaBadge delta={billedDelta} prevLabel={resolved.previous.label} />}
        />
        <DashboardStatCard
          label="Collected"
          value={formatCurrency(current.collected)}
          icon={Coins}
          tone={current.refunded > 0 ? 'warning' : 'success'}
          trailing={<DeltaBadge delta={collectedDelta} prevLabel={resolved.previous.label} />}
        />
        <DashboardStatCard
          label="Invoices"
          value={current.invoiceCount}
          icon={TrendingUp}
          trailing={<DeltaBadge delta={invoicesDelta} prevLabel={resolved.previous.label} />}
        />
        <DashboardStatCard
          label="Patients"
          value={current.patientCount}
          icon={Users}
          trailing={<DeltaBadge delta={patientsDelta} prevLabel={resolved.previous.label} />}
        />
      </section>

      {/* ---------- By department + by category side-by-side ---------- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                By department
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <CardLabel>{byDepartment.length}</CardLabel>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={exportByDepartment}
                disabled={byDepartment.length === 0}
              >
                <Download /> CSV
              </Button>
            </div>
          </CardHeader>
          {byDepartment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No department revenue in this period.</p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Donut
                slices={byDepartment.map<DonutSlice>((d, i) => ({
                  key: d.department,
                  label: d.department,
                  value: d.amount,
                  ...sliceTone(i),
                }))}
                size={150}
                centreLabel={formatCurrency(
                  byDepartment.reduce((s, d) => s + d.amount, 0),
                )}
                centreSub="Total"
                className="shrink-0 self-center"
              />
              <ul className="flex min-w-0 flex-1 flex-col gap-3">
                {byDepartment.map((d, i) => (
                  <li key={d.department} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span
                          className={cn('h-2 w-2 rounded-full', sliceTone(i).dot)}
                          aria-hidden="true"
                        />
                        {d.department}
                      </span>
                      <span className="font-mono tabular-nums">{formatCurrency(d.amount)}</span>
                    </div>
                    <ProgressBar value={d.share} />
                    <span className="text-xs text-muted-foreground">
                      {d.invoiceCount} invoice{d.invoiceCount === 1 ? '' : 's'} · {d.doctorCount} doctor{d.doctorCount === 1 ? '' : 's'} · {(d.share * 100).toFixed(1)}% share
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By service category</CardTitle>
            <CardLabel>{byCategory.length}</CardLabel>
          </CardHeader>
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices in this period.</p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Donut
                slices={byCategory.map<DonutSlice>((c, i) => ({
                  key: c.category,
                  label: c.category.replace(/_/g, ' '),
                  value: c.amount,
                  ...sliceTone(i),
                }))}
                size={150}
                centreLabel={formatCurrency(
                  byCategory.reduce((s, c) => s + c.amount, 0),
                )}
                centreSub="Total"
                className="shrink-0 self-center"
              />
              <ul className="flex min-w-0 flex-1 flex-col gap-3">
                {byCategory.map((c, i) => (
                  <li key={c.category} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 font-medium capitalize">
                        <span
                          className={cn('h-2 w-2 rounded-full', sliceTone(i).dot)}
                          aria-hidden="true"
                        />
                        {c.category.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono tabular-nums">{formatCurrency(c.amount)}</span>
                    </div>
                    <ProgressBar value={c.share} />
                    <span className="text-xs text-muted-foreground">
                      {(c.share * 100).toFixed(1)}% share
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </section>

      {/* ---------- Revenue by doctor ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              Revenue by doctor
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <CardLabel>{byDoctor.length}</CardLabel>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={exportByDoctor}
              disabled={byDoctor.length === 0}
            >
              <Download /> CSV
            </Button>
          </div>
        </CardHeader>
        {byDoctor.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No revenue with a doctor join in this period. Walk-ins without an
            op_visit don’t roll up to a doctor.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Doctor</th>
                  <th className="py-2 pr-4 font-medium">Department</th>
                  <th className="py-2 pr-4 text-right font-medium">Patients</th>
                  <th className="py-2 pr-4 text-right font-medium">Invoices</th>
                  <th className="py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {byDoctor.map((d) => (
                  <tr key={d.doctorId} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{d.doctorName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{d.department}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{d.patientCount}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{d.invoiceCount}</td>
                    <td className="py-2 text-right font-mono tabular-nums font-semibold">
                      {formatCurrency(d.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------- Top services ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Top services</CardTitle>
          <div className="flex items-center gap-2">
            <CardLabel>{topServices.length}</CardLabel>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={exportTopServices}
              disabled={topServices.length === 0}
            >
              <Download /> CSV
            </Button>
          </div>
        </CardHeader>
        {topServices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No services billed in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Service</th>
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topServices.map((s) => (
                  <tr key={s.serviceCode} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-mono text-xs">{s.serviceCode}</td>
                    <td className="py-2 pr-4 font-medium">{s.serviceName}</td>
                    <td className="py-2 pr-4 capitalize text-muted-foreground">
                      {s.category.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{s.quantity}</td>
                    <td className="py-2 text-right font-mono tabular-nums font-semibold">
                      {formatCurrency(s.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Sub-components ---------- */

interface DeltaBadgeProps {
  delta: number | null;
  prevLabel: string;
}

function DeltaBadge({ delta, prevLabel }: DeltaBadgeProps): JSX.Element {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        — vs {prevLabel}
      </span>
    );
  }
  const up = delta >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        up ? 'text-success' : 'text-danger',
      )}
      title={`vs ${prevLabel}`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(1)}% vs {prevLabel}
    </span>
  );
}

function ProgressBar({ value }: { value: number }): JSX.Element {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}
