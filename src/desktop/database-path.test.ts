import { describe, expect, it } from "vitest";

import { resolveDatabasePath } from "@/desktop/database-path";

describe("resolveDatabasePath", () => {
  it("uses DATABASE_PATH when set", () => {
    expect(
      resolveDatabasePath("/Users/me/Library/Application Support/Paisa-Watch", {
        DATABASE_PATH: "/custom/paisa.db"
      })
    ).toBe("/custom/paisa.db");
  });

  it("defaults to paisa-watch.db under the Electron userData path", () => {
    expect(resolveDatabasePath("/Users/me/Library/Application Support/Paisa-Watch", {})).toBe(
      "/Users/me/Library/Application Support/Paisa-Watch/paisa-watch.db"
    );
  });
});
