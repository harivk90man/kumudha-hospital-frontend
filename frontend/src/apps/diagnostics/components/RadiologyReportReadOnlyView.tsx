import type { RadiologyOrderQueueEntry } from '@/features/radiology';

/**
 * Chrome blocks top-level navigation to data: URIs, so we convert to a
 * blob: URL on click — browsers allow opening those in a new tab.
 */
const openDataUriInNewTab = (dataUri: string): void => {
  const [header, b64] = dataUri.split(',');
  const mime = (header.match(/:(.*?);/) ?? [])[1] ?? 'image/jpeg';
  const raw  = atob(b64);
  const buf  = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
};

interface RadiologyReportReadOnlyViewProps {
  order: RadiologyOrderQueueEntry;
}

export function RadiologyReportReadOnlyView({
  order,
}: RadiologyReportReadOnlyViewProps): JSX.Element {
  const images = order.imagesUrl ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Impression
      </div>
      <p className="whitespace-pre-wrap text-sm">
        {order.resultSummary ?? '—'}
      </p>

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
                <button
                  type="button"
                  onClick={() => openDataUriInNewTab(url)}
                  title={`Open image ${idx + 1} in new tab`}
                  className="h-full w-full cursor-zoom-in"
                >
                  <img
                    src={url}
                    alt={`${order.testName} ${idx + 1}`}
                    className="h-full w-full object-cover transition hover:opacity-90"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
