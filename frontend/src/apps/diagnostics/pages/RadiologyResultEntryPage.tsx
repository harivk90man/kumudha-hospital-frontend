import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Breadcrumb } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import {
  fetchRadiologyOrder,
  type RadiologyOrderQueueEntry,
} from '@/features/radiology';
import { RadiologyReportForm } from '../components/RadiologyReportForm';
import { RadiologyReportReadOnlyView } from '../components/RadiologyReportReadOnlyView';

const FORM_ID = 'radiology-report-form';

/**
 * Full-page radiology report entry. Mounted at
 * `/diagnostics/radiology/:orderId/report` — the worklist row's
 * primary CTA navigates here directly. For `reported` / `released`
 * orders this page renders the read-only view (and hides the Save
 * CTA) so the same URL is the canonical view-and-edit surface.
 */
export function RadiologyResultEntryPage(): JSX.Element {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<RadiologyOrderQueueEntry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    setLoading(true);
    fetchRadiologyOrder(orderId)
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
  // as a finalized report. The page swaps to `RadiologyReportReadOnlyView`
  // and drops the Save CTA.
  const isReadOnly =
    order?.status === 'reported' || order?.status === 'released';

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[
          { label: 'Radiology worklist', to: '/diagnostics/radiology' },
          { label: order ? `${order.testName} (${order.testCode})` : 'Report' },
        ]}
        homeTo="/diagnostics/radiology"
        homeLabel="Diagnostics home"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/diagnostics/radiology')}
            className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft /> Back to radiology worklist
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {isReadOnly ? 'View report' : 'Enter report'}
          </h1>
          {order && (
            <p className="font-mono text-xxs text-muted-foreground tabular-nums">
              {order.patient.fullName} · {order.patient.uhid} · OP {order.opNumber} ·{' '}
              {order.testName} ({order.testCode})
            </p>
          )}
        </div>
        {order && !isReadOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" form={FORM_ID} disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : <Check />}
              {submitting ? 'Saving…' : 'Save report'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/diagnostics/radiology')}
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
        <Card>
          {isReadOnly ? (
            <RadiologyReportReadOnlyView order={order} />
          ) : (
            <RadiologyReportForm
              order={order}
              formId={FORM_ID}
              hideActions
              onSubmittingChange={setSubmitting}
              onSaved={() => navigate('/diagnostics/radiology')}
            />
          )}
        </Card>
      )}
    </div>
  );
}
