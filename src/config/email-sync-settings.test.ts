import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabaseSettingsPath, writeDatabasePathToSettings } from "@/config/database-settings";
import { readEmailSyncSettings, writeEmailSyncSettings } from "@/config/email-sync-settings";

const tempHomes: string[] = [];

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();

  return {
    ...original,
    homedir: () => tempHomes.at(-1) ?? original.homedir()
  };
});

describe("email sync settings", () => {
  beforeEach(() => {
    tempHomes.push(mkdtempSync(join(tmpdir(), "paisa-watch-settings-")));
  });

  afterEach(() => {
    const home = tempHomes.pop();
    if (home) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("returns an empty object when no settings file exists", () => {
    expect(readEmailSyncSettings()).toEqual({});
  });

  it("writes and reads email sync settings", () => {
    writeEmailSyncSettings({
      imapHost: "imap.example.com",
      imapPort: 993,
      imapUser: "owner@example.com",
      imapPassword: "app-password",
      llmBaseUrl: "https://openrouter.ai/api/v1",
      llmApiKey: "sk-or-123",
      llmModel: "openai/gpt-4o-mini",
      pollIntervalMinutes: 5
    });

    expect(readEmailSyncSettings()).toEqual({
      imapHost: "imap.example.com",
      imapPort: 993,
      imapUser: "owner@example.com",
      imapPassword: "app-password",
      llmBaseUrl: "https://openrouter.ai/api/v1",
      llmApiKey: "sk-or-123",
      llmModel: "openai/gpt-4o-mini",
      pollIntervalMinutes: 5
    });
  });

  it("reads a saved LLM base URL/model with no API key (e.g. a local Ollama server)", () => {
    writeEmailSyncSettings({
      imapHost: "imap.example.com",
      imapPort: 993,
      imapUser: "owner@example.com",
      imapPassword: "app-password",
      llmBaseUrl: "http://localhost:11434/v1",
      llmModel: "llama3.1",
      pollIntervalMinutes: 5
    });

    expect(readEmailSyncSettings().llmApiKey).toBeUndefined();
    expect(readEmailSyncSettings().llmBaseUrl).toBe("http://localhost:11434/v1");
  });

  it("preserves the database path when writing email sync settings, and vice versa", () => {
    writeDatabasePathToSettings("/tmp/custom/paisa-watch.db");
    writeEmailSyncSettings({ imapHost: "imap.example.com" });

    expect(JSON.parse(readFileSync(getDatabaseSettingsPath(), "utf8"))).toMatchObject({
      databasePath: "/tmp/custom/paisa-watch.db",
      imapHost: "imap.example.com"
    });
  });
});
