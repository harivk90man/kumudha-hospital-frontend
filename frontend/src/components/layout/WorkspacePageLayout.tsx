import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { Breadcrumb, type BreadcrumbItem } from '@/components/data-display';
import { UhidSearchInput } from '@/components/form';

interface UhidSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}

interface ActionProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** Icon shown to the left of the label when not in loading state. */
  icon?: React.ReactNode;
}

export interface WorkspacePageLayoutProps {
  /** Breadcrumb trail after the home icon. */
  breadcrumbItems: BreadcrumbItem[];
  homeTo: string;
  homeLabel?: string;

  /** Back button target — navigated to on click. */
  backTo: string;

  /** Page title rendered as h1. */
  title: string;

  /** Subtitle below the title. Accepts a node so callers can make it dynamic. */
  subtitle?: React.ReactNode;

  /** Optional UHID / phone search input in the header right area. */
  uhidSearch?: UhidSearchProps;

  /** Primary action button (e.g. "Register", "Place order"). */
  primaryAction?: ActionProps;

  /** Secondary / cancel button (outline style). */
  secondaryAction?: ActionProps;

  children: React.ReactNode;
}

/**
 * Standard full-height workspace page shell used across frontdesk and similar
 * station pages. Renders breadcrumb → header (title + optional UHID search +
 * action buttons) → divider → scrollable content area.
 */
export function WorkspacePageLayout({
  breadcrumbItems,
  homeTo,
  homeLabel,
  backTo,
  title,
  subtitle,
  uhidSearch,
  primaryAction,
  secondaryAction,
  children,
}: WorkspacePageLayoutProps): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4 md:h-screen md:gap-5 md:p-6">
      <Breadcrumb items={breadcrumbItems} homeTo={homeTo} homeLabel={homeLabel} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(backTo)}
            className="-ml-2 mb-1 h-7 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-[13px] text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {(uhidSearch || primaryAction || secondaryAction) && (
          <div className="flex flex-wrap items-center gap-2">
            {uhidSearch && (
              <UhidSearchInput
                value={uhidSearch.value}
                onChange={uhidSearch.onChange}
                onSearch={uhidSearch.onSubmit}
                placeholder={uhidSearch.placeholder}
              />
            )}

            {primaryAction && (
              <Button
                type="button"
                className="w-44 justify-center"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled ?? false}
              >
                {primaryAction.loading ? <Spinner size="sm" /> : (primaryAction.icon ?? null)}
                {primaryAction.loading
                  ? (primaryAction.loadingLabel ?? primaryAction.label)
                  : primaryAction.label}
              </Button>
            )}

            {secondaryAction && (
              <Button
                type="button"
                variant="outline"
                className="w-44 justify-center"
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled ?? false}
              >
                {secondaryAction.loading ? <Spinner size="sm" /> : (secondaryAction.icon ?? null)}
                {secondaryAction.loading
                  ? (secondaryAction.loadingLabel ?? secondaryAction.label)
                  : secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </header>

      <hr className="border-hairline" />

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
