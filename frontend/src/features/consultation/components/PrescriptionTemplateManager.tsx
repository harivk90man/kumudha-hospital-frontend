import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, InsetGroup, InsetGroupRow } from '@/components/layout';
import { fetchPrescriptionTemplates } from '../consultationApi';
import type { PrescriptionTemplate } from '../consultationTypes';

interface PrescriptionTemplateManagerProps {
  className?: string;
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/**
 * Read-only manager view of prescription templates owned by the doctor.
 * Edit / delete are stubbed actions for now — wire to backend when available.
 */
export function PrescriptionTemplateManager({
  className,
}: PrescriptionTemplateManagerProps): JSX.Element {
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    void fetchPrescriptionTemplates().then((t) => {
      if (alive) {
        setTemplates(t);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card className={className} aria-label="Prescription template manager">
      <CardHeader>
        <CardTitle>My prescription templates</CardTitle>
        <span className="text-xs text-muted-foreground">
          {loading ? 'Loading…' : `${templates.length} templates`}
        </span>
      </CardHeader>

      <InsetGroup>
        {templates.map((t) => (
          <InsetGroupRow key={t.id}>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">
                {t.specialty} · {t.itemCount} items · updated {formatDate(t.updatedAt)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon" variant="ghost" aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Delete">
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          </InsetGroupRow>
        ))}
      </InsetGroup>
    </Card>
  );
}
