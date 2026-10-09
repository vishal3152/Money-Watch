import { timingSafeEqual } from "node:crypto";

const MIN_CRON_SECRET_LENGTH = 32;

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Compare with a constant-time check so a
 * short/guessable secret cannot be walked byte-by-byte via response timing. Missing or too-short
 * secrets fail closed (401) — never "open when unset".
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string | undefined
): boolean {
  if (cronSecret === undefined || cronSecret.length < MIN_CRON_SECRET_LENGTH) {
    return false;
  }
  if (authorizationHeader === null) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${cronSecret}`, "utf8");
  const presented = Buffer.from(authorizationHeader, "utf8");
  if (expected.length !== presented.length) {
    return false;
  }
  return timingSafeEqual(expected, presented);
}

/** Owner-facing cron failure text — never forward raw IMAP/LLM exception messages. */
export function sanitizeCronOwnerError(_error: unknown): string {
  return "Email sync failed for this Owner. Check server logs for details.";
}
