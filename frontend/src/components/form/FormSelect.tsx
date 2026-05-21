import { forwardRef, useState } from 'react';
import type { SelectHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  requiredMark?: boolean;
  children: ReactNode;
  variant?: 'default' | 'flat';
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(function FormSelect(
  { label, error, hint, requiredMark, variant = 'default', className, id, onChange, children, ...rest },
  ref,
) {
  const isFlat = variant === 'flat';
  const selectId = id ?? `fs-${rest.name ?? Math.random().toString(36).slice(2, 8)}`;
  const describedBy = error ? `${selectId}-err` : hint ? `${selectId}-hint` : undefined;

  // Track whether a real value is selected so flat mode can show
  // placeholder-level colour (muted/60) until the user picks an option.
  // For controlled usage (value prop), derive isEmpty directly so it stays
  // in sync with external state changes (e.g. reset). For uncontrolled usage
  // (defaultValue), maintain local state updated via onChange.
  const isControlled = rest.value !== undefined;
  const [uncontrolledIsEmpty, setUncontrolledIsEmpty] = useState(
    !rest.defaultValue || rest.defaultValue === '',
  );
  const isEmpty = isControlled ? rest.value === '' : uncontrolledIsEmpty;

  return (
    <label htmlFor={selectId} className="flex flex-col gap-1">
      {!isFlat && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
          {requiredMark && <span className="ml-0.5 text-danger">*</span>}
        </span>
      )}
      <select
        id={selectId}
        ref={ref}
        aria-label={isFlat ? label : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(e) => {
          if (!isControlled) setUncontrolledIsEmpty(e.target.value === '');
          onChange?.(e);
        }}
        className={cn(
          isFlat
            ? cn(
                'w-full border-b bg-transparent px-0 py-1.5 text-sm font-normal transition-colors focus:outline-none focus:border-primary',
                isEmpty ? 'text-muted-foreground/60 focus:text-foreground' : 'text-foreground',
                error ? 'border-danger/60' : 'border-hairline',
              )
            : cn(
                'rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
                error && 'border-danger/60',
              ),
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <span id={`${selectId}-err`} className="text-xs text-danger">
          {error}
        </span>
      ) : hint && !isFlat ? (
        <span id={`${selectId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
});
