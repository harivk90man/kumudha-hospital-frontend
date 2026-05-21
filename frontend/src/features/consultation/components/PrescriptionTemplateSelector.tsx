import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { fetchPrescriptionTemplates } from '../consultationApi';
import type { PrescriptionItem, PrescriptionTemplate } from '../consultationTypes';

interface PrescriptionTemplateSelectorProps {
  onLoad: (items: PrescriptionItem[]) => Promise<void> | void;
  className?: string;
}

export function PrescriptionTemplateSelector({
  onLoad,
  className,
}: PrescriptionTemplateSelectorProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchPrescriptionTemplates().then(setTemplates);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={popoverRef} className={cn('relative inline-block', className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <BookOpen /> Template
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 overflow-hidden rounded-lg border bg-popover shadow-md">
          <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Prescription templates
          </header>
          <ul className="max-h-72 overflow-auto">
            {templates.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                No templates yet.
              </li>
            )}
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={async () => {
                    await onLoad(t.items);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.specialty} · {t.itemCount} items
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
