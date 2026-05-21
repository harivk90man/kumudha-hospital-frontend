import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BedDouble, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/layout';
import {
  admissionAdviceSchema,
  type AdmissionAdviceFormValues,
} from '../schemas/adviceSchemas';
import type { AdmissionAdvice } from '../consultationTypes';

interface AdmissionAdvicePanelProps {
  initial?: AdmissionAdvice;
  onSubmit: (value: AdmissionAdviceFormValues) => Promise<void> | void;
  className?: string;
}

const fieldClass =
  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';
const labelClass = 'text-xs font-medium text-muted-foreground';

export function AdmissionAdvicePanel({
  initial,
  onSubmit,
  className,
}: AdmissionAdvicePanelProps): JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<AdmissionAdviceFormValues>({
    resolver: zodResolver(admissionAdviceSchema),
    defaultValues: {
      reason: initial?.reason ?? '',
      wardType: initial?.wardType ?? 'general',
      urgency: initial?.urgency ?? 'routine',
      notes: initial?.notes ?? '',
    },
  });

  return (
    <Card asChild className={className}>
      <form onSubmit={handleSubmit(async (v) => onSubmit(v))} aria-label="Admission advice">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            <BedDouble className="h-4 w-4 text-muted-foreground" /> Admission advice
          </CardTitle>
          <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
            <Save /> Save
          </Button>
        </CardHeader>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 md:col-span-3">
          <span className={labelClass}>Reason *</span>
          <input {...register('reason')} className={fieldClass} />
          {errors.reason && (
            <span className="text-xs text-danger">{errors.reason.message}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Ward type</span>
          <select {...register('wardType')} className={fieldClass}>
            <option value="general">General</option>
            <option value="semi_private">Semi-private</option>
            <option value="private">Private</option>
            <option value="icu">ICU</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Urgency</span>
          <select {...register('urgency')} className={fieldClass}>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 md:col-span-3">
          <span className={labelClass}>Notes</span>
          <textarea rows={2} {...register('notes')} className={fieldClass} />
        </label>
      </div>
      </form>
    </Card>
  );
}
