import { useAuthStore, selectUser, selectIsAuthenticated } from '../authStore';
import { login as loginApi, logout as logoutApi } from '../authApi';
import type { UserProfile } from '../authTypes';

interface UseAuthResult {
  user: UserProfile | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<UserProfile>;
  logout: () => void;
}

/**
 * Pure read hook — returns auth state and actions.
 * Token revalidation on startup is handled once by useAuthInit() in RootLayout,
 * NOT here, so mounting 36+ components never fires 36 network requests.
 */
export const useAuth = (): UseAuthResult => {
  const user = useAuthStore(selectUser);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  const login = async (username: string, password: string): Promise<UserProfile> => {
    const session = await loginApi(username, password);
    setSession(session);
    return session.user;
  };

  const logout = (): void => {
    clear();
    logoutApi().catch(() => {});
  };

  return { user, isAuthenticated, login, logout };
};
