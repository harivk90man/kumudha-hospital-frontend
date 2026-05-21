import { supabase } from '@/lib/supabase/supabaseClient';
import type { AuthSession, UserProfile, UserRole } from './authTypes';

/**
 * DEMO-MODE auth surface.
 *
 * Wired directly to Supabase via `@/lib/supabase/supabaseClient` because the
 * planned Spring backend doesn't exist yet. Long-term this whole file goes
 * back to calling `httpClient.post('/auth/login', ...)` — see the migration
 * note in `supabaseClient.ts`.
 *
 * Auth model:
 *   - No real password verification — login looks up the `users` row by
 *     username, checks `status = 'active'`, and returns a session.
 *   - `accessToken` is a marker (`supabase-demo-<userId>`), NOT a JWT. It
 *     just lets `restoreSession` rehydrate the user on page reload.
 *   - `expiresAt` is set 8 hours in the future.
 *   - DB `roles.role_code` matches the frontend `UserRole` union exactly
 *     (frontdesk | doctor | chief_doctor | pharma | inventory | lab_radio |
 *     owner). The owner-managed role-assignment page is the single source
 *     of truth for who holds what.
 */

const DEMO_TOKEN_PREFIX = 'supabase-demo-';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const UI_ROLES: ReadonlySet<UserRole> = new Set([
  'frontdesk',
  'doctor',
  'chief_doctor',
  'pharma',
  'inventory',
  'lab_radio',
  'owner',
]);

/** Accept only role codes the frontend knows about; silently drop anything else. */
function asUserRole(code: string): UserRole | null {
  return UI_ROLES.has(code as UserRole) ? (code as UserRole) : null;
}

/* ---------- DB row shapes (snake_case mirrors of the schema) ---------- */

interface UserRow {
  id: string;
  full_name: string;
  username: string;
  status: string;
  profile_data: Record<string, unknown> | null;
  profile_picture: string | null;
}

interface RoleRow {
  role_code: string;
}

interface UserRoleRow {
  role_id: string;
  is_primary: boolean;
  roles: RoleRow | null;
}

/* ---------- Helpers ---------- */

/**
 * Loads every active role the user holds, picks the primary, and runs both
 * the primary code and the full set through the DB-to-FE role mapper.
 * Returns null if the user has no mappable role (defensive — should not
 * happen for any seeded account).
 */
async function loadUserRoles(
  userId: string,
): Promise<{ primary: UserRole; all: UserRole[] } | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role_id, is_primary, roles ( role_code )')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as UserRoleRow[];
  if (rows.length === 0) return null;

  const mapped: { role: UserRole; isPrimary: boolean }[] = [];
  for (const row of rows) {
    const code = row.roles?.role_code;
    if (!code) continue;
    const fe = asUserRole(code);
    if (!fe) continue;
    mapped.push({ role: fe, isPrimary: row.is_primary });
  }
  if (mapped.length === 0) return null;

  const primary = (mapped.find((m) => m.isPrimary)?.role) ?? mapped[0].role;
  const all = Array.from(new Set(mapped.map((m) => m.role)));
  return { primary, all };
}

function buildUserProfile(
  row: UserRow,
  primary: UserRole,
  allRoles: UserRole[],
): UserProfile {
  const base = {
    id:           row.id,
    fullName:     row.full_name,
    allRoles,
    avatarUrl:    row.profile_picture
      ? `data:image/jpeg;base64,${row.profile_picture}`
      : undefined,
    stationSlug:  (row.profile_data?.stationSlug as string | undefined),
  };

  if (primary === 'doctor' || primary === 'chief_doctor') {
    return {
      ...base,
      role: primary,
      specialization: (row.profile_data?.specialization as string) ?? '',
      registrationNo: (row.profile_data?.registrationNo as string) ?? '',
    };
  }

  return { ...base, role: primary } as UserProfile;
}

function buildSession(user: UserProfile): AuthSession {
  return {
    accessToken: `${DEMO_TOKEN_PREFIX}${user.id}`,
    expiresAt:   new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    user,
  };
}

/* ---------- API functions ---------- */

/**
 * Credential login. Looks up `users` by `username`, requires
 * `status = 'active'`. Password is NOT validated — this is a demo.
 */
export const login = async (username: string, _password: string): Promise<AuthSession> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, username, status, profile_data, profile_picture')
    .eq('username', username.trim().toLowerCase())
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Invalid username or password.');

  const row = data as UserRow;
  if (row.status !== 'active') {
    throw new Error('Account is not active.');
  }

  const roles = await loadUserRoles(row.id);
  if (!roles) throw new Error('No roles assigned — contact your administrator.');

  return buildSession(buildUserProfile(row, roles.primary, roles.all));
};

/**
 * Token revalidation — called on page load when a stored token exists.
 * For demo tokens (`supabase-demo-<userId>`) we re-fetch the user from
 * `users` and reissue a fresh session. Any other token shape is rejected.
 */
export const restoreSession = async (token: string): Promise<AuthSession> => {
  if (!token.startsWith(DEMO_TOKEN_PREFIX)) {
    throw new Error('Session token format not recognised.');
  }
  const userId = token.slice(DEMO_TOKEN_PREFIX.length);
  if (!userId) throw new Error('Session no longer valid.');

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, username, status, profile_data, profile_picture')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Session no longer valid.');

  const row = data as UserRow;
  if (row.status !== 'active') throw new Error('Account is not active.');

  const roles = await loadUserRoles(row.id);
  if (!roles) throw new Error('No roles assigned — contact your administrator.');

  return buildSession(buildUserProfile(row, roles.primary, roles.all));
};

/**
 * Logout — no-op in demo mode (no server-side token blacklist). The
 * caller must clear the local session store after this resolves.
 */
export const logout = async (): Promise<void> => {
  // Nothing to revoke server-side — demo tokens are stateless markers.
};
