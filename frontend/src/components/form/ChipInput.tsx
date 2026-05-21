import { forwardRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Chip-style multi-value text input. Replaces the legacy
 * "comma-separated values in a textarea" pattern with explicit chips
 * + Enter-to-add + ✕-to-remove. Reads as enterprise-data-entry, not
 * a freeform notes field.
 *
 * Designed to be controlled — caller owns `values`. The input itself
 * tracks only its own draft text.
 *
 * Used for allergies, chronic conditions, and any other repeated-string
 * field that doesn't deserve a full table editor.
 */

interface ChipInputProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** Placeholder for the inline input. */
  placeholder?: string;
  /** Sub-label hint under the input — e.g. data-source notes. */
  hint?: string;
  /** Surfaces validation errors at the field level. */
  error?: string;
  /** Optional asterisk; mirrors FormInput's API. */
  requiredMark?: boolean;
  /** Optional suggestion list for `<datalist>` autocomplete (mock now). */
  suggestions?: string[];
  /** Disable the entire input (prevents add + remove). */
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Hide the visible label; field stays accessible via aria-label. */
  hideLabel?: boolean;
  /** Bottom-border-only underline style (no box border, no shadow). */
  flat?: boolean;
}

export const ChipInput = forwardRef<HTMLInputElement, ChipInputProps>(
  (
    {
      label,
      values,
      onChange,
      placeholder,
      hint,
      error,
      requiredMark,
      suggestions,
      disabled,
      className,
      id,
      hideLabel = false,
      flat = false,
    },
    ref,
  ) => {
    const [draft, setDraft] = useState<string>('');
    const datalistId = suggestions && suggestions.length > 0
      ? `${id ?? label.replace(/\s+/g, '-').toLowerCase()}-suggestions`
      : undefined;

    const commitDraft = (): void => {
      const trimmed = draft.trim();
      if (!trimmed) return;
      // Dedupe — case-insensitive — so the same allergen typed twice
      // doesn't add a duplicate chip.
      if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
        setDraft('');
        return;
      }
      onChange([...values, trimmed]);
      setDraft('');
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
      // Enter / comma both commit. Tab leaves the field as-is.
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commitDraft();
        return;
      }
      // Backspace on an empty draft removes the last chip — fast undo.
      if (e.key === 'Backspace' && draft.length === 0 && values.length > 0) {
        e.preventDefault();
        onChange(values.slice(0, -1));
      }
    };

    const removeAt = (idx: number): void => {
      onChange(values.filter((_, i) => i !== idx));
    };

    return (
      <div className={cn('flex flex-col gap-1', className)}>
        {!hideLabel && (
          <label
            htmlFor={id}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground"
          >
            {label}
            {requiredMark && (
              <span aria-hidden="true" className="text-danger">*</span>
            )}
          </label>
        )}
        <div
          aria-label={hideLabel ? label : undefined}
          className={cn(
            flat
              ? cn(
                  'flex flex-wrap items-center gap-1.5 border-b bg-transparent px-0 py-1.5 transition-colors focus-within:outline-none focus-within:border-primary',
                  error ? 'border-danger/60' : 'border-hairline',
                )
              : cn(
                  'flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 shadow-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-ring',
                  error && 'border-danger ring-1 ring-danger/40',
                ),
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {v}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${v}`}
                  className="inline-flex rounded-full hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          <input
            ref={ref}
            id={id}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commitDraft}
            placeholder={values.length === 0 ? placeholder : undefined}
            disabled={disabled}
            list={datalistId}
            // `min-w-[8rem]` keeps the input clickable even when chips
            // crowd the line. `flex-1` lets it expand to the row's
            // remaining width.
            className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm focus:outline-none disabled:cursor-not-allowed"
          />
          {datalistId && (
            <datalist id={datalistId}>
              {suggestions!.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </div>
        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : hint ? (
          <p className="text-xxs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    );
  },
);
ChipInput.displayName = 'ChipInput';
