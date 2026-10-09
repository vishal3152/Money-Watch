import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDatabaseSettingsPath,
  readDatabasePathFromSettings,
  writeDatabasePathToSettings
} from "@/config/database-settings";

const tempHomes: string[] = [];

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();

  return {
    ...original,
    homedir: () => tempHomes.at(-1) ?? original.homedir()
  };
});

describe("database settings", () => {
  beforeEach(() => {
    tempHomes.push(mkdtempSync(join(tmpdir(), "paisa-watch-settings-")));
  });

  afterEach(() => {
    const home = tempHomes.pop();
    if (home) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("returns null when no settings file exists", () => {
    expect(readDatabasePathFromSettings()).toBeNull();
  });

  it("writes and reads a database path", () => {
    writeDatabasePathToSettings("/tmp/custom/paisa-watch.db");
    expect(readDatabasePathFromSettings()).toBe("/tmp/custom/paisa-watch.db");
    expect(JSON.parse(readFileSync(getDatabaseSettingsPath(), "utf8"))).toEqual({
      databasePath: "/tmp/custom/paisa-watch.db"
    });
  });

  it("preserves unrelated settings keys when writing a database path", () => {
    const settingsPath = getDatabaseSettingsPath();
    mkdirSync(join(settingsPath, ".."), { recursive: true });
    writeFileSync(
      settingsPath,
      `${JSON.stringify({ databasePath: "/tmp/old.db", otherKey: "keep-me" }, null, 2)}\n`,
      "utf8"
    );

    writeDatabasePathToSettings("/tmp/custom/paisa-watch.db");

    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      databasePath: "/tmp/custom/paisa-watch.db",
      otherKey: "keep-me"
    });
  });
});
