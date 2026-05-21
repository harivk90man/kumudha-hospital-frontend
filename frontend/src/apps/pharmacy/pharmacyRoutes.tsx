import { Navigate, type RouteObject } from 'react-router-dom';
import { PharmacyLayout } from './components/PharmacyLayout';
import { DashboardPage } from './pages/DashboardPage';
import { RxQueuePage } from './pages/RxQueuePage';
import { RxDispensePage } from './pages/RxDispensePage';
import { StockAlertsPage } from './pages/StockAlertsPage';
import { RefillLookupPage } from './pages/RefillLookupPage';
import { CounterSalePage } from './pages/CounterSalePage';
import { OtcInvoicesPage } from './pages/OtcInvoicesPage';

export const pharmacyRoutes: RouteObject[] = [
  {
    path: '/pharmacy',
    element: <PharmacyLayout />,
    children: [
      // Rx queue is the pharmacist’s primary surface — Dashboard stays
      // mounted off-sidebar for back-compat.
      { index: true,                   element: <Navigate to="/pharmacy/queue" replace /> },
      { path: 'dashboard',             element: <DashboardPage /> },

      // Prescription dispensing
      { path: 'queue',                 element: <RxQueuePage /> },
      { path: 'queue/:rxId/dispense',  element: <RxDispensePage /> },
      { path: 'refill',                element: <RefillLookupPage /> },

      // OTC counter sale (kept strictly isolated from Rx routes)
      { path: 'counter',               element: <CounterSalePage /> },
      { path: 'otc/invoices',          element: <OtcInvoicesPage /> },

      // Inventory
      { path: 'alerts',                element: <StockAlertsPage /> },

      // Back-compat — the old combined Walk-in screen has been split
      // into Refill (Rx flow) + Counter sale (OTC flow). Old bookmarks
      // land on the counter screen by default.
      { path: 'walkin',                element: <Navigate to="/pharmacy/counter" replace /> },
    ],
  },
];
