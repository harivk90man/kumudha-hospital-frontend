import { LayoutDashboard, ListOrdered, Stethoscope } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';
import { useAuth } from '@/features/auth';

const items: AppSidebarNavItem[] = [
  { to: '/doctor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/doctor/queue',     label: 'Queue',     icon: ListOrdered    },
];

interface DoctorSidebarProps {
  logoSrc: string;
}

export function DoctorSidebar({ logoSrc }: DoctorSidebarProps): JSX.Element {
  const { user } = useAuth();
  const subtitle = user?.role === 'doctor' ? user.specialization : '—';
  return (
    <AppSidebar
      logoSrc={logoSrc}
      brandTitle="Doctor portal"
      homeTo="/doctor/dashboard"
      navItems={items}
      navAriaLabel="Doctor primary"
      userAvatarIcon={Stethoscope}
      fallbackName="Doctor"
      userSubtitle={subtitle}
    />
  );
}
