import { readSettings, writeSettings } from "@/config/database-settings";

export type EmailSyncStatus = {
  lastCheckedAt: string | null;
  lastResult: "success" | "error" | null;
  lastErrorMessage: string | null;
};

const EMPTY_STATUS: EmailSyncStatus = { lastCheckedAt: null, lastResult: null, lastErrorMessage: null };

/** The local tier's counterpart to `PgEmailSyncSettingsRepository.getStatus()` — same settings.json store as `email-sync-settings.ts`. */
export function readEmailSyncStatus(): EmailSyncStatus {
  const settings = readSettings();
  const lastResult = settings.emailSyncLastResult;

  return {
    lastCheckedAt: typeof settings.emailSyncLastCheckedAt === "string" ? settings.emailSyncLastCheckedAt : null,
    lastResult: lastResult === "success" || lastResult === "error" ? lastResult : null,
    lastErrorMessage:
      typeof settings.emailSyncLastErrorMessage === "string" ? settings.emailSyncLastErrorMessage : null
  };
}

export function writeEmailSyncStatus(status: EmailSyncStatus): void {
  writeSettings({
    emailSyncLastCheckedAt: status.lastCheckedAt,
    emailSyncLastResult: status.lastResult,
    emailSyncLastErrorMessage: status.lastErrorMessage
  });
}

export { EMPTY_STATUS as EMPTY_EMAIL_SYNC_STATUS };
