import { cn } from '@/utils/cn';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export interface BloodGroupPillsProps {
  value: string;
  onChange: (next: string) => void;
}

export function BloodGroupPills({ value, onChange }: BloodGroupPillsProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BLOOD_GROUPS.map((bg) => {
        const active = value === bg;
        return (
          <button
            key={bg}
            type="button"
            onClick={() => onChange(active ? '' : bg)}
            aria-pressed={active}
            className={cn(
              'min-w-[2.5rem] rounded-full border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-hairline bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            {bg}
          </button>
        );
      })}
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-xxs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
