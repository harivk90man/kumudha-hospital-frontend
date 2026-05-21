import { useNavigate, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/pharmacy/queue',        label: 'Rx queue' },
  { to: '/pharmacy/otc/invoices', label: 'OTC sale' },
  { to: '/pharmacy/refill',       label: 'Refill'   },
] as const;

/**
 * Pharmacy counter view switcher — rendered as a bottom-border-only
 * select so it sits flush in the divider row alongside the search input.
 */
export function PharmacyQueueTabs(): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = TABS.find((t) => pathname.startsWith(t.to))?.to ?? TABS[0].to;

  return (
    <select
      value={active}
      onChange={(e) => navigate(e.target.value)}
      aria-label="Switch pharmacy view"
      className="rounded-none border-x-0 border-t-0 border-b border-hairline bg-transparent py-2 pl-0 pr-6 text-sm font-medium text-foreground focus:outline-none focus:border-primary"
    >
      {TABS.map((t) => (
        <option key={t.to} value={t.to}>{t.label}</option>
      ))}
    </select>
  );
}
