import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — wraps the existing React frontend as a native
 * iOS / Android tablet app. Two delivery modes:
 *
 *   1. **Hosted mode** (default below): `server.url` points at the live
 *      Vercel deployment. The APK / IPA ships almost empty (~5 MB) and
 *      loads the latest UI on every launch, so a new web deploy reaches
 *      every installed tablet without a re-install. Best for the demo
 *      and for kiosk / bedside terminals on Wi-Fi.
 *
 *   2. **Bundled mode**: comment out `server.url` and ship the contents
 *      of `dist/` inside the binary. Required for any offline guarantee.
 *      Run `npm run build` before `npx cap sync` so the embedded UI is
 *      the latest.
 *
 * `webDir` still has to point at the local build because Capacitor uses
 * it as a fallback when the configured URL is unreachable.
 */
const config: CapacitorConfig = {
  appId: 'in.kumudha.hms',
  appName: 'Kumudha HMS',
  webDir: 'dist',
  server: {
    url: 'https://kumudha-hms.vercel.app',
    cleartext: false,
  },
  android: {
    // Keeps the WebView background out of the address-bar gray flash
    // during startup; the splash plugin takes over after that.
    backgroundColor: '#ffffff',
  },
  ios: {
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    StatusBar: {
      // Hidden by default for the kiosk look; pages that need it can call
      // `StatusBar.show()` at runtime.
      style: 'DARK',
      overlaysWebView: false,
    },
  },
};

export default config;
