import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

/**
 * Loads `.env` then `.env.local` (local wins), matching Next.js file precedence for
 * those two files. Does not overwrite keys already present on `env` (shell / CI wins).
 */
export function loadProjectEnvFiles(
  cwd: string = process.cwd(),
  env: Record<string, string | undefined> = process.env
): void {
  const merged: Record<string, string> = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = join(cwd, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(merged, parseEnvFile(readFileSync(filePath, "utf8")));
  }

  for (const [key, value] of Object.entries(merged)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}
