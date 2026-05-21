import { useEffect, useState } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { cn } from '@/utils/cn';

/**
 * Enterprise sticky save bar. Fixed to the viewport bottom, slides in
 * only when the form is dirty, slides out when the form goes clean.
 * Sits on top of the mobile bottom-nav (clearance via `bottom-16 md:bottom-0`
 * to match the same offset the role bottom-nav uses).
 *
 * Behaviors:
 *  - dirty + idle      → "● Unsaved changes" + Discard + Save
 *  - saving            → "Saving…" + Spinner; Save disabled
 *  - just-saved        → "✓ Saved" briefly (1.6s) then auto-hides if
 *                        the form is clean again
 *  - dirty after error → reverts to the dirty state with no toast
 *                        (the FormErrorContainer carries the failure)
 *
 * Designed to read as enterprise chrome: white surface, hairline top
 * border, soft upward shadow. No floating consumer-CTA feel.
 */
interface StickySaveBarProps {
  /** True when the form has un-saved changes. */
  dirty: boolean;
  /** True while a submit is in flight (Save reads "Saving…", disabled). */
  saving?: boolean;
  /** Set true briefly after a successful save — bar shows ✓ Saved and
   *  auto-hides after 1.6s if `dirty` stays false. */
  justSaved?: boolean;
  /** Submit handler — usually `handleSubmit(onSubmit)` from RHF. */
  onSave: () => void | Promise<void>;
  /** Reset / cancel handler — usually `reset()` from RHF, or `navigate(-1)`. */
  onDiscard: () => void;
  /** Override the Save button label. Default: "Save changes". */
  saveLabel?: string;
  /** Override the Discard button label. Default: "Discard". */
  discardLabel?: string;
  /** Compact text shown left-of-buttons when dirty + idle.
   *  Default: "Unsaved changes". */
  dirtyLabel?: string;
}

export function StickySaveBar({
  dirty,
  saving = false,
  justSaved = false,
  onSave,
  onDiscard,
  saveLabel = 'Save changes',
  discardLabel = 'Discard',
  dirtyLabel = 'Unsaved changes',
}: StickySaveBarProps): JSX.Element | null {
  // Local "show saved" flag so the bar lingers briefly after a save
  // before auto-hiding when `dirty` flips back to false.
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);

  useEffect(() => {
    if (!justSaved) return;
    setShowSavedToast(true);
    const t = window.setTimeout(() => setShowSavedToast(false), 1_600);
    return () => window.clearTimeout(t);
  }, [justSaved]);

  // Visibility: bar shows while dirty OR while we’re displaying the
  // post-save confirmation. Otherwise it’s gone.
  const visible = dirty || showSavedToast;
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className={cn(
        // Position above the mobile bottom-nav (`bottom-16`) on small
        // screens; hugs the viewport bottom on `md+` where there’s no
        // bottom-nav. `inset-x-0` spans full width minus the sidebar
        // gutter — the role layout’s `<main>` is already `flex-1`, so
        // a `fixed` element here spans the whole viewport — that’s
        // intended (it overlays the sidebar too on narrow desktops,
        // but the sidebar is `bg-card` underneath, so it reads fine).
        'fixed inset-x-0 bottom-16 z-40 border-t border-hairline bg-card shadow-elevated print:hidden md:bottom-0',
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 md:px-6">
        <div className="flex items-center gap-2 text-sm">
          {saving ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Spinner size="sm" />
              Saving…
            </span>
          ) : showSavedToast && !dirty ? (
            <span className="inline-flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-foreground">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full bg-warning animate-breathe"
              />
              <span className="font-medium">{dirtyLabel}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
          >
            {discardLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void onSave()}
            disabled={saving || !dirty}
          >
            {saving ? <Spinner size="sm" /> : <Check />}
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
