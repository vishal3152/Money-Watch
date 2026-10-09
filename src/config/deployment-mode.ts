import { isDesktopApp } from "@/config/is-desktop-app";

/**
 * Cloud hosting is browser-only. The Electron desktop app is always local.
 * Vercel (`VERCEL=1`) is always cloud — serverless has no SQLite filesystem.
 */
export function isCloudMode(): boolean {
  if (isDesktopApp()) {
    return false;
  }

  return process.env.DEPLOYMENT_MODE === "cloud" || process.env.VERCEL === "1";
}
