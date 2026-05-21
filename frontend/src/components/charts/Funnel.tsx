import { cn } from '@/utils/cn';

/**
 * Patient-flow funnel — a vertical sequence of stage cards, each
 * width-proportional to its share of the top stage. Small drop-off
 * label between stages so the owner sees where the flow leaks
 * (e.g. "32% drop between Booked → Arrived").
 *
 * Pure flex / Tailwind. No SVG needed for this one.
 */
export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  /** Tailwind classes for the bar fill, e.g. `bg-primary/80`. */
  fill: string;
}

interface FunnelProps {
  stages: FunnelStage[];
  /** Format the count display. Defaults to localised number. */
  format?: (v: number) => string;
  className?: string;
}

export function Funnel({
  stages,
  format = (v) => v.toLocaleString(),
  className,
}: FunnelProps): JSX.Element | null {
  if (stages.length === 0) return null;
  const top = Math.max(stages[0].value, 1);
  return (
    <ol className={cn('flex flex-col gap-1', className)}>
      {stages.map((s, i) => {
        const pct = (s.value / top) * 100;
        const prev = i > 0 ? stages[i - 1] : null;
        const dropPct =
          prev && prev.value > 0
            ? ((prev.value - s.value) / prev.value) * 100
            : 0;
        return (
          <li key={s.key} className="flex flex-col gap-1">
            {prev && (
              <div className="flex items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
                {dropPct > 0 ? (
                  <span className="text-warning">
                    ↓ {dropPct.toFixed(0)}% drop
                  </span>
                ) : (
                  <span>↓</span>
                )}
              </div>
            )}
            <div className="relative h-9 overflow-hidden rounded-md bg-muted/30">
              <div
                className={cn('absolute inset-y-0 left-0 transition-[width]', s.fill)}
                style={{ width: `${Math.max(pct, 4)}%` }}
                aria-hidden="true"
              />
              <div className="relative flex h-full items-center justify-between px-3 text-xs">
                <span className="font-medium text-foreground">{s.label}</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {format(s.value)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
