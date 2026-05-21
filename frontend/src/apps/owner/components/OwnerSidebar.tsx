import { Activity, IndianRupee, LayoutDashboard, TrendingUp } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';

const items: AppSidebarNavItem[] = [
  { to: '/owner/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/owner/revenue',    label: 'Revenue',    icon: IndianRupee },
  { to: '/owner/operations', label: 'Operations', icon: Activity },
];

interface OwnerSidebarProps {
  logoSrc: string;
}

export function OwnerSidebar({ logoSrc }: OwnerSidebarProps): JSX.Element {
  return (
    <AppSidebar
      logoSrc={logoSrc}
      brandTitle="Owner"
      homeTo="/owner/dashboard"
      navItems={items}
      navAriaLabel="Owner primary"
      userAvatarIcon={TrendingUp}
      fallbackName="Owner"
      userSubtitle="Owner"
    />
  );
}
