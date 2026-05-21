import { Check, ClipboardList, FileText, FlaskConical, Pill, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export type ConsultationStepKey =
  | 'notes'
  | 'diagnosis'
  | 'prescription'
  | 'orders'
  | 'advice';

interface StepDef {
  key: ConsultationStepKey;
  label: string;
  Icon: LucideIcon;
}

export const consultationSteps: StepDef[] = [
  { key: 'notes', label: 'Notes', Icon: FileText },
  { key: 'diagnosis', label: 'Diagnosis', Icon: ClipboardList },
  { key: 'prescription', label: 'Prescription', Icon: Pill },
  { key: 'orders', label: 'Orders', Icon: FlaskConical },
  { key: 'advice', label: 'Advice', Icon: Send },
];

interface ConsultationStepperProps {
  active: ConsultationStepKey;
  completed: Record<ConsultationStepKey, boolean>;
  onChange: (next: ConsultationStepKey) => void;
  className?: string;
}

export function ConsultationStepper({
  active,
  completed,
  onChange,
  className,
}: ConsultationStepperProps): JSX.Element {
  return (
    <ol
      role="tablist"
      aria-label="Consultation steps"
      className={cn(
        'flex w-full items-stretch gap-1 overflow-x-auto rounded-xl border bg-card p-1.5',
        className,
      )}
    >
      {consultationSteps.map((step, idx) => {
        const isActive = step.key === active;
        const isDone = completed[step.key];
        const Icon = isDone && !isActive ? Check : step.Icon;
        return (
          <li key={step.key} className="flex flex-1 items-center min-w-fit">
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(step.key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : isDone
                    ? 'text-foreground hover:bg-muted'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isActive
                    ? 'bg-primary-foreground text-primary'
                    : isDone
                      ? 'bg-success text-success-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
                aria-hidden="true"
              >
                {isDone && !isActive ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="hidden text-[10px] uppercase tracking-wide opacity-80 sm:inline">
                  Step {idx + 1}
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {step.label}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
