// The portal inside the AbsorbHR phone app (mobile/, Capacitor).
// The app injects `window.Capacitor` into the live portal's pages, with every installed
// phone feature on `Capacitor.Plugins`, so the portal needs no extra packages.
// In an ordinary browser none of this exists and every helper returns null.

type Listener = { remove?: () => unknown };

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    App?: {
      addListener: (
        event: "appStateChange",
        cb: (state: { isActive: boolean }) => void,
      ) => Listener | Promise<Listener>;
    };
    BiometricAuthNative?: {
      checkBiometry: () => Promise<{ isAvailable: boolean; deviceIsSecure: boolean }>;
      internalAuthenticate: (options: {
        reason?: string;
        cancelTitle?: string;
        allowDeviceCredential?: boolean;
        iosFallbackTitle?: string;
        androidTitle?: string;
        androidSubtitle?: string;
        androidConfirmationRequired?: boolean;
      }) => Promise<void>;
    };
  };
};

/** The app's bridge, or null in a normal browser. */
export function nativeApp(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}
