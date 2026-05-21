import { Link } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { useAuth, userHas } from '@/features/auth';
import { cn } from '@/utils/cn';
import type { ShiftLockState, ShiftType } from '../shiftCloseStore';

interface ShiftLockedBannerProps {
  lock: ShiftLockState;
  className?: string;
}

const SHIFT_LABEL: Record<ShiftType, string> = {
  morning: 'Morning',
  evening: 'Evening',
};

const formatTime = (d: Date): string =>
  d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Inline banner shown on every payment surface (cashier, walk-in,
 * inline invoice payment) when the active counter is locked.
 *
 * Two lock reasons drive two distinct copies + CTAs:
 *   - `no_open`: shift has never been opened today. Tells the user the
 *     till hasn't been opened; if they hold `open_shift` (owner / chief
 *     doctor) the CTA is "Open shift now" → `/cashier/shift`. Frontdesk
 *     sees a "Ask owner or chief doctor to open the shift" message.
 *   - `closed`: an earlier shift was closed and the next hasn't been
 *     opened. Tells the user WHO closed, WHEN, and routes the same way.
 *
 * Render `null` when `lock.locked === false` so callers can drop this
 * unconditionally above any payment widget.
 */
export function ShiftLockedBanner({
  lock,
  className,
}: ShiftLockedBannerProps): JSX.Element | null {
  const { user } = useAuth();
  if (!lock.locked) return null;

  const canOpen = userHas(user, 'open_shift');
  const shiftLabel = SHIFT_LABEL[lock.activeShift.shiftType];
  const isClosed = lock.reason === 'closed';
  const closed = lock.closedShift;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning',
        className,
      )}
    >
      <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {isClosed && closed ? (
          <>
            <span className="font-semibold">
              {shiftLabel} shift is closed — payments paused on this counter.
            </span>
            <span className="opacity-80">
              Closed by {closed.closedByName} ({closed.closedByRole}) at{' '}
              {formatTime(new Date(closed.closedAt))}. Any payment now would
              land in the closed window and create silent variance.
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold">
              No shift open on this counter yet.
            </span>
            <span className="opacity-80">
              {canOpen
                ? 'Declare the opening float to unlock payments for this shift.'
                : 'Ask owner or chief doctor to open the shift before taking payments.'}
            </span>
          </>
        )}
        <Link
          to="/cashier/shift"
          className="mt-1 inline-flex items-center gap-1 text-xxs font-semibold underline-offset-2 hover:underline"
        >
          {canOpen ? 'Open shift now' : 'View shift status'}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
