import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/utils/cn';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  /**
   * When true (default) the input accepts any free-text — value === input text.
   * When false the input is read-only, shows the matched option's label, and
   * value can only be changed by picking from the dropdown.
   */
  allowCustom?: boolean;
  /** Classname applied to the underlying `<input>` (e.g. cell styling). */
  className?: string;
}

/**
 * Shared combobox primitive — typeable input + custom dropdown panel.
 *
 * Used for fields that need:
 *  - Free-text entry plus suggestions (Frequency, Route — allowCustom)
 *  - Or strict select-from-list with branded styling (Food Timing — !allowCustom)
 *
 * Native `<datalist>` was rejected because its popup styling is browser-
 * controlled (Chrome renders it large + dark). This component renders a
 * fully-styled dropdown matching the rest of the design system.
 *
 * Keyboard:
 *  - ArrowDown/Up   — move highlight
 *  - Enter          — select highlighted option (then bubbles up so the
 *                     parent row's onKeyDown can advance to the next field)
 *  - Escape         — close dropdown
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = true,
  className,
}: ComboboxProps): JSX.Element {
  const [open,       setOpen]       = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const inputRef                    = useRef<HTMLInputElement>(null);

  const exactMatch = options.find((o) => o.value === value);

  // Filter only when user is typing custom text in free-text mode. When the
  // value exactly matches an option, treat it as a "selected" state — show
  // the full list so the user can browse.
  const filtered = !allowCustom || !value || exactMatch
    ? options
    : options.filter((o) =>
        o.label.toLowerCase().includes(value.toLowerCase()) ||
        o.value.toLowerCase().includes(value.toLowerCase()),
      );

  useEffect(() => { if (!open) setFocusedIdx(-1); }, [open]);
  useEffect(() => { setFocusedIdx(-1); }, [value]);

  /** Fixed-position dropdown to escape any ancestor `overflow:hidden`. */
  const getDropdownStyle = (): CSSProperties => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return { display: 'none' };
    return {
      position: 'fixed',
      top:      rect.bottom + 4,
      left:     rect.left,
      width:    Math.max(rect.width, 180),
      zIndex:   9999,
    };
  };

  const displayValue = allowCustom ? value : (exactMatch?.label ?? '');

  const selectOption = (opt: ComboboxOption): void => {
    onChange(opt.value);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (!open) setOpen(true);
      setFocusedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusedIdx >= 0 && filtered[focusedIdx]) {
      e.preventDefault();
      selectOption(filtered[focusedIdx]);
      // Intentionally NOT stopPropagation — let parent row's keydown
      // handler bubble-receive Enter and advance to the next field.
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (!allowCustom) return;     // read-only in strict mode
    onChange(e.target.value);
    setOpen(true);
  };

  /** Delay close so a click on a suggestion can fire before blur. */
  const onBlur = (): void => {
    setTimeout(() => setOpen(false), 150);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className={cn(className, !allowCustom && 'cursor-pointer')}
        placeholder={placeholder}
        value={displayValue}
        readOnly={!allowCustom}
        onChange={onInputChange}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul
          style={getDropdownStyle()}
          className="max-h-48 overflow-auto rounded-md border border-hairline bg-background shadow-lg"
        >
          {filtered.map((opt, idx) => (
            <li key={opt.value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(opt)}
                className={cn(
                  'flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors',
                  idx === focusedIdx ? 'bg-muted text-foreground' : 'hover:bg-muted',
                )}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
