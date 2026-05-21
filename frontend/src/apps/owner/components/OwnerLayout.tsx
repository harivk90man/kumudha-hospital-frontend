import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isSuperRole, useAuth } from '@/features/auth';
import { OwnerSidebar } from './OwnerSidebar';
import { OwnerBottomNav } from './OwnerBottomNav';

const LOGO_SRC = '/branding/kh-logo.jpeg';

export function OwnerLayout(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Owner + chief doctor share access to the owner-app surface (the
  // chief doctor's secondary role explicitly admits them per the
  // role spec).
  if (
    user &&
    !isSuperRole(user.role) &&
    !user.allRoles.includes('chief_doctor')
  ) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen bg-page">
      <OwnerSidebar logoSrc={LOGO_SRC} />
      <main className="flex min-h-screen flex-1 flex-col pb-16 md:pb-0">
        <Outlet />
      </main>
      <OwnerBottomNav />
    </div>
  );
}
