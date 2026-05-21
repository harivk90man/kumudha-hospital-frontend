import { Boxes, CalendarX, PackagePlus, Truck } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';

// Medicines is the clerk’s primary surface; Dashboard route stays
// mounted for back-compat but is off the sidebar.
const items: AppSidebarNavItem[] = [
  { to: '/inventory/medicines', label: 'Medicines',     icon: Boxes },
  { to: '/inventory/batches',   label: 'Batches',       icon: CalendarX },
  { to: '/inventory/suppliers', label: 'Suppliers',     icon: Truck },
  { to: '/inventory/grn',       label: 'Goods receive', icon: PackagePlus },
];

interface InventorySidebarProps {
  logoSrc: string;
}

export function InventorySidebar({ logoSrc }: InventorySidebarProps): JSX.Element {
  return (
    <AppSidebar
      logoSrc={logoSrc}
      brandTitle="Inventory"
      homeTo="/inventory/dashboard"
      navItems={items}
      navAriaLabel="Inventory primary"
      userAvatarIcon={Boxes}
      fallbackName="Clerk"
      userSubtitle="Inventory clerk"
    />
  );
}
