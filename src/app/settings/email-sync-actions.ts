"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { withPersistedFormState } from "@/app/form-persistence";
import { shouldEnforceLlmHostSafety } from "@/app/settings/llm-host-safety-policy";
import { isCloudMode as isCloudModeFn } from "@/config/deployment-mode";
import {
  readEmailSyncSettings as readEmailSyncSettingsFromFile,
  writeEmailSyncSettings as writeEmailSyncSettingsToFile,
  type EmailSyncSettings
} from "@/config/email-sync-settings";
import {
  readEmailSyncStatus as readEmailSyncStatusFromFile,
  type EmailSyncStatus
} from "@/config/email-sync-status";
import { assertSafeImapHostname, UnsafeImapHostError } from "@/domain/imap-host-safety";
import { assertSafeLlmBaseUrl, assertValidLlmBaseUrl, UnsafeLlmHostError } from "@/domain/llm-host-safety";
import { getCurrentOwnerId as getCurrentOwnerIdFn } from "@/lib/cloud-auth/current-owner";
import type { LocalizedText, MessageKey } from "@/i18n/translator";

const EMPTY_STATUS: EmailSyncStatus = { lastCheckedAt: null, lastResult: null, lastErrorMessage: null };

const SECRET_FORM_KEYS = ["imapPassword", "llmApiKey"] as const;

function persistEmailSyncFormState<T extends object>(formData: FormData, state: T): T & { values: Record<string, string>; formKey: string } {
  return withPersistedFormState(formData, state, { omitKeys: SECRET_FORM_KEYS });
}

export type EmailSyncSettingsFormState = {
  fieldErrors?: {
    imapHost?: LocalizedText;
    imapPort?: LocalizedText;
    imapUser?: LocalizedText;
    imapPassword?: LocalizedText;
    llmBaseUrl?: LocalizedText;
    llmModel?: LocalizedText;
    pollIntervalMinutes?: LocalizedText;
  };
  formError?: LocalizedText;
  formSuccess?: MessageKey;
  values?: Record<string, string>;
  formKey?: string;
};

/** Shape shared by the local file and the per-Owner Postgres row (ADR-0010) — ownerId omitted, it's implicit per store. */
type StoredEmailSyncSettings = Partial<EmailSyncSettings>;

/** A fully-saved settings write: every field present except `llmApiKey`, which stays genuinely
 * optional even on a complete save (a self-hosted host like Ollama needs no key at all). */
type CompleteEmailSyncSettings = Required<Omit<EmailSyncSettings, "llmApiKey">> & Pick<EmailSyncSettings, "llmApiKey">;

export type SaveEmailSyncSettingsDeps = {
  readEmailSyncSettings?: () => StoredEmailSyncSettings;
  writeEmailSyncSettings?: (settings: StoredEmailSyncSettings) => void;
  isCloudMode?: () => boolean;
  /** Request Host header — used to skip the LLM SSRF guard when the app itself is on loopback. */
  getRequestHost?: () => Promise<string | null>;
  getCurrentOwnerId?: () => Promise<string | null>;
  /** Cloud-tier read/write, only used when isCloudMode() and an Owner is resolved. */
  readCloudEmailSyncSettings?: (ownerId: string) => Promise<StoredEmailSyncSettings>;
  writeCloudEmailSyncSettings?: (ownerId: string, settings: CompleteEmailSyncSettings) => Promise<void>;
  /** After a successful write, refresh Settings so the page re-reads saved summary/status. */
  refresh?: (path: string) => void;
};

async function defaultGetRequestHost(): Promise<string | null> {
  return (await headers()).get("host");
}

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

function parseBoundedInteger(value: string, max: number): number | null {
  const parsed = parsePositiveInteger(value);
  return parsed !== null && parsed <= max ? parsed : null;
}

const MAX_TCP_PORT = 65_535;
/** A poll interval beyond a day would defeat the point of "poll on an interval" and is almost
 * certainly a fat-fingered value (minutes vs. hours/days) rather than an intentional setting. */
const MAX_POLL_INTERVAL_MINUTES = 1_440;

async function defaultReadCloudEmailSyncSettings(ownerId: string): Promise<StoredEmailSyncSettings> {
  const { PgEmailSyncSettingsRepository } = await import(
    "@/db/postgres/repositories/email-sync-settings-repository"
  );
  const { resolvePostgresConnectionString } = await import("@/config/postgres-connection");
  const credentials = await new PgEmailSyncSettingsRepository(
    resolvePostgresConnectionString(),
    ownerId
  ).get();
  return credentials ?? {};
}

async function defaultWriteCloudEmailSyncSettings(
  ownerId: string,
  settings: CompleteEmailSyncSettings
): Promise<void> {
  const { PgEmailSyncSettingsRepository } = await import(
    "@/db/postgres/repositories/email-sync-settings-repository"
  );
  const { resolvePostgresConnectionString } = await import("@/config/postgres-connection");
  await new PgEmailSyncSettingsRepository(resolvePostgresConnectionString(), ownerId).set(settings);
}

export async function saveEmailSyncSettings(
  _prevState: EmailSyncSettingsFormState,
  formData: FormData,
  deps: SaveEmailSyncSettingsDeps = {}
): Promise<EmailSyncSettingsFormState> {
  const cloudMode = (deps.isCloudMode ?? isCloudModeFn)();
  let existing: StoredEmailSyncSettings;
  let ownerId: string | null = null;

  if (cloudMode) {
    ownerId = await (deps.getCurrentOwnerId ?? getCurrentOwnerIdFn)();
    if (ownerId === null) {
      return persistEmailSyncFormState(formData, {
        formError: { key: "errors.emailSyncSignIn" }
      });
    }
    existing = await (deps.readCloudEmailSyncSettings ?? defaultReadCloudEmailSyncSettings)(ownerId);
  } else {
    existing = (deps.readEmailSyncSettings ?? readEmailSyncSettingsFromFile)();
  }

  const imapHost = String(formData.get("imapHost") ?? "").trim();
  const imapPortInput = String(formData.get("imapPort") ?? "").trim();
  // Lowercased: this value doubles as email alert sync's idempotency-tracking mailbox key
  // (docs/specs/email-alert-sync.md) — re-saving with different casing must not look like a
  // different mailbox and reprocess everything.
  const imapUser = String(formData.get("imapUser") ?? "").trim().toLowerCase();
  const imapPasswordInput = String(formData.get("imapPassword") ?? "");
  const llmBaseUrl = String(formData.get("llmBaseUrl") ?? "").trim();
  const llmApiKeyInput = String(formData.get("llmApiKey") ?? "");
  const llmModel = String(formData.get("llmModel") ?? "").trim();
  const pollIntervalInput = String(formData.get("pollIntervalMinutes") ?? "").trim();

  const fieldErrors: NonNullable<EmailSyncSettingsFormState["fieldErrors"]> = {};

  if (imapHost.length === 0) {
    fieldErrors.imapHost = { key: "errors.imapHostRequired" };
  } else {
    try {
      assertSafeImapHostname(imapHost);
    } catch (error) {
      if (error instanceof UnsafeImapHostError) {
        fieldErrors.imapHost = { key: "errors.imapHostPublic" };
      } else {
        throw error;
      }
    }
  }
  const imapPort = parseBoundedInteger(imapPortInput, MAX_TCP_PORT);
  if (imapPort === null) {
    fieldErrors.imapPort = { key: "errors.imapPortInvalid" };
  }
  if (imapUser.length === 0) {
    fieldErrors.imapUser = { key: "errors.imapUserRequired" };
  }
  // Blank leaves the previously saved secret in place; only reject a blank when none is saved yet.
  if (imapPasswordInput.length === 0 && !existing.imapPassword) {
    fieldErrors.imapPassword = { key: "errors.imapPasswordRequired" };
  }
  if (llmBaseUrl.length === 0) {
    fieldErrors.llmBaseUrl = { key: "errors.llmBaseUrlRequired" };
  } else {
    // Shape check runs on both tiers — an unusable value (not a URL, wrong scheme) should fail
    // here, not surface as a confusing failure only at poll time.
    try {
      assertValidLlmBaseUrl(llmBaseUrl);
    } catch (error) {
      if (error instanceof UnsafeLlmHostError) {
        fieldErrors.llmBaseUrl = { key: "errors.llmBaseUrlInvalid" };
      } else {
        throw error;
      }
    }
    // Host-safety check is cloud mode only (docs/adr/0013-provider-agnostic-llm-config-with-cloud-
    // only-host-safety.md): the app's own server makes this outbound call on shared infra there, so
    // a localhost/private target is a real SSRF risk. Local/self-hosted mode is a single-owner
    // machine already trusted, and the whole point of a configurable host is letting the Owner
    // point it at their own machine's Ollama on localhost — so this half does not run there at all.
    // Also skipped when the app itself is served on a loopback Host (local `DEPLOYMENT_MODE=cloud`
    // against a real cloud DB): the Next process can reach Ollama; production Vercel Host is not
    // loopback so the guard still applies there.
    if (!fieldErrors.llmBaseUrl && cloudMode) {
      const requestHost = await (deps.getRequestHost ?? defaultGetRequestHost)();
      if (shouldEnforceLlmHostSafety(cloudMode, requestHost)) {
        try {
          assertSafeLlmBaseUrl(llmBaseUrl);
        } catch (error) {
          if (error instanceof UnsafeLlmHostError) {
            fieldErrors.llmBaseUrl = { key: "errors.llmBaseUrlPublic" };
          } else {
            throw error;
          }
        }
      }
    }
  }
  if (llmModel.length === 0) {
    fieldErrors.llmModel = { key: "errors.llmModelRequired" };
  }
  // llmApiKey is never required — a self-hosted host like Ollama needs no auth.

  let pollIntervalMinutes = existing.pollIntervalMinutes ?? 5;
  if (pollIntervalInput.length > 0) {
    const parsed = parseBoundedInteger(pollIntervalInput, MAX_POLL_INTERVAL_MINUTES);
    if (parsed === null) {
      fieldErrors.pollIntervalMinutes = {
        key: "errors.pollIntervalInvalid",
        params: { max: MAX_POLL_INTERVAL_MINUTES }
      };
    } else {
      pollIntervalMinutes = parsed;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return persistEmailSyncFormState(formData, { fieldErrors });
  }

  const imapPassword = imapPasswordInput.length > 0 ? imapPasswordInput : existing.imapPassword!;
  // Same "blank keeps existing" convention as imapPassword — but unlike it, never required: no
  // existing value simply means no key at all (e.g. a self-hosted host that needs no auth).
  const llmApiKey = llmApiKeyInput.length > 0 ? llmApiKeyInput : existing.llmApiKey;

  if (cloudMode) {
    await (deps.writeCloudEmailSyncSettings ?? defaultWriteCloudEmailSyncSettings)(ownerId!, {
      imapHost,
      imapPort: imapPort!,
      imapUser,
      imapPassword,
      llmBaseUrl,
      llmApiKey,
      llmModel,
      pollIntervalMinutes
    });
  } else {
    (deps.writeEmailSyncSettings ?? writeEmailSyncSettingsToFile)({
      imapHost,
      imapPort: imapPort!,
      imapUser,
      imapPassword,
      llmBaseUrl,
      llmApiKey,
      llmModel,
      pollIntervalMinutes
    });
  }

  (deps.refresh ?? revalidatePath)("/settings");
  // Remount the form so secret fields clear and defaults re-read from refreshed page props.
  return { formSuccess: "settings.emailSync.saved", formKey: crypto.randomUUID() };
}

export type EmailSyncSettingsSummary = {
  imapHost: string;
  imapPort: string;
  imapUser: string;
  llmBaseUrl: string;
  llmModel: string;
  pollIntervalMinutes: string;
  hasImapPassword: boolean;
  hasLlmApiKey: boolean;
  status: EmailSyncStatus;
};

function toSummary(settings: StoredEmailSyncSettings, status: EmailSyncStatus): EmailSyncSettingsSummary {
  return {
    imapHost: settings.imapHost ?? "",
    imapPort: settings.imapPort !== undefined ? String(settings.imapPort) : "",
    imapUser: settings.imapUser ?? "",
    llmBaseUrl: settings.llmBaseUrl ?? "",
    llmModel: settings.llmModel ?? "",
    pollIntervalMinutes: settings.pollIntervalMinutes !== undefined ? String(settings.pollIntervalMinutes) : "",
    hasImapPassword: settings.imapPassword !== undefined,
    hasLlmApiKey: settings.llmApiKey !== undefined,
    status
  };
}

const EMPTY_SUMMARY: EmailSyncSettingsSummary = toSummary({}, EMPTY_STATUS);

export type GetEmailSyncSettingsSummaryDeps = {
  isCloudMode?: () => boolean;
  getCurrentOwnerId?: () => Promise<string | null>;
  readCloudEmailSyncSettings?: (ownerId: string) => Promise<StoredEmailSyncSettings>;
  readCloudEmailSyncStatus?: (ownerId: string) => Promise<EmailSyncStatus>;
};

async function defaultReadCloudEmailSyncStatus(ownerId: string): Promise<EmailSyncStatus> {
  const { PgEmailSyncSettingsRepository } = await import(
    "@/db/postgres/repositories/email-sync-settings-repository"
  );
  const { resolvePostgresConnectionString } = await import("@/config/postgres-connection");
  return new PgEmailSyncSettingsRepository(resolvePostgresConnectionString(), ownerId).getStatus();
}

/**
 * Non-secret fields plus whether a secret is already saved — never the secret values themselves,
 * so the settings page never embeds a saved IMAP password/OpenRouter key in its HTML. Also
 * includes the last poll's status (last-checked time and outcome) so a silently broken mailbox
 * connection is visible instead of the Imports queue just never growing.
 */
export async function getEmailSyncSettingsSummary(
  deps: GetEmailSyncSettingsSummaryDeps = {}
): Promise<EmailSyncSettingsSummary> {
  if ((deps.isCloudMode ?? isCloudModeFn)()) {
    const ownerId = await (deps.getCurrentOwnerId ?? getCurrentOwnerIdFn)();
    if (ownerId === null) {
      return EMPTY_SUMMARY;
    }
    const [settings, status] = await Promise.all([
      (deps.readCloudEmailSyncSettings ?? defaultReadCloudEmailSyncSettings)(ownerId),
      (deps.readCloudEmailSyncStatus ?? defaultReadCloudEmailSyncStatus)(ownerId)
    ]);
    return toSummary(settings, status);
  }

  return toSummary(readEmailSyncSettingsFromFile(), readEmailSyncStatusFromFile());
}
