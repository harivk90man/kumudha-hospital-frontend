import { create } from 'zustand';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  createdAt: number;
}

export type PanelState = 'normal' | 'minimized' | 'expanded' | 'hidden';

interface NotificationsState {
  notifications: Notification[];
  panelState: PanelState;
  push: (n: Pick<Notification, 'type' | 'title' | 'message'>) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  setPanelState: (s: PanelState) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  panelState: 'hidden',

  push: (n) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...n, id: crypto.randomUUID(), createdAt: Date.now() },
      ],
      panelState: state.panelState === 'hidden' ? 'normal' : state.panelState,
    })),

  dismiss: (id) =>
    set((state) => {
      const remaining = state.notifications.filter((n) => n.id !== id);
      return {
        notifications: remaining,
        panelState: remaining.length === 0 ? 'hidden' : state.panelState,
      };
    }),

  clearAll: () => set({ notifications: [], panelState: 'hidden' }),

  setPanelState: (s) => set({ panelState: s }),
}));

// ── Severity order for determining panel header colour ──────────────────────
const SEVERITY: Record<NotificationType, number> = {
  error: 3, warning: 2, info: 1, success: 0,
};

/** Returns the most severe notification type in the current list. */
export function dominantType(notifications: Notification[]): NotificationType {
  if (notifications.length === 0) return 'info';
  return notifications.reduce((acc, n) =>
    SEVERITY[n.type] > SEVERITY[acc] ? n.type : acc,
    notifications[0].type,
  );
}
