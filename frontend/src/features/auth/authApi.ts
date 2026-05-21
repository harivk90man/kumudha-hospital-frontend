import { httpClient } from '@/lib/http/httpClient';
import type { AuthSession, UserProfile, UserRole } from './authTypes';
import { mockAuthenticate } from './__mocks__/authMocks';

// ── Backend response shape ────────────────────────────────────────────────────

interface BackendLoginUserDto {
  id: string;
  employeeId: string;
  fullName: string;
  username: string;
  email: string | null;
  mobile: string;
  departmentId: string | null;
  designation: string | null;
  primaryRole: string;
  allRoles: string[];
  profileData: Record<string, unknown> | null;
  profilePicture: string | null;
  status: string;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
}

interface BackendLoginResponse {
  token: string;
  expiresAt: string;
  user: BackendLoginUserDto;
}

// ── Response mapper ───────────────────────────────────────────────────────────

function mapToUserProfile(dto: BackendLoginUserDto): UserProfile {
  const role = dto.primaryRole as UserRole;
  const allRoles = (dto.allRoles as UserRole[] | undefined) ?? [role];
  const base = {
    id: dto.id,
    fullName: dto.fullName,
    allRoles,
    avatarUrl: dto.profilePicture
      ? `data:image/jpeg;base64,${dto.profilePicture}`
      : undefined,
    stationSlug: (dto.profileData?.stationSlug as string | undefined),
  };

  if (role === 'doctor' || role === 'chief_doctor') {
    return {
      ...base,
      role,
      specialization: (dto.profileData?.specialization as string) ?? '',
      registrationNo: (dto.profileData?.registrationNo as string) ?? '',
    };
  }

  // All other roles share the base shape — cast is safe because role is a valid UserRole.
  return { ...base, role } as UserProfile;
}

function mapToAuthSession(res: BackendLoginResponse): AuthSession {
  return {
    accessToken: res.token,
    expiresAt:   res.expiresAt,
    user:        mapToUserProfile(res.user),
  };
}

// ── Mock-only session ─────────────────────────────────────────────────────────

/**
 * Wrap a mock user as an AuthSession. The token is just a marker so the
 * `restoreSession` flow can identify mock logins on page reload.
 */
function mockSessionFor(user: UserProfile): AuthSession {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // +8h
  return { accessToken: `mock-token-${user.id}`, expiresAt, user };
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Credential login. Tries the real backend first; if the request fails
 * (no backend running in dev / mock mode), falls back to the mock user
 * catalogue. The mock fallback accepts a username (lowercased first
 * name — e.g. `priya`, `naveen`, `kuppan`) with password `123123`.
 */
export const login = async (username: string, password: string): Promise<AuthSession> => {
  try {
    const res = await httpClient.post<BackendLoginResponse>('/auth/login', { username, password });
    return mapToAuthSession(res);
  } catch {
    const mockUser = mockAuthenticate(username, password);
    if (!mockUser) throw new Error('Invalid username or password.');
    return mockSessionFor(mockUser);
  }
};

/**
 * Token revalidation — called on page load when a stored token exists.
 * Mock tokens (`mock-token-<userId>`) resolve locally so refreshes keep
 * the demo signed in without a backend.
 */
export const restoreSession = async (token: string): Promise<AuthSession> => {
  if (token.startsWith('mock-token-')) {
    const userId = token.slice('mock-token-'.length);
    const { mockUsers } = await import('./__mocks__/authMocks');
    const user = mockUsers.find((u) => u.id === userId);
    if (!user) throw new Error('Mock session no longer valid.');
    return mockSessionFor(user);
  }
  const res = await httpClient.post<BackendLoginResponse>(
    '/auth/login',
    undefined,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return mapToAuthSession(res);
};

/**
 * Logout — notifies the server (no-op until token blacklist is implemented).
 * The caller must clear the local session store after this resolves.
 */
export const logout = async (): Promise<void> => {
  try {
    await httpClient.post('/auth/logout');
  } catch {
    // Mock mode — nothing to notify.
  }
};
