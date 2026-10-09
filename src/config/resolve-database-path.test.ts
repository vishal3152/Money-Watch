import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeDatabasePathToSettings } from "@/config/database-settings";
import { defaultDatabasePath, resolveDatabasePath } from "@/config/resolve-database-path";

const tempHomes: string[] = [];
const originalDatabasePath = process.env.DATABASE_PATH;

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();

  return {
    ...original,
    homedir: () => tempHomes.at(-1) ?? original.homedir()
  };
});

describe("resolveDatabasePath", () => {
  beforeEach(() => {
    tempHomes.push(mkdtempSync(join(tmpdir(), "paisa-watch-resolve-")));
    delete process.env.DATABASE_PATH;
  });

  afterEach(() => {
    const home = tempHomes.pop();
    if (home) {
      rmSync(home, { recursive: true, force: true });
    }

    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
  });

  it("prefers an explicit path", () => {
    expect(resolveDatabasePath("/explicit/paisa.db")).toBe(resolve("/explicit/paisa.db"));
  });

  it("uses DATABASE_PATH when set", () => {
    process.env.DATABASE_PATH = "/env/paisa.db";
    expect(resolveDatabasePath()).toBe(resolve("/env/paisa.db"));
  });

  it("uses saved settings when env is unset", () => {
    writeDatabasePathToSettings("/settings/paisa.db");
    expect(resolveDatabasePath()).toBe(resolve("/settings/paisa.db"));
  });

  it("falls back to the project-local default database file", () => {
    expect(resolveDatabasePath()).toBe(resolve(defaultDatabasePath));
  });
});
