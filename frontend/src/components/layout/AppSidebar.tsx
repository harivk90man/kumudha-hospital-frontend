import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUiShell } from '@/store/uiShellStore';
import { usePreferences } from '@/store/preferencesStore';
import { useAuth, type UserRole } from '@/features/auth';
import { SettingsSheet } from '@/components/overlay/SettingsSheet';
import { CommandPalette } from '@/components/overlay/CommandPalette';

/**
 * A nav item is either:
 *   - a regular link (`to/label/icon`), or
 *   - a section header (`section: string`) — renders a small uppercase
 *     label + thin divider when expanded; collapses to a 1px hairline
 *     spacer when iconified.
 */
export type AppSidebarNavItem =
  | { to: string; label: string; icon: LucideIcon }
  | { section: string };

const isSection = (
  item: AppSidebarNavItem,
): item is { section: string } => 'section' in item;

const ROLE_LABEL: Record<UserRole, string> = {
  frontdesk:    'Front desk',
  doctor:       'Doctor',
  chief_doctor: 'Chief doctor',
  pharma:       'Pharmacy',
  inventory:    'Inventory',
  lab_radio:    'Lab / Radiology',
  owner:        'Owner',
};

export interface AppSidebarProps {
  logoSrc: string;
  brandTitle: string;
  homeTo: string;
  navItems: AppSidebarNavItem[];
  navAriaLabel: string;
  /** @deprecated kept for API stability */
  userAvatarIcon?: LucideIcon;
  /** @deprecated */
  fallbackName?: string;
  /** @deprecated */
  userSubtitle?: string;
}

/**
 * Single source of truth for the desktop left-rail sidebar across every
 * role app. Nav colours derive from the user-selectable Primary preference
 * (bg-nav / text-nav-foreground tokens) so the sidebar adapts to White,
 * Temenos Blue, or Graphite without any component change.
 */
export function AppSidebar({
  logoSrc,
  brandTitle,
  homeTo,
  navItems,
  navAriaLabel,
}: AppSidebarProps): JSX.Element {
  const collapsed = useUiShell((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiShell((s) => s.toggleSidebar);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          (target as HTMLElement).isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }
      if (e.key === '/' && !inEditable) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === 'Escape' && paletteOpen) {
        e.preventDefault();
        setPaletteOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paletteOpen]);

  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-screen flex-col self-start border-r border-nav-foreground/10 bg-nav text-nav-foreground transition-[width] duration-150 md:flex',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* Brand row */}
        {collapsed ? (
          <div className="flex h-16 flex-col items-center justify-center gap-1 border-b border-nav-foreground/10">
            <Link
              to={homeTo}
              aria-label={`${brandTitle} home`}
              title={`${brandTitle} home`}
              className="rounded-full"
            >
              <img
                src={logoSrc}
                alt="Hospital logo"
                className="h-8 w-8 rounded-full border border-nav-foreground/20 object-cover transition hover:opacity-90"
              />
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              className="rounded-md p-0.5 text-nav-foreground/60 hover:bg-nav-foreground/10 hover:text-nav-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex h-16 items-center gap-3 border-b border-nav-foreground/10 px-4">
            <Link
              to={homeTo}
              aria-label={`${brandTitle} home`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition hover:opacity-90"
            >
              <img
                src={logoSrc}
                alt="Hospital logo"
                className="h-9 w-9 flex-shrink-0 rounded-full border border-nav-foreground/20 object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-semibold text-nav-foreground">{brandTitle}</span>
                <span className="text-xxs uppercase tracking-wider text-nav-foreground/55">
                  HMS
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              className="rounded-md p-1 text-nav-foreground/60 hover:bg-nav-foreground/10 hover:text-nav-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Nav list */}
        <nav
          className={cn('flex-1 space-y-0.5 overflow-y-auto', collapsed ? 'px-2 py-3' : 'p-3')}
          aria-label={navAriaLabel}
        >
          {navItems.map((item, idx) => {
            if (isSection(item)) {
              return collapsed ? (
                <div
                  key={`section-${idx}`}
                  className={cn('mx-2 border-t border-nav-foreground/10', idx > 0 && 'mt-3')}
                  aria-hidden="true"
                />
              ) : (
                <div
                  key={`section-${idx}`}
                  className={cn(
                    'px-3 pb-1 text-xxs font-semibold uppercase tracking-wider text-nav-foreground/50',
                    idx > 0 && 'pt-3',
                  )}
                >
                  {item.section}
                </div>
              );
            }

            const { to, label, icon: Icon } = item;
            return (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center rounded-lg text-sm font-medium transition-colors',
                    collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                    isActive
                      ? 'bg-nav-foreground/15 text-nav-foreground before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-r-md before:bg-nav-foreground'
                      : collapsed
                        ? 'text-nav-foreground hover:bg-nav-foreground/10'
                        : 'text-nav-foreground/70 hover:bg-nav-foreground/10 hover:text-nav-foreground',
                  )
                }
                end
              >
                <Icon className="h-5 w-5 flex-shrink-0" strokeWidth={2.75} />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer: Settings → user pill */}
        <div className={cn('flex flex-col gap-1.5 border-t border-nav-foreground/10', collapsed ? 'px-2 py-3' : 'p-3')}>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title={collapsed ? 'Settings' : undefined}
            className={cn(
              'flex w-full items-center rounded-lg text-sm text-nav-foreground/75 transition-colors hover:bg-nav-foreground/10 hover:text-nav-foreground [&_svg]:text-nav-foreground',
              collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2',
            )}
          >
            <Settings className="h-5 w-5 flex-shrink-0" strokeWidth={2.75} />
            {!collapsed && 'Settings'}
          </button>
          <UserPill collapsed={collapsed} />
        </div>

        <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </aside>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

/* ---------- User pill ---------- */

interface UserPillProps {
  collapsed: boolean;
}

const roleDotColor: Record<UserRole, string> = {
  frontdesk:    'bg-info',
  doctor:       'bg-primary',
  chief_doctor: 'bg-primary',
  pharma:       'bg-brandAccent',
  inventory:    'bg-warning',
  lab_radio:    'bg-warning',
  owner:        'bg-primary',
};

function UserPill({ collapsed }: UserPillProps): JSX.Element | null {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const avatarUrl = usePreferences((s) => s.avatarUrl);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent): void => {
      if (!wrapperRef.current) return;
      if (e.target instanceof Node && !wrapperRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!user) return null;

  const onLogout = (): void => {
    logout();
    setMenuOpen(false);
    navigate('/login', { replace: true });
  };

  const avatar = avatarUrl ? (
    <img
      src={avatarUrl}
      alt="Profile"
      className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white text-xxs font-semibold',
        roleDotColor[user.role],
      )}
    >
      {user.fullName.charAt(0).toUpperCase()}
    </span>
  );

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((m) => !m)}
        title={collapsed ? `${user.fullName} · ${ROLE_LABEL[user.role]}` : undefined}
        className={cn(
          'flex w-full items-center rounded-md text-left text-sm transition-colors hover:bg-nav-foreground/10',
          collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-2 py-1.5',
        )}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {avatar}
        {!collapsed && (
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-medium text-nav-foreground">{user.fullName}</span>
            <span className="truncate text-xxs text-nav-foreground/55">
              {ROLE_LABEL[user.role]}
            </span>
          </span>
        )}
      </button>
      {menuOpen && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 min-w-[13rem] overflow-hidden rounded-md border bg-card shadow-md',
            collapsed
              ? 'bottom-full left-0 mb-2'
              : 'bottom-full right-0 mb-2',
          )}
        >
          <div className="flex items-center gap-2.5 bg-muted/40 px-3 py-2.5">
            {avatar}
            <div className="flex min-w-0 flex-col leading-tight">
              <div className="truncate text-sm font-semibold">{user.fullName}</div>
              <div className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            </div>
          </div>
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm font-medium text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:outline-none [&_svg]:size-4 [&_svg]:shrink-0"
            >
              <LogOut /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
