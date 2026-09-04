/**
 * Configuration and session persistence helpers for Global Splash Test Mode (Etapa 1.26E).
 * Controls whether all entering users (new, existing, ADMIN, legacy, guest, completed)
 * view the StaziaMed animated splash screen once per session.
 */

export const SHOW_SPLASH_FOR_ALL = true;

export const SPLASH_SESSION_KEY = "staziamed_splash_seen_session";

export function hasSeenSplashThisSession(): boolean {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return false;
  }
  try {
    return window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export function markSplashSeenThisSession(): void {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
  } catch (e) {
    console.warn("Could not save splash session state:", e);
  }
}

export function clearSplashSeenThisSession(): void {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }
  try {
    window.sessionStorage.removeItem(SPLASH_SESSION_KEY);
  } catch (e) {
    console.warn("Could not clear splash session state:", e);
  }
}
