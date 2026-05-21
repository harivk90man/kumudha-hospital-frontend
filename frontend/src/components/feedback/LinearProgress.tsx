const PT = 'm3-pt 2s linear infinite';
const PS = 'm3-ps 2s linear infinite';
const ST = 'm3-st 2s linear infinite';
const SS = 'm3-ss 2s linear infinite';

/**
 * Material Design 3 indeterminate linear progress indicator.
 * 3px fixed strip at the top of the viewport, accent-coloured.
 *
 * Two bars, each split into an outer translator and inner scaler so
 * the translate and scale transforms stay on separate elements (no
 * conflict). Keyframes are defined in globals.css where per-keyframe
 * animation-timing-function is valid CSS syntax.
 */
export function LinearProgress(): JSX.Element {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading"
      className="fixed inset-x-0 top-0 z-[9999] h-[3px] overflow-hidden bg-primary/20"
    >
      <div className="absolute inset-y-0 left-0 w-full" style={{ animation: PT }}>
        <div className="h-full w-full origin-left bg-primary" style={{ animation: PS }} />
      </div>
      <div className="absolute inset-y-0 left-0 w-full" style={{ animation: ST }}>
        <div className="h-full w-full origin-left bg-primary" style={{ animation: SS }} />
      </div>
    </div>
  );
}
