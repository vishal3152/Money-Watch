import { readEmailSyncSettings, type EmailSyncSettings } from "@/config/email-sync-settings";
import { writeEmailSyncStatus } from "@/config/email-sync-status";
import { createDb, type DrizzleDb } from "@/db/client";
import {
  checkEmailSyncNow,
  type CheckEmailSyncNowDeps,
  type CheckEmailSyncNowResult
} from "@/email-sync/check-now";
import { fetchUnseenImapMessages } from "@/email-sync/imap-client";
import { createEmailClassifier, createLlmCaller } from "@/email-sync/llm-client";
import { shouldStartEmailAlertSyncPolling } from "@/email-sync/should-start-polling";

const DEFAULT_POLL_INTERVAL_MINUTES = 5;

let polling = false;

export type StartEmailAlertSyncPollingDeps = {
  readEmailSyncSettings?: () => Partial<EmailSyncSettings>;
  createDb?: () => DrizzleDb;
  /** The whole poll-and-record-status seam this daemon calls each tick — overridable so tests can
   * verify scheduling behavior without touching a real database, IMAP server, or LLM host. */
  checkEmailSyncNow?: (deps: CheckEmailSyncNowDeps) => Promise<CheckEmailSyncNowResult>;
};

/**
 * Starts the background poll loop when email sync is fully configured in Settings. Called from
 * `scripts/email-sync-poll-daemon.ts` (`pnpm email-sync:poll`) — never from the Next.js app
 * (docs/specs/email-alert-sync.md). A no-op when settings are incomplete, and idempotent against
 * being called more than once.
 *
 * Every setting is re-read before use, so nothing here requires a daemon restart to take effect:
 * a rotated IMAP password/LLM key applies on the very next tick (already true before this change,
 * via each tick's own settings re-read), and a changed poll interval now applies too, starting
 * from the tick after whichever one is already scheduled — a timer already counting down can't
 * retroactively adopt a new delay, the same way changing a value on a running kitchen timer
 * doesn't rewind it, but nothing here is ever frozen at the old interval permanently the way a
 * plain `setInterval(poll, intervalMs)` was. That's why the loop below self-schedules with
 * `setTimeout` (re-reading the interval before each new wait) instead of one `setInterval` whose
 * delay is fixed forever at the call that creates it.
 */
export function startEmailAlertSyncPolling(deps: StartEmailAlertSyncPollingDeps = {}): void {
  if (polling) {
    return;
  }

  const readSettings = deps.readEmailSyncSettings ?? readEmailSyncSettings;
  const runCheckEmailSyncNow = deps.checkEmailSyncNow ?? checkEmailSyncNow;

  const startupSettings = readSettings();
  if (!shouldStartEmailAlertSyncPolling(startupSettings)) {
    // No timer, no log otherwise: the process would just sit there with no signal at all that it
    // never actually started polling — this is the only visibility an operator gets.
    console.error(
      "[email-sync] Not starting: IMAP host/port/user/password and the LLM base URL/model must all be set in Settings first."
    );
    return;
  }
  polling = true;

  // Created once and reused for the life of this process — every repository getter otherwise opens
  // its own better-sqlite3 handle per call (createDb() never closes what it opens) and this daemon
  // makes several per poll (processed-alert lookup, listAccounts, account + import-batch repos per
  // message), which would otherwise leak file descriptors for as long as the daemon runs.
  const db = (deps.createDb ?? createDb)();

  // Ticks cannot overlap by construction — `scheduleNext` (the only thing that arms the next
  // `setTimeout`) runs in this poll's own `.finally()`, so a new tick is never scheduled until the
  // current one has already settled. A `pollInFlight` guard was needed against the old
  // `setInterval`, where a slow poll could still be running when the next fixed-delay tick fired;
  // it would be dead code here, so it's gone rather than kept for a case that can't occur.
  const poll = async (): Promise<void> => {
    const settings = readSettings();
    if (!shouldStartEmailAlertSyncPolling(settings)) {
      console.error("[email-sync] Skipping this poll: settings are no longer complete.");
      return;
    }
    await runCheckEmailSyncNow({
      pollDeps: {
        db,
        // This daemon is local-tier only (docs/specs/email-alert-sync.md) regardless of what a
        // shared DEPLOYMENT_MODE/VERCEL env var says about the surrounding deployment — it always
        // reads local settings.json and always writes to the local SQLite file, never Postgres.
        // Without pinning these, a self-hosted operator who sets DEPLOYMENT_MODE=cloud for the web
        // app would also flip this process's repository resolution to the cloud path, which then
        // fails outright (it has no request context to resolve a signed-in Owner from).
        isCloudMode: () => false,
        getCurrentOwnerId: async () => null,
        // Lowercased defense-in-depth: saveEmailSyncSettings already normalizes this at save
        // time, but a value written before that normalization existed must not suddenly look
        // like a different mailbox and reprocess everything.
        mailbox: settings.imapUser!.toLowerCase(),
        fetchUnseenMessages: () =>
          fetchUnseenImapMessages({
            host: settings.imapHost!,
            port: settings.imapPort!,
            user: settings.imapUser!,
            password: settings.imapPassword!
          }),
        // Local/self-hosted daemon: enforceHostSafety is always false, since the whole point of
        // a configurable LLM host is letting the Owner point it at their own machine's Ollama on
        // localhost (docs/adr/0013-provider-agnostic-llm-config-with-cloud-only-host-safety.md).
        callLlm: createLlmCaller({
          baseUrl: settings.llmBaseUrl!,
          apiKey: settings.llmApiKey,
          model: settings.llmModel!,
          enforceHostSafety: false
        }),
        classifyIsTransactionUpdate: createEmailClassifier({
          baseUrl: settings.llmBaseUrl!,
          apiKey: settings.llmApiKey,
          model: settings.llmModel!,
          enforceHostSafety: false
        })
      },
      writeStatus: (status) => writeEmailSyncStatus(status),
      sanitizeError: (error) => {
        console.error("[email-sync] poll failed:", error);
        return "Email sync failed. Check server logs for details.";
      }
    });
  };

  // Schedules the *next* tick only after the current one settles (success or failure) — reading
  // the interval fresh each time is what lets a saved interval change apply without a restart.
  const scheduleNext = (): void => {
    const settings = readSettings();
    const intervalMs = (settings.pollIntervalMinutes ?? DEFAULT_POLL_INTERVAL_MINUTES) * 60_000;
    setTimeout(() => {
      void poll().finally(scheduleNext);
    }, intervalMs);
  };

  void poll().finally(scheduleNext);
}
