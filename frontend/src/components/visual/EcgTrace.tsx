import { cn } from '@/utils/cn';

/**
 * Ambient ECG strip animation. Used on login page brand panels for
 * on-brand "I’m a hospital app" visual texture without competing with
 * the type. Pure CSS — no JS, no layout impact.
 *
 * Mechanism: the SVG renders 2× the visible beats at 200% container
 * width and is scrolled -50% (= one container width = one set of
 * beats) by the `animate-ecg-scroll` Tailwind animation. Because the
 * second half of the strip is identical to the first, the loop is
 * seamless.
 *
 * `currentColor` for stroke so callers tone it via text-color (the
 * brand panel sets it to a low-opacity primary-foreground tint).
 */

interface EcgTraceProps {
  className?: string;
  /** Stroke width in SVG user units. Default 1.5. */
  strokeWidth?: number;
  /** How many PQRST beats fit in one container width. Default 6. */
  beats?: number;
}

/** One PQRST beat — 200 SVG x-units wide, baseline at y=50. */
const oneBeat = (offsetX: number): string => {
  const x = (n: number): number => offsetX + n;
  return [
    `M ${x(0)} 50`,
    `L ${x(20)} 50`,                                // baseline
    `Q ${x(28)} 42 ${x(36)} 50`,                    // P wave
    `L ${x(50)} 50`,
    `L ${x(54)} 53`,                                // Q dip
    `L ${x(60)} 18`,                                // R spike up (lub)
    `L ${x(66)} 70`,                                // S drop
    `L ${x(72)} 50`,                                // back to baseline
    `L ${x(110)} 50`,
    `Q ${x(130)} 32 ${x(150)} 50`,                  // T wave (dub)
    `L ${x(200)} 50`,                               // tail
  ].join(' ');
};

export function EcgTrace({
  className,
  strokeWidth = 1.5,
  beats = 6,
}: EcgTraceProps): JSX.Element {
  // Render 2× beats so the -50% scroll lands exactly on the start of
  // the second copy (= visually identical to t=0).
  const totalBeats = beats * 2;
  const totalUnits = totalBeats * 200;
  const path = Array.from({ length: totalBeats }, (_, i) => oneBeat(i * 200)).join(' ');

  return (
    <div
      className={cn('pointer-events-none relative overflow-hidden', className)}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${totalUnits} 100`}
        preserveAspectRatio="none"
        className="absolute inset-y-0 left-0 h-full w-[200%] animate-ecg-scroll"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          // Keep stroke at constant CSS px even though
          // preserveAspectRatio="none" stretches the path horizontally.
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
