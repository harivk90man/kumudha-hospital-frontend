import { Card } from '@/components/layout';
import type { RadiologyOrderQueueEntry } from '@/features/radiology';

interface RadiologyReportReadOnlyViewProps {
  order: RadiologyOrderQueueEntry;
}

/**
 * Read-only inspection of a radiologist’s report. Used as the inline
 * expand body on RadiologyPage rows whose status is `released` —
 * impression, notes, and any captured images are shown but cannot be
 * edited (parity with the lab worklist’s read-only view).
 */
export function RadiologyReportReadOnlyView({
  order,
}: RadiologyReportReadOnlyViewProps): JSX.Element {
  const images = order.imagesUrl ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Impression
          </div>
          <p className="whitespace-pre-wrap text-sm">
            {order.resultSummary ?? '—'}
          </p>
        </div>

        {order.notes && (
          <div className="mt-3 flex flex-col gap-1 border-t pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </span>
            <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Images ({images.length})
            </span>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {images.map((url, idx) => (
                <li key={url} className="aspect-square overflow-hidden rounded-md border">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open image ${idx + 1}`}
                  >
                    <img
                      src={url}
                      alt={`${order.testName} ${idx + 1}`}
                      className="h-full w-full object-cover transition hover:opacity-90"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
