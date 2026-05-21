import { Clock } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Inline wait-aging chip — calm under 20m, amber 20–40m, soft red
 * 40–90m, stronger red emphasis ≥90m. Shared between OP coordination
 * and doctor queue so wait-time signal reads the same way across
 * surfaces. Tone-shifts let the eye scan a 70-row queue and find the
 * rows that have been waiting longest without reading any number.
 *
 * Pure presentational — caller computes the live minute count (often
 * via a 30s setInterval ticking against `appointmentTime` so the chip
 * doesn’t go stale between polls). No animation: a blinking chip
 * during a 10-hour OP day is exhausting; tone shift alone is enough.
 */
interface WaitChipProps {
  minutes: number;
  /** Override the className wrapper (e.g. add `ml-1.5` for inline use). */
  className?: string;
}

export function WaitChip({ minutes, className }: WaitChipProps): JSX.Element {
  // Bands match the doctor-fatigue brief: wider tiers so the colour
  // doesn’t shift on every 5m interval; the ≥90m tier picks up bg fill
  // (not just text) so the eye catches it on a busy table.
  const critical = minutes >= 90;
  const tone = critical
    ? 'bg-danger/12 text-danger font-semibold'
    : minutes >= 40
      ? 'text-danger'
      : minutes >= 20
        ? 'text-warning'
        : 'text-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5',
        critical && 'rounded-full px-1.5 py-px',
        tone,
        className,
      )}
    >
      <Clock className="h-3 w-3" />
      <span className="font-sans tabular-nums">{minutes}m</span>
    </span>
  );
}
