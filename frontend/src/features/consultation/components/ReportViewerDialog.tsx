import { useEffect } from 'react';
import { FileText, FlaskConical, Scan, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { LabOrder, LabResultFlag } from '@/features/lab';
import type { RadiologyOrder } from '@/features/radiology';
import type { PatientSummary } from '@/features/patient';

/**
 * In-app report viewer modal. Replaces a real PDF link with a styled
 * representation of the lab / radiology report — content is sourced
 * from the order's own fields (resultSummary, flag, timestamps),
 * so the paperclip click always renders the right report for the
 * encounter rather than a 404 PDF.
 */

export type ReportViewerInput =
  | { kind: 'lab';       order: LabOrder;       patient: PatientSummary }
  | { kind: 'radiology'; order: RadiologyOrder; patient: PatientSummary }
  | null;

interface ReportViewerDialogProps {
  value: ReportViewerInput;
  onClose: () => void;
}

const flagToneClass: Record<LabResultFlag, string> = {
  normal:        'bg-success/15 text-success',
  low:           'bg-warning/15 text-warning',
  high:          'bg-warning/15 text-warning',
  critical_low:  'bg-danger/15 text-danger',
  critical_high: 'bg-danger/15 text-danger',
};

const flagLabel: Record<LabResultFlag, string> = {
  normal:        'Normal',
  low:           'Low',
  high:          'High',
  critical_low:  'Critical low',
  critical_high: 'Critical high',
};

const formatDateTime = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export function ReportViewerDialog({ value, onClose }: ReportViewerDialogProps): JSX.Element | null {
  // Close on Escape
  useEffect(() => {
    if (!value) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [value, onClose]);

  if (!value) return null;

  const { kind, order, patient } = value;
  const Icon = kind === 'lab' ? FlaskConical : Scan;
  const reportLabel = kind === 'lab' ? 'Laboratory Report' : 'Radiology Report';
  const labOrder = kind === 'lab' ? (order as LabOrder) : null;
  const radOrder = kind === 'radiology' ? (order as RadiologyOrder) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={reportLabel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-hairline bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Letterhead */}
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {reportLabel}
              </h2>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                Kumudha Hospital · Chennai
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report"
            className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Patient + order meta */}
        <section className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-hairline px-6 py-4 text-sm">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Patient</div>
            <div className="font-medium">{patient.fullName}</div>
            <div className="text-xs text-muted-foreground">
              {patient.gender.toUpperCase()} · {patient.ageYears}y ·{' '}
              <span className="font-mono tabular-nums">{patient.uhid}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Test</div>
            <div className="font-medium">{order.testName}</div>
            <div className="font-mono text-xs text-muted-foreground">{order.testCode}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Ordered</div>
            <div className="font-mono tabular-nums text-xs">{formatDateTime(order.orderedAt)}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</div>
            <div className="font-mono tabular-nums text-xs capitalize">
              {order.status.replace(/_/g, ' ')}
            </div>
          </div>
        </section>

        {/* Result body */}
        <section className="px-6 py-5 text-sm leading-relaxed">
          {kind === 'lab' && labOrder && (
            <>
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Result</span>
                {labOrder.flag && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    flagToneClass[labOrder.flag],
                  )}>
                    {flagLabel[labOrder.flag]}
                  </span>
                )}
              </div>
              {labOrder.resultValue && (
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums">{labOrder.resultValue}</span>
                  {labOrder.resultUnit && (
                    <span className="text-xs text-muted-foreground">{labOrder.resultUnit}</span>
                  )}
                </div>
              )}
              <p className="text-foreground">
                {labOrder.resultSummary ?? 'Report pending — no clinical summary recorded.'}
              </p>
              {labOrder.componentResults && labOrder.componentResults.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Panel components
                  </div>
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Component</th>
                        <th className="py-2 pr-3 font-medium">Value</th>
                        <th className="py-2 pr-3 font-medium">Unit</th>
                        <th className="py-2 pr-3 font-medium">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labOrder.componentResults.map((c, idx) => (
                        <tr key={`${c.componentCode}-${idx}`} className="border-b border-hairline last:border-b-0">
                          <td className="py-1.5 pr-3 font-medium">{c.componentName}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{c.value || '—'}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{c.unit ?? '—'}</td>
                          <td className="py-1.5 pr-3">
                            {c.flag && (
                              <span className={cn(
                                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                flagToneClass[c.flag],
                              )}>
                                {flagLabel[c.flag]}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {kind === 'radiology' && radOrder && (
            <>
              <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Modality
              </div>
              <p className="mb-4 text-foreground capitalize">{radOrder.modality}</p>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Impression
              </div>
              <p className="text-foreground">
                {radOrder.resultSummary ?? 'Report pending — no impression recorded.'}
              </p>
              {radOrder.imagesUrl && radOrder.imagesUrl.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Images
                  </div>
                  {/* Render the X-ray (data URL or remote) inline so the
                      doctor sees the film directly. Each image is also
                      a link to open the full-size version in a new tab. */}
                  <div className="flex flex-wrap gap-3">
                    {radOrder.imagesUrl.map((url, idx) => (
                      <a
                        key={`${url}-${idx}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block overflow-hidden rounded border border-hairline bg-black/5 transition-shadow hover:shadow-md"
                        aria-label={`Open image ${idx + 1} in new tab`}
                      >
                        <img
                          src={url}
                          alt={`Image ${idx + 1}`}
                          className="block max-h-72 w-auto max-w-full object-contain"
                          loading="lazy"
                        />
                        <span className="flex items-center justify-between gap-2 border-t border-hairline px-2 py-1 text-[10px] text-muted-foreground group-hover:text-foreground">
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Image {idx + 1}
                          </span>
                          <span>Open full size</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Footer note */}
        <footer className="border-t border-hairline px-6 py-3 text-[11px] text-muted-foreground">
          Report generated for OP <span className="font-mono">{order.id}</span>.
          This is a sample report viewer — the real backend renders the lab/radiologist's signed PDF.
        </footer>
      </div>
    </div>
  );
}
