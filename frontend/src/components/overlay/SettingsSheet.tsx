import { useRef } from 'react';
import { Check, Monitor, Moon, Sun, Upload, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';
import {
  ACCENTS,
  FONT_SIZE_PX,
  PRIMARIES,
  usePreferences,
  type AccentDef,
  type FontSize,
  type PrimaryDef,
  type ThemeMode,
} from '@/store/preferencesStore';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

interface ThemeOpt {
  value: ThemeMode;
  label: string;
  Icon: typeof Sun;
}

const themeOptions: ThemeOpt[] = [
  { value: 'light',  label: 'Light',  Icon: Sun },
  { value: 'dark',   label: 'Dark',   Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

interface FontSizeOpt {
  value: FontSize;
  label: string;
  sample: string;
}

const fontSizeOptions: FontSizeOpt[] = [
  { value: 'sm', label: 'Small',   sample: 'text-xs' },
  { value: 'md', label: 'Default', sample: 'text-sm' },
  { value: 'lg', label: 'Large',   sample: 'text-base' },
];

const accentSwatchStyle = (a: AccentDef): React.CSSProperties => ({
  background: `hsl(${a.h} ${a.s}% ${a.l}%)`,
});

const primarySwatchStyle = (p: PrimaryDef): React.CSSProperties => ({
  background: `hsl(${p.bg.h} ${p.bg.s}% ${p.bg.l}%)`,
  border: p.key === 'white' ? '1px solid hsl(215 20% 88%)' : 'none',
});

/** Resize a File to 80x80 JPEG data-URL using an off-screen canvas. */
function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 80, 80);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Personal-preferences sheet. Opens from any role app's sidebar — preferences
 * are stored device-local via the global `preferencesStore`.
 */
export function SettingsSheet({ open, onClose }: SettingsSheetProps): JSX.Element {
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const accent = usePreferences((s) => s.accent);
  const setAccent = usePreferences((s) => s.setAccent);
  const primary = usePreferences((s) => s.primary);
  const setPrimary = usePreferences((s) => s.setPrimary);
  const fontSize = usePreferences((s) => s.fontSize);
  const setFontSize = usePreferences((s) => s.setFontSize);
  const avatarUrl = usePreferences((s) => s.avatarUrl);
  const setAvatarUrl = usePreferences((s) => s.setAvatarUrl);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeToDataUrl(file);
      setAvatarUrl(dataUrl);
    } catch {
      // silently ignore — user can retry
    }
    e.target.value = '';
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-6 sm:max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Personalise the appearance. Saved on this device only.
          </SheetDescription>
        </SheetHeader>

        {/* ---- Profile photo ---- */}
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Profile photo
          </h3>
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="h-16 w-16 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border border-border">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                {avatarUrl ? 'Change photo' : 'Upload photo'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl('')}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                  Remove photo
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </section>

        {/* ---- Nav colour ---- */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sidebar colour
          </h3>
          <div className="flex gap-3">
            {PRIMARIES.map((p) => {
              const active = primary === p.key;
              const checkColor = p.key === 'white' ? 'text-foreground' : 'text-white';
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPrimary(p.key)}
                  className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-full transition-transform',
                    active
                      ? 'scale-110 ring-2 ring-foreground/20'
                      : 'hover:scale-105',
                  )}
                  style={primarySwatchStyle(p)}
                  aria-pressed={active}
                  aria-label={p.label}
                  title={p.label}
                >
                  {active && <Check className={cn('h-4 w-4', checkColor)} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Sets the sidebar background — White, Temenos Blue, or Graphite.
          </p>
        </section>

        {/* ---- Appearance ---- */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Appearance
          </h3>
          <div className="inline-flex w-full rounded-lg bg-muted p-1">
            {themeOptions.map(({ value, label, Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={active}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- Accent ---- */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Accent colour
          </h3>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map((a) => {
              const active = accent === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAccent(a.key)}
                  className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-full border transition-transform',
                    active
                      ? 'scale-110 border-foreground/40 ring-2 ring-foreground/10'
                      : 'border-border hover:scale-105',
                  )}
                  style={accentSwatchStyle(a)}
                  aria-pressed={active}
                  aria-label={a.label}
                  title={a.label}
                >
                  {active && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Applied to buttons and interactive primary highlights.
          </p>
        </section>

        {/* ---- Text size ---- */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Text size
          </h3>
          <div className="inline-flex w-full rounded-lg bg-muted p-1">
            {fontSizeOptions.map(({ value, label, sample }) => {
              const active = fontSize === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFontSize(value)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-0.5 rounded-md px-2.5 py-2 transition-colors',
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={active}
                >
                  <span className={cn('font-semibold leading-none', sample)}>Aa</span>
                  <span className="text-[10px]">{label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Sample base size: {FONT_SIZE_PX[fontSize]}px. Every measurement in
            the app scales from this.
          </p>
        </section>
      </SheetContent>
    </Sheet>
  );
}
