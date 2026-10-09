import { readSettings, writeSettings } from "@/config/database-settings";

export type EmailSyncSettings = {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  /** Base URL of an OpenAI-compatible chat-completions API, e.g. "https://openrouter.ai/api/v1"
   * or "http://localhost:11434/v1" for a local Ollama server (src/email-sync/llm-client.ts). */
  llmBaseUrl: string;
  /** Omitted when the configured host needs no auth (e.g. a local Ollama server). */
  llmApiKey?: string;
  llmModel: string;
  pollIntervalMinutes: number;
};

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function readEmailSyncSettings(): Partial<EmailSyncSettings> {
  const settings = readSettings();

  return {
    imapHost: readOptionalString(settings.imapHost),
    imapPort: readOptionalNumber(settings.imapPort),
    imapUser: readOptionalString(settings.imapUser),
    imapPassword: readOptionalString(settings.imapPassword),
    llmBaseUrl: readOptionalString(settings.llmBaseUrl),
    llmApiKey: readOptionalString(settings.llmApiKey),
    llmModel: readOptionalString(settings.llmModel),
    pollIntervalMinutes: readOptionalNumber(settings.pollIntervalMinutes)
  };
}

export function writeEmailSyncSettings(settings: Partial<EmailSyncSettings>): void {
  writeSettings(settings);
}
