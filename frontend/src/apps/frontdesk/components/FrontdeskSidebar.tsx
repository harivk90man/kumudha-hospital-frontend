import { CalendarClock, HeartPulse, Lock, Users } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';
import { roleHas, useAuth, type UserRole } from '@/features/auth';

// Sidebar is intentionally minimal — OP coordination covers the daily
// receptionist + nurse flow (lookup + queue position + vitals queue +
// walk-in entry point); Appointments is the receptionist’s booking
// surface. Shift close is appended only for users who carry the
// `close_shift` capability (nurse today; receptionist intentionally
// excluded — small-clinic dual-hat is the nurse, not the receptionist).
// The legacy Dashboard / Register / Vitals / Queue routes stay
// reachable via deep-link but are off the sidebar so the user isn’t
// fragmented across screens.
const baseItems: AppSidebarNavItem[] = [
  { to: '/frontdesk/station',      label: 'OP coordination', icon: HeartPulse },
  { to: '/frontdesk/appointments', label: 'Appointments',    icon: CalendarClock },
];

const navFor = (role: UserRole | undefined): AppSidebarNavItem[] => {
  if (role && roleHas(role, 'close_shift')) {
    return [
      ...baseItems,
      { to: '/cashier/shift-close', label: 'Shift close', icon: Lock },
    ];
  }
  return baseItems;
};

interface FrontdeskSidebarProps {
  logoSrc: string;
}

const roleLabel = (role: string): string =>
  role === 'receptionist' ? 'Receptionist' : role === 'nurse' ? 'Nurse' : 'Front desk';

export function FrontdeskSidebar({ logoSrc }: FrontdeskSidebarProps): JSX.Element {
  const { user } = useAuth();
  return (
    <AppSidebar
      logoSrc={logoSrc}
      brandTitle="Front desk"
      homeTo="/frontdesk/dashboard"
      navItems={navFor(user?.role)}
      navAriaLabel="Front-desk primary"
      userAvatarIcon={Users}
      fallbackName="Staff"
      userSubtitle={user ? roleLabel(user.role) : '—'}
    />
  );
}
