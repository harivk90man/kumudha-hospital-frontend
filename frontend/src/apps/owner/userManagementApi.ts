import { supabase, DEMO_USER_ID } from '@/lib/supabase/supabaseClient';
import type { UserRole } from '@/features/auth/authTypes';

/**
 * Owner-app role management. Reads the user roster, lists each user's
 * roles, and exposes mutators for the owner to add / remove a role
 * and pick a primary. Direct Supabase calls (demo mode).
 */

export interface UserWithRoles {
  id: string;
  username: string;
  fullName: string;
  designation: string | null;
  status: string;
  roles: { role: UserRole; isPrimary: boolean }[];
}

interface UserRow {
  id: string;
  username: string;
  full_name: string;
  designation: string | null;
  status: string;
}

interface RoleRow {
  id: string;
  role_code: string;
}

interface UserRoleRow {
  user_id: string;
  role_id: string;
  is_primary: boolean;
  roles: { role_code: string } | null;
}

const UI_ROLES: ReadonlySet<UserRole> = new Set([
  'frontdesk',
  'doctor',
  'chief_doctor',
  'pharma',
  'inventory',
  'lab_radio',
  'owner',
]);

const asUserRole = (code: string): UserRole | null =>
  UI_ROLES.has(code as UserRole) ? (code as UserRole) : null;

/** Returns every active user with their active role assignments. */
export const fetchUsersWithRoles = async (): Promise<UserWithRoles[]> => {
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, username, full_name, designation, status')
    .is('deleted_at', null)
    .order('full_name', { ascending: true });
  if (uErr) throw new Error(uErr.message);
  const userRows = (users ?? []) as UserRow[];

  if (userRows.length === 0) return [];

  const { data: links, error: lErr } = await supabase
    .from('user_roles')
    .select('user_id, role_id, is_primary, roles ( role_code )')
    .in('user_id', userRows.map((u) => u.id))
    .is('deleted_at', null);
  if (lErr) throw new Error(lErr.message);
  const linkRows = (links ?? []) as unknown as UserRoleRow[];

  const byUser = new Map<string, { role: UserRole; isPrimary: boolean }[]>();
  for (const row of linkRows) {
    const fe = row.roles ? asUserRole(row.roles.role_code) : null;
    if (!fe) continue;
    const list = byUser.get(row.user_id) ?? [];
    list.push({ role: fe, isPrimary: row.is_primary });
    byUser.set(row.user_id, list);
  }

  return userRows.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    designation: u.designation,
    status: u.status,
    roles: byUser.get(u.id) ?? [],
  }));
};

const roleIdCache: Map<UserRole, string> = new Map();

async function roleIdFor(role: UserRole): Promise<string> {
  const cached = roleIdCache.get(role);
  if (cached) return cached;
  const { data, error } = await supabase
    .from('roles')
    .select('id')
    .eq('role_code', role)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Role ${role} not defined in the database.`);
  const row = data as RoleRow;
  roleIdCache.set(role, row.id);
  return row.id;
}

/** Adds the role to the user. If the user has no primary yet, this becomes primary. */
export const addRole = async (userId: string, role: UserRole): Promise<void> => {
  const roleId = await roleIdFor(role);

  // Check if the user already has a primary role.
  const { data: existing, error: exErr } = await supabase
    .from('user_roles')
    .select('user_id, role_id, is_primary')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (exErr) throw new Error(exErr.message);
  const rows = (existing ?? []) as { user_id: string; role_id: string; is_primary: boolean }[];

  // Already assigned? No-op.
  if (rows.some((r) => r.role_id === roleId)) return;

  const hasPrimary = rows.some((r) => r.is_primary);
  const { error: insErr } = await supabase
    .from('user_roles')
    .insert({
      user_id: userId,
      role_id: roleId,
      is_primary: !hasPrimary,
      created_by: DEMO_USER_ID,
    });
  if (insErr) throw new Error(insErr.message);
};

/** Removes the role. If it was primary, the alphabetically-first remaining role becomes the new primary. */
export const removeRole = async (userId: string, role: UserRole): Promise<void> => {
  const roleId = await roleIdFor(role);

  // Hard-delete the row (audit-excluded composite-PK table).
  const { data: existing, error: exErr } = await supabase
    .from('user_roles')
    .select('user_id, role_id, is_primary')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (exErr) throw new Error(exErr.message);
  const rows = (existing ?? []) as { user_id: string; role_id: string; is_primary: boolean }[];
  const target = rows.find((r) => r.role_id === roleId);
  if (!target) return;

  const { error: delErr } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);
  if (delErr) throw new Error(delErr.message);

  // If we deleted the primary, promote another row (deterministic by role_id).
  if (target.is_primary) {
    const remaining = rows.filter((r) => r.role_id !== roleId);
    if (remaining.length > 0) {
      const next = remaining.slice().sort((a, b) => a.role_id.localeCompare(b.role_id))[0];
      const { error: upErr } = await supabase
        .from('user_roles')
        .update({ is_primary: true })
        .eq('user_id', userId)
        .eq('role_id', next.role_id);
      if (upErr) throw new Error(upErr.message);
    }
  }
};

/** Sets the role as the user's primary. Requires the role to already be assigned. */
export const setPrimaryRole = async (userId: string, role: UserRole): Promise<void> => {
  const roleId = await roleIdFor(role);

  // Clear any existing primary, then mark this row primary.
  const { error: clearErr } = await supabase
    .from('user_roles')
    .update({ is_primary: false })
    .eq('user_id', userId)
    .eq('is_primary', true);
  if (clearErr) throw new Error(clearErr.message);

  const { error: setErr } = await supabase
    .from('user_roles')
    .update({ is_primary: true })
    .eq('user_id', userId)
    .eq('role_id', roleId);
  if (setErr) throw new Error(setErr.message);
};
