import { create } from 'zustand';

interface NetworkActivityState {
  count: number;
  increment: () => void;
  decrement: () => void;
}

export const useNetworkActivity = create<NetworkActivityState>()((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  decrement: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));
