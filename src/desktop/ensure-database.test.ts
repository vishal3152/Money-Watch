import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { ensureDatabaseReady } from "@/desktop/ensure-database";
import { InstitutionRepository } from "@/db/repositories/institution-repository";

describe("ensureDatabaseReady", () => {
  it("creates parent directories and applies migrations so repositories can write", async () => {
    const root = mkdtempSync(join(tmpdir(), "paisa-watch-ensure-"));
    const databasePath = join(root, "nested", "paisa-watch.db");

    try {
      await ensureDatabaseReady({
        databasePath,
        migrationsFolder: resolve(process.cwd(), "drizzle")
      });

      const db = createDb(databasePath);
      const institutions = new InstitutionRepository(db);

      await institutions.create({ id: "inst-1", name: "HDFC" });
      expect(await institutions.getById("inst-1")).toEqual({ id: "inst-1", name: "HDFC" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
