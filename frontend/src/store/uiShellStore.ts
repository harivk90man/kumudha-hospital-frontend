import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * App-shell UI state shared across every role app (frontdesk, doctor,
 * diagnostics, pharmacy, cashier, inventory, owner, admin). Lives in
 * global `store/` per CLAUDE.md §3.6 — the collapsed sidebar flag is
 * read by every `<RoleSidebar>` and written by their toggle buttons.
 *
 * Persisted so a user’s collapse choice survives reloads and follows
 * them across role apps (signing out + back in keeps the same choice).
 */

type UiShellState = {
  /** True when the desktop sidebar is collapsed to icon-only width. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
};

export const useUiShell = create<UiShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'hms.uiShell.v1',
    },
  ),
);
