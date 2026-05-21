import { IndianRupee, ListChecks, Lock, Receipt } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';
import { useAuth, userHas } from '@/features/auth';

/**
 * Cashier sidebar — items filter by capability so owner / chief_doctor
 * who reach `/cashier/shift` from their dashboard don't see Invoices
 * / Payments items they don't have permission to act on. Frontdesk
 * (the till operator) sees the full surface.
 */
const ALL_ITEMS: (AppSidebarNavItem & { caps: ReadonlyArray<'take_payment' | 'open_shift' | 'close_shift'> })[] = [
  { to: '/cashier/invoices', label: 'Invoices', icon: Receipt,    caps: ['take_payment'] },
  { to: '/cashier/payments', label: 'Payments', icon: ListChecks, caps: ['take_payment'] },
  { to: '/cashier/shift',    label: 'Shift',    icon: Lock,       caps: ['take_payment', 'open_shift', 'close_shift'] },
];

interface CashierSidebarProps {
  logoSrc: string;
}

export function CashierSidebar({ logoSrc }: CashierSidebarProps): JSX.Element {
  const { user } = useAuth();
  const items: AppSidebarNavItem[] = ALL_ITEMS.filter((entry) =>
    entry.caps.some((c) => userHas(user, c)),
  ).map(({ caps: _caps, ...rest }) => rest);
  return (
    <AppSidebar
      logoSrc={logoSrc}
      brandTitle="Cashier"
      homeTo="/cashier/shift"
      navItems={items}
      navAriaLabel="Cashier primary"
      userAvatarIcon={IndianRupee}
      fallbackName="Cashier"
      userSubtitle="Cashier"
    />
  );
}
