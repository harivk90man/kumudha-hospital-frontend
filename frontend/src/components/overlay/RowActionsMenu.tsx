import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { MoreVertical } from 'lucide-react';
import { Slot } from '@radix-ui/react-slot';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

/**
 * Row-level "kebab" overflow menu — the secondary-action holder for a
 * worklist row. Pairs with one labeled primary CTA next to it so the
 * Actions column reads as: [primary CTA for current row state] [⋯].
 *
 * Keeps the column compact regardless of how many secondary actions the
 * row has, and gives screen-reader users a labeled menu instead of a
 * row of mystery icons.
 *
 * Self-contained (useState + click-outside) so we don’t pull in a new
 * Radix package for one consumer. When a second worklist needs the same
 * surface, this is a drop-in replacement target for a shadcn
 * dropdown-menu primitive.
 */

interface RowActionsMenuProps {
  /**
   * Accessible label for the trigger — e.g. "More actions for Ramesh".
   * Read by SRs since the trigger itself is icon-only.
   */
  label: string;
  /** `<RowActionsItem>` children. */
  children: ReactNode;
  /** Override the default right-edge alignment. */
  align?: 'start' | 'end';
}

export function RowActionsMenu({
  label,
  children,
  align = 'end',
}: RowActionsMenuProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && wrapperRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Auto-close after any item activates (click). We listen on the menu
  // itself so any nested `<Link>` / `<button>` triggers it without each
  // RowActionsItem needing a manual onClick wrapper.
  const onMenuClick = (): void => setOpen(false);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className="h-8 w-8"
      >
        <MoreVertical />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          onClick={onMenuClick}
          className={cn(
            // `min-w-max` so the menu grows to its widest item; the
            // 12rem floor stops it from collapsing under a single short
            // item. Combined with `whitespace-nowrap` on items, no
            // label ever wraps mid-line.
            'absolute top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-md border bg-card p-1 shadow-md',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface RowActionsItemProps {
  children: ReactNode;
  /**
   * When true, clones the single child element and merges menuitem
   * styling/role onto it — lets a `<Link>` be the menu item directly,
   * matching the Radix Slot pattern used by `Button`.
   */
  asChild?: boolean;
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  /** Render in danger-tone — e.g. Cancel visit. */
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}

// Items use the same icon-then-label layout regardless of whether the
// underlying element is a `<Link>` (asChild) or a `<button>` — gap-2.5
// + items-center gives consistent vertical alignment, leading-none stops
// the icon’s box from outgrowing the text line, and `whitespace-nowrap`
// prevents long labels from wrapping mid-item (the menu grows instead).
const itemBase =
  'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm font-medium leading-none text-foreground whitespace-nowrap hover:bg-muted/60 focus:bg-muted/60 focus:outline-none cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0 no-underline';

export function RowActionsItem({
  children,
  asChild = false,
  onClick,
  destructive = false,
  disabled = false,
  className,
}: RowActionsItemProps): JSX.Element {
  const cls = cn(
    itemBase,
    destructive && 'text-danger hover:bg-danger/10',
    disabled && 'pointer-events-none opacity-50',
    className,
  );

  if (asChild) {
    // Clone the child so the menuitem role + styling lives on the link.
    const only = Children.only(children) as ReactElement;
    if (!isValidElement(only)) return <></>;
    return (
      <Slot role="menuitem" className={cls} onClick={onClick}>
        {cloneElement(only)}
      </Slot>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cls}
    >
      {children}
    </button>
  );
}
