import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Activity, Heart, Pencil, Thermometer, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { vitalsEditSchema, type VitalsEditFormValues } from '../schemas/vitalsSchemas';
import type { Vitals } from '../consultationTypes';

interface VitalsEditSheetProps {
  open: boolean;
  onClose: () => void;
  /** Current vitals to pre-fill the form. Undefined when nothing recorded yet. */
  initial?: Vitals;
  /** Throws on failure to keep the sheet open. */
  onSubmit: (patch: Partial<Vitals>) => Promise<void> | void;
}

const fieldClass =
  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

const labelClass = 'text-xs font-medium text-muted-foreground';

const recordedAtLabel = (iso?: string): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day:   '2-digit',
    month: 'short',
    hour:  '2-digit',
    minute:'2-digit',
  });
};

/**
 * Doctor-side vitals amendment form. Pre-fills from `latestVitals`, lets the
 * doctor correct any field, and PATCHes the row. DB-side L1/L3 audit captures
 * the diff — no reason required (per product decision).
 */
export function VitalsEditSheet({
  open,
  onClose,
  initial,
  onSubmit,
}: VitalsEditSheetProps): JSX.Element {
  const [busy,  setBusy]  = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const defaults: VitalsEditFormValues = {
    bpSystolic:      initial?.bpSystolic      ?? undefined,
    bpDiastolic:     initial?.bpDiastolic     ?? undefined,
    pulseRate:       initial?.pulseRate       ?? undefined,
    spo2:            initial?.spo2            ?? undefined,
    temperatureF:    initial?.temperatureF    ?? undefined,
    respiratoryRate: initial?.respiratoryRate ?? undefined,
    weightKg:        initial?.weightKg        ?? undefined,
    heightCm:        initial?.heightCm        ?? undefined,
    bloodSugarMgDl:  undefined,
    painScore:       initial?.painScore       ?? undefined,
    notes:           '',
  };

  const { register, handleSubmit, reset, formState } = useForm<VitalsEditFormValues>({
    resolver: zodResolver(vitalsEditSchema),
    defaultValues: defaults,
  });

  // Re-prime the form whenever the sheet opens with fresh `initial` values.
  useEffect(() => {
    if (open) {
      reset(defaults);
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const submit = handleSubmit(async (v) => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(v as Partial<Vitals>);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vitals');
    } finally {
      setBusy(false);
    }
  });

  const fieldErr = (name: keyof VitalsEditFormValues): string | undefined =>
    formState.errors[name]?.message as string | undefined;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="inline-flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit vitals
          </SheetTitle>
          <SheetDescription>
            {initial?.recordedAt
              ? <>Originally recorded {recordedAtLabel(initial.recordedAt)}{initial.recordedBy ? <> by {initial.recordedBy}</> : null}. Your changes are audit-logged.</>
              : <>Record this patient's vitals. Changes are audit-logged.</>}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex flex-col gap-3">

          {/* BP — pair */}
          <fieldset className="flex flex-col gap-1">
            <legend className={labelClass}>
              <Activity className="inline h-3 w-3" /> Blood pressure (mmHg)
            </legend>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Systolic"
                {...register('bpSystolic')}
                className={fieldClass}
              />
              <span className="text-muted-foreground">/</span>
              <input
                type="number"
                placeholder="Diastolic"
                {...register('bpDiastolic')}
                className={fieldClass}
              />
            </div>
            {(fieldErr('bpSystolic') || fieldErr('bpDiastolic')) && (
              <span className="text-xs text-danger">
                {fieldErr('bpSystolic') ?? fieldErr('bpDiastolic')}
              </span>
            )}
          </fieldset>

          {/* Two-up grid for the rest */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}><Heart className="inline h-3 w-3" /> Pulse (bpm)</span>
              <input type="number" {...register('pulseRate')} className={fieldClass} />
              {fieldErr('pulseRate') && <span className="text-xs text-danger">{fieldErr('pulseRate')}</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}><Thermometer className="inline h-3 w-3" /> Temp (°F)</span>
              <input type="number" step="0.1" {...register('temperatureF')} className={fieldClass} />
              {fieldErr('temperatureF') && <span className="text-xs text-danger">{fieldErr('temperatureF')}</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}><Wind className="inline h-3 w-3" /> SpO₂ (%)</span>
              <input type="number" {...register('spo2')} className={fieldClass} />
              {fieldErr('spo2') && <span className="text-xs text-danger">{fieldErr('spo2')}</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Resp rate (/min)</span>
              <input type="number" {...register('respiratoryRate')} className={fieldClass} />
              {fieldErr('respiratoryRate') && <span className="text-xs text-danger">{fieldErr('respiratoryRate')}</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Weight (kg)</span>
              <input type="number" step="0.1" {...register('weightKg')} className={fieldClass} />
              {fieldErr('weightKg') && <span className="text-xs text-danger">{fieldErr('weightKg')}</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Height (cm)</span>
              <input type="number" step="0.1" {...register('heightCm')} className={fieldClass} />
              {fieldErr('heightCm') && <span className="text-xs text-danger">{fieldErr('heightCm')}</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Blood sugar (mg/dL)</span>
              <input type="number" {...register('bloodSugarMgDl')} className={fieldClass} />
              {fieldErr('bloodSugarMgDl') && <span className="text-xs text-danger">{fieldErr('bloodSugarMgDl')}</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelClass}>Pain score (0–10)</span>
              <input type="number" min={0} max={10} {...register('painScore')} className={fieldClass} />
              {fieldErr('painScore') && <span className="text-xs text-danger">{fieldErr('painScore')}</span>}
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Notes</span>
            <textarea
              rows={2}
              {...register('notes')}
              className={fieldClass}
              placeholder="e.g. Fasting BSL · BP recheck after rest"
            />
          </label>

          {error && <span className="text-xs text-danger" role="alert">{error}</span>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save vitals
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
