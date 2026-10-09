import {
  runEmailAlertSyncPoll,
  type EmailAlertSyncPollResult,
  type RunEmailAlertSyncPollDeps
} from "@/email-sync/run-email-alert-sync-poll";

export type EmailSyncStatusWrite = {
  lastCheckedAt: string;
  lastResult: "success" | "error";
  lastErrorMessage: string | null;
};

export type CheckEmailSyncNowResult =
  | { ok: true; result: EmailAlertSyncPollResult }
  | { ok: false; error: string };

export type CheckEmailSyncNowDeps = {
  pollDeps: RunEmailAlertSyncPollDeps;
  writeStatus: (status: EmailSyncStatusWrite) => Promise<void> | void;
  now?: () => string;
  runPoll?: (deps: RunEmailAlertSyncPollDeps) => Promise<EmailAlertSyncPollResult>;
  sanitizeError?: (error: unknown) => string;
};

const DEFAULT_ERROR_MESSAGE = "Email sync failed. Check server logs for details.";

/**
 * Runs one poll pass on demand (the Settings screen's "Check now" action, both tiers) and records
 * the outcome so a broken mailbox connection is visible instead of the Imports queue silently
 * starving (docs/specs/email-alert-sync.md). Never forwards a raw IMAP/LLM exception
 * message to the caller — those often embed secrets or mailbox details.
 */
export async function checkEmailSyncNow(deps: CheckEmailSyncNowDeps): Promise<CheckEmailSyncNowResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const runPoll = deps.runPoll ?? runEmailAlertSyncPoll;
  const sanitizeError = deps.sanitizeError ?? (() => DEFAULT_ERROR_MESSAGE);

  console.info(`[email-sync] poll start mailbox=${deps.pollDeps.mailbox}`);
  try {
    const result = await runPoll(deps.pollDeps);
    await deps.writeStatus({ lastCheckedAt: now(), lastResult: "success", lastErrorMessage: null });
    console.info(
      `[email-sync] poll success mailbox=${deps.pollDeps.mailbox} matched=${result.matched} unresolved=${result.unresolved} ignored=${result.ignored} skipped=${result.skipped}`
    );
    return { ok: true, result };
  } catch (error) {
    // Always log the concrete failure here — callers sanitize for the UI/status row and previously
    // the check-now route forgot to log at all, leaving only "Check server logs for details."
    console.error(`[email-sync] poll failed mailbox=${deps.pollDeps.mailbox}`, error);
    const message = sanitizeError(error);
    await deps.writeStatus({ lastCheckedAt: now(), lastResult: "error", lastErrorMessage: message });
    return { ok: false, error: message };
  }
}
