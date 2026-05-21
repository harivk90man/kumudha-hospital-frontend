import { Navigate, type RouteObject } from 'react-router-dom';
import { OwnerLayout } from './components/OwnerLayout';
import { DashboardPage } from './pages/DashboardPage';
import { RevenuePage } from './pages/RevenuePage';
import { OperationsPage } from './pages/OperationsPage';
import { UsersPage } from './pages/UsersPage';

export const ownerRoutes: RouteObject[] = [
  {
    path: '/owner',
    element: <OwnerLayout />,
    children: [
      { index: true, element: <Navigate to="/owner/dashboard" replace /> },
      { path: 'dashboard',  element: <DashboardPage /> },
      { path: 'revenue',    element: <RevenuePage /> },
      { path: 'operations', element: <OperationsPage /> },
      { path: 'users',      element: <UsersPage /> },
    ],
  },
];
