import { useEffect, useState } from 'react';

interface LinearProgressProps {
  completing?: boolean;
}

/**
 * NProgress-style top-of-page loading bar.
 *
 * loading:    starts at 8% immediately, grows to 85% over ~8 s
 * completing: fills to 100% in 150 ms, then fades out over 300 ms
 *
 * GlobalProgressBar controls the completing prop and unmounts after 500 ms.
 */
export function LinearProgress({ completing = false }: LinearProgressProps): JSX.Element {
  const [width, setWidth] = useState(8);

  // On mount: let the browser paint the 8% bar first, then start the
  // slow grow so the transition actually fires (needs two frames).
  useEffect(() => {
    const t = window.setTimeout(() => setWidth(85), 16);
    return () => window.clearTimeout(t);
  }, []);

  // When completing, fill to 100% immediately.
  useEffect(() => {
    if (completing) setWidth(100);
  }, [completing]);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading"
      style={{
        position: 'fixed',
        inset: '0 0 auto 0',
        zIndex: 9999,
        height: 6,
        pointerEvents: 'none',
        opacity: completing ? 0 : 1,
        transition: completing ? 'opacity 300ms ease 150ms' : undefined,
      }}
    >
      <div
        style={{
          height: '100%',
          background: 'hsl(var(--primary))',
          borderRadius: '0 3px 3px 0',
          width: `${width}%`,
          transition: completing
            ? 'width 150ms ease-in'
            : 'width 8000ms cubic-bezier(0.05, 0.1, 0.1, 1)',
        }}
      />
    </div>
  );
}
