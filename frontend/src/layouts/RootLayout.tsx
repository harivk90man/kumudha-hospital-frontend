import { Outlet } from 'react-router-dom';
import { GlobalProgressBar } from '@/components/feedback/GlobalProgressBar';
import { NotificationPanel } from '@/components/feedback/NotificationPanel';
import { useAuthInit } from '@/features/auth/hooks/useAuthInit';

export function RootLayout(): JSX.Element {
  useAuthInit();   // token revalidation — fires exactly once per page load
  return (
    <>
      <GlobalProgressBar />
      <NotificationPanel />
      <Outlet />
    </>
  );
}
