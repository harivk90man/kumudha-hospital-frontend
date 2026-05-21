import type { UserRole } from '@/features/auth';
import { FrontdeskSidebar } from '@/apps/frontdesk/components/FrontdeskSidebar';
import { FrontdeskBottomNav } from '@/apps/frontdesk/components/FrontdeskBottomNav';
import { DoctorSidebar } from '@/apps/doctor/components/DoctorSidebar';
import { DoctorBottomNav } from '@/apps/doctor/components/DoctorBottomNav';
import { DiagnosticsSidebar } from '@/apps/diagnostics/components/DiagnosticsSidebar';
import { DiagnosticsBottomNav } from '@/apps/diagnostics/components/DiagnosticsBottomNav';
import { PharmacySidebar } from '@/apps/pharmacy/components/PharmacySidebar';
import { PharmacyBottomNav } from '@/apps/pharmacy/components/PharmacyBottomNav';
import { InventorySidebar } from '@/apps/inventory/components/InventorySidebar';
import { InventoryBottomNav } from '@/apps/inventory/components/InventoryBottomNav';
import { OwnerSidebar } from '@/apps/owner/components/OwnerSidebar';
import { OwnerBottomNav } from '@/apps/owner/components/OwnerBottomNav';

export interface RoleChrome {
  Sidebar: React.FC<{ logoSrc: string }>;
  BottomNav: React.FC;
}

/**
 * Pick sidebar + bottom-nav for the SIGNED-IN USER, not the route. So
 * an owner visiting `/diagnostics/lab` keeps the owner sidebar around
 * the lab worklist instead of being trapped in the diagnostics chrome
 * with no way back to their dashboard.
 *
 * Chief doctors get the doctor chrome (they spend most of their time
 * on the doctor app); the owner-dashboard access is via direct link.
 */
export function pickRoleChrome(role: UserRole): RoleChrome {
  switch (role) {
    case 'doctor':
    case 'chief_doctor':
      return { Sidebar: DoctorSidebar, BottomNav: DoctorBottomNav };
    case 'frontdesk':
      return { Sidebar: FrontdeskSidebar, BottomNav: FrontdeskBottomNav };
    case 'lab_radio':
      return { Sidebar: DiagnosticsSidebar, BottomNav: DiagnosticsBottomNav };
    case 'pharma':
      return { Sidebar: PharmacySidebar, BottomNav: PharmacyBottomNav };
    case 'inventory':
      return { Sidebar: InventorySidebar, BottomNav: InventoryBottomNav };
    case 'owner':
      return { Sidebar: OwnerSidebar, BottomNav: OwnerBottomNav };
  }
}
