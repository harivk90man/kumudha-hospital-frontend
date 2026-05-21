import { Navigate, type RouteObject } from 'react-router-dom';
import { CashierLayout } from './components/CashierLayout';
import { DashboardPage } from './pages/DashboardPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ShiftPage } from './pages/ShiftPage';
import { CashierWorkspacePage } from './pages/CashierWorkspacePage';

/**
 * Cashier app-shell route table. Mounted in routes.tsx.
 *
 * Auth: handled by CashierLayout. Wrong-role users are bounced to /.
 *
 * `/cashier/shift` is the unified shift management page — open / close /
 * history all live here. The old `/cashier/shift-close` URL stays mounted
 * as a back-compat redirect for any existing bookmarks.
 */
export const cashierRoutes: RouteObject[] = [
  {
    path: '/cashier',
    element: <CashierLayout />,
    children: [
      { index: true, element: <Navigate to="/cashier/invoices" replace /> },
      { path: 'dashboard',    element: <DashboardPage /> },
      { path: 'invoices',     element: <InvoicesPage /> },
      { path: 'invoices/:id', element: <InvoiceDetailPage /> },
      { path: 'payments',     element: <PaymentsPage /> },
      { path: 'shift',        element: <ShiftPage /> },
      { path: 'shift-close',  element: <Navigate to="/cashier/shift" replace /> },
      { path: 'workspace',    element: <CashierWorkspacePage /> },
    ],
  },
];
