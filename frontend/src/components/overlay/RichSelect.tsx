import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Rich popover-backed select. Replaces the native `<select>` element
 * for filter strips that need to show more than a single line of text
 * per option — e.g. a doctor list with department + live queue count,
 * a counter with shift + collected amount, a vendor with category +
 * outstanding total.
 *
 * Visual + behavioural shape matches the `RowActionsMenu` pattern in
 * this folder — self-contained click-outside / Escape close, no Radix
 * select dependency. Keyboard nav: ArrowUp / ArrowDown move focus,
 * Enter commits, Escape closes, Tab dismisses.
 */
export interface RichSelectOption {
  value: string;
  /** Primary label — bold, single line. */
  name: string;
  /** Smaller text under the name (e.g. department, station). */
  sublabel?: string;
  /** Right-aligned numeric badge (e.g. live queue count). */
  count?: number;
}

interface RichSelectProps {
  /** Form-style label rendered above the trigger. Omit to hide the label. */
  label?: string;
  /** The selected option's `value`. */
  value: string;
  onChange: (value: string) => void;
  options: RichSelectOption[];
  /** ARIA label for the listbox. Defaults to the field label. */
  menuLabel?: string;
  /** Extra classes applied to the outer wrapper (sizing, etc.). */
  className?: string;
  /** Extra classes applied to the trigger button (e.g. border overrides). */
  triggerClassName?: string;
}

export function RichSelect({
  label,
  value,
  onChange,
  options,
  menuLabel,
  className,
  triggerClassName,
}: RichSelectProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const triggerId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );
  const initialActive = useMemo(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx >= 0 ? idx : 0;
  }, [options, value]);
  const [activeIndex, setActiveIndex] = useState<number>(initialActive);

  // Reset active row to the selected one each time the menu opens so
  // arrow-key nav starts from "current value" not the previous focus.
  useEffect(() => {
    if (open) setActiveIndex(initialActive);
  }, [open, initialActive]);

  // Close on outside click or Escape — mirrors RowActionsMenu's own
  // self-contained dismiss pattern so we don't pull in a Radix package
  // for one consumer.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && wrapperRef.current.contains(e.target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (idx: number): void => {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(activeIndex);
    }
  };

  const triggerLabel = selected ? selected.name : 'Select…';
  const triggerSub = selected?.sublabel;

  return (
    <div ref={wrapperRef} className={cn('relative flex flex-col gap-1', className)}>
      {label && (
        <label
          htmlFor={triggerId}
          className="text-xs font-medium text-muted-foreground"
        >
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
          open && 'ring-2 ring-ring',
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <span className="block truncate text-foreground">{triggerLabel}</span>
          {triggerSub && (
            <span className="block truncate text-xxs text-muted-foreground">
              {triggerSub}
            </span>
          )}
        </span>
        {typeof selected?.count === 'number' && (
          <span className="font-mono text-xxs text-muted-foreground tabular-nums">
            {selected.count}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={menuLabel ?? label}
          tabIndex={-1}
          autoFocus
          onKeyDown={onListKeyDown}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          ref={(el) => {
            // Move focus to the listbox so ↑ ↓ Enter work without a click.
            el?.focus();
          }}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-elevated focus:outline-none"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIndex;
            return (
              <button
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                type="button"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                  isActive && !isSelected && 'bg-muted/60',
                  isSelected && 'bg-primary/10 text-primary',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{opt.name}</span>
                  {opt.sublabel && (
                    <span
                      className={cn(
                        'block truncate text-xxs',
                        isSelected ? 'text-primary/70' : 'text-muted-foreground',
                      )}
                    >
                      {opt.sublabel}
                    </span>
                  )}
                </span>
                {typeof opt.count === 'number' && (
                  <span
                    className={cn(
                      'font-mono text-xxs tabular-nums',
                      isSelected ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {opt.count}
                  </span>
                )}
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
