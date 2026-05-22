import type { Config } from 'tailwindcss';
import animatePlugin from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontSize: {
        // Operational metadata size — UHIDs, age/gender, timestamps,
        // identifier captions on table rows. Slightly larger line-height
        // + tracking-wide help small text stay scannable on dense queues.
        xxs: ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
      },
      fontFamily: {
        // Inter is the project's display + body face — Modern Clean
        // typography spec. Apple system stack remains as the fallback
        // chain so the app degrades gracefully if Inter fails to load.
        sans: [
          '"Inter"',
          '"Inter Variable"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
        ],
      },
      colors: {
        border: 'hsl(var(--border))',
        hairline: 'hsl(var(--hairline))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        page: 'hsl(var(--page-bg))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        brandAccent: {
          DEFAULT: 'hsl(var(--brand-accent))',
          foreground: 'hsl(var(--brand-accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          foreground: 'hsl(var(--danger-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Fixed Temenos brand navy — kept as a static escape hatch
        // for surfaces that always want the brand colour regardless of
        // user preference. Most consumers should use `bg-nav` below.
        temenos: {
          DEFAULT: 'hsl(var(--temenos))',
          foreground: 'hsl(var(--temenos-foreground))',
        },
        // Nav-bar chrome — driven by the user-selectable Primary
        // preference (white / Temenos / Graphite). Sidebar interior
        // colours derive from `nav-foreground` so text/borders/hover
        // layers adapt to whichever background the user picked.
        nav: {
          DEFAULT: 'hsl(var(--nav-bg))',
          foreground: 'hsl(var(--nav-fg))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Linear-style: a hairline + a soft drop. Reads as elevation, not weight.
        // Drop colour comes from `--shadow-rgb` so the shadow adapts in dark mode
        // (slate-900 on light → pure black on dark, with higher alpha).
        card: '0 1px 0 hsl(var(--hairline)), 0 1px 2px -1px rgb(var(--shadow-rgb) / var(--shadow-alpha-sm))',
        'card-hover': '0 1px 0 hsl(var(--hairline)), 0 4px 12px -4px rgb(var(--shadow-rgb) / var(--shadow-alpha-md))',
        elevated: '0 1px 0 hsl(var(--hairline)), 0 8px 24px -8px rgb(var(--shadow-rgb) / var(--shadow-alpha-lg))',
        // Inset-grouped row group: just hairline + tiny drop.
        inset: '0 0 0 1px hsl(var(--hairline))',
      },
      transitionTimingFunction: {
        // Apple-ish ease-out-quart — quick start, gentle settle.
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // ECG strip scroll. The SVG renders 2× the visible beats at
        // 200% container width, then scrolls -50% (= 1× container =
        // 1 set of beats) for a seamless loop with no JS.
        'ecg-scroll': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        // Soft "alive" pulse for in-flight or alert dots. Combines a
        // subtle scale with opacity so it reads as breathing, not flashing.
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%':      { transform: 'scale(1.18)', opacity: '0.7' },
        },
        // Outer ring "ripple" used together with breathe for high-attention
        // states (STAT priority, critical results). Ring fades + grows.
        'breathe-ring': {
          '0%':   { transform: 'scale(1)',   opacity: '0.6' },
          '70%':  { transform: 'scale(2.2)', opacity: '0' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        // Aurora drift — three independent slow-moving radial blobs used
        // as a background on the login brand panel. Each blob traces a
        // different translate+scale path so they never sync up; combined
        // with mix-blend-screen on a primary-color base they create a
        // soft, drifting "aurora" glow. Long durations (25–40s) keep the
        // motion ambient, never attention-grabbing.
        'aurora-1': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%':      { transform: 'translate(8%, 12%) scale(1.15)' },
        },
        'aurora-2': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%':      { transform: 'translate(-10%, -8%) scale(0.9)' },
        },
        'aurora-3': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.6' },
          '50%':      { transform: 'translate(-6%, 6%) scale(1.2)', opacity: '1' },
        },
        // One-shot row highlight — fades from a faint primary wash to
        // transparent over 1.2s. Used by live worklists to visually
        // mark rows whose status changed during the last poll, so the
        // eye catches operational deltas without alarm.
        'flash-once': {
          '0%':   { backgroundColor: 'hsl(var(--primary) / 0.14)' },
          '100%': { backgroundColor: 'transparent' },
        },
        // Material M3 indeterminate linear progress — proper two-bar
        // translate+scale approach. Each bar uses two nested animations:
        // the outer element translates (position), the inner element
        // scales (width). GPU-composited transform properties mean no
        // layout reflow and perfectly seamless looping.
        'progress-m2': {
          '0%':   { left: '-35%', right: '100%' },
          '60%':  { left: '100%', right: '-90%' },
          '100%': { left: '100%', right: '-90%' },
        },
        // Primary bar — translation
        'm3-pt': {
          '0%':    { animationTimingFunction: 'cubic-bezier(0.5,0,0.701732,0.495819)', transform: 'translateX(-100%)' },
          '20%':   { animationTimingFunction: 'cubic-bezier(0.302435,0.381352,0.55,0.956352)', transform: 'translateX(-100%)' },
          '59.15%':{ transform: 'translateX(83.67144%)' },
          '100%':  { transform: 'translateX(200.61143%)' },
        },
        // Primary bar — scale
        'm3-ps': {
          '0%':    { animationTimingFunction: 'cubic-bezier(0.334731,0.12482,0.785844,1)', transform: 'scaleX(0.08)' },
          '36.65%':{ animationTimingFunction: 'cubic-bezier(0.06,0.11,0.6,1)', transform: 'scaleX(0.08)' },
          '69.15%':{ transform: 'scaleX(0.661479)' },
          '100%':  { transform: 'scaleX(0.08)' },
        },
        // Secondary bar — translation
        'm3-st': {
          '0%':    { animationTimingFunction: 'cubic-bezier(0.15,0,0.515058,0.409685)', transform: 'translateX(-100%)' },
          '25%':   { animationTimingFunction: 'cubic-bezier(0.31033,0.284058,0.8,0.733712)', transform: 'translateX(-37.6519%)' },
          '48.35%':{ animationTimingFunction: 'cubic-bezier(0.4,0.627035,0.6,0.902026)', transform: 'translateX(84.38628%)' },
          '100%':  { transform: 'translateX(160.27775%)' },
        },
        // Secondary bar — scale
        'm3-ss': {
          '0%':    { animationTimingFunction: 'cubic-bezier(0.205028,0.057051,0.57661,0.453971)', transform: 'scaleX(0.08)' },
          '19.15%':{ animationTimingFunction: 'cubic-bezier(0.152313,0.196432,0.648374,1.00432)', transform: 'scaleX(0.457104)' },
          '44.15%':{ animationTimingFunction: 'cubic-bezier(0.257759,-0.003163,0.211762,1.38179)', transform: 'scaleX(0.72796)' },
          '100%':  { transform: 'scaleX(0.08)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'ecg-scroll': 'ecg-scroll 12s linear infinite',
        breathe: 'breathe 1.8s ease-in-out infinite',
        'breathe-ring': 'breathe-ring 1.8s ease-out infinite',
        'aurora-1': 'aurora-1 30s ease-in-out infinite',
        'aurora-2': 'aurora-2 40s ease-in-out infinite',
        'aurora-3': 'aurora-3 25s ease-in-out infinite',
        'flash-once': 'flash-once 1.2s ease-out 1 forwards',
        'progress-m2': 'progress-m2 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite',
        'm3-pt': 'm3-pt 2s linear infinite',
        'm3-ps': 'm3-ps 2s linear infinite',
        'm3-st': 'm3-st 2s linear infinite',
        'm3-ss': 'm3-ss 2s linear infinite',
      },
    },
  },
  plugins: [animatePlugin],
};

export default config;
