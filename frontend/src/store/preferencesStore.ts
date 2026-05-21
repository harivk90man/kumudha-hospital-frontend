import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

export type AccentKey =
  | 'temenos'
  | 'slate'
  | 'cyan'
  | 'teal'
  | 'sage'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'graphite';

export interface AccentDef {
  key: AccentKey;
  label: string;
  h: number;
  s: number;
  l: number;
}

export const ACCENTS: AccentDef[] = [
  { key: 'temenos',  label: 'Temenos',    h: 233, s: 48, l: 31 },
  { key: 'slate',    label: 'Slate Blue', h: 211, s: 35, l: 48 },
  { key: 'cyan',     label: 'Soft Cyan',  h: 188, s: 45, l: 42 },
  { key: 'teal',     label: 'Teal',       h: 178, s: 55, l: 40 },
  { key: 'sage',     label: 'Sage',       h: 158, s: 25, l: 42 },
  { key: 'blue',     label: 'Blue',       h: 211, s: 70, l: 50 },
  { key: 'indigo',   label: 'Indigo',     h: 235, s: 60, l: 52 },
  { key: 'purple',   label: 'Purple',     h: 278, s: 45, l: 55 },
  { key: 'graphite', label: 'Graphite',   h: 220, s: 10, l: 35 },
];

/** Nav-bar background colour — independent of the button accent. */
export type PrimaryKey = 'white' | 'temenos' | 'graphite';

export interface PrimaryDef {
  key: PrimaryKey;
  label: string;
  /** Background HSL for the nav rail. */
  bg: { h: number; s: number; l: number };
  /** Foreground HSL for text/icons on that background. */
  fg: { h: number; s: number; l: number };
}

export const PRIMARIES: PrimaryDef[] = [
  {
    key: 'white',
    label: 'White',
    bg: { h: 0,   s: 0,  l: 100 },
    fg: { h: 215, s: 25, l: 15  },
  },
  {
    key: 'temenos',
    label: 'Temenos Blue',
    bg: { h: 233, s: 48, l: 31 },
    fg: { h: 0,   s: 0,  l: 100 },
  },
  {
    key: 'graphite',
    label: 'Graphite',
    bg: { h: 220, s: 10, l: 18 },
    fg: { h: 0,   s: 0,  l: 100 },
  },
];

export type FontSize = 'sm' | 'md' | 'lg';

export const FONT_SIZE_PX: Record<FontSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
};

interface PreferencesState {
  theme: ThemeMode;
  accent: AccentKey;
  primary: PrimaryKey;
  fontSize: FontSize;
  avatarUrl: string;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentKey) => void;
  setPrimary: (p: PrimaryKey) => void;
  setFontSize: (f: FontSize) => void;
  setAvatarUrl: (url: string) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'temenos',
      primary: 'white',
      fontSize: 'md',
      avatarUrl: '',
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setPrimary: (primary) => set({ primary }),
      setFontSize: (fontSize) => set({ fontSize }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
    }),
    {
      name: 'hms.preferences.v4',
    },
  ),
);
