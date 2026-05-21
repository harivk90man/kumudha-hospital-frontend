import { cn } from '@/utils/cn';

/**
 * Hour-of-day heatmap — a single horizontal strip of 24 cells whose
 * opacity scales with the bucket's value. Cheap, scannable view of
 * "what time of day does revenue / footfall actually happen". Hovers
 * surface the exact value via native title.
 *
 * Pure flex; one cell per hour. The colour is fixed (consumer passes
 * a Tailwind tone class); intensity is opacity-based so a single
 * hue covers low and high.
 */
interface HourHeatmapProps {
  /** Length 24 — index 0 = midnight. Pass empty array to render zeros. */
  values: number[];
  /** Tailwind background class for the cell tone, e.g. `bg-primary`. */
  toneClass?: string;
  /** Format the cell title (hover tooltip). */
  format?: (v: number) => string;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_LABEL = (h: number): string => {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
};

export function HourHeatmap({
  values,
  toneClass = 'bg-primary',
  format = (v) => v.toLocaleString(),
  className,
}: HourHeatmapProps): JSX.Element {
  const safe = values.length === 24 ? values : Array(24).fill(0);
  const max = Math.max(...safe, 1);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="grid grid-cols-24 gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
        {HOURS.map((h) => {
          const v = safe[h] ?? 0;
          // Opacity ranges from 0.08 (visible empty cell) to 1.0
          // (peak). Linear scale — peaks read instantly, low cells
          // still register so the strip never has gaps.
          const opacity = 0.08 + (v / max) * 0.92;
          return (
            <div
              key={h}
              className={cn('h-7 rounded-sm', toneClass)}
              style={{ opacity: v === 0 ? 0.08 : opacity }}
              title={`${HOUR_LABEL(h)} — ${format(v)}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-24 text-[9px] text-muted-foreground" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
        {HOURS.map((h) => (
          <span key={h} className="text-center">
            {/* Show every 4th label so the row isn't a wall of digits. */}
            {h % 4 === 0 ? HOUR_LABEL(h) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
