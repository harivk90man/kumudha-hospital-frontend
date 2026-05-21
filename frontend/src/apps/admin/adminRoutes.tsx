import { Navigate, type RouteObject } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { TenantsPage } from './pages/TenantsPage';
import { UsersPage } from './pages/UsersPage';
import { LookupsPage } from './pages/LookupsPage';
import { AuditPage } from './pages/AuditPage';

export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true,            element: <Navigate to="/admin/tenants" replace /> },
      { path: 'dashboard',      element: <Navigate to="/admin/tenants" replace /> },
      { path: 'tenants',        element: <TenantsPage /> },
      { path: 'users',          element: <UsersPage /> },
      { path: 'lookups',        element: <LookupsPage /> },
      { path: 'audit',          element: <AuditPage /> },
    ],
  },
];
