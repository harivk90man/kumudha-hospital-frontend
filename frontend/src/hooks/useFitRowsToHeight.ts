import { useEffect, useState, type RefObject } from 'react';

interface FitOptions {
  /** Estimated height of a single data row in px. Default 44. */
  rowHeight?: number;
  /** Height of the sticky <thead> in px. Default 36. */
  theadHeight?: number;
  /** Height of the pagination footer strip in px. Default 44. */
  footerHeight?: number;
  /** Minimum rows to always return. Default 5. */
  minRows?: number;
  /** Upper cap to prevent absurd values on large monitors. Default 200. */
  maxRows?: number;
}

/**
 * Returns the number of table rows that fit between the container's top
 * edge and the bottom of the viewport, without overflow.
 *
 * Uses `getBoundingClientRect().top` rather than `clientHeight` so it
 * works correctly on full-page lists where the container height is
 * content-driven, not viewport-constrained.
 *
 * Recomputes on window resize and when the container element resizes
 * (e.g. the non-table content above shifts layout).
 */
export function useFitRowsToHeight(
  containerRef: RefObject<HTMLElement | null>,
  options: FitOptions = {},
): number {
  const {
    rowHeight = 44,
    theadHeight = 36,
    footerHeight = 44,
    minRows = 5,
    maxRows = 200,
  } = options;

  // Start with a mid-range guess so first render doesn't flash 5 rows.
  const [rows, setRows] = useState<number>(15);

  useEffect(() => {
    const compute = (): void => {
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // Space from the container top to viewport bottom, minus thead + pagination + 8px buffer.
      const usable = window.innerHeight - top - theadHeight - footerHeight - 8;
      const n = Math.max(minRows, Math.min(maxRows, Math.floor(usable / rowHeight)));
      setRows((prev) => (prev === n ? prev : n));
    };

    compute();

    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', compute);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  // containerRef identity is stable; options are primitives re-checked via deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight, theadHeight, footerHeight, minRows, maxRows]);

  return rows;
}
