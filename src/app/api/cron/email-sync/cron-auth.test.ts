import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest, sanitizeCronOwnerError } from "@/app/api/cron/email-sync/cron-auth";

const STRONG_SECRET = "a".repeat(32);

describe("isAuthorizedCronRequest", () => {
  it("accepts an exact Bearer match when the secret is long enough", () => {
    expect(isAuthorizedCronRequest(`Bearer ${STRONG_SECRET}`, STRONG_SECRET)).toBe(true);
  });

  it("rejects a missing header, wrong token, or short secret", () => {
    expect(isAuthorizedCronRequest(null, STRONG_SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${STRONG_SECRET}x`, STRONG_SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${"b".repeat(32)}`, STRONG_SECRET)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer short-but-matching", "short-but-matching")).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${STRONG_SECRET}`, undefined)).toBe(false);
  });
});

describe("sanitizeCronOwnerError", () => {
  it("never echoes the underlying exception message", () => {
    expect(sanitizeCronOwnerError(new Error("IMAP auth failed for password hunter2"))).toBe(
      "Email sync failed for this Owner. Check server logs for details."
    );
  });
});
