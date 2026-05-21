import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import type { ConsultationNotesFormValues } from '../schemas/consultationSchemas';
import type { ConsultationNote } from '../consultationTypes';

interface ConsultationNotesFormProps {
  initial: ConsultationNote;
  onSubmit: (values: ConsultationNotesFormValues) => Promise<void> | void;
  className?: string;
}

/**
 * Underline-only field — no box border.
 * `[field-sizing:content]` makes textareas auto-resize to their content so the
 * underline is always flush with the last text line instead of sitting at the
 * bottom of a fixed tall box.
 */
const inputClass =
  'w-full border-0 border-b border-hairline bg-transparent pt-1.5 pb-0.5 text-sm leading-relaxed ' +
  'text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary ' +
  'transition-colors';

const textareaClass =
  inputClass +
  ' resize-none overflow-hidden [field-sizing:content]';

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

const AUTOSAVE_DEBOUNCE_MS = 800;

export function ConsultationNotesForm({
  initial,
  onSubmit,
  className,
}: ConsultationNotesFormProps): JSX.Element {
  const { register, watch } = useForm<ConsultationNotesFormValues>({
    defaultValues: {
      chiefComplaint:           initial.chiefComplaint ?? '',
      historyOfPresentIllness:  initial.historyOfPresentIllness ?? '',
      examinationFindings:      initial.examinationFindings ?? '',
      clinicalImpression:       initial.clinicalImpression ?? '',
      advice:                   initial.advice ?? '',
    },
  });

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { unsubscribe } = watch((data) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void onSubmitRef.current(data as ConsultationNotesFormValues);
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [watch]);

  return (
    <div className={className}>
      <div className="grid gap-8 md:grid-cols-2">

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelClass}>Chief complaint</span>
          <input
            {...register('chiefComplaint')}
            className={inputClass}
            placeholder="e.g. Lower back pain × 3 weeks"
            autoComplete="off"
          />
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelClass}>History of present illness</span>
          <textarea
            rows={2}
            {...register('historyOfPresentIllness')}
            className={textareaClass}
            placeholder="Onset, duration, character, associated symptoms…"
          />
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelClass}>Examination findings</span>
          <textarea
            rows={3}
            {...register('examinationFindings')}
            className={textareaClass}
            placeholder="General, systemic, local examination…"
          />
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelClass}>Clinical impression</span>
          <textarea
            rows={3}
            {...register('clinicalImpression')}
            className={textareaClass}
            placeholder="Provisional diagnosis, differentials…"
          />
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelClass}>Verbal instructions</span>
          <textarea
            rows={2}
            {...register('advice')}
            className={textareaClass}
            placeholder="Activity restrictions, diet, follow-up instructions…"
          />
        </label>

      </div>
    </div>
  );
}
