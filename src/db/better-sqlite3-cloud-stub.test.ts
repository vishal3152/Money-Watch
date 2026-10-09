import { describe, expect, it } from "vitest";

import Database from "@/db/better-sqlite3-cloud-stub";

describe("better-sqlite3 cloud stub", () => {
  it("throws when constructed so cloud builds never open SQLite", () => {
    expect(() => Database()).toThrow(/not available in cloud/i);
  });
});
