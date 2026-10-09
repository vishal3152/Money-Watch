export type NavTabsVisibilityParams = {
  isCloudMode: boolean;
  hasSession: boolean;
};

/**
 * Dashboard/Imports/Settings are post-login chrome. In cloud mode, an unauthenticated
 * visitor can only ever be on /login or /auth/callback — `session-gate.ts` redirects
 * every other path there — so navigation leading to gated pages is dead until they sign
 * in. Local/desktop has no login screen at all, so the nav always shows there.
 */
export function shouldShowNavTabs({ isCloudMode, hasSession }: NavTabsVisibilityParams): boolean {
  return !isCloudMode || hasSession;
}
