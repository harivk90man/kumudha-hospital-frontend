import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  requiredMark?: boolean;
  /**
   * 'flat'      — hides the label, underline border only. Placeholder carries the name.
   * 'underline' — keeps the label, underline border only. For labelled dense forms.
   * 'default'   — standard labelled box (default).
   */
  variant?: 'default' | 'flat' | 'underline';
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(function FormInput(
  { label, error, hint, leading, trailing, requiredMark, variant = 'default', className, id, ...rest },
  ref,
) {
  const isFlat = variant === 'flat';
  const isUnderline = variant === 'underline';
  const inputId = id ?? `fi-${rest.name ?? Math.random().toString(36).slice(2, 8)}`;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

  const wrapperCn = isFlat || isUnderline
    ? cn(
        'flex items-center gap-2 border-b bg-transparent px-0 py-1.5 text-sm transition-colors focus-within:border-primary',
        error ? 'border-danger/60' : 'border-hairline',
      )
    : cn(
        'flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-within:ring-2 focus-within:ring-ring',
        error && 'border-danger/60',
      );

  return (
    <label htmlFor={inputId} className="flex flex-col gap-1">
      {!isFlat && (
        <span className={cn('text-xs font-medium', isUnderline ? 'text-muted-foreground/70' : 'text-muted-foreground')}>
          {label}
          {requiredMark && <span className="ml-0.5 text-danger">*</span>}
        </span>
      )}
      <span className={wrapperCn}>
        {leading}
        <input
          id={inputId}
          ref={ref}
          aria-label={isFlat ? label : undefined}
          aria-required={requiredMark || undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60',
            className,
          )}
          {...rest}
        />
        {isFlat && requiredMark && (
          <span aria-hidden="true" className="text-danger">*</span>
        )}
        {trailing}
      </span>
      {error ? (
        <span id={`${inputId}-err`} className="text-xs text-danger">
          {error}
        </span>
      ) : hint && !isFlat ? (
        <span id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
});
