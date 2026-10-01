import type { ProfileSection } from "../components/profile/ProfileSettingsView";

export type ProfileFocusTarget = "alerts";

export interface ProfileNavigationRequest {
  section: ProfileSection;
  focus?: ProfileFocusTarget;
}

export const PROFILE_NAVIGATION_EVENT = "staziamed:profile-navigation";
const PROFILE_NAVIGATION_STORAGE_KEY = "staziamed_profile_navigation";

export const queueProfileNavigation = (request: ProfileNavigationRequest) => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(PROFILE_NAVIGATION_STORAGE_KEY, JSON.stringify(request));
  } catch (error) {
    console.warn("Unable to persist profile navigation request", error);
  }

  window.dispatchEvent(new CustomEvent<ProfileNavigationRequest>(PROFILE_NAVIGATION_EVENT, { detail: request }));
};

export const consumeQueuedProfileNavigation = (): ProfileNavigationRequest | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PROFILE_NAVIGATION_STORAGE_KEY);
    if (!raw) return null;

    window.sessionStorage.removeItem(PROFILE_NAVIGATION_STORAGE_KEY);
    return JSON.parse(raw) as ProfileNavigationRequest;
  } catch (error) {
    console.warn("Unable to read profile navigation request", error);
    window.sessionStorage.removeItem(PROFILE_NAVIGATION_STORAGE_KEY);
    return null;
  }
};

