import { join, resolve } from "node:path";

import { readDatabasePathFromSettings } from "@/config/database-settings";

export const defaultDatabasePath = join(process.cwd(), "paisa-watch.db");

export function resolveDatabasePath(explicitPath?: string): string {
  if (explicitPath !== undefined && explicitPath.trim().length > 0) {
    return resolve(explicitPath.trim());
  }

  const envPath = process.env.DATABASE_PATH;
  if (envPath !== undefined && envPath.trim().length > 0) {
    return resolve(envPath.trim());
  }

  const settingsPath = readDatabasePathFromSettings();
  if (settingsPath !== null) {
    return resolve(settingsPath);
  }

  return resolve(defaultDatabasePath);
}
