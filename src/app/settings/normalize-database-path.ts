import { statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Not part of actions.ts because that file is `"use server"` — every export there must be an
 * async Server Action, and this pure helper is called directly (not as an action) by
 * `previewDatabasePath`'s caller in settings-form.tsx as well as by `saveDatabasePath` itself.
 */
export function normalizeDatabasePath(databasePathInput: string): string {
  const resolvedPath = resolve(databasePathInput);

  try {
    if (statSync(resolvedPath).isDirectory()) {
      return join(resolvedPath, "paisa-watch.db");
    }
  } catch {
    // Path does not exist yet; treat input as a file path.
  }

  return resolvedPath;
}
