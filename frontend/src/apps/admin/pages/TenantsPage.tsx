import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Spinner } from '@/components/feedback/Spinner';
import { fetchTenants, type Tenant } from '@/features/platform';

export function TenantsPage(): JSX.Element {
  const [items, setItems] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTenants()
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Tenants' }]}
        homeTo="/admin/tenants"
        homeLabel="Admin home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Landing page — LiveIndicator band stands in for the
              ghost back-link on sub-pages so the title baseline lines
              up across the admin app. */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Live admin
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Tenants
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Hospitals on the platform. UHID prefix + length is locked at
            onboarding (BRD Patient Identity Model).
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading tenants...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No tenants yet.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((t) => (
            <li key={t.id}>
              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>
                      <Building2 className="mr-1 inline h-4 w-4 text-muted-foreground" />
                      {t.displayName}
                    </CardTitle>
                    <p className="font-mono text-xs text-muted-foreground">{t.slug}</p>
                  </div>
                  <StatusPill tone={t.isActive ? 'success' : 'neutral'} size="sm">
                    {t.isActive ? 'Active' : 'Inactive'}
                  </StatusPill>
                </CardHeader>

                <CardLabel>
                  {t.city}{t.state ? `, ${t.state}` : ''} · since{' '}
                  {new Date(t.createdAt).toLocaleDateString()}
                </CardLabel>

                <ul className="grid grid-cols-3 gap-2 text-xs">
                  <li className="rounded-md border p-2">
                    <div className="text-muted-foreground">UHID prefix</div>
                    <div className="font-mono">{t.uhidPrefix}</div>
                  </li>
                  <li className="rounded-md border p-2">
                    <div className="text-muted-foreground">UHID length</div>
                    <div className="font-mono">{t.uhidNumberLength}</div>
                  </li>
                  <li className="rounded-md border p-2">
                    <div className="text-muted-foreground">Users</div>
                    <div className="font-mono">{t.userCount}</div>
                  </li>
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
