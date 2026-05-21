import { Boxes, Pill } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@/components/layout';

/**
 * Pharmacy nav collapsed to the two surfaces the pharmacist actually
 * lives in:
 *
 *   COUNTER — the unified tabbed page (Rx queue / OTC sale / Refill),
 *             entered at `/pharmacy/queue`. The Rx-dispense and counter-
 *             sale detail pages are reached from inside that page; no
 *             top-level nav entries needed.
 *   STOCK   — read-only stock view with filter + pagination. Replaces
 *             the previous "Stock alerts" entry as the single inventory
 *             surface the pharmacist needs at hand.
 */
const items: AppSidebarNavItem[] = [
  { to: '/pharmacy/queue',  label: 'Counter', icon: Pill },
  { to: '/pharmacy/alerts', label: 'Stock',   icon: Boxes },
];

interface PharmacySidebarProps {
  logoSrc: string;
}

export function PharmacySidebar({ logoSrc }: PharmacySidebarProps): JSX.Element {
  return (
    <AppSidebar
      logoSrc={logoSrc}
      brandTitle="Pharmacy"
      homeTo="/pharmacy/dashboard"
      navItems={items}
      navAriaLabel="Pharmacy primary"
      userAvatarIcon={Pill}
      fallbackName="Pharmacist"
      userSubtitle="Pharmacist"
    />
  );
}
