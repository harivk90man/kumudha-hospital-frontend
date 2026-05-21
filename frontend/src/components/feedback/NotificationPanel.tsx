import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, Maximize2, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/features/auth/authStore';
import {
  dominantType,
  type Notification,
  type NotificationType,
  useNotificationsStore,
} from '@/store/notificationsStore';

// ── Colour maps ───────────────────────────────────────────────────────────────

const HEADER_BG: Record<NotificationType, string> = {
  success: 'bg-green-50  border-green-300',
  error:   'bg-red-50    border-red-300',
  warning: 'bg-amber-50  border-amber-300',
  info:    'bg-blue-50   border-blue-300',
};

const HEADER_TEXT: Record<NotificationType, string> = {
  success: 'text-green-800',
  error:   'text-red-800',
  warning: 'text-amber-800',
  info:    'text-blue-800',
};

const ITEM_DOT: Record<NotificationType, string> = {
  success: 'bg-green-500',
  error:   'bg-red-500',
  warning: 'bg-amber-500',
  info:    'bg-blue-500',
};

// ── Icon per type ─────────────────────────────────────────────────────────────

function TypeIcon({ type, className }: { type: NotificationType; className?: string }) {
  const cls = cn('h-4 w-4 shrink-0', className);
  switch (type) {
    case 'success': return <CheckCircle2 className={cn(cls, 'text-green-600')} />;
    case 'error':   return <AlertCircle  className={cn(cls, 'text-red-600')} />;
    case 'warning': return <AlertTriangle className={cn(cls, 'text-amber-600')} />;
    case 'info':    return <Info          className={cn(cls, 'text-blue-600')} />;
  }
}

// ── Header label: "2 Errors" / "Txn Complete" ─────────────────────────────────

function headerLabel(notifications: Notification[], type: NotificationType): string {
  const count = notifications.length;
  if (count === 1) return notifications[0].title;
  const label = type === 'error' ? 'Errors' : type === 'warning' ? 'Warnings'
    : type === 'success' ? 'Messages' : 'Notifications';
  return `${count} ${label}`;
}

// ── Individual notification row ───────────────────────────────────────────────

function NotificationRow({ n }: { n: Notification }) {
  const dismiss = useNotificationsStore((s) => s.dismiss);
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', ITEM_DOT[n.type])} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground leading-snug">{n.title}</p>
        {n.message && (
          <p className="mt-0.5 text-xs text-muted-foreground break-words">{n.message}</p>
        )}
      </div>
      <button
        onClick={() => dismiss(n.id)}
        className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function NotificationPanel() {
  const isAuthenticated = useAuthStore((s) => !!s.session);
  const { notifications, panelState, setPanelState, clearAll } = useNotificationsStore();

  if (!isAuthenticated || panelState === 'hidden' || notifications.length === 0) return null;

  const type    = dominantType(notifications);
  const label   = headerLabel(notifications, type);
  const isMinimized = panelState === 'minimized';
  const isExpanded  = panelState === 'expanded';

  const headerBar = (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 border-b border-inherit',
        isMinimized || isExpanded ? 'rounded-lg border' : 'rounded-t-lg',
        HEADER_BG[type],
      )}
    >
      <TypeIcon type={type} />
      <span className={cn('flex-1 text-sm font-semibold truncate', HEADER_TEXT[type])}>
        {label}
      </span>

      {/* ↑ / ↓ minimise */}
      <button
        onClick={() => setPanelState(isMinimized ? 'normal' : 'minimized')}
        className={cn('rounded p-0.5 hover:bg-black/10', HEADER_TEXT[type])}
        aria-label={isMinimized ? 'Restore' : 'Minimise'}
      >
        {isMinimized ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {/* ⤢ expand */}
      <button
        onClick={() => setPanelState(isExpanded ? 'normal' : 'expanded')}
        className={cn('rounded p-0.5 hover:bg-black/10', HEADER_TEXT[type])}
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>

      {/* ✕ close all */}
      <button
        onClick={clearAll}
        className={cn('rounded p-0.5 hover:bg-black/10', HEADER_TEXT[type])}
        aria-label="Close all"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  // ── Expanded: centre-top overlay ──────────────────────────────────────────
  if (isExpanded) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setPanelState('normal')}
        />
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-lg border shadow-2xl bg-background">
          {headerBar}
          <div className="max-h-[60vh] divide-y divide-hairline overflow-y-auto">
            {notifications.map((n) => <NotificationRow key={n.id} n={n} />)}
          </div>
          <div className="flex justify-end border-t border-hairline px-3 py-2">
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear all
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Normal / minimised: top-right floating panel ──────────────────────────
  return (
    <div className="fixed right-4 top-4 z-50 w-80 rounded-lg border shadow-lg bg-background">
      {headerBar}
      {!isMinimized && (
        <div className="max-h-52 divide-y divide-hairline overflow-y-auto rounded-b-lg">
          {notifications.map((n) => <NotificationRow key={n.id} n={n} />)}
        </div>
      )}
    </div>
  );
}
