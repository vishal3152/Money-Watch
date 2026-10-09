import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readEmailSyncStatus, writeEmailSyncStatus } from "@/config/email-sync-status";

const tempHomes: string[] = [];

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();

  return {
    ...original,
    homedir: () => tempHomes.at(-1) ?? original.homedir()
  };
});

describe("email sync status", () => {
  beforeEach(() => {
    tempHomes.push(mkdtempSync(join(tmpdir(), "paisa-watch-email-sync-status-")));
  });

  afterEach(() => {
    const home = tempHomes.pop();
    if (home) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("returns an empty status when nothing has been recorded yet", () => {
    expect(readEmailSyncStatus()).toEqual({
      lastCheckedAt: null,
      lastResult: null,
      lastErrorMessage: null
    });
  });

  it("writes and reads a success status", () => {
    writeEmailSyncStatus({
      lastCheckedAt: "2026-09-12T10:00:00.000Z",
      lastResult: "success",
      lastErrorMessage: null
    });

    expect(readEmailSyncStatus()).toEqual({
      lastCheckedAt: "2026-09-12T10:00:00.000Z",
      lastResult: "success",
      lastErrorMessage: null
    });
  });

  it("writes and reads an error status", () => {
    writeEmailSyncStatus({
      lastCheckedAt: "2026-09-12T10:05:00.000Z",
      lastResult: "error",
      lastErrorMessage: "Email sync failed. Check server logs for details."
    });

    expect(readEmailSyncStatus()).toEqual({
      lastCheckedAt: "2026-09-12T10:05:00.000Z",
      lastResult: "error",
      lastErrorMessage: "Email sync failed. Check server logs for details."
    });
  });
});
