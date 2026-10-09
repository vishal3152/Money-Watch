import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Keyed by field name; every settings module (this file's databasePath, email-sync-settings.ts's
// IMAP/LLM fields, ...) shares one settings.json via readSettings/writeSettings below, so a
// write from one module never clobbers another's keys (merge-preserving read-modify-write).
export type DatabaseSettings = Record<string, unknown> & {
  databasePath?: string;
};

export function getDatabaseSettingsPath(): string {
  return join(homedir(), ".config", "paisa-watch", "settings.json");
}

export function readSettings(): Partial<DatabaseSettings> {
  try {
    const raw = readFileSync(getDatabaseSettingsPath(), "utf8");
    return JSON.parse(raw) as Partial<DatabaseSettings>;
  } catch {
    // Missing or invalid settings file.
    return {};
  }
}

export function writeSettings(patch: Partial<DatabaseSettings>): void {
  const settingsPath = getDatabaseSettingsPath();
  const merged: DatabaseSettings = { ...readSettings(), ...patch };

  mkdirSync(join(settingsPath, ".."), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

export function readDatabasePathFromSettings(): string | null {
  const parsed = readSettings();

  if (typeof parsed.databasePath === "string" && parsed.databasePath.trim().length > 0) {
    return parsed.databasePath.trim();
  }

  return null;
}

export function writeDatabasePathToSettings(databasePath: string): void {
  writeSettings({ databasePath });
}
