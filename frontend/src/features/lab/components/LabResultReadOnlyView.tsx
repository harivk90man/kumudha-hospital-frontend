import { Card } from '@/components/layout';
import { StatusPill, type StatusPillProps } from '@/components/data-display';
import {
  type LabComponentResult,
  type LabResultFlag,
} from '../labTypes';

const flagTone: Record<LabResultFlag, StatusPillProps['tone']> = {
  normal: 'success',
  low: 'warning',
  high: 'warning',
  critical_low: 'danger',
  critical_high: 'danger',
};

const flagLabel: Record<LabResultFlag, string> = {
  normal: 'Normal',
  low: 'Low',
  high: 'High',
  critical_low: 'Critical low',
  critical_high: 'Critical high',
};

/**
 * Minimal shape — accepts both `LabOrderQueueEntry` (tech-side, with
 * patient/opNumber/specimen) and `LabOrder` (doctor-side snapshot,
 * which omits those context fields). All visible fields are optional;
 * the view renders whichever it has.
 */
export interface LabResultReadOnlyViewModel {
  patient?: { uhid: string };
  opNumber?: string;
  specimen?: string;
  reportedAt?: string;
  releasedAt?: string;
  componentResults?: LabComponentResult[];
  resultNumeric?: number;
  resultText?: string;
  resultSummary?: string;
  resultUnit?: string;
  flag?: LabResultFlag;
  notes?: string;
}

interface LabResultReadOnlyViewProps {
  order: LabResultReadOnlyViewModel;
}

/**
 * Read-only inspection of a lab order’s saved result. Used in three
 * places, each with slightly different available context:
 *  - LabPage worklist row expand (tech) — full LabOrderQueueEntry.
 *  - ReportResultsPanel on the doctor’s consultation Reports tab —
 *    overlays the live queue entry when available.
 *  - Same panel in past-visit Reports — falls back to the doctor’s
 *    snapshot (LabOrder) without queue overlay.
 *
 * Panel orders render the component-level breakdown; single-value
 * orders render the numeric + flag + unit big-display.
 */
export function LabResultReadOnlyView({
  order,
}: LabResultReadOnlyViewProps): JSX.Element {
  const isPanel = (order.componentResults?.length ?? 0) > 0;
  const hasContext = Boolean(
    order.patient || order.opNumber || order.specimen || order.reportedAt || order.releasedAt,
  );

  return (
    <div className="flex flex-col gap-4">
      {hasContext && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {order.patient && (
              <>
                <span>UHID {order.patient.uhid}</span>
                <span className="text-muted-foreground">·</span>
              </>
            )}
            {order.opNumber && (
              <>
                <span>OP {order.opNumber}</span>
                <span className="text-muted-foreground">·</span>
              </>
            )}
            {order.specimen && (
              <span className="capitalize">{order.specimen}</span>
            )}
            {order.reportedAt && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>Reported {new Date(order.reportedAt).toLocaleString()}</span>
              </>
            )}
            {order.releasedAt && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>Released {new Date(order.releasedAt).toLocaleString()}</span>
              </>
            )}
          </div>
        </div>
      )}

      <Card>
        {isPanel ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Parameter</th>
                  <th className="py-2 pr-3 font-medium">Value</th>
                  <th className="py-2 pr-3 font-medium">Unit</th>
                  <th className="py-2 pr-3 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {order.componentResults!.map((r) => (
                  <tr key={r.componentCode} className="border-b align-top last:border-b-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.componentName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {r.componentCode}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono tabular-nums">{r.value}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {r.unit ?? '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {r.flag ? (
                        <StatusPill tone={flagTone[r.flag]} size="sm">
                          {flagLabel[r.flag]}
                        </StatusPill>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Result
            </div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-2xl tabular-nums font-semibold">
                {order.resultNumeric ?? order.resultText ?? order.resultSummary ?? '—'}
              </span>
              {order.resultUnit && (
                <span className="text-sm text-muted-foreground">{order.resultUnit}</span>
              )}
              {order.flag && (
                <StatusPill tone={flagTone[order.flag]} size="sm">
                  {flagLabel[order.flag]}
                </StatusPill>
              )}
            </div>
            {order.resultSummary && order.resultNumeric !== undefined && (
              <p className="text-xs text-muted-foreground">{order.resultSummary}</p>
            )}
          </div>
        )}

        {order.notes && (
          <div className="mt-4 flex flex-col gap-1 border-t pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </span>
            <p className="whitespace-pre-wrap text-sm">{order.notes}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
