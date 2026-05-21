import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  requiredMark?: boolean;
  variant?: 'default' | 'flat' | 'underline';
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  function FormTextarea(
    { label, error, hint, requiredMark, variant = 'default', className, id, rows = 3, ...rest },
    ref,
  ) {
    const isFlat = variant === 'flat';
    const isUnderline = variant === 'underline';
    const taId = id ?? `ft-${rest.name ?? Math.random().toString(36).slice(2, 8)}`;
    const describedBy = error ? `${taId}-err` : hint ? `${taId}-hint` : undefined;

    return (
      <label htmlFor={taId} className="flex flex-col gap-1">
        {!isFlat && (
          <span className="text-xs font-medium text-muted-foreground">
            {label}
            {requiredMark && <span className="ml-0.5 text-danger">*</span>}
          </span>
        )}
        <textarea
          id={taId}
          ref={ref}
          rows={rows}
          aria-label={isFlat ? label : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            isFlat || isUnderline
              ? cn(
                  'w-full border-b bg-transparent px-0 py-1.5 text-sm transition-colors focus:outline-none focus:border-primary resize-none',
                  error ? 'border-danger/60' : 'border-hairline',
                )
              : cn(
                  'rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
                  error && 'border-danger/60',
                ),
            className,
          )}
          {...rest}
        />
        {error ? (
          <span id={`${taId}-err`} className="text-xs text-danger">
            {error}
          </span>
        ) : hint && !isFlat ? (
          <span id={`${taId}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </label>
    );
  },
);
