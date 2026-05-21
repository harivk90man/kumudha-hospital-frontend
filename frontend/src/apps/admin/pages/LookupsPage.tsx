import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import { fetchLookup, type LookupKind, type LookupRow } from '@/features/platform';

const tabs: { value: LookupKind; label: string }[] = [
  { value: 'departments', label: 'Departments' },
  { value: 'allergies',   label: 'Allergies' },
  { value: 'services',    label: 'Services' },
  { value: 'states',      label: 'Patient states' },
];

export function LookupsPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as LookupKind) || 'departments';
  const [items, setItems] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchLookup(kind)
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  const setKind = (next: LookupKind): void => {
    const np = new URLSearchParams(params);
    np.set('kind', next);
    setParams(np, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Lookups' }]}
        homeTo="/admin/tenants"
        homeLabel="Admin home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Landing page — LiveIndicator band stands in for the
              ghost back-link on sub-pages so title + right-side CTAs
              land at the same y as on every other page. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live admin
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Lookup tables
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Closed-domain reference data the rest of the app reads from.
            Editing lands when the admin write endpoints ship.
          </p>
        </div>
      </header>

      <div role="tablist" aria-label="Lookup kind" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {tabs.map((t) => {
          const active = kind === t.value;
          return (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setKind(t.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">No rows.</p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{tabs.find((t) => t.value === kind)?.label}</CardTitle>
            <CardLabel>{items.length}</CardLabel>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Label</th>
                  <th className="py-2 pr-3">Notes</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-mono text-xs">{r.code}</td>
                    <td className="py-2 pr-3 font-medium">{r.label}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.notes ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={r.isActive ? 'success' : 'neutral'} size="sm">
                        {r.isActive ? 'Active' : 'Inactive'}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
