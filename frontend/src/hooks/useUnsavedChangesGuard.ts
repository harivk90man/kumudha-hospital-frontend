import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Unsaved-changes guard. Two protections in one hook:
 *
 *  1. **Browser-level** — `window.beforeunload` triggers the platform’s
 *     native "Leave site?" prompt on tab close / refresh / external
 *     navigation. Standard healthcare-software safety net.
 *  2. **App-level** — react-router’s `useBlocker` intercepts in-app
 *     navigation when the form is dirty. We use native `window.confirm()`
 *     for the prompt to keep this lightweight (custom modal is a
 *     future enhancement; the brief explicitly defers it).
 *
 * Pass `true` while the form has unsaved changes; pass `false` once
 * the form is clean (post-submit, post-reset). The hook auto-cleans
 * up its listeners.
 *
 * Usage:
 *   const { formState: { isDirty } } = useForm(…);
 *   useUnsavedChangesGuard(isDirty);
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  message = 'You have unsaved changes. Are you sure you want to leave?',
): void {
  // beforeunload — survives tab close / refresh / external nav.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      // Most modern browsers ignore `returnValue` text and show a
      // canned string; setting it is still required to trigger the
      // prompt at all.
      e.returnValue = message;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, message]);

  // react-router blocker — intercepts in-app `<Link>` and `navigate()`
  // calls while the form is dirty. Native confirm() is enough for F1
  // per the brief.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    // eslint-disable-next-line no-alert
    const proceed = window.confirm(message);
    if (proceed) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, message]);
}
