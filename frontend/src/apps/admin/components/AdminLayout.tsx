import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isSuperRole, useAuth } from '@/features/auth';
import { AdminSidebar } from './AdminSidebar';
import { AdminBottomNav } from './AdminBottomNav';

const LOGO_SRC = '/branding/kh-logo.jpeg';

export function AdminLayout(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Admin app folded into owner role in the 7-role refresh.
  if (user && !isSuperRole(user.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen bg-page">
      <AdminSidebar logoSrc={LOGO_SRC} />
      <main className="flex min-h-screen flex-1 flex-col pb-16 md:pb-0">
        <Outlet />
      </main>
      <AdminBottomNav />
    </div>
  );
}
