import { FlaskConical, Microscope, Scan } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';
import { useAuth } from '@/features/auth';

// Lab + Radiology are the work surfaces — each has its own tab-count
// strip that subsumes the cross-section "dashboard". The Dashboard
// route stays mounted for back-compat but is off the sidebar.
const items: AppSidebarNavItem[] = [
  { to: '/diagnostics/lab',       label: 'Lab',       icon: FlaskConical },
  { to: '/diagnostics/radiology', label: 'Radiology', icon: Scan },
];

interface DiagnosticsSidebarProps {
  logoSrc: string;
}

const roleLabel = (role: string): string =>
  role === 'lab_tech' ? 'Lab technician' : role === 'rad_tech' ? 'Radiology tech' : 'Diagnostics';

export function DiagnosticsSidebar({ logoSrc }: DiagnosticsSidebarProps): JSX.Element {
  const { user } = useAuth();
  return (
    <AppSidebar
      logoSrc={logoSrc}
      brandTitle="Diagnostics"
      homeTo="/diagnostics/dashboard"
      navItems={items}
      navAriaLabel="Diagnostics primary"
      userAvatarIcon={Microscope}
      fallbackName="Tech"
      userSubtitle={user ? roleLabel(user.role) : '—'}
    />
  );
}
