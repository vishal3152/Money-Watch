import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailSyncSettings } from "@/config/email-sync-settings";
import type { CheckEmailSyncNowResult } from "@/email-sync/check-now";

const COMPLETE_SETTINGS: EmailSyncSettings = {
  imapHost: "imap.example.com",
  imapPort: 993,
  imapUser: "owner@example.com",
  imapPassword: "secret",
  llmBaseUrl: "https://openrouter.ai/api/v1/chat/completions",
  llmModel: "openai/gpt-4o-mini",
  pollIntervalMinutes: 5
};

const OK_RESULT: CheckEmailSyncNowResult = {
  ok: true,
  result: { matched: 0, unresolved: 0, ignored: 0, skipped: 0 }
};

/**
 * `startEmailAlertSyncPolling` keeps its `polling` guard as module-level state, so every test
 * needs a fresh module instance — `vi.resetModules()` + a dynamic `import()` inside each test,
 * matching `src/db/postgres/connection-pool.test.ts`'s pattern for the same reason.
 */
async function loadStartPolling() {
  vi.resetModules();
  return import("@/email-sync/start-polling");
}

describe("startEmailAlertSyncPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll when required settings are incomplete", async () => {
    const { startEmailAlertSyncPolling } = await loadStartPolling();
    const checkEmailSyncNow = vi.fn();

    startEmailAlertSyncPolling({
      readEmailSyncSettings: () => ({ imapHost: "imap.example.com" }),
      createDb: () => ({}) as never,
      checkEmailSyncNow
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(checkEmailSyncNow).not.toHaveBeenCalled();
  });

  it("polls once immediately on start", async () => {
    const { startEmailAlertSyncPolling } = await loadStartPolling();
    const checkEmailSyncNow = vi.fn().mockResolvedValue(OK_RESULT);

    startEmailAlertSyncPolling({
      readEmailSyncSettings: () => COMPLETE_SETTINGS,
      createDb: () => ({}) as never,
      checkEmailSyncNow
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(checkEmailSyncNow).toHaveBeenCalledTimes(1);
  });

  it("is idempotent against being called more than once", async () => {
    const { startEmailAlertSyncPolling } = await loadStartPolling();
    const checkEmailSyncNow = vi.fn().mockResolvedValue(OK_RESULT);
    const deps = {
      readEmailSyncSettings: () => COMPLETE_SETTINGS,
      createDb: () => ({}) as never,
      checkEmailSyncNow
    };

    startEmailAlertSyncPolling(deps);
    startEmailAlertSyncPolling(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(checkEmailSyncNow).toHaveBeenCalledTimes(1);
  });

  it("polls again after the configured interval elapses", async () => {
    const { startEmailAlertSyncPolling } = await loadStartPolling();
    const checkEmailSyncNow = vi.fn().mockResolvedValue(OK_RESULT);

    startEmailAlertSyncPolling({
      readEmailSyncSettings: () => COMPLETE_SETTINGS,
      createDb: () => ({}) as never,
      checkEmailSyncNow
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1 * 60_000);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(2);
  });

  it("applies a changed poll interval one cycle later, without a restart", async () => {
    const { startEmailAlertSyncPolling } = await loadStartPolling();
    const checkEmailSyncNow = vi.fn().mockResolvedValue(OK_RESULT);
    let settings = COMPLETE_SETTINGS;

    startEmailAlertSyncPolling({
      readEmailSyncSettings: () => settings,
      createDb: () => ({}) as never,
      checkEmailSyncNow
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(1);

    // Changed while the first poll's 5-minute wait is already ticking down. A timer that's
    // already armed can't retroactively adopt a new delay — the same way changing the time on a
    // running kitchen timer doesn't rewind it — so this still takes the old 5 minutes to fire.
    settings = { ...COMPLETE_SETTINGS, pollIntervalMinutes: 1 };
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(2);

    // But the wait *after* that one is armed fresh, post-change, so it's the new 1 minute — a
    // plain `setInterval` fixed at startup would still need a full 5 minutes here, forever.
    await vi.advanceTimersByTimeAsync(1 * 60_000);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(3);
  });

  it("keeps re-checking on schedule (never calling out) if settings turn incomplete mid-run", async () => {
    const { startEmailAlertSyncPolling } = await loadStartPolling();
    const checkEmailSyncNow = vi.fn().mockResolvedValue(OK_RESULT);
    let settings: Partial<EmailSyncSettings> = COMPLETE_SETTINGS;

    startEmailAlertSyncPolling({
      readEmailSyncSettings: () => settings,
      createDb: () => ({}) as never,
      checkEmailSyncNow
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(1);

    // Pre-existing behavior, unchanged by this fix: an incomplete-settings tick still no-ops
    // rather than calling out, but the loop stays armed — if settings become complete again, the
    // very next tick resumes without needing the daemon restarted either.
    settings = { ...COMPLETE_SETTINGS, imapPassword: undefined };
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(1);

    settings = COMPLETE_SETTINGS;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(checkEmailSyncNow).toHaveBeenCalledTimes(2);
  });
});
