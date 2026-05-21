import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, UserCog } from 'lucide-react';
import { Breadcrumb } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  addRole,
  fetchUsersWithRoles,
  removeRole,
  setPrimaryRole,
  type UserWithRoles,
} from '../userManagementApi';
import type { UserRole } from '@/features/auth/authTypes';
import { cn } from '@/utils/cn';

const ALL_ROLES: { code: UserRole; label: string; tone: string }[] = [
  { code: 'frontdesk',    label: 'Front desk',     tone: 'bg-slate-100 text-slate-800' },
  { code: 'doctor',       label: 'Doctor',         tone: 'bg-violet-100 text-violet-800' },
  { code: 'chief_doctor', label: 'Chief doctor',   tone: 'bg-indigo-100 text-indigo-800' },
  { code: 'pharma',       label: 'Pharmacy',       tone: 'bg-teal-100 text-teal-800' },
  { code: 'inventory',    label: 'Inventory',      tone: 'bg-amber-100 text-amber-800' },
  { code: 'lab_radio',    label: 'Lab / Radiology', tone: 'bg-sky-100 text-sky-800' },
  { code: 'owner',        label: 'Owner',          tone: 'bg-rose-100 text-rose-800' },
];

const roleMeta = (role: UserRole) =>
  ALL_ROLES.find((r) => r.code === role) ?? { code: role, label: role, tone: 'bg-slate-100 text-slate-800' };

export function UsersPage(): JSX.Element {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchUsersWithRoles());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRole = async (userId: string, role: UserRole, isAssigned: boolean) => {
    setBusyId(userId);
    setError(null);
    try {
      if (isAssigned) {
        await removeRole(userId, role);
      } else {
        await addRole(userId, role);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role.');
    } finally {
      setBusyId(null);
    }
  };

  const makePrimary = async (userId: string, role: UserRole) => {
    setBusyId(userId);
    setError(null);
    try {
      await setPrimaryRole(userId, role);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set primary role.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <Breadcrumb
        items={[
          { label: 'Owner', to: '/owner/dashboard' },
          { label: 'User roles' },
        ]}
        homeTo="/owner/dashboard"
        homeLabel="Owner home"
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">User roles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign roles to staff and pick each user&rsquo;s primary role.
            The primary role decides which workspace the user lands on after login.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <Loader2 className={cn('h-4 w-4', loading ? 'animate-spin' : 'hidden')} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Designation</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Roles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    Loading users&hellip;
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isBusy = busyId === u.id;
                  const assignedRoles = new Set(u.roles.map((r) => r.role));
                  const primary = u.roles.find((r) => r.isPrimary)?.role;
                  return (
                    <tr key={u.id} className={cn(isBusy && 'opacity-60')}>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-foreground">{u.fullName}</div>
                        <div className="text-xs text-muted-foreground">@{u.username}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {u.designation ?? '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          {ALL_ROLES.map((r) => {
                            const meta = roleMeta(r.code);
                            const isAssigned = assignedRoles.has(r.code);
                            const isPrimary = primary === r.code;
                            return (
                              <div key={r.code} className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void toggleRole(u.id, r.code, isAssigned)}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition',
                                    isAssigned
                                      ? meta.tone + ' border-transparent'
                                      : 'border-dashed border-border bg-transparent text-muted-foreground hover:border-foreground/30',
                                    isBusy && 'cursor-not-allowed',
                                  )}
                                  title={isAssigned ? `Click to remove ${meta.label}` : `Click to assign ${meta.label}`}
                                >
                                  {meta.label}
                                </button>
                                {isAssigned && (
                                  <button
                                    type="button"
                                    disabled={isBusy || isPrimary}
                                    onClick={() => void makePrimary(u.id, r.code)}
                                    className={cn(
                                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                                      isPrimary
                                        ? 'bg-foreground text-background'
                                        : 'border border-border text-muted-foreground hover:border-foreground/40',
                                    )}
                                    title={
                                      isPrimary
                                        ? 'This is the primary role'
                                        : 'Mark as primary role'
                                    }
                                    aria-label={isPrimary ? 'Primary' : 'Make primary'}
                                  >
                                    {isPrimary ? <ShieldCheck className="h-3.5 w-3.5" /> : <UserCog className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {u.roles.length === 0 && (
                          <p className="mt-1 text-xs text-rose-600">No roles assigned &mdash; user cannot log in until you give them one.</p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Click a role chip to add or remove it. Click the shield icon next to an assigned role to make it the primary.
        Changes take effect immediately and persist to the database.
      </p>
    </div>
  );
}
