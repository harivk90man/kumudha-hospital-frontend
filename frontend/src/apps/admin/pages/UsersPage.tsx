import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Spinner } from '@/components/feedback/Spinner';
import { RichSelect, type RichSelectOption } from '@/components/overlay';
import {
  fetchTenants,
  fetchUsers,
  type PlatformUser,
  type Tenant,
} from '@/features/platform';
import type { UserRole } from '@/features/auth';

type RoleFilter = 'all' | UserRole;

const roleOptions: { value: RoleFilter; label: string }[] = [
  { value: 'all',          label: 'All roles' },
  { value: 'frontdesk',    label: 'Front desk' },
  { value: 'doctor',       label: 'Doctor' },
  { value: 'chief_doctor', label: 'Chief doctor' },
  { value: 'pharma',       label: 'Pharmacy' },
  { value: 'inventory',    label: 'Inventory' },
  { value: 'lab_radio',    label: 'Lab / Radiology' },
  { value: 'owner',        label: 'Owner' },
];

const roleLabel = (r: UserRole): string => {
  const found = roleOptions.find((o) => o.value === r);
  return found?.label ?? r;
};

const formatLastLogin = (iso?: string): string => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export function UsersPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const role = (params.get('role') as RoleFilter) || 'all';
  const tenant = params.get('tenant') ?? 'all';
  const q = params.get('q') ?? '';

  const [items, setItems] = useState<PlatformUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    void fetchTenants().then(setTenants);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchUsers({ role, q })
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
  }, [role, q]);

  const setParam = (key: string, value: string): void => {
    const np = new URLSearchParams(params);
    if (value && value !== 'all') np.set(key, value);
    else np.delete(key);
    setParams(np, { replace: true });
  };

  /**
   * Tenant filter is client-side narrowing of the fetched user page (the
   * backend `fetchUsers` doesn't take a tenant param yet — once it does,
   * lift the filter into the query). The dropdown options carry the
   * tenant's display name + city as sublabel + live user count.
   */
  const tenantFilterOptions = useMemo<RichSelectOption[]>(() => {
    const total = tenants.reduce((s, t) => s + t.userCount, 0);
    return [
      {
        value: 'all',
        name: 'All tenants',
        sublabel: 'Every hospital',
        count: total,
      },
      ...tenants.map((t) => ({
        value: t.id,
        name: t.displayName,
        sublabel: t.city,
        count: t.userCount,
      })),
    ];
  }, [tenants]);

  const visibleItems = useMemo(
    () => (tenant === 'all' ? items : items.filter((u) => u.tenantId === tenant)),
    [items, tenant],
  );

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Users' }]}
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
            Users
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Every staff account across all tenants. Filter by tenant or
            role to find a person; search by name or email.
          </p>
        </div>
      </header>

      {/* Filter row — RichSelect for tenant (identity dropdown carries
          tenant display name + city + live user count). Role stays in
          a RichSelect too so the trigger height matches. Search input
          fills the remaining width; refresh timestamp pinned right. */}
      <div className="flex flex-wrap items-end gap-3">
        <RichSelect
          label="Tenant"
          value={tenant}
          onChange={(v) => setParam('tenant', v)}
          menuLabel="Filter users by tenant"
          className="w-64"
          options={tenantFilterOptions}
        />
        <RichSelect
          label="Role"
          value={role}
          onChange={(v) => setParam('role', v)}
          menuLabel="Filter users by role"
          className="w-52"
          options={roleOptions.map((o) => ({ value: o.value, name: o.label }))}
        />
        <label className="relative flex-1 min-w-[16rem]">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Search</span>
          <Search className="pointer-events-none absolute left-3 bottom-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Name or email"
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
          <Spinner size="sm" /> Loading users...
        </div>
      ) : visibleItems.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No users match these filters.
          </p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardLabel>{visibleItems.length}</CardLabel>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Tenant</th>
                  <th className="py-2 pr-3">Last login</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{u.fullName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{u.email ?? '—'}</td>
                    <td className="py-2 pr-3">{roleLabel(u.role)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{u.tenantName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{formatLastLogin(u.lastLoginAt)}</td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={u.isActive ? 'success' : 'neutral'} size="sm">
                        {u.isActive ? 'Active' : 'Inactive'}
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
