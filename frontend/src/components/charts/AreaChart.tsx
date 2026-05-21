import { useId, useMemo, useState } from 'react';
import { cn } from '@/utils/cn';

/**
 * Multi-series area chart — pure SVG. Renders up to ~6 series stacked
 * by parent ordering (NOT auto-stacked; pass pre-stacked values if you
 * want a stack). Each series gets its own filled area + crisp line on
 * top so individual series can be distinguished even when overlapping.
 *
 * Hover surfaces a vertical guide + a small tooltip pegged to the
 * nearest x-tick. No chart-lib dependency — keeps the dashboard
 * bundle slim.
 */
export interface AreaSeries {
  key: string;
  label: string;
  values: number[];
  /** Tailwind stroke colour, e.g. `stroke-primary`. */
  stroke: string;
  /** Tailwind fill colour (usually `fill-primary/15`). */
  fill: string;
  /** Legend dot colour, e.g. `bg-primary`. */
  dot: string;
}

interface AreaChartProps {
  /** x-axis tick labels — one per index. */
  xLabels: string[];
  series: AreaSeries[];
  /** Formatter for the y-axis + tooltip value display. */
  format?: (v: number) => string;
  /** Show value tooltip on hover. Default true. */
  tooltip?: boolean;
  height?: number;
  className?: string;
}

export function AreaChart({
  xLabels,
  series,
  format = (v) => v.toLocaleString(),
  tooltip = true,
  height = 180,
  className,
}: AreaChartProps): JSX.Element {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  const { W, H, padL, padR, padT, padB, max, min } = useMemo(() => {
    const W = 800;
    const H = 240;
    const padL = 36;
    const padR = 12;
    const padT = 12;
    const padB = 28;
    let max = 0;
    let min = Infinity;
    for (const s of series) {
      for (const v of s.values) {
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
    if (min === Infinity) min = 0;
    // Pad max by ~10% so the line never kisses the top edge.
    max = max === 0 ? 1 : max * 1.1;
    min = 0;
    return { W, H, padL, padR, padT, padB, max, min };
  }, [series]);

  const n = xLabels.length;
  const stepX = n > 1 ? (W - padL - padR) / (n - 1) : 0;
  const yFor = (v: number): number =>
    H - padB - ((v - min) / (max - min || 1)) * (H - padT - padB);
  const xFor = (i: number): number => padL + i * stepX;

  // Y-axis tick lines — 4 evenly-spaced rows.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + (max - min) * t);

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (!tooltip || n === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const xVB = (xPx / rect.width) * W;
    const i = Math.round((xVB - padL) / stepX);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Trend"
        className="block w-full"
        style={{ height }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y grid lines + labels */}
        {yTicks.map((t, i) => {
          const y = yFor(t);
          return (
            <g key={`y-${i}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-hairline"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                className="fill-muted-foreground"
              >
                {format(t)}
              </text>
            </g>
          );
        })}

        {/* Areas + lines for each series */}
        {series.map((s) => {
          if (s.values.length === 0) return null;
          const linePts = s.values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
          const areaPts = `${padL},${H - padB} ${linePts} ${xFor(s.values.length - 1)},${H - padB}`;
          return (
            <g key={s.key}>
              <polygon
                points={areaPts}
                className={s.fill}
                fill="currentColor"
                opacity="0.18"
              />
              <polyline
                points={linePts}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={s.stroke}
                stroke="currentColor"
              />
            </g>
          );
        })}

        {/* X axis labels — show every Nth so labels don't overlap */}
        {xLabels.map((l, i) => {
          const stride = Math.max(1, Math.ceil(n / 8));
          if (i % stride !== 0 && i !== n - 1) return null;
          return (
            <text
              key={`x-${i}`}
              x={xFor(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="9"
              className="fill-muted-foreground"
            >
              {l}
            </text>
          );
        })}

        {/* Hover guide */}
        {hover !== null && (
          <g>
            <line
              x1={xFor(hover)}
              x2={xFor(hover)}
              y1={padT}
              y2={H - padB}
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-muted-foreground/60"
              strokeDasharray="2 3"
            />
            {series.map((s) => {
              if (s.values[hover] === undefined) return null;
              return (
                <circle
                  key={`hov-${s.key}`}
                  cx={xFor(hover)}
                  cy={yFor(s.values[hover])}
                  r="3"
                  className={s.stroke}
                  fill="currentColor"
                />
              );
            })}
          </g>
        )}

        {/* Filter defs used by some browsers for stable rendering */}
        <defs>
          <clipPath id={`clip-${id}`}>
            <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} />
          </clipPath>
        </defs>
      </svg>

      {/* Tooltip */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xxs shadow-elevated"
          style={{
            left: `calc(${(xFor(hover) / W) * 100}% + 4px)`,
            transform: 'translateX(0)',
          }}
        >
          <div className="font-mono tabular-nums">{xLabels[hover]}</div>
          {series.map((s) => (
            <div key={`tt-${s.key}`} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden="true" />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-mono tabular-nums">
                {format(s.values[hover] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
