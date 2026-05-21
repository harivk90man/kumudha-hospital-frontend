import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { FormTextarea } from '@/components/form';
import { cn } from '@/utils/cn';
import {
  recordRadiologyResult,
  type RadiologyOrderQueueEntry,
} from '@/features/radiology';

const schema = z.object({
  resultSummary: z.string().min(2, 'Impression required'),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * TSD-09 §4.3 — multi-image capture caps. UI enforces JPEG/PNG/WebP
 * only (full DICOM stays in PACS via study_uid); per-file cap 10 MB,
 * per-study cap 20 files. Real backend will mirror these limits.
 */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface RadiologyReportFormProps {
  order: RadiologyOrderQueueEntry;
  /** Called after the impression + images are successfully saved. */
  onSaved: () => void | Promise<void>;
  /** Called when the user cancels — parent collapses the expand. */
  onCancel?: () => void;
  /**
   * Optional `id` on the wrapping `<form>` so an external Save button
   * (page-header CTA) can trigger this form via `form="..."`.
   */
  formId?: string;
  /** Hide the in-form Save / Cancel row — caller renders its own CTAs. */
  hideActions?: boolean;
  /** Mirrors submitting state to the parent so external CTAs can disable. */
  onSubmittingChange?: (busy: boolean) => void;
}

/**
 * Compact impression + notes form for radiology with multi-image
 * capture (X-ray / CT preview snapshots). Used both by the legacy
 * `/diagnostics/radiology/:orderId/report` page and the inline-expand
 * on the worklist row.
 */
export function RadiologyReportForm({
  order,
  onSaved,
  onCancel,
  formId,
  hideActions = false,
  onSubmittingChange,
}: RadiologyReportFormProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      resultSummary: order.resultSummary ?? '',
      notes: order.notes ?? '',
    },
  });

  // Mirror submitting state to parent so external CTAs (page-header
  // Save button when `hideActions` is set) can disable while in flight.
  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  /**
   * Image previews live in component state — `URL.createObjectURL`
   * blob URLs for newly-picked files plus any URLs already saved on
   * the order. Tracked separately from RHF because `File` objects
   * aren’t serialisable into the form schema.
   *
   * `picked` is the subset of `images` we created in this session so
   * we can `revokeObjectURL` them on unmount / removal. Server-saved
   * URLs (from `order.imagesUrl`) are *not* revoked.
   */
  const [images, setImages] = useState<string[]>(order.imagesUrl ?? []);
  const pickedRef = useRef<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);

  // Re-prime the form + image previews if the parent reuses this
  // component across different orders by swapping the `order` prop.
  useEffect(() => {
    reset({
      resultSummary: order.resultSummary ?? '',
      notes: order.notes ?? '',
    });
    setImages(order.imagesUrl ?? []);
  }, [order.id, order.resultSummary, order.notes, order.imagesUrl, reset]);

  // Revoke blob URLs created in THIS session when the component unmounts
  // (or when the order changes — pickedRef carries the survivors).
  useEffect(() => {
    return () => {
      for (const url of pickedRef.current) URL.revokeObjectURL(url);
      pickedRef.current.clear();
    };
  }, []);

  const acceptFiles = useCallback(
    (files: FileList | File[]): void => {
      setUploadError(null);
      const incoming = Array.from(files);
      if (incoming.length === 0) return;

      const remaining = MAX_FILES - images.length;
      if (remaining <= 0) {
        setUploadError(`Maximum ${MAX_FILES} images per study.`);
        return;
      }

      const accepted: string[] = [];
      const skipped: string[] = [];
      for (const f of incoming.slice(0, remaining)) {
        if (!ACCEPTED_TYPES.includes(f.type as typeof ACCEPTED_TYPES[number])) {
          skipped.push(`${f.name} (unsupported type)`);
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          skipped.push(`${f.name} (>10 MB)`);
          continue;
        }
        const url = URL.createObjectURL(f);
        pickedRef.current.add(url);
        accepted.push(url);
      }

      if (incoming.length > remaining) {
        skipped.push(`${incoming.length - remaining} more (cap of ${MAX_FILES})`);
      }

      if (accepted.length > 0) {
        setImages((prev) => [...prev, ...accepted]);
      }
      if (skipped.length > 0) {
        setUploadError(`Skipped: ${skipped.join(', ')}`);
      }
    },
    [images.length],
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) acceptFiles(e.target.files);
    // Reset so re-picking the same file fires onChange again.
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) acceptFiles(e.dataTransfer.files);
  };

  const removeImage = (url: string): void => {
    setImages((prev) => prev.filter((u) => u !== url));
    if (pickedRef.current.has(url)) {
      URL.revokeObjectURL(url);
      pickedRef.current.delete(url);
    }
  };

  const onSubmit = async (values: FormValues): Promise<void> => {
    await recordRadiologyResult({
      orderId: order.id,
      resultSummary: values.resultSummary,
      notes: values.notes || undefined,
      imagesUrl: images.length > 0 ? images : undefined,
    });
    // Don’t revoke session-uploaded URLs here — the mock backend now
    // holds them; revoking would break preview elsewhere in the app.
    pickedRef.current.clear();
    await onSaved();
  };

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="rounded-lg border bg-muted/30 p-3 text-xs">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span>UHID {order.patient.uhid}</span>
          <span className="text-muted-foreground">·</span>
          <span>OP {order.opNumber}</span>
          <span className="text-muted-foreground">·</span>
          <span className="capitalize">{order.modality}</span>
          <span className="text-muted-foreground">·</span>
          <span>{order.bodyPart}</span>
        </div>
      </div>

      {/* Image upload + thumbnails */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Images ({images.length}/{MAX_FILES})
          </span>
          <span className="text-[10px] text-muted-foreground">
            JPEG / PNG / WebP · up to 10 MB each
          </span>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col gap-3 rounded-lg border border-dashed p-3 transition',
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30',
          )}
        >
          {images.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              Drag images here or click <strong>Add images</strong>.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {images.map((url, idx) => (
                <li key={url} className="group relative aspect-square overflow-hidden rounded-md border">
                  <img
                    src={url}
                    alt={`Capture ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    aria-label={`Remove image ${idx + 1}`}
                    className="absolute right-1 top-1 rounded-full bg-card/90 p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-card hover:text-foreground focus:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              multiple
              onChange={onFileInputChange}
              className="hidden"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={images.length >= MAX_FILES}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus /> Add images
            </Button>
            {uploadError && (
              <span role="alert" className="text-xs text-warning">
                {uploadError}
              </span>
            )}
          </div>
        </div>
      </section>

      <FormTextarea
        label="Impression"
        requiredMark
        rows={6}
        placeholder='e.g. "Mild loss of lumbar lordosis. No fracture. Disc spaces preserved."'
        error={errors.resultSummary?.message}
        {...register('resultSummary')}
      />
      <FormTextarea
        label="Notes (optional)"
        rows={2}
        error={errors.notes?.message}
        {...register('notes')}
      />

      {!hideActions && (
        <div className="flex justify-end gap-2 border-t pt-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner size="sm" /> : <Check />}
            {isSubmitting ? 'Saving…' : 'Save report'}
          </Button>
        </div>
      )}
    </form>
  );
}
