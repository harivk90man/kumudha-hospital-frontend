import { useEffect } from 'react';
import {
  ACCENTS,
  FONT_SIZE_PX,
  PRIMARIES,
  usePreferences,
} from '@/store/preferencesStore';

interface PreferencesProviderProps {
  children: React.ReactNode;
}

const matchMediaDark = (): MediaQueryList | null =>
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

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

  // Primary — writes --nav-bg and --nav-fg so sidebar tokens update.
  useEffect(() => {
    const def = PRIMARIES.find((p) => p.key === primary) ?? PRIMARIES[0];
    const root = document.documentElement;
    root.style.setProperty('--nav-bg', `${def.bg.h} ${def.bg.s}% ${def.bg.l}%`);
    root.style.setProperty('--nav-fg', `${def.fg.h} ${def.fg.s}% ${def.fg.l}%`);
  }, [primary]);

  // Font size — every `rem` in the app scales from this single var.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--base-font-size',
      `${FONT_SIZE_PX[fontSize]}px`,
    );
  }, [fontSize]);

  return <>{children}</>;
}
