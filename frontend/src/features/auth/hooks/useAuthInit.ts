import { useEffect } from 'react';
import { useAuthStore } from '../authStore';
import { restoreSession } from '../authApi';

/**
 * Called exactly once — in RootLayout — to revalidate the stored token on
 * startup. Every other component reads auth state via useAuth() without
 * triggering a network request.
 */
export const useAuthInit = (): void => {
  const setSession    = useAuthStore((s) => s.setSession);
  const clear         = useAuthStore((s) => s.clear);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const initialized   = useAuthStore((s) => s.initialized);

  useEffect(() => {
    if (initialized) return;

    const token = useAuthStore.getState().session?.accessToken;
    if (!token) {
      setInitialized();
      return;
    }

    restoreSession(token)
      .then((session) => { setSession(session); setInitialized(); })
      .catch(() => { clear(); setInitialized(); });
  // initialized is intentionally excluded — we only want this to run once per
  // page load (initialized resets to false on reload via partialize config).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
