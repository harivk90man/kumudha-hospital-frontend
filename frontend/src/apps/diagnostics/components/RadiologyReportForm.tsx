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

/** One image entry in local state. */
interface ImageEntry {
  /** Display URL — blob URL for new picks, data URI for existing DB images. */
  url: string;
  /** Present only for newly picked files (not yet persisted). */
  file?: File;
}

/**
 * DB CHECK allows image/jpeg and image/png only.
 * WebP excluded — no matching MIME in radiology_attachments.file_type CHECK.
 */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'] as const;
const MAX_FILES = 20;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — stored as bytea in DB

interface RadiologyReportFormProps {
  order: RadiologyOrderQueueEntry;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
  formId?: string;
  hideActions?: boolean;
  onSubmittingChange?: (busy: boolean) => void;
}

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

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  /**
   * `images` holds both pre-existing DB images (url only, no file) and
   * newly picked files (url = blob URL, file = File object).
   * On submit we extract only entries with a `file` to upload — existing
   * DB attachments are not re-sent.
   *
   * `blobsRef` tracks blob URLs created this session so we can revoke them
   * on unmount. Server-supplied data URIs are NOT revoked.
   */
  const [images, setImages] = useState<ImageEntry[]>(
    (order.imagesUrl ?? []).map((url) => ({ url })),
  );
  const blobsRef = useRef<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);

  useEffect(() => {
    reset({
      resultSummary: order.resultSummary ?? '',
      notes: order.notes ?? '',
    });
    setImages((order.imagesUrl ?? []).map((url) => ({ url })));
  }, [order.id, order.resultSummary, order.notes, order.imagesUrl, reset]);

  useEffect(() => {
    return () => {
      for (const url of blobsRef.current) URL.revokeObjectURL(url);
      blobsRef.current.clear();
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

      const accepted: ImageEntry[] = [];
      const skipped: string[] = [];

      for (const f of incoming.slice(0, remaining)) {
        if (!ACCEPTED_TYPES.includes(f.type as typeof ACCEPTED_TYPES[number])) {
          skipped.push(`${f.name} (unsupported type — use JPEG or PNG)`);
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          skipped.push(`${f.name} (exceeds 2 MB)`);
          continue;
        }
        const url = URL.createObjectURL(f);
        blobsRef.current.add(url);
        accepted.push({ url, file: f });
      }

      if (incoming.length > remaining) {
        skipped.push(`${incoming.length - remaining} more (cap of ${MAX_FILES})`);
      }
      if (accepted.length > 0) setImages((prev) => [...prev, ...accepted]);
      if (skipped.length > 0) setUploadError(`Skipped: ${skipped.join(', ')}`);
    },
    [images.length],
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) acceptFiles(e.target.files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) acceptFiles(e.dataTransfer.files);
  };

  const removeImage = (url: string): void => {
    setImages((prev) => prev.filter((img) => img.url !== url));
    if (blobsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      blobsRef.current.delete(url);
    }
  };

  const onSubmit = async (values: FormValues): Promise<void> => {
    const imageFiles = images
      .filter((img) => img.file !== undefined)
      .map((img) => img.file!);

    await recordRadiologyResult({
      orderId: order.id,
      resultSummary: values.resultSummary,
      notes: values.notes || undefined,
      imageFiles: imageFiles.length > 0 ? imageFiles : undefined,
    });
    blobsRef.current.clear();
    await onSaved();
  };

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      {/* Image upload + thumbnails */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Images ({images.length}/{MAX_FILES})
          </span>
          <span className="text-[10px] text-muted-foreground">
            JPEG / PNG · up to 2 MB each
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
              {images.map((img, idx) => (
                <li key={img.url} className="group relative aspect-square overflow-hidden rounded-md border">
                  <img
                    src={img.url}
                    alt={`Capture ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.url)}
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
