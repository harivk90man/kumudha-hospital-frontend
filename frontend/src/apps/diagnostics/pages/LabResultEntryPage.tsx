import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Breadcrumb } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import {
  fetchLabOrder,
  LabResultEntryPanel,
  LabResultReadOnlyView,
  type LabOrderQueueEntry,
} from '@/features/lab';

const FORM_ID = 'lab-result-entry-form';

/**
 * Standalone result-entry page for a single lab order. The
 * `LabResultEntryPanel` carries the actual table + value entry; this
 * wrapper resolves the order by id, lays out the page header (back
 * link + title + Save / Cancel CTAs top-right), and routes back to
 * the worklist on save.
 */
export function LabResultEntryPage(): JSX.Element {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<LabOrderQueueEntry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    setLoading(true);
    fetchLabOrder(orderId)
      .then((found) => {
        if (alive) setOrder(found);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [orderId]);

  // Read-only branch — `reported` and `released` orders are presented
  // as a finalized result. The page swaps to `LabResultReadOnlyView`
  // and drops the Save CTA. (`reported` keeps the tech's audit trail;
  // releasing happens from the worklist row's quick action.)
  const isReadOnly =
    order?.status === 'reported' || order?.status === 'released';

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[
          { label: 'Lab worklist', to: '/diagnostics/lab' },
          { label: order ? `${order.testName} (${order.testCode})` : 'Result' },
        ]}
        homeTo="/diagnostics/lab"
        homeLabel="Diagnostics"
      />

      {/* Header layout matches every other sub-page (Vitals / Payment
          / Patient edit) — ghost "Back" link above the title, primary
          CTA + Cancel aligned to the top-right of the row. */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/diagnostics/lab')}
            className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft /> Back to lab worklist
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {isReadOnly ? 'View result' : 'Enter result'}
          </h1>
          {order && (
            <p className="font-mono text-xxs text-muted-foreground tabular-nums">
              {order.patient.fullName} · {order.patient.uhid} · OP {order.opNumber} ·{' '}
              {order.panelName ?? order.testName} ({order.panelCode ?? order.testCode})
            </p>
          )}
        </div>
        {order && !isReadOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" form={FORM_ID} disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : <Check />}
              {submitting ? 'Saving…' : 'Save result'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/diagnostics/lab')}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        )}
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading order...
        </div>
      )}

      {!loading && !order && (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Order not found.
          </p>
        </Card>
      )}

      {order && (
        <>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span>UHID {order.patient.uhid}</span>
              <span className="text-muted-foreground">·</span>
              <span>OP {order.opNumber}</span>
              <span className="text-muted-foreground">·</span>
              <span className="capitalize">{order.specimen}</span>
              <span className="text-muted-foreground">·</span>
              <span>
                {order.patient.gender.toUpperCase()} · {order.patient.ageYears}y
              </span>
              {order.requiresFasting && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-warning">Fasting required</span>
                </>
              )}
            </div>
          </div>

          {isReadOnly ? (
            <LabResultReadOnlyView order={order} />
          ) : (
            <LabResultEntryPanel
              order={order}
              formId={FORM_ID}
              hideActions
              onSubmittingChange={setSubmitting}
              onSaved={() => navigate('/diagnostics/lab')}
            />
          )}
        </>
      )}
    </div>
  );
}
