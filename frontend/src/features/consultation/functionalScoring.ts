/**
 * Functional-assessment instruments — Ortho toolkit equivalents.
 *
 * Data tables + scoring helpers. Pure (no React, no API) so the
 * questionnaire UI in `<FunctionalScoringPanel>` can render entirely
 * off these constants and the per-instrument compute function.
 *
 * v1 supports:
 *   - VAS  (Visual Analog Scale)         — 0–10 single slider.
 *   - ODI  (Oswestry Disability Index)   — 10 questions × 6 options.
 *
 * DASH / WOMAC reserved in the scale enum but not implemented here.
 */

import type { FunctionalScaleCode, FunctionalScore } from './consultationTypes';

/* ---------- Question shape ---------- */

export interface FunctionalQuestion {
  /** Stable key used in `rawAnswers`. */
  key: string;
  /** The patient-facing question stem. */
  prompt: string;
  /** Options in order; index = score the doctor records. */
  options: string[];
}

export interface FunctionalInstrumentSpec {
  code: FunctionalScaleCode;
  label: string;
  /** Short description shown in the scale picker. */
  description: string;
  /** When the doctor would reach for it. */
  whenToUse: string;
  /** Scale-version string written to DB so future revisions can co-exist. */
  version: string;
}

/* ---------- VAS ---------- */

export const VAS_SPEC: FunctionalInstrumentSpec = {
  code: 'VAS',
  label: 'VAS Pain',
  description: 'Visual Analog Scale — 0 (no pain) to 10 (worst imaginable).',
  whenToUse: 'Universal pain intensity snapshot at this visit.',
  version: 'v1',
};

export const VAS_BANDS: { range: [number, number]; label: string }[] = [
  { range: [0, 0],   label: 'No pain' },
  { range: [1, 3],   label: 'Mild' },
  { range: [4, 6],   label: 'Moderate' },
  { range: [7, 9],   label: 'Severe' },
  { range: [10, 10], label: 'Worst imaginable' },
];

export const vasBand = (score: number): string =>
  VAS_BANDS.find((b) => score >= b.range[0] && score <= b.range[1])?.label ?? '—';

/* ---------- Oswestry Disability Index (ODI) ---------- */

/**
 * The standard 10-section Oswestry questionnaire. Each section has 6
 * statements; the patient picks the one that fits best. Score per
 * section = the chosen statement's index (0–5). Total / 50 × 100 =
 * disability percentage. (Section omitted -> denominator drops by 5
 * to keep partial-answer scoring proportional.)
 *
 * Reference: orthotoolkit.com/oswestry/ + ODI v2.0 (Fairbank 2000).
 */
export const ODI_SPEC: FunctionalInstrumentSpec = {
  code: 'ODI',
  label: 'Oswestry Disability Index',
  description: '10 lifestyle questions; auto-computes a 0–100% lumbar disability score.',
  whenToUse: 'Lumbar / low-back pain follow-up; comparing baseline vs current visit.',
  version: 'v1',
};

export const ODI_QUESTIONS: FunctionalQuestion[] = [
  {
    key: 'q1', prompt: 'Pain intensity',
    options: [
      'I can tolerate the pain I have without having to use painkillers.',
      'The pain is bad but I manage without taking painkillers.',
      'Painkillers give complete relief from pain.',
      'Painkillers give moderate relief from pain.',
      'Painkillers give very little relief from pain.',
      'Painkillers have no effect on the pain and I do not use them.',
    ],
  },
  {
    key: 'q2', prompt: 'Personal care (washing, dressing, etc.)',
    options: [
      'I can look after myself normally without causing extra pain.',
      'I can look after myself normally but it causes extra pain.',
      'It is painful to look after myself and I am slow and careful.',
      'I need some help but manage most of my personal care.',
      'I need help every day in most aspects of self care.',
      'I do not get dressed, I wash with difficulty and stay in bed.',
    ],
  },
  {
    key: 'q3', prompt: 'Lifting',
    options: [
      'I can lift heavy weights without extra pain.',
      'I can lift heavy weights but it gives extra pain.',
      'Pain prevents me from lifting heavy weights off the floor, but I can manage if they are conveniently positioned.',
      'Pain prevents me from lifting heavy weights, but I can manage light to medium weights if conveniently positioned.',
      'I can lift only very light weights.',
      'I cannot lift or carry anything at all.',
    ],
  },
  {
    key: 'q4', prompt: 'Walking',
    options: [
      'Pain does not prevent me walking any distance.',
      'Pain prevents me walking more than 1 mile.',
      'Pain prevents me walking more than ½ mile.',
      'Pain prevents me walking more than 100 yards.',
      'I can only walk using a stick or crutches.',
      'I am in bed most of the time and have to crawl to the toilet.',
    ],
  },
  {
    key: 'q5', prompt: 'Sitting',
    options: [
      'I can sit in any chair as long as I like.',
      'I can only sit in my favourite chair as long as I like.',
      'Pain prevents me from sitting more than 1 hour.',
      'Pain prevents me from sitting more than 30 minutes.',
      'Pain prevents me from sitting more than 10 minutes.',
      'Pain prevents me from sitting at all.',
    ],
  },
  {
    key: 'q6', prompt: 'Standing',
    options: [
      'I can stand as long as I want without extra pain.',
      'I can stand as long as I want but it gives me extra pain.',
      'Pain prevents me from standing for more than 1 hour.',
      'Pain prevents me from standing for more than 30 minutes.',
      'Pain prevents me from standing for more than 10 minutes.',
      'Pain prevents me from standing at all.',
    ],
  },
  {
    key: 'q7', prompt: 'Sleeping',
    options: [
      'My sleep is never disturbed by pain.',
      'My sleep is occasionally disturbed by pain.',
      'Because of pain I have less than 6 hours sleep.',
      'Because of pain I have less than 4 hours sleep.',
      'Because of pain I have less than 2 hours sleep.',
      'Pain prevents me from sleeping at all.',
    ],
  },
  {
    key: 'q8', prompt: 'Sex life (if applicable)',
    options: [
      'My sex life is normal and causes no extra pain.',
      'My sex life is normal but causes some extra pain.',
      'My sex life is nearly normal but is very painful.',
      'My sex life is severely restricted by pain.',
      'My sex life is nearly absent because of pain.',
      'Pain prevents any sex life at all.',
    ],
  },
  {
    key: 'q9', prompt: 'Social life',
    options: [
      'My social life is normal and gives me no extra pain.',
      'My social life is normal but increases the degree of pain.',
      'Pain has no significant effect on my social life apart from limiting my more energetic interests, e.g. sport.',
      'Pain has restricted my social life and I do not go out as often.',
      'Pain has restricted my social life to my home.',
      'I have no social life because of pain.',
    ],
  },
  {
    key: 'q10', prompt: 'Travelling',
    options: [
      'I can travel anywhere without pain.',
      'I can travel anywhere but it gives me extra pain.',
      'Pain is bad but I manage journeys over 2 hours.',
      'Pain restricts me to journeys of less than 1 hour.',
      'Pain restricts me to short necessary journeys under 30 minutes.',
      'Pain prevents me from travelling except to receive treatment.',
    ],
  },
];

/**
 * ODI severity bands per Fairbank (2000):
 *   0–20%  minimal disability
 *  21–40%  moderate
 *  41–60%  severe
 *  61–80%  crippled
 *  81–100% bed-bound / exaggerating symptoms
 */
export const ODI_BANDS: { range: [number, number]; label: string }[] = [
  { range: [0,  20],  label: 'Minimal disability' },
  { range: [21, 40],  label: 'Moderate disability' },
  { range: [41, 60],  label: 'Severe disability' },
  { range: [61, 80],  label: 'Crippled' },
  { range: [81, 100], label: 'Bed-bound / disabled' },
];

export const odiBand = (percent: number): string =>
  ODI_BANDS.find((b) => percent >= b.range[0] && percent <= b.range[1])?.label ?? '—';

/**
 * Compute the ODI score from per-question answers. Answered questions
 * contribute up to 5 each; unanswered ones drop out of both numerator
 * and denominator (proportional partial scoring per the Fairbank
 * guidance). Returns a 0–100 rounded percent + the band label.
 */
export const computeOdi = (
  answers: Record<string, number>,
): { percent: number; band: string; answeredCount: number } => {
  const answered = ODI_QUESTIONS.filter((q) => typeof answers[q.key] === 'number');
  if (answered.length === 0) return { percent: 0, band: '—', answeredCount: 0 };
  const sum = answered.reduce((s, q) => s + answers[q.key], 0);
  const percent = Math.round((sum / (answered.length * 5)) * 100);
  return { percent, band: odiBand(percent), answeredCount: answered.length };
};

/* ---------- Registry helpers ---------- */

export const INSTRUMENTS: FunctionalInstrumentSpec[] = [VAS_SPEC, ODI_SPEC];

export const findInstrument = (code: FunctionalScaleCode): FunctionalInstrumentSpec | undefined =>
  INSTRUMENTS.find((i) => i.code === code);

/** Build a fresh FunctionalScore record for a given scale. */
export const blankScore = (code: FunctionalScaleCode): FunctionalScore => {
  const spec = findInstrument(code);
  return {
    scaleCode:     code,
    scaleVersion:  spec?.version ?? 'v1',
    rawAnswers:    {},
    computedScore: 0,
  };
};
