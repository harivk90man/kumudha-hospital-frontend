import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, FileText, FlaskConical, Scan } from 'lucide-react';
import { cn } from '@/utils/cn';
import { CardTitle } from '@/components/layout';
import type { LabResultFlag } from '@/features/lab';
import type { VisitHistoryItem, VisitReportSummary } from '../consultationTypes';

interface VisitHistoryPanelProps {
  visits: VisitHistoryItem[];
  onSelect?: (opNumber: string) => void;
  selectedOpNumber?: string | null;
  className?: string;
}

const PAGE_SIZE = 5;

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const flagTone: Record<LabResultFlag, string> = {
  normal:       'text-success',
  low:          'text-warning',
  high:         'text-warning',
  critical_low: 'text-danger',
  critical_high:'text-danger',
};

function ReportLine({ report }: { report: VisitReportSummary }): JSX.Element {
  const Icon = report.kind === 'lab' ? FlaskConical : Scan;
  const tone = report.flag ? flagTone[report.flag] : 'text-muted-foreground';
  return (
    <li className="flex items-start gap-2 py-1 text-xs">
      <CheckCircle2 className={cn('mt-0.5 h-3 w-3 flex-shrink-0', tone)} />
      <Icon className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-medium">{report.testName}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{report.testCode}</span>
        </div>
        <div className="text-muted-foreground">{report.resultLine}</div>
      </div>
    </li>
  );
}

export function VisitHistoryPanel({
  visits,
  onSelect,
  selectedOpNumber,
  className,
}: VisitHistoryPanelProps): JSX.Element {
  const [page,     setPage]     = useState(1);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate,   setToDate]   = useState<string>('');

  // Filter the full list first, then paginate the result so the count
  // and page math stay consistent with what the doctor sees.
  const filteredVisits = visits.filter((v) => {
    const day = v.visitDate.slice(0, 10); // visitDate is ISO; compare YYYY-MM-DD.
    if (fromDate && day < fromDate) return false;
    if (toDate   && day > toDate)   return false;
    return true;
  });

  // Reset to first page whenever the underlying list or filter changes.
  useEffect(() => { setPage(1); }, [visits, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / PAGE_SIZE));
  const pageVisits = filteredVisits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterActive = Boolean(fromDate || toDate);
  const clearFilter = (): void => { setFromDate(''); setToDate(''); };

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label="Visit history">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        {/* Left: title + count stacked */}
        <div className="flex flex-col gap-0.5">
          <CardTitle>Visit history</CardTitle>
          <span className="text-xs text-muted-foreground">
            {filterActive
              ? `${filteredVisits.length} of ${visits.length} past visits`
              : `${visits.length} past visits`}
          </span>
        </div>

        {/* Right: compact from/to date filter inline with the title */}
        {visits.length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">From</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-none border-0 border-b border-hairline bg-transparent py-1 text-xs text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">To</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-none border-0 border-b border-hairline bg-transparent py-1 text-xs text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </label>
            {filterActive && (
              <button
                type="button"
                onClick={clearFilter}
                className="text-[11px] text-primary hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {visits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No prior visits on record.</p>
      ) : filteredVisits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No visits match the selected date range.</p>
      ) : (
        <>
          <ol className="relative ml-2 divide-y divide-hairline border-t border-hairline pl-4">
            {pageVisits.map((v, idx) => {
              const isSelected = selectedOpNumber === v.opNumber;
              const isLast     = idx === pageVisits.length - 1;
              const cardBody = (
                <div
                  className={cn(
                    'flex flex-col gap-1 py-3 text-left transition-colors',
                    onSelect && 'cursor-pointer hover:bg-muted/20',
                    isSelected && 'bg-primary/5',
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{formatDate(v.visitDate)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{v.opNumber}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {v.doctorName} · {v.department}
                  </div>
                  <div className="text-sm">{v.chiefComplaint}</div>
                  {v.primaryDiagnosis && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Dx: </span>
                      <span className="font-medium">{v.primaryDiagnosis}</span>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Rx × {v.prescriptionCount}
                    </span>
                    {v.hasLabReports && (
                      <span className="inline-flex items-center gap-1">
                        <FlaskConical className="h-3 w-3" /> Lab
                      </span>
                    )}
                    {v.hasRadiologyReports && (
                      <span className="inline-flex items-center gap-1">
                        <Scan className="h-3 w-3" /> Radiology
                      </span>
                    )}
                  </div>

                  {v.reports && v.reports.length > 0 && (
                    <ul className="mt-2 flex flex-col">
                      {v.reports.map((r) => (
                        <ReportLine key={`${v.opNumber}-${r.testCode}`} report={r} />
                      ))}
                    </ul>
                  )}
                </div>
              );
              return (
                <li key={v.opNumber} className="relative">
                  <span className="absolute -left-[1.42rem] top-4 z-10 h-2 w-2 rounded-full bg-primary" />
                  {!isLast && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute w-px bg-hairline"
                      style={{ left: '-1.17rem', top: '1.5rem', bottom: '-1rem' }}
                    />
                  )}
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(v.opNumber)}
                      aria-label={`Open visit ${v.opNumber} from ${formatDate(v.visitDate)}`}
                      className="block w-full text-left focus:outline-none focus-visible:bg-muted/30"
                    >
                      {cardBody}
                    </button>
                  ) : (
                    cardBody
                  )}
                </li>
              );
            })}
          </ol>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visits.length)} of {visits.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                  className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 tabular-nums">{page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  aria-label="Next page"
                  className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
