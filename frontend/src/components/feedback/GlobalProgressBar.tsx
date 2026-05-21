import { useEffect, useState } from 'react';
import { useNavigation, useLocation } from 'react-router-dom';
import { useNetworkActivity } from '@/store/networkActivityStore';
import { LinearProgress } from './LinearProgress';

/**
 * Mounts the M3 linear progress bar when any of these is true:
 *  - React Router is mid-navigation (state !== 'idle', covers loader-based routes)
 *  - The location just changed (catches non-loader client-side navigation)
 *  - One or more axios requests are in-flight, with a 400 ms minimum tail so
 *    fast local responses are still visible to the eye.
 */
export function GlobalProgressBar(): JSX.Element | null {
  const navigation = useNavigation();
  const location = useLocation();
  const count = useNetworkActivity((s) => s.count);

  // Flash the bar briefly on every location change (client-side nav
  // without loaders keeps navigation.state at 'idle' the whole time).
  const [locationBusy, setLocationBusy] = useState(false);
  useEffect(() => {
    setLocationBusy(true);
    const t = window.setTimeout(() => setLocationBusy(false), 400);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.search]);

  // Keep the bar visible for at least 400 ms after the last request
  // completes — fast local/dev responses finish in < 100 ms which makes
  // the bar flash too briefly to notice without this tail.
  const [httpBusy, setHttpBusy] = useState(false);
  useEffect(() => {
    if (count > 0) {
      setHttpBusy(true);
      return;
    }
    const t = window.setTimeout(() => setHttpBusy(false), 400);
    return () => window.clearTimeout(t);
  }, [count]);

  const busy = navigation.state !== 'idle' || httpBusy || locationBusy;
  if (!busy) return null;
  return <LinearProgress />;
}
