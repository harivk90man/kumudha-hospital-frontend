import { Link } from 'react-router-dom';
import { Lock, Unlock, Wallet } from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  DEFAULT_COUNTER_ID,
  isShiftLocked,
  useCurrentCounterStore,
  useShiftCloseStore,
} from '@/features/billing';
import { useMemo } from 'react';

/**
 * Chief-doctor multi-role pill. Doctors who also hold `chief_doctor`
 * land on `/doctor/queue` by default; this pill surfaces the current
 * cashier-shift status in the top bar so they can jump to
 * `/cashier/shift` to open or close without leaving their primary
 * worklist.
 *
 * Renders only when the signed-in user holds `chief_doctor` — gated
 * by [DoctorLayout](apps/doctor/components/DoctorLayout.tsx).
 */
export function ChiefDoctorShiftPill(): JSX.Element {
  const counterId = useCurrentCounterStore((s) => s.counterId) || DEFAULT_COUNTER_ID;
  const closes = useShiftCloseStore((s) => s.closes);
  const opens = useShiftCloseStore((s) => s.opens);

  const lock = useMemo(
    () => isShiftLocked({ counterId, at: new Date(), closes, opens }),
    [counterId, closes, opens],
  );

  const locked = lock.locked;
  return (
    <Link
      to="/cashier/shift"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xxs font-medium transition-colors',
        locked
          ? 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20'
          : 'border-success/40 bg-success/10 text-success hover:bg-success/20',
      )}
    >
      <Wallet className="h-3 w-3" />
      {locked ? (
        <>
          <Lock className="h-3 w-3" />
          {lock.reason === 'closed' ? 'Shift closed' : 'Shift not open'}
        </>
      ) : (
        <>
          <Unlock className="h-3 w-3" /> Shift open
        </>
      )}
    </Link>
  );
}
