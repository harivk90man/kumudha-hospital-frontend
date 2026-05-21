import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface AmendWithReasonSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the doctor’s reason; throw to keep the sheet open on failure. */
  onSubmit: (reason: string) => Promise<void> | void;
  /** Optional list of prior amendments to show as audit history. */
  history?: { id: string; reason: string; amendedAt: string }[];
}

const fieldClass =
  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Captures the mandatory reason (TSD-07 §4.2) when amending a locked
 * consultation. Audit-logged via `amendConsultation` API.
 */
export function AmendWithReasonSheet({
  open,
  onClose,
  onSubmit,
  history = [],
}: AmendWithReasonSheetProps): JSX.Element {
  const [reason, setReason] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const tooShort = trimmed.length < 8;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (tooShort) {
      setError('Reason must be at least 8 characters (will be audited).');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to amend consultation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="inline-flex items-center gap-2 text-danger">
            <ShieldAlert className="h-4 w-4" />
            Amend completed consultation
          </SheetTitle>
          <SheetDescription>
            This consultation is locked. Provide a reason — both the reason and your edits
            will be audit-logged and visible to clinical reviewers.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Reason for amendment *</span>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={fieldClass}
              placeholder="e.g. Lab result corrected by lab team after release; updating impression."
            />
            {error && <span className="text-xs text-danger">{error}</span>}
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || tooShort}>
              Unlock & amend
            </Button>
          </div>
        </form>

        {history.length > 0 && (
          <section className="flex flex-col gap-2 border-t pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prior amendments ({history.length})
            </h4>
            <ul className="flex flex-col divide-y rounded-lg border">
              {history.map((a) => (
                <li key={a.id} className="px-3 py-2 text-xs">
                  <div className="font-mono text-muted-foreground">{formatDateTime(a.amendedAt)}</div>
                  <div className="text-foreground">{a.reason}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </SheetContent>
    </Sheet>
  );
}
