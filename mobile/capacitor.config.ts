import type { CapacitorConfig } from "@capacitor/cli";

// The app opens the live portal. Almost every portal change reaches the app straight away,
// with no new App Store / Google Play release; only changes in this folder need one.
const config: CapacitorConfig = {
  // Permanent once published: the reverse of absorbhr.co.uk.
  appId: "uk.co.absorbhr.portal",
  appName: "AbsorbHR",
  // Local pages bundled inside the app: the no-signal screen.
  webDir: "www",
  backgroundColor: "#570080",
  // Lets the portal tell it is inside the app (see lib/native.ts in the portal).
  appendUserAgent: "AbsorbHRApp/1",
  server: {
    url: "https://absorbhr-portal.co.uk",
    // Shown when the portal can't be reached (no signal, or the site is down).
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#570080",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#570080",
      overlaysWebView: false,
    },
  },
};

export default config;
