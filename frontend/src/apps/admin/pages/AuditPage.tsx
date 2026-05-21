import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill, type StatusPillProps } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Spinner } from '@/components/feedback/Spinner';
import { FormSelect } from '@/components/form';
import { fetchAuditLog, type AuditEntry, type AuditSeverity } from '@/features/platform';

type SevFilter = 'all' | AuditSeverity;

const sevOptions: { value: SevFilter; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'info',     label: 'Info' },
  { value: 'warn',     label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

const sevTone: Record<AuditSeverity, StatusPillProps['tone']> = {
  info: 'neutral',
  warn: 'warning',
  critical: 'danger',
};

export function AuditPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const severity = (params.get('severity') as SevFilter) || 'all';
  const q = params.get('q') ?? '';

  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAuditLog({ severity, q })
      .then((rows) => {
        if (alive) {
          setItems(rows);
          setRefreshedAt(new Date());
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [severity, q]);

  const setParam = (key: string, value: string): void => {
    const np = new URLSearchParams(params);
    if (value && value !== 'all') np.set(key, value);
    else np.delete(key);
    setParams(np, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Audit log' }]}
        homeTo="/admin/tenants"
        homeLabel="Admin home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Landing page — LiveIndicator band stands in for the
              ghost back-link on sub-pages so title + right-side CTAs
              anchor at the same y across the admin app. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live admin
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Audit log
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Append-only ledger of every notable action (TSD-02 §4.1). Critical
            rows highlight in red; warnings in amber.
          </p>
        </div>
      </header>

      {/* Filter row — severity is a closed enum (Info/Warn/Critical) so
          FormSelect is the right primitive here per §3.5 of the design
          brief. RichSelect is reserved for identity dropdowns where each
          option carries a sublabel + live count. */}
      <div className="flex flex-wrap items-end gap-3">
        <FormSelect
          label="Severity"
          value={severity}
          onChange={(e) => setParam('severity', e.target.value)}
          className="w-40"
        >
          {sevOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </FormSelect>
        <label className="relative flex-1 min-w-[16rem]">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Search</span>
          <Search className="pointer-events-none absolute left-3 bottom-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Action, actor, resource id, notes"
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <span className="pb-2 text-xxs text-muted-foreground tabular-nums">
          {refreshedAt &&
            `Refreshed ${refreshedAt.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}`}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading audit...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">No audit rows match.</p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Audit entries</CardTitle>
            <CardLabel>{items.length}</CardLabel>
          </CardHeader>
          <ul className="flex flex-col divide-y">
            {items.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(a.occurredAt).toLocaleString()}
                  </span>
                  <span className="font-medium">{a.action}</span>
                  <StatusPill tone={sevTone[a.severity]} size="sm">
                    {a.severity}
                  </StatusPill>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.actorName} ({a.actorRole.replace(/_/g, ' ')}) ·{' '}
                  {a.resourceType}
                  {a.resourceId ? ` ${a.resourceId}` : ''}
                </div>
                {a.notes && (
                  <p className="text-xs">{a.notes}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
