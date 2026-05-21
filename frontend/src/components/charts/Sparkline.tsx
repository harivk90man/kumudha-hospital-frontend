import { useId } from 'react';
import { cn } from '@/utils/cn';

/**
 * Tiny inline SVG sparkline — fixed-aspect, scales to its parent's
 * width. Renders an area + line; first/last points get a small dot.
 *
 * Built ground-up (no chart lib) so the whole owner dashboard ships
 * with zero new dependencies.
 */
export interface SparklineProps {
  values: number[];
  height?: number;
  strokeClass?: string;
  fillClass?: string;
  className?: string;
  ariaLabel?: string;
}

export function Sparkline({
  values,
  height = 36,
  strokeClass = 'text-primary',
  fillClass = 'fill-primary/15',
  className,
  ariaLabel,
}: SparklineProps): JSX.Element {
  const id = useId();
  if (values.length === 0) {
    return (
      <div
        className={cn('text-xxs text-muted-foreground', className)}
        style={{ height }}
        aria-label={ariaLabel ?? 'No data'}
      >
        —
      </div>
    );
  }
  // Use a fixed viewBox; SVG scales to fit the parent. y-flip in path.
  const W = 100;
  const H = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? W / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = H - ((v - min) / range) * H;
    return [x, y] as const;
  });
  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  const areaPath = `${linePath} L ${W.toFixed(2)} ${H} L 0 ${H} Z`;
  const last = points[points.length - 1];
  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? 'Trend'}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('block w-full', className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={`spark-grad-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaPath}
        className={cn('stroke-none', fillClass)}
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClass}
      />
      {last && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={1.6}
          className={strokeClass}
          fill="currentColor"
        />
      )}
    </svg>
  );
}
