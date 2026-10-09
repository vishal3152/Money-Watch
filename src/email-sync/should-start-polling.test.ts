import { describe, expect, it } from "vitest";

import { shouldStartEmailAlertSyncPolling } from "@/email-sync/should-start-polling";

const completeSettings = {
  imapHost: "imap.example.com",
  imapPort: 993,
  imapUser: "owner@example.com",
  imapPassword: "app-password",
  llmBaseUrl: "https://openrouter.ai/api/v1",
  llmModel: "openai/gpt-4o-mini"
};

describe("shouldStartEmailAlertSyncPolling", () => {
  it("returns true once every required setting is present", () => {
    expect(shouldStartEmailAlertSyncPolling(completeSettings)).toBe(true);
  });

  it("returns true with no llmApiKey (e.g. a local Ollama server that needs no auth)", () => {
    expect(shouldStartEmailAlertSyncPolling(completeSettings)).toBe(true);
    expect(completeSettings).not.toHaveProperty("llmApiKey");
  });

  it("returns false when a required setting is missing", () => {
    const { imapPassword: _imapPassword, ...incomplete } = completeSettings;
    expect(shouldStartEmailAlertSyncPolling(incomplete)).toBe(false);
  });

  it("returns false when llmModel is missing", () => {
    const { llmModel: _llmModel, ...incomplete } = completeSettings;
    expect(shouldStartEmailAlertSyncPolling(incomplete)).toBe(false);
  });

  it("returns false for an empty settings object", () => {
    expect(shouldStartEmailAlertSyncPolling({})).toBe(false);
  });
});
