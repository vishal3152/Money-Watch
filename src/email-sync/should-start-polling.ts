import type { EmailSyncSettings } from "@/config/email-sync-settings";

// llmApiKey is deliberately excluded — a self-hosted OpenAI-compatible host (e.g. Ollama) needs no
// API key at all, so requiring one here would block polling from ever starting for that setup.
const REQUIRED_FIELDS: Array<keyof EmailSyncSettings> = [
  "imapHost",
  "imapPort",
  "imapUser",
  "imapPassword",
  "llmBaseUrl",
  "llmModel"
];

/** True only once every required email-sync setting has been configured (docs/specs/email-alert-sync.md). */
export function shouldStartEmailAlertSyncPolling(settings: Partial<EmailSyncSettings>): boolean {
  return REQUIRED_FIELDS.every((field) => settings[field] !== undefined);
}
