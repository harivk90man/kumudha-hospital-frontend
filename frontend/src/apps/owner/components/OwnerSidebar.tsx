import { Activity, IndianRupee, LayoutDashboard, SlidersHorizontal, TrendingUp, UserCog } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';

const items: AppSidebarNavItem[] = [
  { to: '/owner/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/owner/revenue',    label: 'Revenue',    icon: IndianRupee },
  { to: '/owner/operations', label: 'Operations', icon: Activity },
  { to: '/owner/pricing',    label: 'Pricing',    icon: SlidersHorizontal },
  { to: '/owner/users',      label: 'User roles', icon: UserCog },
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
