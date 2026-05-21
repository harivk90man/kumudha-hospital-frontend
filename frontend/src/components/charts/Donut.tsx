import { cn } from '@/utils/cn';

/**
 * Donut chart — pure SVG. Each slice is a stroke-dasharray arc on a
 * single circle, so there's no path-arc math headache. Centre carries
 * an optional headline (e.g. total) + sub-line. Click each slice to
 * forward to a parent handler (filter, drill, etc.).
 *
 * Built ground-up so the dashboard ships with no chart-lib dep.
 */

export interface DonutSlice {
  /** Stable key — also used as click payload. */
  key: string;
  label: string;
  value: number;
  /** Tailwind class for the stroke colour, e.g. `stroke-primary`. */
  stroke: string;
  /** Tailwind class for the legend dot, e.g. `bg-primary`. */
  dot?: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centreLabel?: string;
  centreSub?: string;
  onSliceClick?: (key: string) => void;
  className?: string;
}

export function Donut({
  slices,
  size = 160,
  thickness = 18,
  centreLabel,
  centreSub,
  onSliceClick,
  className,
}: DonutProps): JSX.Element {
  const total = slices.reduce((s, x) => s + x.value, 0);
  // SVG arc trick: a single full circle, each slice expressed as a
  // dasharray segment along the circumference. Rotate -90° so the
  // first slice starts at 12 o'clock (the natural reading start).
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <div
        className={cn('flex items-center justify-center text-xxs text-muted-foreground', className)}
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  let offsetSoFar = 0;
  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Distribution"
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={thickness}
            className="stroke-muted/30"
          />
          {slices.map((s) => {
            const len = (s.value / total) * c;
            // 0.5 px gap between adjacent slices keeps the donut from
            // reading as one continuous ring when slices are similar
            // colour but distinct categories.
            const gap = slices.length > 1 ? Math.min(2, len * 0.05) : 0;
            const visible = Math.max(0, len - gap);
            const dashArr = `${visible} ${c - visible}`;
            const dashOff = -offsetSoFar;
            offsetSoFar += len;
            return (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={thickness}
                strokeDasharray={dashArr}
                strokeDashoffset={dashOff}
                strokeLinecap="butt"
                className={cn(
                  s.stroke,
                  onSliceClick && 'cursor-pointer transition-opacity duration-150 hover:opacity-80',
                )}
                onClick={onSliceClick ? () => onSliceClick(s.key) : undefined}
                style={{ pointerEvents: onSliceClick ? 'auto' : 'none' }}
              >
                <title>{`${s.label} — ${s.value}`}</title>
              </circle>
            );
          })}
        </g>
      </svg>
      {(centreLabel || centreSub) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centreLabel && (
            <div className="text-base font-semibold tabular-nums leading-tight">
              {centreLabel}
            </div>
          )}
          {centreSub && (
            <div className="text-xxs uppercase tracking-wider text-muted-foreground">
              {centreSub}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
