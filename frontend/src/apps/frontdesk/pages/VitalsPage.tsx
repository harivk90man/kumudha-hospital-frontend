import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, HeartPulse, ShieldAlert, UserCheck } from 'lucide-react';
import { Breadcrumb, LiveIndicator, StatusPill } from '@/components/data-display';
import { Card, CardHeader, CardLabel, CardTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';
import { fetchLiveQueue, liveToQueueEntry, type QueueEntry } from '@/features/encounter';
import { VitalsCaptureForm } from '../components/VitalsCaptureForm';

/**
 * Vitals capture surface. Two modes:
 *
 *   - Browse mode (default, no `?op=`): two-column queue + form. The nurse
 *     picks a patient from the awaiting-vitals queue on the left and
 *     captures vitals on the right.
 *   - Focused mode (`/frontdesk/vitals?op=OP-2026-...`): single-pane form
 *     for that one patient — opened when the nurse clicks the Vitals
 *     icon on a station-queue row. Header carries the Back link + the
 *     primary CTAs (matches the Patient profile / Edit page pattern).
 */
const FOCUSED_FORM_ID = 'vitals-focused-form';

export function VitalsPage(): JSX.Element {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selected, setSelected] = useState<QueueEntry | null>(null);
  const [submittingFocused, setSubmittingFocused] = useState<boolean>(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const opParam = params.get('op');

  const reload = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await fetchLiveQueue({ queueStatus: 'awaiting_vitals' });
      setQueue(result.rows.map(liveToQueueEntry));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  // Focused mode: pre-select the row matching `?op=...` once the queue
  // loads. Stays in single-pane mode whether or not we found a match
  // (a stale link still surfaces the "not found" message instead of
  // dumping the nurse into the full queue).
  useEffect(() => {
    if (!opParam || queue.length === 0) return;
    const match = queue.find((q) => q.opNumber === opParam);
    if (match) setSelected(match);
  }, [opParam, queue]);

  const focused = Boolean(opParam);
  const focusedMatch = useMemo<QueueEntry | null>(
    () => (opParam ? queue.find((q) => q.opNumber === opParam) ?? null : null),
    [opParam, queue],
  );

  if (focused) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4 md:h-screen md:gap-5 md:p-6">
        <Breadcrumb
          items={[
            { label: 'Vitals', to: '/frontdesk/vitals' },
            { label: focusedMatch?.patient.fullName ?? opParam ?? '' },
          ]}
          homeTo="/frontdesk/station"
          homeLabel="OP coordination"
        />

        {/* Header matches the patient profile / edit pages —
            ghost "Back" link above the title, primary CTAs aligned
            to the top-right of the row. */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/frontdesk/station')}
              className="-ml-2 mb-1 h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
              <HeartPulse className="h-4 w-4 text-primary" />
              Take vitals
            </h1>
            <p className="font-mono text-xxs text-muted-foreground tabular-nums">
              {focusedMatch
                ? `${focusedMatch.patient.fullName} · ${focusedMatch.patient.uhid} · Token ${focusedMatch.tokenNumber}`
                : (opParam ?? '')}
            </p>
          </div>
          {focusedMatch && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                form={FOCUSED_FORM_ID}
                className="w-44 justify-center"
                disabled={submittingFocused}
              >
                {submittingFocused ? <Spinner size="sm" /> : <UserCheck />}
                {submittingFocused ? "Submitting..." : "Submit vitals"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-44 justify-center"
                onClick={() => navigate('/frontdesk/station')}
                disabled={submittingFocused}
              >
                Cancel
              </Button>
            </div>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-auto border-t border-hairline pt-4">

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" /> Loading patient…
          </div>
        ) : !focusedMatch ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
              <HeartPulse className="h-8 w-8 text-muted-foreground/40" />
              <span>
                <strong className="font-mono">{opParam}</strong> isn't awaiting vitals.
                Vitals may already be taken, or the patient isn't on the queue.
              </span>
              <Button asChild type="button" variant="outline">
                <a href="/frontdesk/vitals">Open full queue</a>
              </Button>
            </div>
          </Card>
        ) : (
          <VitalsCaptureForm
            entry={focusedMatch}
            formId={FOCUSED_FORM_ID}
            hideActions
            onSubmittingChange={setSubmittingFocused}
            onSubmitted={() => navigate('/frontdesk/station')}
          />
        )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[{ label: 'Vitals' }]}
        homeTo="/frontdesk/station"
        homeLabel="OP coordination"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Landing-page band — keeps the title anchor consistent with
              focused mode (which has the ghost back-link in this slot). */}
          <div className="-ml-2 mb-2 flex h-8 items-center gap-2 px-2">
            <LiveIndicator />
            <span className="text-xxs uppercase tracking-wider text-muted-foreground">
              Vitals queue
            </span>
          </div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <HeartPulse className="h-4 w-4 text-primary" />
            Vitals queue
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Pick a patient on the left, capture vitals on the right.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Awaiting vitals</CardTitle>
            <CardLabel>{queue.length}</CardLabel>
          </CardHeader>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" /> Loading queue…
            </div>
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No patients waiting for vitals.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {queue.map((q) => {
                const isSel = selected?.opNumber === q.opNumber;
                return (
                  <li key={q.opNumber}>
                    <button
                      type="button"
                      onClick={() => setSelected(q)}
                      className={cn(
                        'flex w-full flex-col gap-1 rounded-lg border p-3 text-left transition',
                        isSel
                          ? 'border-primary/60 bg-primary/5'
                          : 'hover:border-primary/30 hover:bg-muted/30',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {q.patient.fullName}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {q.tokenNumber}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {q.patient.uhid} · {q.waitingForMinutes}m wait
                      </div>
                      <div className="text-xs">{q.chiefComplaint}</div>
                      {(q.patient.allergies?.length ?? 0) > 0 && (
                        <StatusPill tone="danger" size="sm" className="self-start">
                          <ShieldAlert className="h-3 w-3" />
                          Allergy
                        </StatusPill>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          {!selected ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <HeartPulse className="h-8 w-8 text-muted-foreground/40" />
              Select a patient on the left to capture vitals.
            </div>
          ) : (
            <>
              <CardHeader>
                <div>
                  <CardTitle>{selected.patient.fullName}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {selected.patient.uhid} ·{' '}
                    {selected.patient.gender.toUpperCase()} ·{' '}
                    {selected.patient.ageYears}y
                    {selected.patient.bloodGroup
                      ? ` · ${selected.patient.bloodGroup}`
                      : ''}
                  </p>
                </div>
                <CardLabel>Token {selected.tokenNumber}</CardLabel>
              </CardHeader>
              <VitalsCaptureForm
                entry={selected}
                onSubmitted={async () => {
                  setSelected(null);
                  await reload();
                }}
                onCancel={() => setSelected(null)}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
