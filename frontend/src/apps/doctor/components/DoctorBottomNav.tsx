import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ListOrdered } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { to: '/doctor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/doctor/queue',     label: 'Queue',     icon: ListOrdered    },
];

export function DoctorBottomNav(): JSX.Element {
  return (
    <nav
      aria-label="Doctor primary mobile"
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
