import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldAlert, UserCheck } from 'lucide-react';
import { FormInput, FormTextarea } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import {
  recordVitals,
  transitionEncounterState,
  type QueueEntry,
  type VitalsCaptureInput,
} from '@/features/encounter';
import { vitalsSchema, type VitalsFormValues } from '../schemas/vitalsSchema';

const computeBmi = (weightKg?: number, heightCm?: number): number | null => {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  return Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1));
};

const SectionLabel = ({ title }: { title: string }): JSX.Element => (
  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
    {title}
  </span>
);

interface VitalsCaptureFormProps {
  entry: QueueEntry;
  onSubmitted: () => void | Promise<void>;
  onCancel?: () => void;
  formId?: string;
  hideActions?: boolean;
  onSubmittingChange?: (busy: boolean) => void;
}

/**
 * Inline vitals capture form. Submits to `recordVitals` then transitions
 * the encounter `awaiting_vitals` → `awaiting_doctor` via the journey trigger.
 */
export function VitalsCaptureForm({
  entry,
  onSubmitted,
  onCancel,
  formId,
  hideActions = false,
  onSubmittingChange,
}: VitalsCaptureFormProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<VitalsFormValues>({
    resolver: zodResolver(vitalsSchema),
    defaultValues: {
      chiefComplaint: entry.chiefComplaint ?? '',
      notes: '',
    },
  });

  useEffect(() => {
    reset({
      chiefComplaint: entry.chiefComplaint ?? '',
      notes: '',
    });
  }, [entry.opNumber, entry.chiefComplaint, reset]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const watchedWeight = useWatch({ control, name: 'weightKg' });
  const watchedHeight = useWatch({ control, name: 'heightCm' });
  const liveBmi = computeBmi(
    typeof watchedWeight === 'number' ? watchedWeight : Number(watchedWeight),
    typeof watchedHeight === 'number' ? watchedHeight : Number(watchedHeight),
  );

  const onSubmit = async (values: VitalsFormValues): Promise<void> => {
    const payload: VitalsCaptureInput = {
      bpSystolic:        values.bpSystolic,
      bpDiastolic:       values.bpDiastolic,
      pulseRate:         values.pulseRate,
      temperatureF:      values.temperatureF,
      spo2:              values.spo2,
      respiratoryRate:   values.respiratoryRate,
      weightKg:          values.weightKg,
      heightCm:          values.heightCm,
      bloodSugarRandom:  values.bloodSugarRandom,
      bloodSugarFasting: values.bloodSugarFasting,
      painScore:         values.painScore,
      notes:             values.notes || undefined,
      chiefComplaint:    values.chiefComplaint || undefined,
    };
    await recordVitals(entry.opNumber, payload);
    await transitionEncounterState(entry.opNumber, 'awaiting_doctor');
    await onSubmitted();
  };

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {(entry.patient.allergies?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <ShieldAlert className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong className="font-semibold">Allergies:</strong>{' '}
            {entry.patient.allergies?.map((a) => a.allergen).join(', ')}
          </span>
        </div>
      )}

      {/* Blood pressure & pulse */}
      <div className="flex flex-col gap-3">
        <SectionLabel title="Blood pressure & pulse" />
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-3">
          <FormInput variant="flat"
            label="BP systolic" placeholder="BP systolic"
            type="number" inputMode="numeric"
            error={errors.bpSystolic?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">mmHg</span>}
            {...register('bpSystolic')}
          />
          <FormInput variant="flat"
            label="BP diastolic" placeholder="BP diastolic"
            type="number" inputMode="numeric"
            error={errors.bpDiastolic?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">mmHg</span>}
            {...register('bpDiastolic')}
          />
          <FormInput variant="flat"
            label="Pulse" placeholder="Pulse"
            type="number" inputMode="numeric"
            error={errors.pulseRate?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">bpm</span>}
            {...register('pulseRate')}
          />
        </div>
      </div>

      {/* Respiratory & temperature */}
      <div className="flex flex-col gap-3">
        <SectionLabel title="Respiratory & temperature" />
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-3">
          <FormInput variant="flat"
            label="Temperature" placeholder="Temperature"
            type="number" step="0.1" inputMode="decimal"
            error={errors.temperatureF?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">°F</span>}
            {...register('temperatureF')}
          />
          <FormInput variant="flat"
            label="SpO2" placeholder="SpO2"
            type="number" inputMode="numeric"
            error={errors.spo2?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">%</span>}
            {...register('spo2')}
          />
          <FormInput variant="flat"
            label="Respiratory rate" placeholder="Respiratory rate"
            type="number" inputMode="numeric"
            error={errors.respiratoryRate?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">/min</span>}
            {...register('respiratoryRate')}
          />
        </div>
      </div>

      {/* Anthropometry */}
      <div className="flex flex-col gap-3">
        <SectionLabel title="Anthropometry" />
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-3">
          <FormInput variant="flat"
            label="Weight" placeholder="Weight"
            type="number" step="0.1" inputMode="decimal"
            error={errors.weightKg?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">kg</span>}
            {...register('weightKg')}
          />
          <FormInput variant="flat"
            label="Height" placeholder="Height"
            type="number" step="0.1" inputMode="decimal"
            error={errors.heightCm?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">cm</span>}
            {...register('heightCm')}
          />
          <FormInput variant="flat"
            label="BMI"
            value={liveBmi ?? ''}
            readOnly
            placeholder="auto"
          />
        </div>
      </div>

      {/* Blood sugar & pain */}
      <div className="flex flex-col gap-3">
        <SectionLabel title="Blood sugar & pain" />
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-3">
          <FormInput variant="flat"
            label="Blood sugar (random)" placeholder="Blood sugar (random)"
            type="number" inputMode="numeric"
            error={errors.bloodSugarRandom?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">mg/dL</span>}
            {...register('bloodSugarRandom')}
          />
          <FormInput variant="flat"
            label="Blood sugar (fasting)" placeholder="Blood sugar (fasting)"
            type="number" inputMode="numeric"
            error={errors.bloodSugarFasting?.message as string | undefined}
            trailing={<span className="text-xs text-muted-foreground">mg/dL</span>}
            {...register('bloodSugarFasting')}
          />
          <FormInput variant="flat"
            label="Pain score (0-10)" placeholder="Pain score (0-10)"
            type="number" inputMode="numeric" min={0} max={10}
            error={errors.painScore?.message as string | undefined}
            {...register('painScore')}
          />
        </div>
      </div>

      {/* Clinical notes */}
      <div className="flex flex-col gap-3">
        <SectionLabel title="Clinical notes" />
        <FormTextarea variant="flat"
          label="Chief complaint"
          rows={1}
          placeholder="Chief complaint e.g. Fever x 3 days, body ache"
          error={errors.chiefComplaint?.message}
          {...register('chiefComplaint')}
        />
        <FormTextarea variant="flat"
          label="Notes (optional)"
          rows={2}
          placeholder="Notes (optional) - anything the doctor should know"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </div>

      {!hideActions && (
        <div className="flex justify-end gap-2 border-t pt-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner size="sm" /> : <UserCheck />}
            {isSubmitting ? 'Submitting…' : 'Submit + send to doctor'}
          </Button>
        </div>
      )}
    </form>
  );
}
