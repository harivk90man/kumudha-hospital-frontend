import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthSession, UserProfile } from './authTypes';

interface AuthState {
  session: AuthSession | null;
  /** True once the startup token-revalidation attempt has completed (pass or fail). */
  initialized: boolean;
  setSession: (session: AuthSession) => void;
  clear: () => void;
  setInitialized: () => void;
}

/**
 * App-wide auth store. Persists only `session` to localStorage.
 * `initialized` deliberately resets to false on every page load so
 * useAuthInit() always revalidates the token against the server on startup.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      initialized: false,
      setSession: (session) => set({ session }),
      clear: () => set({ session: null }),
      setInitialized: () => set({ initialized: true }),
    }),
    {
      name: 'hms-auth',
      partialize: (state) => ({ session: state.session }),
    },
  ),
);

export const selectUser = (state: AuthState): UserProfile | null =>
  state.session?.user ?? null;

export const selectIsAuthenticated = (state: AuthState): boolean =>
  state.session !== null;
