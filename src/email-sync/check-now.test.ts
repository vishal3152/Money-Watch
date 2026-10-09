import { describe, expect, it, vi } from "vitest";

import { checkEmailSyncNow, type EmailSyncStatusWrite } from "@/email-sync/check-now";
import type { RunEmailAlertSyncPollDeps } from "@/email-sync/run-email-alert-sync-poll";

const pollDeps: RunEmailAlertSyncPollDeps = {
  mailbox: "owner@example.com",
  fetchUnseenMessages: vi.fn(),
  callLlm: vi.fn(),
  classifyIsTransactionUpdate: vi.fn()
};

describe("checkEmailSyncNow", () => {
  it("records a success status and returns the poll result", async () => {
    const writtenStatuses: EmailSyncStatusWrite[] = [];
    const runPoll = vi.fn().mockResolvedValue({ matched: 2, unresolved: 0, invalid: 0, skipped: 1 });

    const result = await checkEmailSyncNow({
      pollDeps,
      runPoll,
      now: () => "2026-09-12T10:00:00.000Z",
      writeStatus: (status) => {
        writtenStatuses.push(status);
      }
    });

    expect(result).toEqual({ ok: true, result: { matched: 2, unresolved: 0, invalid: 0, skipped: 1 } });
    expect(writtenStatuses).toEqual([
      { lastCheckedAt: "2026-09-12T10:00:00.000Z", lastResult: "success", lastErrorMessage: null }
    ]);
    expect(runPoll).toHaveBeenCalledWith(pollDeps);
  });

  it("records a sanitized error status and never leaks the raw error message", async () => {
    const writtenStatuses: EmailSyncStatusWrite[] = [];
    const runPoll = vi.fn().mockRejectedValue(new Error("ECONNREFUSED imap.example.com password=hunter2"));
    const sanitizeError = vi.fn().mockReturnValue("Email sync failed. Check server logs for details.");

    const result = await checkEmailSyncNow({
      pollDeps,
      runPoll,
      sanitizeError,
      now: () => "2026-09-12T10:05:00.000Z",
      writeStatus: (status) => {
        writtenStatuses.push(status);
      }
    });

    expect(result).toEqual({
      ok: false,
      error: "Email sync failed. Check server logs for details."
    });
    expect(writtenStatuses).toEqual([
      {
        lastCheckedAt: "2026-09-12T10:05:00.000Z",
        lastResult: "error",
        lastErrorMessage: "Email sync failed. Check server logs for details."
      }
    ]);
    expect(sanitizeError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("falls back to a fixed message when no sanitizer is provided", async () => {
    const runPoll = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await checkEmailSyncNow({
      pollDeps,
      runPoll,
      writeStatus: vi.fn()
    });

    expect(result).toEqual({
      ok: false,
      error: "Email sync failed. Check server logs for details."
    });
  });
});
