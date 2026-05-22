import { useEffect, useRef, useState } from 'react';
import { useNavigation, useLocation } from 'react-router-dom';
import { useNetworkActivity } from '@/store/networkActivityStore';
import { LinearProgress } from './LinearProgress';

type Phase = 'loading' | 'completing';

/**
 * Drives the top-of-page NProgress-style bar.
 *
 * Phase machine:
 *   null      → 'loading'    when activity starts
 *   'loading' → 'completing' when activity ends (bar fills to 100%)
 *   completing lasts 500 ms then unmounts
 */
export function GlobalProgressBar(): JSX.Element | null {
  const navigation = useNavigation();
  const location = useLocation();
  const count = useNetworkActivity((s) => s.count);
  const [phase, setPhase] = useState<Phase | null>(null);
  const completeTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const networkBusy = navigation.state !== 'idle' || count > 0;

  // HTTP / router activity
  useEffect(() => {
    if (networkBusy) {
      if (completeTimer.current) window.clearTimeout(completeTimer.current);
      setPhase('loading');
    } else {
      setPhase((prev) => (prev === 'loading' ? 'completing' : prev));
      completeTimer.current = window.setTimeout(() => setPhase(null), 500);
    }
    return () => {
      if (completeTimer.current) window.clearTimeout(completeTimer.current);
    };
  }, [networkBusy]);

  // Client-side navigation flash (no loaders — navigation.state stays idle)
  useEffect(() => {
    setPhase('loading');
    const t1 = window.setTimeout(() => setPhase('completing'), 300);
    const t2 = window.setTimeout(() => setPhase(null), 700);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [location.pathname, location.search]);

  if (!phase) return null;
  return <LinearProgress completing={phase === 'completing'} />;
}
