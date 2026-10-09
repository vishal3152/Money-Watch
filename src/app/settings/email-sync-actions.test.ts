import { describe, expect, it } from "vitest";

import {
  getEmailSyncSettingsSummary,
  saveEmailSyncSettings,
  type EmailSyncSettingsFormState
} from "@/app/settings/email-sync-actions";
import type { EmailSyncSettings } from "@/config/email-sync-settings";

function completeFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values: Record<string, string> = {
    imapHost: "imap.example.com",
    imapPort: "993",
    imapUser: "owner@example.com",
    imapPassword: "app-password",
    llmBaseUrl: "https://openrouter.ai/api/v1",
    llmApiKey: "sk-or-123",
    llmModel: "openai/gpt-4o-mini",
    pollIntervalMinutes: "5",
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

/** Success paths call refresh/revalidatePath — stub it so Vitest isn't inside a Next request. */
const noopRefresh = () => {};

describe("saveEmailSyncSettings", () => {
  it("rejects an empty IMAP host without writing", async () => {
    const written: Array<Partial<EmailSyncSettings>> = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ imapHost: "" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: (s) => written.push(s) }
    );

    expect(result.fieldErrors?.imapHost).toBeTruthy();
    expect(written).toEqual([]);
  });

  it("rejects a localhost or private IMAP host without writing", async () => {
    const written: Array<Partial<EmailSyncSettings>> = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ imapHost: "127.0.0.1" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: (s) => written.push(s) }
    );

    expect(result.fieldErrors?.imapHost).toBeTruthy();
    expect(result.values?.imapPassword).toBeUndefined();
    expect(result.values?.llmApiKey).toBeUndefined();
    expect(written).toEqual([]);
  });

  it("rejects a non-numeric IMAP port", async () => {
    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ imapPort: "not-a-number" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: () => {} }
    );

    expect(result.fieldErrors?.imapPort).toBeTruthy();
  });

  it("rejects an IMAP port outside the valid TCP port range", async () => {
    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ imapPort: "70000" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: () => {} }
    );

    expect(result.fieldErrors?.imapPort).toBeTruthy();
  });

  it("rejects a poll interval above the daily cap", async () => {
    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ pollIntervalMinutes: "999999" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: () => {} }
    );

    expect(result.fieldErrors?.pollIntervalMinutes).toBeTruthy();
  });

  it("requires the IMAP password, LLM base URL, and LLM model on first setup", async () => {
    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ imapPassword: "", llmBaseUrl: "", llmModel: "" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: () => {} }
    );

    expect(result.fieldErrors?.imapPassword).toBeTruthy();
    expect(result.fieldErrors?.llmBaseUrl).toBeTruthy();
    expect(result.fieldErrors?.llmModel).toBeTruthy();
  });

  it("never requires an LLM API key — a self-hosted host like Ollama needs no auth", async () => {
    const written: Array<Partial<EmailSyncSettings>> = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ llmApiKey: "", llmBaseUrl: "http://localhost:11434/v1", llmModel: "llama3.1" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: (s) => written.push(s), refresh: noopRefresh }
    );

    expect(result.fieldErrors).toBeUndefined();
    expect(written[0]?.llmApiKey).toBeUndefined();
  });

  it("keeps the existing IMAP password and LLM API key when those fields are left blank", async () => {
    const written: Array<Partial<EmailSyncSettings>> = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ imapPassword: "", llmApiKey: "" }),
      {
        readEmailSyncSettings: () => ({ imapPassword: "already-saved", llmApiKey: "already-saved-key" }),
        writeEmailSyncSettings: (s) => written.push(s),
        refresh: noopRefresh
      }
    );

    expect(result.fieldErrors).toBeUndefined();
    expect(written).toEqual([
      {
        imapHost: "imap.example.com",
        imapPort: 993,
        imapUser: "owner@example.com",
        imapPassword: "already-saved",
        llmBaseUrl: "https://openrouter.ai/api/v1",
        llmApiKey: "already-saved-key",
        llmModel: "openai/gpt-4o-mini",
        pollIntervalMinutes: 5
      }
    ]);
  });

  it("saves valid settings", async () => {
    const written: Array<Partial<EmailSyncSettings>> = [];
    const refreshed: string[] = [];

    const result = await saveEmailSyncSettings({} as EmailSyncSettingsFormState, completeFormData(), {
      readEmailSyncSettings: () => ({}),
      writeEmailSyncSettings: (s) => written.push(s),
      refresh: (path) => refreshed.push(path)
    });

    expect(result.fieldErrors).toBeUndefined();
    expect(result.formSuccess).toBeTruthy();
    expect(written).toEqual([
      {
        imapHost: "imap.example.com",
        imapPort: 993,
        imapUser: "owner@example.com",
        imapPassword: "app-password",
        llmBaseUrl: "https://openrouter.ai/api/v1",
        llmApiKey: "sk-or-123",
        llmModel: "openai/gpt-4o-mini",
        pollIntervalMinutes: 5
      }
    ]);
    expect(refreshed).toEqual(["/settings"]);
  });

  it("does not refresh the settings page when validation fails", async () => {
    const refreshed: string[] = [];

    await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ imapHost: "" }),
      {
        readEmailSyncSettings: () => ({}),
        writeEmailSyncSettings: () => {},
        refresh: (path) => refreshed.push(path)
      }
    );

    expect(refreshed).toEqual([]);
  });

  it("rejects a malformed LLM base URL in local (non-cloud) mode too — shape validation is not cloud-only", async () => {
    const written: Array<Partial<EmailSyncSettings>> = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ llmBaseUrl: "not a url" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: (s) => written.push(s) }
    );

    expect(result.fieldErrors?.llmBaseUrl).toBeTruthy();
    expect(written).toEqual([]);
  });

  it("saves a local Ollama host in local (non-cloud) mode without a host-safety error", async () => {
    const written: Array<Partial<EmailSyncSettings>> = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ llmBaseUrl: "http://localhost:11434/v1", llmApiKey: "", llmModel: "llama3.1" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: (s) => written.push(s), refresh: noopRefresh }
    );

    expect(result.fieldErrors?.llmBaseUrl).toBeUndefined();
    expect(written[0]?.llmBaseUrl).toBe("http://localhost:11434/v1");
  });

  it("lowercases imapUser before saving — it's the idempotency-tracking mailbox key, and casing drift across saves must not reprocess the whole mailbox", async () => {
    const written: Array<Partial<EmailSyncSettings>> = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ imapUser: "Owner@Example.COM" }),
      { readEmailSyncSettings: () => ({}), writeEmailSyncSettings: (s) => written.push(s), refresh: noopRefresh }
    );

    expect(result.fieldErrors).toBeUndefined();
    expect(written[0]?.imapUser).toBe("owner@example.com");
  });

  it("in cloud mode, refuses without a signed-in Owner and writes nothing", async () => {
    const written: unknown[] = [];

    const result = await saveEmailSyncSettings({} as EmailSyncSettingsFormState, completeFormData(), {
      isCloudMode: () => true,
      getCurrentOwnerId: async () => null,
      writeCloudEmailSyncSettings: async (ownerId, s) => {
        written.push({ ownerId, ...s });
      }
    });

    expect(result.formError).toBeTruthy();
    expect(written).toEqual([]);
  });

  it("in cloud mode, saves settings scoped to the resolved Owner", async () => {
    const written: unknown[] = [];

    const result = await saveEmailSyncSettings({} as EmailSyncSettingsFormState, completeFormData(), {
      isCloudMode: () => true,
      getRequestHost: async () => "paisa-watch.vercel.app",
      getCurrentOwnerId: async () => "owner-1",
      readCloudEmailSyncSettings: async () => ({}),
      writeCloudEmailSyncSettings: async (ownerId, s) => {
        written.push({ ownerId, ...s });
      },
      refresh: noopRefresh
    });

    expect(result.fieldErrors).toBeUndefined();
    expect(written).toEqual([
      {
        ownerId: "owner-1",
        imapHost: "imap.example.com",
        imapPort: 993,
        imapUser: "owner@example.com",
        imapPassword: "app-password",
        llmBaseUrl: "https://openrouter.ai/api/v1",
        llmApiKey: "sk-or-123",
        llmModel: "openai/gpt-4o-mini",
        pollIntervalMinutes: 5
      }
    ]);
  });

  it("in cloud mode, rejects a localhost/private LLM base URL without writing (SSRF guard, cloud-only per docs/adr/0013)", async () => {
    const written: unknown[] = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ llmBaseUrl: "http://localhost:11434/v1" }),
      {
        isCloudMode: () => true,
        getRequestHost: async () => "paisa-watch.vercel.app",
        getCurrentOwnerId: async () => "owner-1",
        readCloudEmailSyncSettings: async () => ({}),
        writeCloudEmailSyncSettings: async (ownerId, s) => {
          written.push({ ownerId, ...s });
        }
      }
    );

    expect(result.fieldErrors?.llmBaseUrl).toBeTruthy();
    expect(written).toEqual([]);
  });

  it("in cloud mode on a loopback Host, allows a localhost LLM base URL (local cloud-mode dev can reach Ollama)", async () => {
    const written: unknown[] = [];

    const result = await saveEmailSyncSettings(
      {} as EmailSyncSettingsFormState,
      completeFormData({ llmBaseUrl: "http://localhost:11434/v1", llmApiKey: "", llmModel: "llama3.1" }),
      {
        isCloudMode: () => true,
        getRequestHost: async () => "localhost:3000",
        getCurrentOwnerId: async () => "owner-1",
        readCloudEmailSyncSettings: async () => ({}),
        writeCloudEmailSyncSettings: async (ownerId, s) => {
          written.push({ ownerId, ...s });
        },
        refresh: noopRefresh
      }
    );

    expect(result.fieldErrors?.llmBaseUrl).toBeUndefined();
    expect(written).toEqual([
      {
        ownerId: "owner-1",
        imapHost: "imap.example.com",
        imapPort: 993,
        imapUser: "owner@example.com",
        imapPassword: "app-password",
        llmBaseUrl: "http://localhost:11434/v1",
        llmApiKey: undefined,
        llmModel: "llama3.1",
        pollIntervalMinutes: 5
      }
    ]);
  });
});

describe("getEmailSyncSettingsSummary", () => {
  it("returns an empty, unsaved summary in cloud mode with no signed-in Owner", async () => {
    await expect(
      getEmailSyncSettingsSummary({ isCloudMode: () => true, getCurrentOwnerId: async () => null })
    ).resolves.toEqual({
      imapHost: "",
      imapPort: "",
      imapUser: "",
      llmBaseUrl: "",
      llmModel: "",
      pollIntervalMinutes: "",
      hasImapPassword: false,
      hasLlmApiKey: false,
      status: { lastCheckedAt: null, lastResult: null, lastErrorMessage: null }
    });
  });

  it("in cloud mode, reads the resolved Owner's saved settings and status without exposing secret values", async () => {
    await expect(
      getEmailSyncSettingsSummary({
        isCloudMode: () => true,
        getCurrentOwnerId: async () => "owner-1",
        readCloudEmailSyncSettings: async () => ({
          imapHost: "imap.example.com",
          imapPort: 993,
          imapUser: "owner@example.com",
          imapPassword: "secret",
          llmBaseUrl: "https://openrouter.ai/api/v1",
          llmApiKey: "secret-key",
          llmModel: "openai/gpt-4o-mini",
          pollIntervalMinutes: 5
        }),
        readCloudEmailSyncStatus: async () => ({
          lastCheckedAt: "2026-09-12T10:00:00.000Z",
          lastResult: "success",
          lastErrorMessage: null
        })
      })
    ).resolves.toEqual({
      imapHost: "imap.example.com",
      imapPort: "993",
      imapUser: "owner@example.com",
      llmBaseUrl: "https://openrouter.ai/api/v1",
      llmModel: "openai/gpt-4o-mini",
      pollIntervalMinutes: "5",
      hasImapPassword: true,
      hasLlmApiKey: true,
      status: { lastCheckedAt: "2026-09-12T10:00:00.000Z", lastResult: "success", lastErrorMessage: null }
    });
  });
});
