import { cn } from '@/utils/cn';

interface AuroraBackgroundProps {
  className?: string;
}

/**
 * Slow-drifting aurora background — three soft radial blobs that drift
 * and scale on different timelines (25s, 30s, 40s) so the motion never
 * syncs. Combined with `mix-blend-screen` on a primary-color parent it
 * produces a Claude/ChatGPT-style "drifting light" feel, no SVG/JS.
 *
 * Drop into any `position: relative` container; the component renders
 * `position: absolute` and `pointer-events-none`. Respects
 * `prefers-reduced-motion` via `motion-safe:` so users with reduced
 * motion see a static glow.
 */
export function AuroraBackground({ className }: AuroraBackgroundProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
    >
      <div className="absolute -left-24 -top-32 h-[34rem] w-[34rem] rounded-full bg-white/20 blur-3xl mix-blend-screen motion-safe:animate-aurora-1" />
      <div className="absolute -right-32 -bottom-24 h-[40rem] w-[40rem] rounded-full bg-white/15 blur-3xl mix-blend-screen motion-safe:animate-aurora-2" />
      <div className="absolute left-1/4 top-1/3 h-[22rem] w-[22rem] rounded-full bg-white/10 blur-3xl mix-blend-screen motion-safe:animate-aurora-3" />
    </div>
  );
}
