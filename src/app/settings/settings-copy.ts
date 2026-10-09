import type { MessageKey } from "@/i18n/translator";

/**
 * The settings screen's lede depends on which of Money Watch's deployment
 * shapes is rendering it: desktop (Electron, always local), cloud
 * (Postgres-backed browser, Supabase or AUTH_PROVIDER=simple), or
 * self-hosted (local SQLite reached from a plain browser — Docker/NAS
 * deployments). Cloud is checked first: a desktop
 * build is never cloud (see isCloudMode()), but a self-hosted browser build
 * is neither desktop nor cloud, and must not fall through to the cloud copy.
 */
export function resolveSettingsLede(desktop: boolean, cloud: boolean): MessageKey {
  if (cloud) {
    return "settings.lede.cloud";
  }
  if (desktop) {
    return "settings.lede.desktop";
  }
  return "settings.lede.selfHosted";
}
