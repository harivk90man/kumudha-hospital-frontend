import { useEffect } from 'react';
import {
  ACCENTS,
  FONT_SIZE_PX,
  PRIMARIES,
  usePreferences,
  type ThemeMode,
} from '@/store/preferencesStore';

interface PreferencesProviderProps {
  children: React.ReactNode;
}

const matchMediaDark = (): MediaQueryList | null =>
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

const isDarkActive = (mode: ThemeMode): boolean =>
  mode === 'dark' || (mode === 'system' && (matchMediaDark()?.matches ?? false));

/**
 * Applies persisted user preferences to the document root.
 *  - `theme`     → toggles `.dark` class on <html>; `system` follows OS.
 *  - `accent`    → writes `--accent-h/--accent-s/--accent-l` CSS vars.
 *  - `fontSize`  → writes `--base-font-size`; cascades to every `rem`.
 *
 * Uses selectors so this component re-renders only when a relevant pref
 * changes (CLAUDE.md §3.7).
 */
export function PreferencesProvider({ children }: PreferencesProviderProps): JSX.Element {
  const theme = usePreferences((s) => s.theme);
  const accent = usePreferences((s) => s.accent);
  const primary = usePreferences((s) => s.primary);
  const fontSize = usePreferences((s) => s.fontSize);

  // Theme — toggles .dark class; honours OS in 'system' mode.
  useEffect(() => {
    const root = document.documentElement;
    const apply = (): void => {
      const wantsDark =
        theme === 'dark' ||
        (theme === 'system' && (matchMediaDark()?.matches ?? false));
      root.classList.toggle('dark', wantsDark);
    };
    apply();
    if (theme !== 'system') return;
    const mq = matchMediaDark();
    if (!mq) return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // Accent — overrides the three HSL component vars.
  useEffect(() => {
    const def = ACCENTS.find((a) => a.key === accent) ?? ACCENTS[0];
    const root = document.documentElement;
    root.style.setProperty('--accent-h', String(def.h));
    root.style.setProperty('--accent-s', `${def.s}%`);
    root.style.setProperty('--accent-l', `${def.l}%`);
  }, [accent]);

  // Primary + theme — writes --nav-bg and --nav-fg so the sidebar
  // tokens update. The default Primary='white' nav is unreadable in
  // dark mode, so when dark is active (explicit OR system+OS-dark) the
  // white preset swaps to a dark slate matching the page chrome.
  // Temenos / Graphite presets are already dark, so they stay.
  useEffect(() => {
    const root = document.documentElement;

    const applyNav = (): void => {
      const def = PRIMARIES.find((p) => p.key === primary) ?? PRIMARIES[0];
      const dark = isDarkActive(theme);
      if (dark && primary === 'white') {
        // Same hue as --card in the .dark block so the sidebar sits flush
        // with the surrounding chrome but stays one shade above page-bg.
        root.style.setProperty('--nav-bg', '220 13% 12%');
        root.style.setProperty('--nav-fg', '220 14% 96%');
      } else {
        root.style.setProperty('--nav-bg', `${def.bg.h} ${def.bg.s}% ${def.bg.l}%`);
        root.style.setProperty('--nav-fg', `${def.fg.h} ${def.fg.s}% ${def.fg.l}%`);
      }
    };

    applyNav();

    // When the user's preference is 'system', the effective theme can
    // change without React re-rendering (OS-level toggle). Subscribe so
    // the nav stays in sync.
    if (theme !== 'system') return;
    const mq = matchMediaDark();
    if (!mq) return;
    mq.addEventListener('change', applyNav);
    return () => mq.removeEventListener('change', applyNav);
  }, [primary, theme]);

  // Font size — every `rem` in the app scales from this single var.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--base-font-size',
      `${FONT_SIZE_PX[fontSize]}px`,
    );
  }, [fontSize]);

  return <>{children}</>;
}
