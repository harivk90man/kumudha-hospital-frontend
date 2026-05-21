import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  Bell,
  CheckCircle2,
  FileQuestion,
  FlaskConical,
  Lock,
  LogOut,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RowActionsItem, RowActionsMenu } from '@/components/overlay';
import { cn } from '@/utils/cn';
import type { EncounterStatus } from '@/features/encounter';
import type { NextAction } from '../consultationTypes';

interface ConsultationActionBarProps {
  status: EncounterStatus;
  /**
   * Default Complete — backend derives `next_action` from the structured
   * record (orders / Rx / advice). Doctor doesn’t have to classify.
   */
  onComplete: () => Promise<void> | void;
  /**
   * Rare-disposition Complete — doctor explicitly tags the visit with
   * one of the kebab options (admit / surgery referral / external referral).
   * Bar patches the chosen `NextAction` and then completes.
   */
  onCompleteWithDisposition: (disposition: NextAction) => Promise<void> | void;
  busy?: boolean;
  /** Last successful autosave timestamp; displayed as "Draft saved Xm ago". */
  draftSavedAt?: string | null;
  /** When set, the consultation is locked (TSD-07 §4.2). */
  lockedAt?: string | null;
  /** True when the doctor has amended in this session (audit logged). */
  amendUnlocked?: boolean;
  /** Click → open amend-with-reason sheet. */
  onAmend?: () => void;
  /**
   * Pre-complete guard inputs — surface as inline warning chips above the
   * action buttons. Advisory only: completion is still permitted (e.g. a
   * doctor may legitimately Complete with labs pending and use Await reports
   * later). The chips exist so the doctor sees gaps before clicking, not
   * after the visit is closed.
   */
  /** True when no diagnosis has been recorded — most common omission. */
  missingDiagnosis?: boolean;
  /** Lab + imaging orders that have not yet been `reported`/`released`. */
  pendingOrdersCount?: number;
  /** Critical-result notifications still awaiting doctor acknowledgement. */
  unackCriticalCount?: number;
  /**
   * Hide the right-side action button cluster (Complete / Await reports
   * / Amend / kebab). The bar then becomes a passive status strip —
   * autosave, lock state, guard chips — while the action buttons are
   * rendered up at the page header. Pair with rendering
   * `<ConsultationActions />` (same component, `headerVariant`) at the
   * top of the page.
   */
  hideActions?: boolean;
  className?: string;
}

/**
 * One advisory chip shown in the pre-complete guard strip. Calm warning
 * tone — these are nudges, not errors. Renders nothing when count is 0.
 */
function GuardChip({
  Icon,
  label,
  tone = 'warning',
}: {
  Icon: LucideIcon;
  label: string;
  tone?: 'warning' | 'danger';
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xxs font-medium',
        tone === 'danger'
          ? 'bg-danger/10 text-danger'
          : 'bg-warning/12 text-warning',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

const formatRelativeShort = (iso: string): string => {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  return `${diffH}h ago`;
};

const formatLockedAt = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function ConsultationActionBar({
  status,
  onComplete,
  onCompleteWithDisposition,
  busy = false,
  draftSavedAt = null,
  lockedAt = null,
  amendUnlocked = false,
  onAmend,
  missingDiagnosis = false,
  pendingOrdersCount = 0,
  unackCriticalCount = 0,
  hideActions = false,
  className,
}: ConsultationActionBarProps): JSX.Element {
  const isDone = status.name === 'consultation_done' || status.name === 'closed';
  const isLocked = Boolean(lockedAt) && !amendUnlocked;
  // Hide the entire button cluster once the visit is done — opening an
  // already-completed consultation is a read-only review, not a place to
  // re-trigger Complete or Await reports. Lock/Amend states still render
  // their own controls below.
  const showCompleteButtons = !isLocked && !amendUnlocked && !isDone;

  // Guard chips shown only when the doctor is actively staging a complete
  // (showCompleteButtons already excludes locked / amending / done states).
  const showGuards =
    showCompleteButtons &&
    (missingDiagnosis || pendingOrdersCount > 0 || unackCriticalCount > 0);

  return (
    <div
      className={cn(
        // Bottom offset clears DoctorBottomNav on mobile (it’s `fixed bottom-0`
        // on `md:hidden`). On `md+` the nav is gone, so we hug the viewport.
        'sticky bottom-16 z-10 flex flex-wrap items-center justify-between gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur md:bottom-0 md:px-6',
        isLocked && 'border-t-muted bg-muted/40',
        amendUnlocked && 'border-t-warning/40 bg-warning/5',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {isLocked && lockedAt ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Lock className="h-3.5 w-3.5" />
            Locked at {formatLockedAt(lockedAt)} — read-only.
          </span>
        ) : amendUnlocked ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-warning">
            <ShieldAlert className="h-3.5 w-3.5" />
            Amending locked consultation — your edits are audit-logged.
          </span>
        ) : (
          <span>
            {isDone
              ? 'Consultation completed.'
              : 'Save your notes, prescription and orders before completing.'}
          </span>
        )}
        {draftSavedAt && !isDone && !isLocked && (
          <span className="text-[10px] text-success">
            Draft autosaved {formatRelativeShort(draftSavedAt)}
          </span>
        )}
      </div>
      {showGuards && (
        <div
          className="order-3 flex w-full flex-wrap items-center gap-1.5 border-t border-dashed pt-2 md:order-none md:w-auto md:border-0 md:pt-0"
          aria-label="Pre-complete checks"
        >
          {unackCriticalCount > 0 && (
            <GuardChip
              Icon={Bell}
              tone="danger"
              label={`${unackCriticalCount} critical unack`}
            />
          )}
          {missingDiagnosis && (
            <GuardChip Icon={FileQuestion} label="No diagnosis" />
          )}
          {pendingOrdersCount > 0 && (
            <GuardChip
              Icon={pendingOrdersCount > 1 ? AlertCircle : FlaskConical}
              label={`${pendingOrdersCount} order${pendingOrdersCount > 1 ? 's' : ''} pending`}
            />
          )}
        </div>
      )}
      {!hideActions && (
        <ConsultationActions
          status={status}
          onComplete={onComplete}
          onCompleteWithDisposition={onCompleteWithDisposition}
          busy={busy}
          lockedAt={lockedAt}
          amendUnlocked={amendUnlocked}
          onAmend={onAmend}
        />
      )}
    </div>
  );
}

interface ConsultationActionsProps {
  status: EncounterStatus;
  onComplete: () => Promise<void> | void;
  onCompleteWithDisposition: (disposition: NextAction) => Promise<void> | void;
  busy?: boolean;
  lockedAt?: string | null;
  amendUnlocked?: boolean;
  onAmend?: () => void;
  className?: string;
}

/**
 * Just the button cluster — Await reports / Complete consultation /
 * rare-disposition kebab (or Amend when locked). Pulled out so the
 * page can render it at the top header (mirroring the front-desk
 * "primary CTA top-right" pattern) while the bottom
 * `<ConsultationActionBar hideActions />` keeps showing autosave +
 * lock state + guard chips.
 *
 * Same show/hide logic as the bar so both placements stay in sync.
 */
export function ConsultationActions({
  status,
  onComplete,
  onCompleteWithDisposition,
  busy = false,
  lockedAt = null,
  amendUnlocked = false,
  onAmend,
  className,
}: ConsultationActionsProps): JSX.Element | null {
  const isDone = status.name === 'consultation_done' || status.name === 'closed';
  const isLocked = Boolean(lockedAt) && !amendUnlocked;
  const showCompleteButtons = !isLocked && !amendUnlocked && !isDone;

  if (!showCompleteButtons && !(isLocked && onAmend)) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {isLocked && onAmend && (
        <Button
          type="button"
          variant="outline"
          onClick={onAmend}
          disabled={busy}
        >
          <ShieldAlert /> Amend with reason
        </Button>
      )}
      {showCompleteButtons && (
        <>
          <Button
            type="button"
            onClick={() => void onComplete()}
            disabled={busy}
          >
            <CheckCircle2 /> Complete consultation
            <ArrowRight />
          </Button>
          {/* Rare-disposition kebab — admit / surgery referral / refer
              external. The default Complete derives next_action from
              the structured record; only these items explicitly tag it. */}
          <RowActionsMenu label="More dispositions" align="end">
            <RowActionsItem
              disabled={busy}
              onClick={() => void onCompleteWithDisposition('admit_ip')}
            >
              <BedDouble /> Admit to IP
            </RowActionsItem>
            <RowActionsItem
              disabled={busy}
              onClick={() => void onCompleteWithDisposition('surgery_referral')}
            >
              <Stethoscope /> Surgery referral
            </RowActionsItem>
            <RowActionsItem
              disabled={busy}
              onClick={() => void onCompleteWithDisposition('referred_external')}
            >
              <LogOut /> Refer external
            </RowActionsItem>
          </RowActionsMenu>
        </>
      )}
    </div>
  );
}
