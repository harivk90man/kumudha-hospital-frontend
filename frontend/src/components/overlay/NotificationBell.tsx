import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Compact notification bell — replaces the always-on "Needs attention"
 * alerts ribbon. Renders a small bell button with an unread-style
 * count badge; clicking it pops open a panel anchored to the trigger
 * with the alert list. Self-contained click-outside / Escape close
 * (same pattern as RowActionsMenu and RichSelect — keeps the dep
 * surface flat).
 *
 * The badge tone reflects the highest-severity alert in the list so
 * a red bell at-a-glance always means "go look right now".
 */
export interface NotificationItem {
  severity: 'critical' | 'warning' | 'info';
  Icon: LucideIcon;
  message: string;
  /** Click target — usually the operational page that owns the action. */
  href: string;
}

interface NotificationBellProps {
  items: NotificationItem[];
  /** Title shown at the top of the popover. Defaults to "Needs attention". */
  title?: string;
  /** Empty-state copy when items.length === 0. */
  emptyLabel?: string;
  className?: string;
}

const SEVERITY_RANK: Record<NotificationItem['severity'], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export function NotificationBell({
  items,
  title = 'Needs attention',
  emptyLabel = 'All clear — no alerts.',
  className,
}: NotificationBellProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const triggerId = useId();

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

  const count = items.length;
  const topSeverity = items.reduce<NotificationItem['severity'] | null>(
    (top, item) =>
      top === null || SEVERITY_RANK[item.severity] > SEVERITY_RANK[top]
        ? item.severity
        : top,
    null,
  );

  const badgeTone =
    topSeverity === 'critical'
      ? 'bg-danger text-danger-foreground'
      : topSeverity === 'warning'
        ? 'bg-warning text-warning-foreground'
        : 'bg-info text-info-foreground';

  return (
    <div
      ref={wrapperRef}
      className={cn('relative inline-flex', className)}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={count > 0 ? `${count} alerts — open notifications` : 'No alerts'}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-foreground transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring',
          count > 0 && topSeverity === 'critical' && 'border-danger/40',
          count > 0 && topSeverity === 'warning' && 'border-warning/40',
        )}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none',
              badgeTone,
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] origin-top-right rounded-md border bg-popover text-popover-foreground shadow-elevated focus:outline-none"
        >
          <header className="flex items-center justify-between border-b border-hairline px-3 py-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{title}</span>
            {count > 0 && (
              <span
                className={cn(
                  'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 font-mono text-[10px] tabular-nums',
                  badgeTone,
                )}
              >
                {count}
              </span>
            )}
          </header>

          {count === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {emptyLabel}
            </p>
          ) : (
            <ul className="max-h-80 overflow-auto py-1">
              {items.map((a, i) => (
                <NotificationRow key={i} item={a} onSelect={() => setOpen(false)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onSelect,
}: {
  item: NotificationItem;
  onSelect: () => void;
}): JSX.Element {
  const ToneIcon = item.Icon;
  return (
    <li>
      <Link
        to={item.href}
        onClick={onSelect}
        className={cn(
          'flex items-start gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50',
          item.severity === 'critical' && 'text-danger',
          item.severity === 'warning' && 'text-warning',
        )}
      >
        <ToneIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-snug">
          {(item.message as ReactNode) /* arbitrary string OK */}
        </span>
        <ChevronRight
          className="mt-0.5 h-4 w-4 flex-shrink-0 opacity-60"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
