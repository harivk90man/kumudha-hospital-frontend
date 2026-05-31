import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { FollowUpFormValues } from '../schemas/adviceSchemas';
import type { FollowUpAdvice } from '../consultationTypes';
import { FollowUpDateField } from './FollowUpDateField';

interface FollowUpAdvicePanelProps {
  initial?: FollowUpAdvice;
  onSubmit: (value: FollowUpFormValues) => Promise<void> | void;
  className?: string;
}

const fieldClass =
  'w-full border-0 border-b border-hairline bg-transparent pt-1.5 pb-0.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors [field-sizing:content] resize-none overflow-hidden';

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

const AUTOSAVE_DEBOUNCE_MS = 800;

/** today + 7 days as ISO yyyy-mm-dd. */
const defaultFollowUpDate = (): string => {
  const d = new Date(); d.setDate(d.getDate() + 7);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function FollowUpAdvicePanel({
  initial,
  onSubmit,
  className,
}: FollowUpAdvicePanelProps): JSX.Element {
  const { control, register, watch } = useForm<FollowUpFormValues>({
    defaultValues: {
      followUpDate: initial?.followUpDate ?? defaultFollowUpDate(),
      modality:     initial?.modality     ?? 'in_person',
      notes:        initial?.notes        ?? '',
    },
  });

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { unsubscribe } = watch((data) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void onSubmitRef.current(data as FollowUpFormValues);
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [watch]);

  return (
    <div className={className} aria-label="Follow-up advice">
      <div className="grid gap-5">

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Follow-up after</span>
          <Controller
            control={control}
            name="followUpDate"
            render={({ field }) => (
              <FollowUpDateField value={field.value} onChange={field.onChange} />
            )}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Instructions for patient</span>
          <textarea
            rows={2}
            {...register('notes')}
            className={fieldClass}
            placeholder="e.g. Review after completing course, bring reports…"
          />
        </label>

      </div>
    </div>
  );
}
