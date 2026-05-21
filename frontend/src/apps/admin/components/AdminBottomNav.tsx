import { NavLink } from 'react-router-dom';
import { Building2, ListTree, ScrollText, Users } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { to: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { to: '/admin/users',   label: 'Users',   icon: Users },
  { to: '/admin/lookups', label: 'Lookups', icon: ListTree },
  { to: '/admin/audit',   label: 'Audit',   icon: ScrollText },
];

export function AdminBottomNav(): JSX.Element {
  return (
    <nav
      aria-label="Admin primary mobile"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
