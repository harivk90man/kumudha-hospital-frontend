import { useCallback, useMemo } from 'react';
import { Activity, ChevronDown, Gauge, ListChecks } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import type { FunctionalScaleCode, FunctionalScore } from '../consultationTypes';
import {
  INSTRUMENTS,
  ODI_QUESTIONS,
  ODI_SPEC,
  VAS_SPEC,
  blankScore,
  computeOdi,
  findInstrument,
  vasBand,
} from '../functionalScoring';

interface FunctionalScoringPanelProps {
  scores: FunctionalScore[];
  onChange: (next: FunctionalScore[]) => void;
}

/**
 * "Functional assessment" section on the doctor consultation page.
 *
 * Top: scale picker — VAS and ODI (DASH / WOMAC reserved). Clicking
 * Add inserts a blank entry into `scores`; the questionnaire below
 * lets the doctor fill it. Each scale can appear at most once per
 * consultation; the picker disables a scale that's already in `scores`.
 *
 * VAS = 0–10 slider + numeric input.
 * ODI = 10 sections × 6 radio options + live percent/band.
 *
 * Removal: each filled scale has a discreet "Remove" button so a
 * mis-clicked scale doesn't haunt the consultation lock.
 */
export function FunctionalScoringPanel({
  scores,
  onChange,
}: FunctionalScoringPanelProps): JSX.Element {
  const presentCodes = useMemo(
    () => new Set(scores.map((s) => s.scaleCode)),
    [scores],
  );

  const addScale = useCallback(
    (code: FunctionalScaleCode): void => {
      if (presentCodes.has(code)) return;
      onChange([...scores, blankScore(code)]);
    },
    [scores, presentCodes, onChange],
  );

  const updateScale = useCallback(
    (code: FunctionalScaleCode, next: FunctionalScore): void => {
      onChange(scores.map((s) => (s.scaleCode === code ? next : s)));
    },
    [scores, onChange],
  );

  const removeScale = useCallback(
    (code: FunctionalScaleCode): void => {
      onChange(scores.filter((s) => s.scaleCode !== code));
    },
    [scores, onChange],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Scale picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Add scale:
        </span>
        {INSTRUMENTS.map((spec) => {
          const already = presentCodes.has(spec.code);
          return (
            <Button
              key={spec.code}
              type="button"
              size="sm"
              variant={already ? 'outline' : 'default'}
              disabled={already}
              onClick={() => addScale(spec.code)}
              title={already ? 'Already recorded for this visit' : spec.whenToUse}
            >
              <Gauge className="h-3.5 w-3.5" /> {spec.label}
            </Button>
          );
        })}
        {/* Reserved scales — visually communicate the toolkit will grow. */}
        {(['DASH', 'WOMAC'] as FunctionalScaleCode[]).map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-hairline px-2 py-1 text-xxs text-muted-foreground"
            title="Coming soon"
          >
            {code} <span className="text-[10px]">soon</span>
          </span>
        ))}
      </div>

      {scores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No functional scores recorded yet. Pick a scale above to start.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {scores.map((score) => (
            <li key={score.scaleCode}>
              {score.scaleCode === 'VAS' ? (
                <VasCard score={score} onChange={(s) => updateScale('VAS', s)} onRemove={() => removeScale('VAS')} />
              ) : score.scaleCode === 'ODI' ? (
                <OdiCard score={score} onChange={(s) => updateScale('ODI', s)} onRemove={() => removeScale('ODI')} />
              ) : (
                <UnsupportedCard score={score} onRemove={() => removeScale(score.scaleCode)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*                          VAS                                     */
/* ─────────────────────────────────────────────────────────────── */

function VasCard({
  score, onChange, onRemove,
}: {
  score: FunctionalScore;
  onChange: (next: FunctionalScore) => void;
  onRemove: () => void;
}): JSX.Element {
  const current = typeof score.rawAnswers.value === 'number' ? score.rawAnswers.value : 0;

  const setValue = (next: number): void => {
    const clamped = Math.max(0, Math.min(10, Math.round(next)));
    const band = vasBand(clamped);
    onChange({
      ...score,
      rawAnswers: { value: clamped },
      computedScore: clamped,
      severityBand: band,
    });
  };

  const toneClass =
    current >= 7 ? 'text-danger'
    : current >= 4 ? 'text-warning'
    : 'text-foreground';

  return (
    <div className="rounded-xl border border-hairline bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">
            <Activity className="mr-1 inline-block h-4 w-4 text-primary" />
            {VAS_SPEC.label}
          </h4>
          <p className="text-xs text-muted-foreground">{VAS_SPEC.description}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={current}
          onChange={(e) => setValue(Number(e.target.value))}
          className="flex-1 min-w-[200px]"
          aria-label="Pain score 0 to 10"
        />
        <div className="flex items-baseline gap-2">
          <span className={cn('text-2xl font-bold tabular-nums', toneClass)}>{current}</span>
          <span className="text-xs text-muted-foreground">/ 10</span>
        </div>
        <span className={cn('rounded-full bg-muted/40 px-2 py-0.5 text-xs font-medium', toneClass)}>
          {vasBand(current)}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*                          ODI                                     */
/* ─────────────────────────────────────────────────────────────── */

function OdiCard({
  score, onChange, onRemove,
}: {
  score: FunctionalScore;
  onChange: (next: FunctionalScore) => void;
  onRemove: () => void;
}): JSX.Element {
  const answers = score.rawAnswers as Record<string, number>;
  const { percent, band, answeredCount } = useMemo(() => computeOdi(answers), [answers]);

  const setAnswer = (qKey: string, optionIdx: number): void => {
    const nextAnswers = { ...answers, [qKey]: optionIdx };
    const { percent: p, band: b } = computeOdi(nextAnswers);
    onChange({
      ...score,
      rawAnswers: nextAnswers,
      computedScore: p,
      severityBand: b,
    });
  };

  const toneClass =
    percent >= 61 ? 'text-danger'
    : percent >= 41 ? 'text-warning'
    : 'text-foreground';

  return (
    <div className="rounded-xl border border-hairline bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">
            <ListChecks className="mr-1 inline-block h-4 w-4 text-primary" />
            {ODI_SPEC.label}
          </h4>
          <p className="text-xs text-muted-foreground">{ODI_SPEC.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-baseline gap-1">
              <span className={cn('text-2xl font-bold tabular-nums', toneClass)}>{percent}</span>
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {answeredCount}/10 answered
            </div>
          </div>
          <span className={cn('rounded-full bg-muted/40 px-2 py-0.5 text-xs font-medium', toneClass)}>
            {band}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {ODI_QUESTIONS.map((q, qi) => {
          const picked = answers[q.key];
          return (
            <li key={q.key}>
              <details className="rounded-md border border-hairline bg-muted/10" open={picked === undefined}>
                <summary className="flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-baseline gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{qi + 1}.</span>
                    {q.prompt}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {picked != null ? `Picked ${picked}/5` : 'Pick one'}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </span>
                </summary>
                <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
                  {q.options.map((opt, idx) => {
                    const checked = picked === idx;
                    return (
                      <li key={idx}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm transition-colors',
                            checked ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/30',
                          )}
                        >
                          <input
                            type="radio"
                            name={`odi-${q.key}`}
                            value={idx}
                            checked={checked}
                            onChange={() => setAnswer(q.key, idx)}
                            className="mt-0.5 accent-primary"
                          />
                          <span className="flex-1">
                            <span className="mr-1 font-mono text-[10px] text-muted-foreground">{idx}</span>
                            {opt}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/*                       UNSUPPORTED                                */
/* ─────────────────────────────────────────────────────────────── */

function UnsupportedCard({
  score, onRemove,
}: {
  score: FunctionalScore;
  onRemove: () => void;
}): JSX.Element {
  const spec = findInstrument(score.scaleCode);
  return (
    <div className="rounded-xl border border-dashed border-hairline bg-muted/10 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h4 className="text-sm font-semibold">{spec?.label ?? score.scaleCode}</h4>
          <p className="text-xs text-muted-foreground">
            Questionnaire not implemented yet. Score will not be persisted.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}
