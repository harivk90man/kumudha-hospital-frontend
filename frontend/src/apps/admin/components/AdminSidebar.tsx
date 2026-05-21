import { Building2, ListTree, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';

const items: AppSidebarNavItem[] = [
  { to: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { to: '/admin/users',   label: 'Users',   icon: Users },
  { to: '/admin/lookups', label: 'Lookups', icon: ListTree },
  { to: '/admin/audit',   label: 'Audit',   icon: ScrollText },
];

interface AdminSidebarProps {
  logoSrc: string;
}

export function AdminSidebar({ logoSrc }: AdminSidebarProps): JSX.Element {
  return (
    <AppSidebar
      logoSrc={logoSrc}
      brandTitle="Platform admin"
      homeTo="/admin/tenants"
      navItems={items}
      navAriaLabel="Admin primary"
      userAvatarIcon={ShieldCheck}
      fallbackName="Admin"
      userSubtitle="Platform admin"
    />
  );
}
